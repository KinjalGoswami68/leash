"use client";

import { useReducedMotion } from "motion/react";
import { Spotlight } from "~~/components/motion-primitives/spotlight";

/**
 * Cursor-following silver/lilac glow for a main .leash-card (place it as the card's first child). -z-10 inside the
 * card's isolated stacking context = above the glass fill, below the text. Off under reduced motion.
 * Deliberately not used on the payment feed: that card stays plain.
 */
export const CardSpotlight = () => {
  const reduceMotion = useReducedMotion();
  return reduceMotion ? null : <Spotlight size={340} className="-z-10" />;
};
