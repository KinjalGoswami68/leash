"""Settings loaded from agent/.env. Values are never logged; use `describe()` to report which are set."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

# Antivirus HTTPS scanning re-signs TLS with its own root CA, which certifi doesn't know. If the bundle from
# make_ca_bundle.py exists, requests (web3) and httpx (groq) use it. setdefault: an explicit env var still wins.
_CA_BUNDLE = Path(__file__).with_name("certs") / "ca-bundle.pem"
if _CA_BUNDLE.exists():
    os.environ.setdefault("REQUESTS_CA_BUNDLE", str(_CA_BUNDLE))
    os.environ.setdefault("SSL_CERT_FILE", str(_CA_BUNDLE))


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
VAULT_ADDRESS = os.getenv("VAULT_ADDRESS", "")
AGENT_PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
SCRIPTED_MODE = _bool("SCRIPTED_MODE")

# Arena: the same LeashVault deployed 3 times with different rules, same agent key (see 02_deploy_arena.ts).
ARENA_VAULTS = {level: os.getenv(f"ARENA_L{level}_ADDRESS", "") for level in (1, 2, 3)}

PRIMARY_MODEL = "openai/gpt-oss-120b"
# Was llama-3.3-70b-versatile, but Groq no longer serves it (404, checked 2026-10-30). gpt-oss-20b supports
# tool calls on the free tier; override with FALLBACK_MODEL if Groq's model list changes again.
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "").strip() or "openai/gpt-oss-20b"
# Arena chats try this model first, then the other one on 429/errors. Switchable without code changes, e.g.
# to a model that is easier to jailbreak live (see DEMO.md).
ARENA_MODEL = os.getenv("ARENA_MODEL", "").strip() or PRIMARY_MODEL
MAX_TOKENS = 400  # Groq free tier is 8k tokens/min; small replies keep a demo inside it.

# Public demo addresses used by scripted mode (Hardhat #2 = allowlisted vendor, #4 = not allowlisted).
DEMO_VENDOR = os.getenv("DEMO_VENDOR", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")
DEMO_ATTACKER = os.getenv("DEMO_ATTACKER", "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]


def describe() -> dict:
    """Which settings are present, without revealing any secret value."""
    return {
        "rpc_url": RPC_URL,
        "vault_address": VAULT_ADDRESS or None,
        "agent_private_key_set": bool(AGENT_PRIVATE_KEY),
        "groq_api_key_set": bool(GROQ_API_KEY),
        "scripted_mode": SCRIPTED_MODE,
        "arena_model": ARENA_MODEL,
        "arena_vaults": {level: addr or None for level, addr in ARENA_VAULTS.items()},
    }
