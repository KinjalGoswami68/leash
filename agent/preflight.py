"""Pre-demo check. Read-only: no transaction is sent, nothing is written. Never prints keys or the RPC URL path.

Run (agent folder, venv active):  python preflight.py
Each line is OK, WARN (works, but look at it) or FIX THIS (the demo will fail). Exit code 1 if anything needs fixing.
"""
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

import groq
import requests
from eth_account import Account
from web3 import Web3

import config

ROOT = Path(__file__).resolve().parent.parent
DEPLOYMENTS = ROOT / "app" / "packages" / "hardhat" / "deployments"
FRONTEND_CONTRACTS = ROOT / "app" / "packages" / "nextjs" / "contracts" / "deployedContracts.ts"

ETH_FIX, ETH_WARN = 0.0005, 0.002  # Base Sepolia pay() costs ~0.00001 ETH; below 0.0005 a retry storm could run dry.
USDC_DEMO = 5  # the stage pitch pays the vendor 5 USDC

VIEW = [("token", "address"), ("balance", "uint256"), ("remainingToday", "uint256"), ("perPaymentLimit", "uint256"),
        ("paused", "bool"), ("allowlistEnabled", "bool"), ("agent", "address"), ("owner", "address")]
ABI = [{"type": "function", "name": n, "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": t}]}
       for n, t in VIEW]
ABI.append({"type": "function", "name": "allowed", "stateMutability": "view",
            "inputs": [{"name": "", "type": "address"}], "outputs": [{"name": "", "type": "bool"}]})
ERC20 = [{"type": "function", "name": "decimals", "stateMutability": "view", "inputs": [],
          "outputs": [{"name": "", "type": "uint8"}]}]

failures = 0


def report(level: str, text: str, fix: str = "") -> None:
    global failures
    if level == "FIX":
        failures += 1
    tag = {"OK": "OK      ", "WARN": "WARN    ", "FIX": "FIX THIS", "INFO": "INFO    "}[level]
    print(f"{tag}  {text}" + (f"\n          -> {fix}" if fix else ""))


def expected_addresses(chain_id: int) -> dict[str, str]:
    folder = DEPLOYMENTS / ("baseSepolia" if chain_id == 84532 else "default")
    out = {}
    for name in ("LeashVault", "ArenaL1", "ArenaL2", "ArenaL3"):
        f = folder / f"{name}.json"
        if f.exists():
            out[name] = json.loads(f.read_text(encoding="utf-8"))["address"].lower()
    return out


def check_env() -> bool:
    missing = [n for n, v in [("RPC_URL", config.RPC_URL), ("VAULT_ADDRESS", config.VAULT_ADDRESS),
                              ("AGENT_PRIVATE_KEY", config.AGENT_PRIVATE_KEY), ("GROQ_API_KEY", config.GROQ_API_KEY)]
               if not v]
    if missing:
        report("FIX", f"agent\\.env is missing: {', '.join(missing)}", "add them (see agent\\.env.example)")
        return False
    report("OK", "agent\\.env has RPC_URL, VAULT_ADDRESS, AGENT_PRIVATE_KEY, GROQ_API_KEY")
    report("INFO", f"SCRIPTED_MODE={config.SCRIPTED_MODE}, ARENA_MODEL={config.ARENA_MODEL}, "
                   f"FALLBACK_MODEL={config.FALLBACK_MODEL}")
    return True


