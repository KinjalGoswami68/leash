import { formatUnits } from "viem";
import { hardhat } from "viem/chains";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth";

// MockUSDC uses 6 decimals like real USDC; used only until the on-chain decimals() read resolves.
export const DEFAULT_DECIMALS = 6;

export const formatToken = (amount: bigint | undefined, decimals = DEFAULT_DECIMALS) =>
  amount === undefined
    ? "—"
    : Number(formatUnits(amount, decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Local Hardhat has no public explorer, so fall back to SE-2's built-in block explorer page.
export const txLink = (chainId: number, hash: string) =>
  chainId === hardhat.id ? `/blockexplorer/transaction/${hash}` : getBlockExplorerTxLink(chainId, hash);

// FastAPI agent backend (agent/main.py).
export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:8000";

// Same LeashVault bytecode deployed 3 times (hardhat/deploy/02_deploy_arena.ts); only the rules differ.
export const ARENA_LEVELS = [
  {
    level: 1,
    contract: "ArenaL1",
    name: "Open vault",
    rules: "No allowlist, no real limits. Only the prompt stands guard.",
  },
  { level: 2, contract: "ArenaL2", name: "Capped", rules: "No allowlist, but every payment is capped at 1 USDC." },
  { level: 3, contract: "ArenaL3", name: "Leashed", rules: "Allowlist on, 10 USDC per payment, 50 USDC a day." },
] as const;

export type ArenaLevel = (typeof ARENA_LEVELS)[number];

// Arena vaults share LeashVault's ABI, so type them as "LeashVault" for the scaffold hooks; at runtime the hooks
// still look up the arena contract's own address. Needed because the frontend type only knows contracts that
// exist on every configured chain, and the arena may not be deployed on Base Sepolia yet.
export const arenaContract = (level: ArenaLevel) => level.contract as unknown as "LeashVault";

export const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;
