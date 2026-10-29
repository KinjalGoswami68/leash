"use client";

// Source: motion-primitives.com/c/scroll-progress.json (MIT). Only change: project formatting.
import { RefObject } from "react";
import { SpringOptions, motion, useScroll, useSpring } from "motion/react";
import { cn } from "~~/utils/cn";

export type ScrollProgressProps = {
  className?: string;
  springOptions?: SpringOptions;
  containerRef?: RefObject<HTMLDivElement>;
};

const DEFAULT_SPRING_OPTIONS: SpringOptions = {
  stiffness: 200,
  damping: 50,
  restDelta: 0.001,
};

export function ScrollProgress({ className, springOptions, containerRef }: ScrollProgressProps) {
  // `layoutEffect` option from upstream removed: motion v14 no longer has it.
  const { scrollYProgress } = useScroll({
    container: containerRef,
  });

  const scaleX = useSpring(scrollYProgress, {
    ...DEFAULT_SPRING_OPTIONS,
    ...(springOptions ?? {}),
  });

  return (
    <motion.div
      className={cn("inset-x-0 top-0 h-1 origin-left", className)}
      style={{
        scaleX,
      }}
    />
  );
}
