"use client";

import type { NextPage } from "next";
import { EventFeed } from "~~/components/leash/EventFeed";
import { Reveal } from "~~/components/leash/Reveal";
import { RulesPanel } from "~~/components/leash/RulesPanel";
import { SparkleField } from "~~/components/leash/Sparkles";
import { Stickers } from "~~/components/leash/Stickers";
import { HeroStickers } from "~~/components/leash/SvgStickers";
import { TextEffect } from "~~/components/motion-primitives/text-effect";

const Dashboard: NextPage = () => {
  return (
    <div className="mx-auto flex w-full max-w-5xl grow flex-col gap-8 px-4 py-10 sm:px-6">
      {/* isolate: the sparkle canvas (-z-10) stays inside the hero, above the page background, under the text. */}
      <header className="relative isolate py-4">
        <SparkleField className="-inset-x-4 -inset-y-8 -z-10 h-[calc(100%+4rem)] w-[calc(100%+2rem)]" cursorTrail />
        <HeroStickers />
        {/* Lottie slot, empty until free files are added (see Stickers.tsx). */}
        <Stickers />
        <div className="leash-eyebrow">Leash · agent spending vault</div>
        {/* Two TextEffects: holographic chrome first half, lime punchline that lands after the setup. */}
        <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-[1.05] sm:text-6xl">
          <TextEffect as="span" per="word" preset="fade-in-blur" segmentClassName="leash-holo">
            The AI got hacked.
          </TextEffect>{" "}
          <TextEffect as="span" per="word" preset="fade-in-blur" delay={0.45} className="leash-lime-glow">
            The money didn&apos;t.
          </TextEffect>
        </h1>
        <p className="max-w-xl text-lg text-muted">
          The agent holds a key that can only call <span className="font-semibold text-ink">pay()</span>. Caps, the
          allowlist and the kill switch live in the contract, so a jailbroken agent hits the same wall as everyone else.
        </p>
      </header>
      <Reveal>
        <RulesPanel />
      </Reveal>
      <Reveal>
        <EventFeed />
      </Reveal>
    </div>
  );
};

export default Dashboard;
