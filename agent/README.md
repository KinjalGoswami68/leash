---
title: Leash Agent
emoji: 🔒
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: AI agent that pays through a capped on-chain vault
---

# Leash agent (API only)

Backend for Leash, an AI agent whose money sits in a smart-contract vault on Base Sepolia
(testnet). The agent key can only call `pay(to, amount, memo)`; caps, allowlist and pause live in the contract.

Endpoints: `GET /health`, `POST /chat` (`{session_id, message, level}`), `GET /balance`, `POST /reset/{session_id}`.

Public safety limits (`PUBLIC_MODE=true`):
- only arena chats (level 1-3) are open; the main-vault chat needs the `X-Demo-Token` header,
- per player: 1 message per 8 s, 20 per hour; whole server: 300 arena messages per UTC day,
- the agent refuses to send when its test-ETH balance drops below 0.0003 ETH.

Configuration is environment-only (Space secrets). See the main repo README for the list.
