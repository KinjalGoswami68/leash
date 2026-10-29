"""Leash agent API. Run: uvicorn main:app --port 8000 (from the agent folder, venv active)."""
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import config
import llm
import scripted
from chain import get_client

app = FastAPI(title="Leash Agent")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

HISTORY_TURNS = 4  # last 4 user/assistant pairs: enough context, keeps each request well under Groq's token budget.

# In-memory sessions on purpose: no database is in scope, and a restart simply clears demo chats.
_sessions: dict[str, dict] = {}
_lock = threading.Lock()


class ChatIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    level: int | None = Field(default=None, ge=1, le=3)  # set = arena chat against that level's vault


ARENA_BUSY = "The arena agent is rate-limited right now. Wait a minute and try again."


def _session(sid: str) -> dict:
    with _lock:
        return _sessions.setdefault(sid, {"history": [], "script_step": 0})


@app.get("/health")
def health():
    info = config.describe()
    try:
        client = get_client()
        info.update(chain_id=client.chain_id, agent_address=client.account.address, ok=True)
    except Exception as e:
        info.update(ok=False, error=str(e))
    return info


@app.get("/balance")
def balance():
    try:
        return get_client().get_balance()
    except Exception as e:
        raise HTTPException(503, f"chain unavailable: {type(e).__name__}")


@app.post("/chat")
def chat(body: ChatIn):
    level = body.level or 0
    try:
        vault = get_client(level)
    except Exception as e:
        raise HTTPException(503, f"chain unavailable: {e}")
    # Separate history per level, so a jailbreak built up on L1 isn't silently carried into L3.
    s = _session(f"{level}:{body.session_id}")
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
