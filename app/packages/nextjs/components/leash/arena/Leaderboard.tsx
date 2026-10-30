"use client";

import { useMemo } from "react";
import { Address } from "@scaffold-ui/components";
import { useAccount } from "wagmi";
import { useVaultLogs } from "~~/hooks/leash/useVaultLogs";
import { useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { ARENA_LEVELS, DEFAULT_DECIMALS, formatToken } from "~~/utils/leash";
import { contracts } from "~~/utils/scaffold-eth/contract";

type Score = { player: string; won: [bigint, bigint, bigint] };

/**
 * Computed in the browser from on-chain Paid events only. There is no score table, no backend write and no admin
 * key: the only way onto the board is to make the agent actually move money to your address.
 */
export const Leaderboard = () => {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const { data: decimals } = useScaffoldReadContract({ contractName: "MockUSDC", functionName: "decimals" });
  const dec = decimals ?? DEFAULT_DECIMALS;

  // One log stream for all 3 arena vaults (one eth_getLogs per block chunk), split by vault address below.
  const { logs, isLoading: loading } = useVaultLogs(ARENA_LEVELS.map(l => l.contract));
  const levelOf = useMemo(() => {
    const m = new Map<string, number>();
    ARENA_LEVELS.forEach((l, i) => {
      const a = contracts?.[targetNetwork.id]?.[l.contract]?.address;
      if (a) m.set(a.toLowerCase(), i);
    });
    return m;
  }, [targetNetwork.id]);

  const scores = useMemo(() => {
    // Allowlisted vendors get paid by design (normal invoices), so they are not players.
    const vendors = new Set<string>();
    [...logs].reverse().forEach(e => {
      if (e.eventName !== "AllowlistUpdated" || levelOf.get(e.address.toLowerCase()) !== 2) return;
      const a = e.args.account?.toLowerCase();
      if (!a) return;
      if (e.args.allowed) vendors.add(a);
      else vendors.delete(a);
    });

    const byPlayer = new Map<string, Score>();
    logs.forEach(e => {
      const i = levelOf.get(e.address.toLowerCase());
      if (e.eventName !== "Paid" || i === undefined) return;
      const to = e.args.to;
      if (!to || vendors.has(to.toLowerCase())) return;
      const s = byPlayer.get(to.toLowerCase()) ?? { player: to, won: [0n, 0n, 0n] };
      s.won[i] += e.args.amount ?? 0n;
      byPlayer.set(to.toLowerCase(), s);
    });

    // Harder level wins outrank any amount on an easier one: one L3 payout beats draining all of L1.
    const cmp = (a: bigint, b: bigint) => (a === b ? 0 : a > b ? -1 : 1);
    return [...byPlayer.values()].sort(
      (a, b) => cmp(a.won[2], b.won[2]) || cmp(a.won[1], b.won[1]) || cmp(a.won[0], b.won[0]),
    );
  }, [logs, levelOf]);

  return (
    <section className="leash-card flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-2xl font-semibold">Leaderboard</h2>
        <div className="leash-label">Built only from on-chain Paid events · harder level ranks first</div>
      </div>
      {loading ? (
        <p className="m-0 text-sm text-muted">Loading history...</p>
      ) : scores.length === 0 ? (
        <p className="m-0 text-sm text-muted">Nobody has made the agent pay them yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="leash-label">
                <th className="py-2 pr-4 font-normal">#</th>
                <th className="py-2 pr-4 font-normal">Player</th>
                {ARENA_LEVELS.map(l => (
                  <th key={l.level} className="py-2 pr-4 text-right font-normal">
                    L{l.level}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map((s, i) => {
                const me = address?.toLowerCase() === s.player.toLowerCase();
                return (
                  <tr key={s.player} className={`border-t border-line ${me ? "bg-silver-100/10 font-semibold" : ""}`}>
                    <td className="py-2 pr-4 tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <Address address={s.player} chain={targetNetwork} size="sm" />
                    </td>
                    {s.won.map((amount, j) => (
                      <td key={j} className={`py-2 pr-4 text-right tabular-nums ${amount > 0n ? "" : "text-muted"}`}>
                        {formatToken(amount, dec)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
