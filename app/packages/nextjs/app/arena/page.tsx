"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { Reveal } from "~~/components/leash/Reveal";
import { FloatingSticker, RobotSticker } from "~~/components/leash/SvgStickers";
import { ArenaChat } from "~~/components/leash/arena/ArenaChat";
import { Leaderboard } from "~~/components/leash/arena/Leaderboard";
import { LevelPanel } from "~~/components/leash/arena/LevelPanel";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { ARENA_LEVELS, arenaContract } from "~~/utils/leash";

const Arena: NextPage = () => {
  const [selected, setSelected] = useState(0);
  const level = ARENA_LEVELS[selected];
  const { data: deployed, isLoading } = useDeployedContractInfo({ contractName: arenaContract(level) });

  return (
    <div className="mx-auto flex w-full max-w-5xl grow flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="relative">
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          <FloatingSticker className="-top-2 right-4 h-28 w-28" rotate={7} drift={-35}>
            <RobotSticker />
          </FloatingSticker>
        </div>
        <div className="leash-eyebrow">Leash · jailbreak arena</div>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-[1.05] sm:text-6xl">
          <span className="leash-holo">Hack the agent.</span> <span className="leash-lime-glow">Try to get paid.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted">
          One agent, one prompt, three vaults. The jailbreak that drains Level 1 is the same one that fails on Level 3:
          the only thing that changes is the rules in the contract.
        </p>
      </header>

      <div role="tablist" className="grid grid-cols-3 gap-2">
        {ARENA_LEVELS.map((l, i) => (
          <button
            key={l.level}
            role="tab"
            aria-selected={i === selected}
            onClick={() => setSelected(i)}
            className={`rounded-xl border p-3 text-left backdrop-blur-md transition duration-200 ${
              i === selected
                ? "border-silver-200/50 bg-silver-100/10 shadow-glow-silver"
                : "border-line bg-card hover:border-silver-200/40"
            }`}
          >
            <div className="leash-label">Level {l.level}</div>
            <div className="font-display font-semibold">{l.name}</div>
          </button>
        ))}
      </div>

      <Reveal>
        {!deployed && !isLoading ? (
          <section className="leash-card">
            <p className="m-0 text-muted">
              Level {level.level} is not deployed on this network yet. Locally run{" "}
              <span className="font-semibold text-ink">yarn deploy --tags Arena</span>.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ArenaChat level={level} />
            </div>
            <div className="lg:col-span-2">
              <LevelPanel level={level} />
            </div>
          </div>
        )}
      </Reveal>

      <Reveal>
        <Leaderboard />
      </Reveal>
    </div>
  );
};

export default Arena;
