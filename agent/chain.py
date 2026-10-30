"""web3.py client for LeashVault. The agent key can only call pay(); every rule lives in the contract."""
import threading
import time
from decimal import Decimal, InvalidOperation

from eth_account import Account
from web3 import Web3
from web3.exceptions import Web3RPCError
from web3.logs import DISCARD

import config

# Minimal ABI: only what the agent uses. Owner functions are left out on purpose; the agent has no use for them.
VAULT_ABI = [
    {"type": "function", "name": "pay", "stateMutability": "nonpayable",
     "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"},
                {"name": "memo", "type": "string"}],
     "outputs": [{"name": "", "type": "bool"}]},
    *[{"type": "function", "name": n, "stateMutability": "view", "inputs": [],
       "outputs": [{"name": "", "type": t}]}
      for n, t in [("token", "address"), ("balance", "uint256"), ("spentToday", "uint256"),
                   ("remainingToday", "uint256"), ("perPaymentLimit", "uint256"),
                   ("dailyLimit", "uint256"), ("paused", "bool"), ("allowlistEnabled", "bool")]],
    {"type": "event", "name": "Paid", "anonymous": False,
     "inputs": [{"name": "to", "type": "address", "indexed": True},
                {"name": "amount", "type": "uint256", "indexed": False},
                {"name": "memo", "type": "string", "indexed": False}]},
    {"type": "event", "name": "Rejected", "anonymous": False,
     "inputs": [{"name": "to", "type": "address", "indexed": True},
                {"name": "amount", "type": "uint256", "indexed": False},
                {"name": "reason", "type": "string", "indexed": False}]},
]
ERC20_ABI = [{"type": "function", "name": n, "stateMutability": "view", "inputs": [],
              "outputs": [{"name": "", "type": t}]} for n, t in [("decimals", "uint8"), ("symbol", "string")]]

OUT_OF_GAS = "Agent is out of test gas"
MEMO_MAX = 140  # memo is stored in event data; capping it bounds gas per call.

# One agent key signs for every vault (main + 3 arena levels) = one nonce sequence, so one lock for all clients.
_SEND_LOCK = threading.Lock()


class VaultClient:
    def __init__(self, vault_address: str, rpc_url: str = config.RPC_URL, private_key: str = config.AGENT_PRIVATE_KEY):
        if not private_key:
            raise RuntimeError("AGENT_PRIVATE_KEY is not set (agent/.env or Space secrets)")
        if not Web3.is_address(vault_address):
            raise RuntimeError("VAULT_ADDRESS is missing or not a valid address")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = Account.from_key(private_key)
        self.vault = self.w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=VAULT_ABI)
        token = self.w3.eth.contract(address=self.vault.functions.token().call(), abi=ERC20_ABI)
        self.decimals = token.functions.decimals().call()
        self.symbol = token.functions.symbol().call()
        self.chain_id = self.w3.eth.chain_id

    def _fmt(self, units: int) -> str:
        return str(Decimal(units) / (Decimal(10) ** self.decimals))

    def has_gas(self) -> bool:
        return self.w3.eth.get_balance(self.account.address) >= Web3.to_wei(config.MIN_AGENT_ETH, "ether")

    def get_balance(self) -> dict:
        f = self.vault.functions
        return {
            "vault_balance": self._fmt(f.balance().call()),
            "spent_today": self._fmt(f.spentToday().call()),
            "remaining_today": self._fmt(f.remainingToday().call()),
            "per_payment_limit": self._fmt(f.perPaymentLimit().call()),
            "daily_limit": self._fmt(f.dailyLimit().call()),
            "paused": f.paused().call(),
            "allowlist_enabled": f.allowlistEnabled().call(),
            "token": self.symbol,
        }

    def pay(self, to: str, amount, memo: str = "") -> dict:
        # Only input that can't be encoded is refused here; every policy decision is left to the contract,
        # so a blocked attempt still lands on-chain as a Rejected event.
        if not isinstance(to, str) or not Web3.is_address(to):
            return {"status": "error", "error": "invalid recipient address"}
        try:
            units = int((Decimal(str(amount)) * (Decimal(10) ** self.decimals)).to_integral_value())
        except (InvalidOperation, ValueError):
            return {"status": "error", "error": "invalid amount"}
        if units < 0 or units >= 2**256:
            return {"status": "error", "error": "invalid amount"}

        if not self.has_gas():
            return {"status": "error", "error": OUT_OF_GAS}

        to = Web3.to_checksum_address(to)
        memo = str(memo or "")[:MEMO_MAX]
        with _SEND_LOCK:
            tx_hash = self._send_pay(to, units, memo)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=config.TX_TIMEOUT_S)

        result = {"to": to, "amount": self._fmt(units), "tx_hash": "0x" + receipt.transactionHash.hex().removeprefix("0x")}
        if receipt.status != 1:
            return {**result, "status": "reverted"}
        if self.vault.events.Paid().process_receipt(receipt, errors=DISCARD):
            return {**result, "status": "paid", "memo": memo}
        rejected = self.vault.events.Rejected().process_receipt(receipt, errors=DISCARD)
        reason = rejected[0]["args"]["reason"] if rejected else "UNKNOWN"
        return {**result, "status": "rejected", "reason": reason}


    def _send_pay(self, to: str, units: int, memo: str):
        # The lock only covers this process. On Vercel two function instances can read the same pending nonce at
        # once; the loser gets a nonce error, so re-read the nonce and resend (best-effort, 3 tries).
        for attempt in range(3):
            tx = self.vault.functions.pay(to, units, memo).build_transaction({
                "from": self.account.address,
                "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                "chainId": self.chain_id,
            })
            try:
                return self.w3.eth.send_raw_transaction(self.account.sign_transaction(tx).raw_transaction)
            except Web3RPCError as e:
                msg = str(e).lower()
                if attempt == 2 or not any(k in msg for k in ("nonce", "underpriced", "already known")):
                    raise
                time.sleep(1 + attempt)


_clients: dict[int, VaultClient] = {}
_clients_lock = threading.Lock()


def get_client(level: int = 0) -> VaultClient:
    """level 0 = the main dashboard vault, 1-3 = arena vaults."""
    with _clients_lock:
        if level not in _clients:
            address = config.VAULT_ADDRESS if level == 0 else config.ARENA_VAULTS.get(level, "")
            if level and not address:
                raise RuntimeError(f"ARENA_L{level}_ADDRESS is not set (agent/.env or Space secrets)")
            _clients[level] = VaultClient(address)
        return _clients[level]
