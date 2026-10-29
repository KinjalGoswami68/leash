"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

type StickerSpec = {
  /** Path under public/, e.g. "/animations/shield.lottie". */
  src: string;
  /** Free file from lottiefiles.com: keep the source URL here for the license trail. */
  source: string;
  /** Position + size utilities (no colors). */
  className: string;
  /** Parallax distance in px over the first 600px of scroll; small on purpose. */
  drift: number;
};

// Empty until free files are dropped into public/animations/. Each entry: filename + source URL, e.g.
// { src: "/animations/shield.lottie", source: "https://lottiefiles.com/...", className: "right-0 top-0 h-20 w-20", drift: -30 },
const STICKERS: StickerSpec[] = [];

const Sticker = ({ src, className, drift }: StickerSpec) => {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, drift]);

  return (
    <motion.div
      aria-hidden
      className={`leash-hover-icon pointer-events-auto absolute ${className}`}
      style={reduceMotion ? undefined : { y }}
    >
      {/* Lottie loops are allowed by the design spec; under reduced motion it shows the first frame only. */}
      <DotLottieReact src={src} loop={!reduceMotion} autoplay={!reduceMotion} />
    </motion.div>
  );
};

/** Decorative Lottie stickers with light scroll parallax. Renders nothing while STICKERS is empty. */
export const Stickers = () => {
  if (STICKERS.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 hidden md:block">
      {STICKERS.map(s => (
        <Sticker key={s.src} {...s} />
      ))}
    </div>
  );
};