def check_chain() -> None:
    host = urlparse(config.RPC_URL).hostname
    w3 = Web3(Web3.HTTPProvider(config.RPC_URL, request_kwargs={"timeout": 15}))
    try:
        chain_id = w3.eth.chain_id
        block = w3.eth.block_number
    except Exception as e:
        hint = "run: python make_ca_bundle.py" if "SSL" in type(e).__name__ + str(e) else "check internet / RPC"
        report("FIX", f"RPC {host} not reachable ({type(e).__name__})", hint)
        return
    network = {84532: "Base Sepolia", 31337: "local Hardhat"}.get(chain_id, f"chain {chain_id}")
    report("OK" if chain_id in (84532, 31337) else "WARN", f"RPC {host} reachable: {network}, block {block}")

    agent_addr = Account.from_key(config.AGENT_PRIVATE_KEY).address
    eth = float(Web3.from_wei(w3.eth.get_balance(agent_addr), "ether"))
    level = "FIX" if eth < ETH_FIX else "WARN" if eth < ETH_WARN else "OK"
    report(level, f"agent {agent_addr} has {eth:.5f} ETH for gas",
           "" if level == "OK" else "top up the agent from a Base Sepolia faucet")

    expected = expected_addresses(chain_id)
    frontend = FRONTEND_CONTRACTS.read_text(encoding="utf-8").lower() if FRONTEND_CONTRACTS.exists() else ""
    vaults = {"LeashVault": config.VAULT_ADDRESS, **{f"ArenaL{n}": a for n, a in config.ARENA_VAULTS.items()}}
    for name, addr in vaults.items():
        main = name == "LeashVault"
        if not addr:
            report("FIX" if main else "WARN", f"{name}: address not set in agent\\.env")
            continue
        if not Web3.is_address(addr) or not w3.eth.get_code(Web3.to_checksum_address(addr)):
            report("FIX", f"{name} {addr}: no contract at this address on {network}",
                   "agent\\.env points at another network's address")
            continue
        if expected.get(name) and expected[name] != addr.lower():
            report("WARN", f"{name} {addr} differs from the last deploy ({expected[name]})")
        if frontend and addr.lower() not in frontend:
            report("WARN", f"{name} {addr} is not in the frontend's deployedContracts.ts",
                   "dashboard and agent may be looking at different vaults: re-run yarn deploy")
        check_vault(w3, name, Web3.to_checksum_address(addr), agent_addr, main)


def check_vault(w3: Web3, name: str, addr: str, agent_addr: str, main: bool) -> None:
    v = w3.eth.contract(address=addr, abi=ABI)
    f = v.functions
    dec = w3.eth.contract(address=f.token().call(), abi=ERC20).functions.decimals().call()
    usdc = lambda units: units / 10**dec  # noqa: E731
    bal, left, cap = usdc(f.balance().call()), usdc(f.remainingToday().call()), usdc(f.perPaymentLimit().call())

    if f.agent().call().lower() != agent_addr.lower():
        report("FIX", f"{name}: vault.agent() is not this AGENT_PRIVATE_KEY's address", "wrong key or wrong vault")
        return
    if f.paused().call():
        report("FIX", f"{name}: vault is PAUSED", "owner presses Resume agent on the dashboard")
        return
    need = USDC_DEMO if main else 1
    level = "FIX" if bal < need else "WARN" if main and bal < 50 else "OK"
    report(level, f"{name}: {bal:g} mUSDC in vault, {left:g} left today, {cap:g} per payment",
           "" if level == "OK" else "owner mints/sends mUSDC to the vault (MockUSDC has open mint)")
    if main:
        if left < USDC_DEMO:
            report("FIX", f"{name}: only {left:g} USDC left in today's window: the 5 USDC vendor payment will be "
                          "blocked", "wait for the 24h window to reset or raise dailyLimit (owner)")
        if cap < USDC_DEMO:
            report("FIX", f"{name}: per-payment cap {cap:g} < 5: the vendor payment will be blocked")
        if f.allowlistEnabled().call():
            vendor_ok = f.allowed(Web3.to_checksum_address(config.DEMO_VENDOR)).call()
            attacker_ok = f.allowed(Web3.to_checksum_address(config.DEMO_ATTACKER)).call()
            report("OK" if vendor_ok else "FIX", f"{name}: demo vendor {config.DEMO_VENDOR} "
                   + ("is allowlisted" if vendor_ok else "is NOT allowlisted"),
                   "" if vendor_ok else "owner: setAllowed(vendor, true) in Debug Contracts")
            if attacker_ok:
                report("WARN", f"{name}: demo attacker is allowlisted (block reason will be a cap, not allowlist)")
        else:
            report("WARN", f"{name}: allowlist is off: the 500 USDC attack is stopped by the cap only")
        owner = f.owner().call()
        eth = float(Web3.from_wei(w3.eth.get_balance(owner), "ether"))
        report("OK" if eth >= ETH_FIX else "WARN", f"owner {owner} has {eth:.5f} ETH (needed for Pause)",
               "" if eth >= ETH_FIX else "top up the owner wallet")


