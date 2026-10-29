"use client";

import { Address } from "@scaffold-ui/components";
import { useAccount } from "wagmi";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { CardSpotlight } from "~~/components/leash/CardSpotlight";
import { useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { ArenaLevel, DEFAULT_DECIMALS, arenaContract, formatToken } from "~~/utils/leash";

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
    <span className="leash-label">{label}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

// Anything above this is shown as "no limit": L1/L2 use 1e9 USDC as a stand-in for "unlimited".
const NO_LIMIT = 10n ** 6n * 10n ** 6n;

export const LevelPanel = ({ level }: { level: ArenaLevel }) => {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const vault = { contractName: arenaContract(level) };

  const { data: decimals } = useScaffoldReadContract({ contractName: "MockUSDC", functionName: "decimals" });
  const { data: balance } = useScaffoldReadContract({ ...vault, functionName: "balance" });
  const { data: perPaymentLimit } = useScaffoldReadContract({ ...vault, functionName: "perPaymentLimit" });
  const { data: dailyLimit } = useScaffoldReadContract({ ...vault, functionName: "dailyLimit" });
  const { data: remainingToday } = useScaffoldReadContract({ ...vault, functionName: "remainingToday" });
  const { data: allowlistEnabled } = useScaffoldReadContract({ ...vault, functionName: "allowlistEnabled" });
  const { data: paused } = useScaffoldReadContract({ ...vault, functionName: "paused" });

  const dec = decimals ?? DEFAULT_DECIMALS;
  const limit = (v: bigint | undefined) => (v !== undefined && v >= NO_LIMIT ? "No limit" : formatToken(v, dec));

  return (
    <section className="leash-card flex flex-col gap-4">
      <CardSpotlight />
      <div className="flex items-center gap-3">
        <ShieldCheckIcon className="leash-hover-icon h-6 w-6 text-silver-200" />
        <div>
          <div className="leash-label">Level {level.level}</div>
          <h2 className="m-0 text-xl font-semibold">{level.name}</h2>
        </div>
        {paused && <span className="leash-chip leash-chip-blocked ml-auto">Paused</span>}
      </div>
      <p className="m-0 text-sm text-muted">{level.rules}</p>
      <div>
        <Row label="Vault balance" value={formatToken(balance, dec)} />
        <Row label="Per-payment cap" value={limit(perPaymentLimit)} />
        <Row label="Daily cap" value={limit(dailyLimit)} />
        <Row label="Left today" value={limit(remainingToday)} />
        <Row label="Allowlist" value={allowlistEnabled === undefined ? "—" : allowlistEnabled ? "On" : "Off"} />
      </div>
      <div className="leash-tile p-4">
        <div className="leash-label mb-2">Your address · ask the agent to pay it</div>
        {address ? (
          <Address address={address} chain={targetNetwork} />
        ) : (
          <p className="m-0 text-sm text-muted">Connect a wallet to get on the leaderboard.</p>
        )}
      </div>
    </section>
  );
};
