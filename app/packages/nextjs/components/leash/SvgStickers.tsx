"use client";

import { ReactNode, useId } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { usePageVisible } from "~~/components/leash/Sparkles";
import { cn } from "~~/utils/cn";

/*
  Original holographic foil stickers, drawn here as inline SVG (no downloaded art, nothing copyrighted).
  Each one = a white "die-cut" layer (the same shapes with a thick white stroke, like the paper edge of a
  real sticker), the art with an iridescent foil fill, then a white glint band clipped to the sticker that
  sweeps across every few seconds. Colors are token classes (fill-maroon-900...) or var(--color-*) in
  gradient stops, never hex: SVG presentation attributes can't read CSS variables, CSS can.
*/

const OUTLINE = "fill-white stroke-white";

const stopStyle = (token: string, opacity = 1) => ({ stopColor: `var(--color-${token})`, stopOpacity: opacity });

/** Unique gradient/clip ids per sticker instance (useId output can contain characters url(#...) dislikes). */
const useStickerIds = () => {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return { holo: `holo${id}`, glint: `glint${id}`, clip: `clip${id}` };
};

/** Foil gradient + glint gradient + the clip that keeps the glint on the sticker. */
const FoilDefs = ({ ids, clip }: { ids: ReturnType<typeof useStickerIds>; clip: ReactNode }) => (
  <defs>
    <linearGradient id={ids.holo} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style={stopStyle("silver-100")} />
      <stop offset="0.3" style={stopStyle("lilac")} />
      <stop offset="0.55" style={stopStyle("mint")} />
      <stop offset="0.8" style={stopStyle("pink")} />
      <stop offset="1" style={stopStyle("silver-200")} />
    </linearGradient>
    <linearGradient id={ids.glint} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" style={stopStyle("white", 0)} />
      <stop offset="0.5" style={stopStyle("white", 0.85)} />
      <stop offset="1" style={stopStyle("white", 0)} />
    </linearGradient>
    <clipPath id={ids.clip}>{clip}</clipPath>
  </defs>
);

/** The sweeping glint band; --glint-delay staggers the stickers. Hidden under reduced motion (CSS). */
const Glint = ({ ids, delay }: { ids: ReturnType<typeof useStickerIds>; delay: number }) => (
  <g clipPath={`url(#${ids.clip})`}>
    <rect
      x={-20}
      y={-20}
      width={34}
      height={160}
      fill={`url(#${ids.glint})`}
      className="leash-sticker-glint"
      style={{ "--glint-delay": `${delay}s` } as React.CSSProperties}
    />
  </g>
);

const SHIELD = "M60 12 L98 26 V58 C98 83 81 101 60 110 C39 101 22 83 22 58 V26 Z";

/** Vault: foil shield with a deep maroon padlock and a lime keyhole dot. */
export const ShieldSticker = () => {
  const ids = useStickerIds();
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
      <FoilDefs ids={ids} clip={<path d={SHIELD} />} />
      <path d={SHIELD} className={OUTLINE} strokeWidth={14} strokeLinejoin="round" />
      <path d={SHIELD} fill={`url(#${ids.holo})`} />
      {/* lighter right-hand facet gives the shield some volume */}
      <path d="M60 19 L91 30.5 V58 C91 79 77 94 60 102 Z" className="fill-white" opacity={0.22} />
      <path
        d="M50 60 V51 a10 10 0 0 1 20 0 V60"
        className="fill-none stroke-maroon-900"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <rect x={42} y={58} width={36} height={28} rx={7} className="fill-maroon-900" />
      <rect x={45} y={61} width={30} height={4} rx={2} className="fill-silver-200" opacity={0.3} />
      <circle cx={60} cy={72} r={4} className="fill-lime" />
      <Glint ids={ids} delay={0} />
    </svg>
  );
};

const LEASH = "M58 68 C78 62 96 72 100 90";

/** Agent: a small friendly foil robot wearing a maroon collar, leash trailing off to a handle loop. */
export const RobotSticker = () => {
  const ids = useStickerIds();
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
      <FoilDefs
        ids={ids}
        clip={
          <>
            <rect x={30} y={22} width={52} height={42} rx={14} />
            <rect x={38} y={64} width={36} height={34} rx={10} />
          </>
        }
      />
      <g className={OUTLINE} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round">
        <line x1={56} y1={24} x2={56} y2={10} />
        <rect x={24} y={22} width={64} height={42} rx={14} />
        <rect x={38} y={64} width={36} height={34} rx={10} />
        <path d={LEASH} className="fill-none" />
        <circle cx={101} cy={98} r={8} />
      </g>
      <line x1={56} y1={24} x2={56} y2={13} className="stroke-silver-400" strokeWidth={4} strokeLinecap="round" />
      <circle cx={56} cy={10} r={5} className="fill-lime" />
      <rect x={24} y={35} width={8} height={14} rx={4} className="fill-silver-400" />
      <rect x={80} y={35} width={8} height={14} rx={4} className="fill-silver-400" />
      <rect x={30} y={22} width={52} height={42} rx={14} fill={`url(#${ids.holo})`} />
      <rect x={37} y={30} width={38} height={25} rx={9} className="fill-maroon-900" />
      <circle cx={49} cy={41} r={4.5} className="fill-lime" />
      <circle cx={63} cy={41} r={4.5} className="fill-lime" />
      <circle cx={50.5} cy={39.5} r={1.4} className="fill-white" />
      <circle cx={64.5} cy={39.5} r={1.4} className="fill-white" />
      <path d="M50 48 Q56 53 62 48" className="fill-none stroke-silver-100" strokeWidth={2.5} strokeLinecap="round" />
      <rect x={38} y={68} width={36} height={30} rx={10} fill={`url(#${ids.holo})`} />
      <circle cx={56} cy={84} r={3.5} className="fill-white" opacity={0.7} />
      {/* collar + tag, then the leash clipped to the tag */}
      <rect x={35} y={61} width={42} height={9} rx={4.5} className="fill-maroon-900" />
      <circle cx={58} cy={71} r={4} className="fill-silver-100 stroke-maroon-900" strokeWidth={1.5} />
      <path d={LEASH} className="fill-none stroke-maroon-900" strokeWidth={4} strokeLinecap="round" />
      <circle cx={101} cy={98} r={7} className="fill-none stroke-maroon-900" strokeWidth={4} />
      <Glint ids={ids} delay={1.4} />
    </svg>
  );
};

