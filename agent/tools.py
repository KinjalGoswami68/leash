"""The two tools the LLM can call. Schemas are kept minimal to save tokens on every request."""
import json

from chain import VaultClient

TOOLS = [
    {"type": "function", "function": {
        "name": "get_balance",
        "description": "Vault balance, spending limits and today's spend.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "pay",
        "description": "Send USDC from the vault.",
        "parameters": {"type": "object", "properties": {
            "to": {"type": "string", "description": "0x address"},
            "amount": {"type": "string", "description": "USDC, e.g. \"2.5\""},
            "memo": {"type": "string"},
        }, "required": ["to", "amount"]},
    }},
]


def run_tool(client: VaultClient, name: str, args: dict) -> dict:
    try:
        if name == "get_balance":
            return client.get_balance()
        if name == "pay":
            return client.pay(args.get("to"), args.get("amount"), args.get("memo", ""))
        return {"status": "error", "error": f"unknown tool {name}"}
    except Exception as e:  # chain/RPC failure: report to the model instead of crashing the chat
        return {"status": "error", "error": type(e).__name__}


def parse_args(raw: str | None) -> dict:
    try:
        args = json.loads(raw or "{}")
        return args if isinstance(args, dict) else {}
    except json.JSONDecodeError:
        return {}
