"""Leash agent API. Run: uvicorn main:app --port 8000 (from the agent folder, venv active).
Public hosting: Vercel Python runtime (this file's `app` is the zero-config entrypoint, vercel.json sets maxDuration)
or the Dockerfile. On Vercel, process memory can reset between requests: everything kept in memory below
(sessions, per-player limits, daily cap) is best-effort there. Gas check and contract rules are always enforced."""
import hmac
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import config
import llm
import scripted
from chain import OUT_OF_GAS, get_client

app = FastAPI(title="Leash Agent")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

HISTORY_TURNS = 4  # last 4 user/assistant pairs: enough context, keeps each request well under Groq's token budget.

# In-memory sessions on purpose: no database is in scope, and a restart simply clears demo chats.
_sessions: dict[str, dict] = {}
_lock = threading.Lock()


class HistoryMsg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class ChatIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    level: int | None = Field(default=None, ge=1, le=3)  # set = arena chat against that level's vault
    # Sent by the browser so chats keep context on serverless, where server memory may be gone by the next
    # request. Not trusted for anything: a player can fake past turns, but the vault's rules still apply to the
    # pay() call itself, which is the point of the project.
    history: list[HistoryMsg] | None = Field(default=None, max_length=2 * 4)


ARENA_BUSY = "The arena agent is rate-limited right now. Wait a minute and try again."

# Groq free tier is 30 requests/min and 1,000/day for the whole key, and one arena message can use up to 4 model
# calls. Per player session: at most 1 arena message per 8s and 20 per hour, refused before any Groq call.
# Best-effort: kept in process memory, and a session id is just a random string the browser picks.
ARENA_MIN_GAP_S = 8
ARENA_MAX_PER_HOUR = 20
ARENA_SLOW_DOWN = "Slow down, try again in a few seconds."
_arena_requests: dict[str, deque] = {}


def _arena_allowed(session_id: str) -> bool:
    now = time.monotonic()
    with _lock:
        recent = _arena_requests.setdefault(session_id, deque())
        while recent and now - recent[0] > 3600:
            recent.popleft()
        if (recent and now - recent[-1] < ARENA_MIN_GAP_S) or len(recent) >= ARENA_MAX_PER_HOUR:
            return False
        recent.append(now)
        return True


# Per-session limits alone don't protect the shared Groq key: anyone can mint new session ids. This is the hard cap
# for the whole server. In memory: per process, so it resets on restart and, on Vercel, each concurrent instance
# counts on its own (best-effort). Groq's own 1,000 requests/day on the free key is the hard ceiling behind it.
ARENA_DAILY_BUSY = "Arena is busy, try later."
_arena_day = {"day": None, "count": 0}


def _arena_daily_allowed() -> bool:
    today = datetime.now(timezone.utc).date()
    with _lock:
        if _arena_day["day"] != today:
            _arena_day.update(day=today, count=0)
        if _arena_day["count"] >= config.ARENA_DAILY_CAP:
            return False
        _arena_day["count"] += 1
        return True


def _demo_token_ok(token: str | None) -> bool:
    # compare_digest: constant-time, so the token can't be guessed byte by byte from response timing.
    return bool(config.DEMO_TOKEN) and hmac.compare_digest((token or "").encode(), config.DEMO_TOKEN.encode())


def _session(sid: str) -> dict:
    with _lock:
        return _sessions.setdefault(sid, {"history": [], "script_step": 0})


@app.get("/health")
def health():
    # Public endpoint: only non-secret facts (no RPC URL, which may embed an API key, and no key material).
    info = {"public_mode": config.PUBLIC_MODE, "scripted_mode": config.SCRIPTED_MODE, "arena_model": config.ARENA_MODEL,
            "arena_levels": [lvl for lvl, addr in config.ARENA_VAULTS.items() if addr]}
    try:
        client = get_client(0 if config.VAULT_ADDRESS else min(info["arena_levels"], default=0))
        info.update(ok=True, chain_id=client.chain_id, agent_address=client.account.address, agent_has_gas=client.has_gas())
    except Exception as e:
        info.update(ok=False, error=type(e).__name__)
    return info


@app.get("/balance")
def balance():
    try:
        return get_client().get_balance()
    except Exception as e:
        raise HTTPException(503, f"chain unavailable: {type(e).__name__}")


@app.post("/chat")
def chat(body: ChatIn, x_demo_token: str | None = Header(default=None)):
    level = body.level or 0
    if not level and config.PUBLIC_MODE and not _demo_token_ok(x_demo_token):
        raise HTTPException(403, "Only the arena (level 1-3) is open on the public server.")
    if level and not _arena_allowed(body.session_id):
        return {"reply": ARENA_SLOW_DOWN, "actions": [], "mode": "rate-limited"}
    if level and not _arena_daily_allowed():
        return {"reply": ARENA_DAILY_BUSY, "actions": [], "mode": "daily-cap"}
    try:
        vault = get_client(level)
        has_gas = vault.has_gas()
    except Exception as e:
        raise HTTPException(503, f"chain unavailable: {type(e).__name__}")
    if not has_gas:
        # Checked before the LLM call too (pay() re-checks): no Groq quota spent on a turn that can't pay anyway.
        return {"reply": OUT_OF_GAS, "actions": [], "mode": "no-gas"}
    # Separate history per level, so a jailbreak built up on L1 isn't silently carried into L3.
    s = _session(f"{level}:{body.session_id}")
    if body.history is not None:
        s["history"] = [m.model_dump() for m in body.history][-2 * HISTORY_TURNS:]
    prompt = llm.ARENA_PROMPT if level else llm.SYSTEM_PROMPT

    result = None
    if not config.SCRIPTED_MODE:
        try:
            first_model = config.ARENA_MODEL if level else config.PRIMARY_MODEL
            result = llm.chat(vault, s["history"], body.message, prompt, first_model)
        except llm.LLMUnavailable:
            result = None  # last-resort fallback below: Groq down or rate limited on both models
    if result is None and level:
        # The scripted demo pays fixed addresses; in the arena that would hand out "wins" nobody earned.
        return {"reply": ARENA_BUSY, "actions": [], "mode": "unavailable"}
    if result is None:
        result = scripted.step(vault, s["script_step"])
        s["script_step"] += 1

    s["history"] = (s["history"] + [
        {"role": "user", "content": body.message},
        {"role": "assistant", "content": result["reply"]},
    ])[-2 * HISTORY_TURNS:]
    return result


@app.post("/reset/{session_id}")
def reset(session_id: str):
    with _lock:
        for level in range(4):
            _sessions.pop(f"{level}:{session_id}", None)
    return {"ok": True}
