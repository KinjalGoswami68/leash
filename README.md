# Leash

**The AI got hacked. The money didn't.**

Leash is a smart-contract vault that holds money for an AI agent. The agent gets its own limited key that can do exactly one thing, `pay(to, amount, memo)`, and the contract enforces the spending rules. So when the agent is prompt-injected or jailbroken, the damage is capped by code, not by the prompt.

## Security model

- **Two keys.** The owner key sets rules, pauses and withdraws. The agent key can only call `pay()`. Any other caller of `pay()` reverts (`NotAgent`). The agent can never change rules or withdraw.
- **Rules live in the contract**, checked on every payment, in this order:
  1. owner pause switch (kill switch)
  2. valid recipient and non-zero amount
  3. recipient allowlist
  4. per-payment cap
  5. 24-hour spending cap
  6. vault balance
- **Blocked attempts are evidence, not errors.** A policy violation does not revert. `pay()` returns `false` and emits `Rejected(to, amount, reason)`, so every blocked attempt is recorded on-chain with a readable reason (`NOT_ALLOWLISTED`, `OVER_DAILY_LIMIT`...). A successful payment emits `Paid(to, amount, memo)`.
- **The prompt is not a security boundary.** The agent's system prompt deliberately contains no spending rules. In the demo, the model obeys a hidden instruction in a vendor email and tries to send 500 USDC to an attacker. The contract blocks it.
- **Checks-effects-interactions** order and OpenZeppelin `SafeERC20` / `Ownable`.

## Honest limitation

The daily cap uses a **fixed 24-hour window** that opens with the first payment after the previous window expired. That is O(1) storage and gas. It is not a true sliding window: an agent can spend up to the daily limit at the end of one window and again at the start of the next, so the **worst case is 2x the daily limit across a window boundary**. A true sliding window would need a list of past payments (more gas and storage). The per-payment cap and allowlist still apply to every payment.

Other scope limits: testnet only, MockUSDC (open mint) instead of real USDC, in-memory agent chat sessions (no database).

## Deployed on Base Sepolia (chain 84532)

| Contract | Address |
|---|---|
| LeashVault (dashboard) | [0x295265bbadc647bc34398d6215689bb5245ff658](https://sepolia.basescan.org/address/0x295265bbadc647bc34398d6215689bb5245ff658) |
| MockUSDC (mUSDC, 6 decimals) | [0x62860b6e87c2e35bfbb5388af5419bd533012d31](https://sepolia.basescan.org/address/0x62860b6e87c2e35bfbb5388af5419bd533012d31) |
| Arena Level 1 (no allowlist, no real limits) | [0x440fae0922618b16e411c173ea63c7ef98dc929a](https://sepolia.basescan.org/address/0x440fae0922618b16e411c173ea63c7ef98dc929a) |
| Arena Level 2 (1 USDC per-payment cap) | [0x86d234eb7fec0cefb5d353ca7d416b4e6687ced9](https://sepolia.basescan.org/address/0x86d234eb7fec0cefb5d353ca7d416b4e6687ced9) |
| Arena Level 3 (full rules + allowlist) | [0x11d5f282101a6fc9bb8074610641f6e690e5fe8d](https://sepolia.basescan.org/address/0x11d5f282101a6fc9bb8074610641f6e690e5fe8d) |

Main vault rules: 10 mUSDC per payment, 50 mUSDC per 24h window, allowlist on.

## Repository layout

```
app/                Scaffold-ETH 2 monorepo (yarn)
  packages/hardhat/   contracts/LeashVault.sol, MockUSDC.sol, deploy/, test/
  packages/nextjs/    dashboard (/) and jailbreak arena (/arena)
agent/              Python FastAPI agent: Groq LLM + web3.py, signs with the agent key
DEMO.md             stage runbook and fallbacks
```

## Run locally

Needs Node 20+ with yarn (`corepack enable`), Python 3.11+, and a free Groq API key (console.groq.com, no card).

```powershell
# 1. Chain + contracts (two terminals)
cd app
yarn install
yarn chain                      # terminal A: local Hardhat node on :8545
yarn deploy                     # terminal B: deploys MockUSDC, LeashVault and the 3 arena vaults
yarn test                       # contract tests

# 2. Frontend
yarn start                      # http://localhost:3000

# 3. Agent
cd ..\agent
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env          # then fill it in (see comments in the file)
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8000
.\.venv\Scripts\python.exe preflight.py   # read-only health check of everything
```

Locally the agent key is Hardhat test account #1 (printed by `yarn chain`); never use a real wallet's key. `SCRIPTED_MODE=true` in `agent/.env` replays a fixed demo without any LLM call. On Windows with antivirus HTTPS scanning, run `python make_ca_bundle.py` once in `agent/` if Python reports certificate errors.

Tests cover every rule, the 24h reset with time travel (`evm_increaseTime`), agent impersonation, and a randomized test of 2,000 `pay()` calls with random amounts and recipients that asserts `spentToday <= dailyLimit` after every call.

## Tech stack

- **Contracts:** Solidity 0.8, OpenZeppelin (ERC20, Ownable, SafeERC20), Hardhat 3 with hardhat-deploy (rocketh), ethers, chai, TypeScript.
- **Frontend:** Scaffold-ETH 2, Next.js, React, wagmi, viem, RainbowKit, Tailwind CSS v4, DaisyUI, Motion / Motion Primitives (MIT).
- **Agent:** Python, FastAPI, uvicorn, web3.py, Groq SDK (`openai/gpt-oss-120b`, fallback `openai/gpt-oss-20b`, then scripted mode), python-dotenv.
- **Network:** Base Sepolia testnet.

## Secrets

No keys are in this repository. `agent/.env`, `app/packages/hardhat/.env` and `app/packages/nextjs/.env.local` are git-ignored; each folder has a `.env.example` listing the variables.

The only private key in the code is the public, well-known Hardhat test account #0 key in `app/packages/hardhat/hardhat.config.ts`. That is Scaffold-ETH 2's default for local development and holds nothing.
