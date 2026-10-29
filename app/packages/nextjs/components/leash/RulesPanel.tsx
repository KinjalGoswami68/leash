"use client";

import { ReactNode, useMemo } from "react";
import { Address } from "@scaffold-ui/components";
import { useReducedMotion } from "motion/react";
import { formatUnits } from "viem";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { CardSpotlight } from "~~/components/leash/CardSpotlight";
import { PauseButton } from "~~/components/leash/PauseButton";
import { AnimatedGroup } from "~~/components/motion-primitives/animated-group";
import { BorderTrail } from "~~/components/motion-primitives/border-trail";
import { SlidingNumber } from "~~/components/motion-primitives/sliding-number";
import { TextShimmer } from "~~/components/motion-primitives/text-shimmer";
import { Tilt } from "~~/components/motion-primitives/tilt";
import { useScaffoldEventHistory, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { DEFAULT_DECIMALS, formatToken } from "~~/utils/leash";

const statVariants = {
  container: { visible: { transition: { staggerChildren: 0.08 } } },
  item: {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
  },
};

// Digits roll to the new value when a payment lands, so the drop is visible during the demo.
// Rounded to 2 decimals like formatToken. Before the first read it shows "—" instead of rolling up from 0.
const TokenNumber = ({ amount, decimals }: { amount: bigint | undefined; decimals: number }) =>
  amount === undefined ? (
    <>—</>
  ) : (
    <SlidingNumber value={Math.round(Number(formatUnits(amount, decimals)) * 100) / 100} />
  );

// Tilt is a cursor effect; under reduced motion the tile is just a tile.
const Stat = ({ label, value, unit, still }: { label: string; value: ReactNode; unit?: string; still: boolean }) => {
  const tile = (
    <div className="leash-tile h-full p-4">
      <div className="leash-label">{label}</div>
      <div className="mt-2 flex items-baseline gap-1 font-display text-2xl font-semibold">
        {value}
        {unit && <span className="font-sans text-sm font-normal text-muted">{unit}</span>}
      </div>
    </div>
  );
  return still ? (
    tile
  ) : (
    <Tilt rotationFactor={6} className="h-full" springOptions={{ stiffness: 260, damping: 22 }}>
      {tile}
    </Tilt>
  );
};

export const RulesPanel = () => {
  const { targetNetwork } = useTargetNetwork();
  const vault = { contractName: "LeashVault" } as const;

  const { data: decimals } = useScaffoldReadContract({ contractName: "MockUSDC", functionName: "decimals" });
  const { data: symbol } = useScaffoldReadContract({ contractName: "MockUSDC", functionName: "symbol" });
  const { data: balance } = useScaffoldReadContract({ ...vault, functionName: "balance" });
  const { data: perPaymentLimit } = useScaffoldReadContract({ ...vault, functionName: "perPaymentLimit" });
  const { data: dailyLimit } = useScaffoldReadContract({ ...vault, functionName: "dailyLimit" });
  const { data: spentToday } = useScaffoldReadContract({ ...vault, functionName: "spentToday" });
  const { data: remainingToday } = useScaffoldReadContract({ ...vault, functionName: "remainingToday" });
  const { data: allowlistEnabled } = useScaffoldReadContract({ ...vault, functionName: "allowlistEnabled" });
  const { data: paused } = useScaffoldReadContract({ ...vault, functionName: "paused" });
  const { data: agent } = useScaffoldReadContract({ ...vault, functionName: "agent" });
  const { data: owner } = useScaffoldReadContract({ ...vault, functionName: "owner" });

  // The contract keeps the allowlist as a mapping (not enumerable), so rebuild the list from AllowlistUpdated events.
  const { data: allowEvents } = useScaffoldEventHistory({ ...vault, eventName: "AllowlistUpdated", watch: true });
  const allowlist = useMemo(() => {
    const state = new Map<string, boolean>();
    // Events arrive newest first; replay oldest first so the latest change wins.
    [...(allowEvents ?? [])].reverse().forEach(e => {
      if (e.args.account) state.set(e.args.account, Boolean(e.args.allowed));
    });
    return [...state].filter(([, ok]) => ok).map(([account]) => account);
  }, [allowEvents]);

  // Trail, shimmer, spotlight and tilt aren't transform animations, so MotionConfig doesn't stop them: skip here.
  const reduceMotion = !!useReducedMotion();
  const dec = decimals ?? DEFAULT_DECIMALS;
  const unit = symbol ?? "USDC";
  const usedPct =
    spentToday !== undefined && dailyLimit ? Math.min(100, Number((spentToday * 10000n) / dailyLimit) / 100) : 0;

  return (
    <section className="leash-card flex flex-col gap-6">
      <CardSpotlight />
      {!reduceMotion && <BorderTrail size={90} transition={{ repeat: Infinity, duration: 8, ease: "linear" }} />}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="leash-hover-icon h-7 w-7 text-silver-200" />
          <div>
            <h2 className="m-0 text-2xl font-semibold">Vault rules</h2>
            <div className="leash-label">Enforced by the contract, not the prompt</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`leash-chip ${paused ? "leash-chip-blocked" : "leash-chip-paid"}`}>
            {paused === undefined ? (
              "…"
            ) : paused ? (
              "Paused"
            ) : reduceMotion ? (
              "Active"
            ) : (
              // Base color set explicitly: shimmer text is transparent, so "currentColor" would vanish
              // and only the moving highlight would show (the old clipped "VE" bug).
              <TextShimmer as="span" duration={2.5} className="[--base-color:var(--color-lime)]">
                Active
              </TextShimmer>
            )}
          </span>
          <PauseButton owner={owner} paused={paused} />
        </div>
      </div>

      <AnimatedGroup className="grid grid-cols-2 gap-4 lg:grid-cols-4" variants={statVariants}>
        <Stat
          label="Vault balance"
          value={<TokenNumber amount={balance} decimals={dec} />}
          unit={unit}
          still={reduceMotion}
        />
        <Stat label="Per-payment cap" value={formatToken(perPaymentLimit, dec)} unit={unit} still={reduceMotion} />
        <Stat label="Daily cap" value={formatToken(dailyLimit, dec)} unit={unit} still={reduceMotion} />
        <Stat
          label="Left today"
          value={<TokenNumber amount={remainingToday} decimals={dec} />}
          unit={unit}
          still={reduceMotion}
        />
      </AnimatedGroup>

      <div>
        <div className="flex justify-between">
          <span className="leash-label">Spent in the current 24h window</span>
          <span className="text-sm tabular-nums text-muted">
            {formatToken(spentToday, dec)} / {formatToken(dailyLimit, dec)} {unit}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-jet/70">
          <div
            className="h-full rounded-full bg-silver-200 shadow-glow-silver transition-all"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="leash-tile p-4">
          <div className="leash-label mb-2">Agent key (can only call pay)</div>
          <Address address={agent} chain={targetNetwork} />
          <div className="leash-label mb-2 mt-4">Owner key (sets rules, pauses, withdraws)</div>
          <Address address={owner} chain={targetNetwork} />
        </div>
        <div className="leash-tile p-4">
          <div className="leash-label mb-2">
            Recipient allowlist · {allowlistEnabled === undefined ? "…" : allowlistEnabled ? "on" : "off"}
          </div>
          {!allowlistEnabled ? (
            <p className="m-0 text-sm text-muted">Any recipient is allowed.</p>
          ) : allowlist.length === 0 ? (
            <p className="m-0 text-sm text-muted">No recipients allowed yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {allowlist.map(a => (
                <li key={a}>
                  <Address address={a} chain={targetNetwork} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