def check_groq() -> None:
    try:
        client = groq.Groq(api_key=config.GROQ_API_KEY, max_retries=0, timeout=20)
        available = {m.id for m in client.models.list().data}
    except groq.AuthenticationError:
        report("FIX", "Groq rejected GROQ_API_KEY", "make a new key at console.groq.com/keys")
        return
    except Exception as e:
        hint = "run: python make_ca_bundle.py" if "SSL" in str(e) or "certificate" in str(e).lower() else \
            "no internet? use SCRIPTED_MODE=true (DEMO.md fallback A)"
        report("FIX", f"Groq not reachable ({type(e).__name__})", hint)
        return
    for label, model in [("main model", config.PRIMARY_MODEL), ("fallback model", config.FALLBACK_MODEL),
                         ("arena model", config.ARENA_MODEL)]:
        if model in available:
            report("OK", f"Groq {label} {model} is available")
        else:
            report("FIX", f"Groq {label} {model} does not exist anymore",
                   "set it in agent\\.env to a listed model, e.g. openai/gpt-oss-20b")
    try:
        r = client.chat.completions.create(model=config.PRIMARY_MODEL, max_tokens=16,
                                           messages=[{"role": "user", "content": "Reply with OK."}])
        report("OK", f"Groq answered a 1-line test request ({r.usage.total_tokens} tokens)")
    except groq.RateLimitError:
        report("WARN", "Groq is rate limiting right now (429)", "wait a minute; on stage the agent backs off")
    except Exception as e:
        report("FIX", f"Groq test request failed ({type(e).__name__})", "SCRIPTED_MODE=true (DEMO.md fallback A)")


def check_servers() -> None:
    try:
        # 25s: the first /health after a restart builds the chain client, which takes a few RPC round trips.
        h = requests.get("http://127.0.0.1:8000/health", timeout=25).json()
        if not h.get("ok"):
            report("FIX", "agent server is up but can't reach the chain", "see its terminal for the error")
        elif "arena_model" not in h:
            report("FIX", "agent server is running old code (from before phase 7)",
                   "restart it (Ctrl+C, then the uvicorn line)")
        elif h.get("scripted_mode") != config.SCRIPTED_MODE or h.get("arena_model") != config.ARENA_MODEL:
            report("WARN", "agent server runs with older .env settings", "restart it (Ctrl+C, then the uvicorn line)")
        else:
            report("OK", f"agent server on :8000 (chain {h.get('chain_id')}, scripted={h.get('scripted_mode')})")
    except requests.Timeout:
        report("FIX", "agent server on port 8000 is too slow to answer", "restart it (Ctrl+C, then the uvicorn line)")
    except requests.RequestException:
        report("FIX", "agent server not responding on port 8000", "start it: DEMO.md terminal 2")
    try:
        code = requests.get("http://127.0.0.1:3000", timeout=30).status_code
        report("OK" if code == 200 else "WARN", f"frontend on :3000 answered HTTP {code}")
    except requests.RequestException:
        report("FIX", "frontend not responding on port 3000", "start it: DEMO.md terminal 1")


def main() -> None:
    print("Leash preflight (read-only)\n")
    if check_env():
        check_chain()
        check_groq()
    check_servers()
    print("\nAll good." if not failures else f"\n{failures} thing(s) to fix before the demo.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
