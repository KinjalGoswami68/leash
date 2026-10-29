"use client";

import { ReactNode } from "react";
import { InView } from "~~/components/motion-primitives/in-view";

// One shared preset so every section enters the same way. The y offset is dropped automatically under
// prefers-reduced-motion by <MotionConfig reducedMotion="user"> in the providers; only the fade remains.
const variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

/** Fades and slides a section up the first time it scrolls into view. */
export const Reveal = ({ children }: { children: ReactNode }) => (
  <InView
    variants={variants}
    transition={{ duration: 0.4, ease: "easeOut" }}
    viewOptions={{ once: true, margin: "0px 0px -60px 0px" }}
    once
  >
    {children}
  </InView>
);
