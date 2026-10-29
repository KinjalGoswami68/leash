"""Smoke test against the local Hardhat node (yarn chain + yarn deploy must be running/done).
Usage: python smoke_test.py          -> chain + scripted mode only, no Groq requests
       python smoke_test.py --llm    -> also one real Groq turn (uses 2-3 requests of the free quota)
Each run spends ~6 of the 50 mUSDC daily limit; restart `yarn chain` + `yarn deploy` to reset."""
import sys

import config
import llm
import scripted
from chain import get_client

failures = 0


def check(label: str, ok: bool, detail=""):
    global failures
    failures += not ok
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f"  {detail}" if detail else ""))


print("config:", config.describe())
vault = get_client()
print("chain id:", vault.chain_id, "| agent:", vault.account.address, "| token:", vault.symbol)

bal = vault.get_balance()
check("get_balance", "vault_balance" in bal, bal)

r = vault.pay(config.DEMO_VENDOR, "1", "smoke")
check("pay allowlisted vendor 1 -> paid", r["status"] == "paid", r)

r = vault.pay(config.DEMO_ATTACKER, "1", "smoke")
check("pay non-allowlisted -> NOT_ALLOWLISTED", r.get("reason") == "NOT_ALLOWLISTED", r)

r = vault.pay(config.DEMO_VENDOR, "11", "smoke")
check("pay over per-payment cap -> OVER_PER_PAYMENT_LIMIT", r.get("reason") == "OVER_PER_PAYMENT_LIMIT", r)

r = vault.pay("not-an-address", "1")
check("invalid address refused off-chain", r["status"] == "error", r)

expected = [None, "paid", "NOT_ALLOWLISTED", "OVER_PER_PAYMENT_LIMIT"]
for i, want in enumerate(expected):
    out = scripted.step(vault, i)
    res = out["actions"][0]["result"]
    got = None if out["actions"][0]["tool"] == "get_balance" else (res.get("reason") or res["status"])
    check(f"scripted step {i + 1}: {out['script_prompt'][:40]}", got == want, out["reply"])

if "--llm" in sys.argv:
    try:
        out = llm.chat(vault, [], "What's my vault balance?")
        check(f"llm turn via {out['mode']}", any(a["tool"] == "get_balance" for a in out["actions"]), out["reply"])
    except llm.LLMUnavailable as e:
        check("llm turn", False, f"LLM unavailable: {e}")

print("\nALL PASSED" if failures == 0 else f"\n{failures} FAILED")
sys.exit(1 if failures else 0)