/** Blocked: a foil coin with a deep maroon slash (no red: the palette has none). */
export const CoinSticker = () => {
  const ids = useStickerIds();
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
      <FoilDefs ids={ids} clip={<circle cx={60} cy={60} r={40} />} />
      <circle cx={60} cy={60} r={40} className={OUTLINE} strokeWidth={12} />
      <line x1={28} y1={92} x2={92} y2={28} className="stroke-white" strokeWidth={22} strokeLinecap="round" />
      <circle cx={60} cy={60} r={40} fill={`url(#${ids.holo})`} />
      <circle cx={60} cy={60} r={30} className="fill-none stroke-white" strokeWidth={3} opacity={0.55} />
      <path d="M60 44 L72 60 L60 76 L48 60 Z" className="fill-maroon-900" />
      <circle cx={60} cy={60} r={3} className="fill-lime" />
      <Glint ids={ids} delay={2.6} />
      <line x1={28} y1={92} x2={92} y2={28} className="stroke-maroon-900" strokeWidth={10} strokeLinecap="round" />
    </svg>
  );
};

const STAR = "M60 8 C64 42 78 56 112 60 C78 64 64 78 60 112 C56 78 42 64 8 60 C42 56 56 42 60 8 Z";
const SMALL_STAR = "translate(98 22) scale(0.24) translate(-60 -60)";

/** Foil sparkle star, with a tiny lime star tucked top-right. */
export const SparkleSticker = () => {
  const ids = useStickerIds();
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
      <FoilDefs ids={ids} clip={<path d={STAR} />} />
      <path d={STAR} className={OUTLINE} strokeWidth={12} strokeLinejoin="round" />
      <g transform={SMALL_STAR}>
        <path d={STAR} className={OUTLINE} strokeWidth={40} strokeLinejoin="round" />
      </g>
      <path d={STAR} fill={`url(#${ids.holo})`} />
      <path d={STAR} className="fill-white" opacity={0.75} transform="translate(60 60) scale(0.4) translate(-60 -60)" />
      <path d={STAR} className="fill-lime" transform={SMALL_STAR} />
      <Glint ids={ids} delay={0.7} />
    </svg>
  );
};

type FloatingStickerProps = {
  children: ReactNode;
  /** Position + size utilities. */
  className: string;
  /** Resting tilt in degrees (real stickers are never stuck on straight). */
  rotate: number;
  /** Parallax distance in px over the first 600px of scroll. */
  drift?: number;
  /** Offsets the float loop so stickers don't bob in sync. */
  delay?: number;
};

/**
 * Three nested layers so the motions don't fight: scroll parallax (outer) > gentle float loop (middle) >
 * hover wiggle + scale (inner). Under reduced motion the sticker just sits still at its tilt.
 */
export const FloatingSticker = ({ children, className, rotate, drift = -30, delay = 0 }: FloatingStickerProps) => {
  const reduceMotion = useReducedMotion();
  const visible = usePageVisible();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, drift]);
  const still = reduceMotion || !visible;

  return (
    <motion.div
      aria-hidden
      className={cn("pointer-events-auto absolute", !visible && "leash-paused", className)}
      style={reduceMotion ? {} : { y }}
    >
      <motion.div
        animate={still ? { y: 0 } : { y: [0, -7, 0] }}
        transition={still ? { duration: 0.2 } : { duration: 5, repeat: Infinity, ease: "easeInOut", delay }}
      >
        <motion.div
          className="leash-sticker cursor-default"
          style={{ rotate }}
          whileHover={
            reduceMotion ? undefined : { scale: 1.08, rotate: [rotate, rotate - 9, rotate + 7, rotate - 3, rotate] }
          }
          transition={{ duration: 0.45 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

/** 4 stickers in the empty space to the right of the hero text (large screens only: no room on mobile). */
export const HeroStickers = () => (
  <div className="pointer-events-none absolute inset-0 hidden lg:block">
    <FloatingSticker className="right-2 -top-4 h-28 w-28" rotate={8} drift={-40}>
      <ShieldSticker />
    </FloatingSticker>
    <FloatingSticker className="right-40 top-24 h-28 w-28" rotate={-7} drift={-20} delay={1.2}>
      <RobotSticker />
    </FloatingSticker>
    <FloatingSticker className="right-6 top-40 h-20 w-20" rotate={12} drift={-55} delay={2.1}>
      <CoinSticker />
    </FloatingSticker>
    <FloatingSticker className="right-48 -top-6 h-12 w-12" rotate={-12} drift={-25} delay={0.6}>
      <SparkleSticker />
    </FloatingSticker>
  </div>
);
