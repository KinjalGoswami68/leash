"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { AnimatePresence, motion } from "motion/react";
import type { Chain } from "viem";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import { SparkleBurst } from "~~/components/leash/Sparkles";
import { useScaffoldEventHistory, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { DEFAULT_DECIMALS, formatToken, shortHash, txLink } from "~~/utils/leash";

type FeedRow = {
  kind: "paid" | "rejected";
  to?: string;
  amount?: bigint;
  note?: string;
  hash: string;
  block: bigint;
  logIndex: number;
};

const rowKey = (r: FeedRow) => `${r.hash}-${r.logIndex}`;

// New rows drop in from the top. Cosmetic only: the row is in the DOM on the same render as the event
// arrives, motion just eases it in over ~0.4s.
const rowMotion = {
  initial: { opacity: 0, y: -16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" as const },
};

/**
 * Paid = lime chip with glow; Blocked = maroon chip. A live Blocked chip shakes once, right after its row
 * has slid in (the x shake is a transform, so MotionConfig drops it under reduced motion).
 */
const StatusChip = ({ isPaid, live }: { isPaid: boolean; live: boolean }) => (
  <motion.span
    className={`leash-chip ${isPaid ? "leash-chip-paid" : "leash-chip-blocked"}`}
    animate={live && !isPaid ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
    transition={{ delay: 0.4, duration: 0.4 }}
  >
    {isPaid ? <CheckCircleIcon className="h-4 w-4" /> : <NoSymbolIcon className="h-4 w-4" />}
    {isPaid ? "Paid" : "Blocked"}
  </motion.span>
);

/**
 * The rows. Mounted once history has loaded; the lazy useState snapshot is the set of rows that were
 * already on-chain at that moment. Anything not in it arrived live, and only those get a sparkle burst
 * (the feed itself stays plain: no tilt, spotlight or idle sparkles).
 */
const FeedList = ({ rows, dec, chain }: { rows: FeedRow[]; dec: number; chain: Chain }) => {
  const [historic] = useState(() => new Set(rows.map(rowKey)));

  if (rows.length === 0)
    return <p className="m-0 text-sm text-muted">No payments yet. Ask the agent to pay someone.</p>;

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {/* initial={false}: rows already on-chain when the page loads appear still; only live ones animate. */}
      <AnimatePresence initial={false}>
        {rows.map(r => {
          const isPaid = r.kind === "paid";
          const href = txLink(chain.id, r.hash);
          const key = rowKey(r);
          const live = !historic.has(key);
          return (
            <motion.li
              key={key}
              layout="position"
              {...rowMotion}
              className={`relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-l-4 border-line bg-jet/50 p-3 ${
                isPaid ? "border-l-lime/70" : "border-l-maroon-600"
              }`}
            >
              {live && <SparkleBurst tone={isPaid ? "lime" : "silver"} className="left-12 top-1/2" />}
              <div className="w-28">
                <StatusChip isPaid={isPaid} live={live} />
              </div>
              <div className="w-28 font-semibold tabular-nums">{formatToken(r.amount, dec)}</div>
              <div className="min-w-0">
                <Address address={r.to} chain={chain} size="sm" />
              </div>
              <div className={`min-w-0 flex-1 truncate text-sm ${isPaid ? "text-muted" : "text-blush"}`} title={r.note}>
                {r.note || "—"}
              </div>
              {href && (
                <Link
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="flex items-center gap-1 font-mono text-xs text-muted hover:text-ink"
                >
                  {shortHash(r.hash)}
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </Link>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
};

/** Live log of every pay() attempt: Paid rows and Rejected rows side by side, newest first. */
export const EventFeed = () => {
  const { targetNetwork } = useTargetNetwork();
  const { data: decimals } = useScaffoldReadContract({ contractName: "MockUSDC", functionName: "decimals" });
  const dec = decimals ?? DEFAULT_DECIMALS;

  const paid = useScaffoldEventHistory({ contractName: "LeashVault", eventName: "Paid", watch: true });
  const rejected = useScaffoldEventHistory({ contractName: "LeashVault", eventName: "Rejected", watch: true });

  const rows = useMemo(() => {
    const out: FeedRow[] = [];
    paid.data?.forEach(e =>
      out.push({
        kind: "paid",
        to: e.args.to,
        amount: e.args.amount,
        note: e.args.memo,
        hash: e.transactionHash,
        block: e.blockNumber,
        logIndex: e.logIndex,
      }),
    );
    rejected.data?.forEach(e =>
      out.push({
        kind: "rejected",
        to: e.args.to,
        amount: e.args.amount,
        note: e.args.reason,
        hash: e.transactionHash,
        block: e.blockNumber,
        logIndex: e.logIndex,
      }),
    );
    return out.sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1));
  }, [paid.data, rejected.data]);

  const paidCount = rows.filter(r => r.kind === "paid").length;
  const blockedCount = rows.length - paidCount;
  const loading = paid.isLoading || rejected.isLoading;

  return (
    <section className="leash-card flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-2xl font-semibold">Live payment feed</h2>
          <div className="leash-label">Every attempt is recorded on-chain</div>
        </div>
        <div className="flex gap-4 text-sm font-semibold tabular-nums">
          <span className="leash-lime-glow">{paidCount} paid</span>
          <span className="text-blush">{blockedCount} blocked</span>
        </div>
      </div>

      {loading ? (
        <p className="m-0 text-sm text-muted">Loading events…</p>
      ) : (
        // Mounted even when empty, so on a fresh vault the very first live payment still gets its burst.
        <FeedList rows={rows} dec={dec} chain={targetNetwork} />
      )}
    </section>
  );
};
