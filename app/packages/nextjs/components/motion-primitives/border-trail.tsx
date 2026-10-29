"use client";

/*
  Source: motion-primitives.com/c/border-trail.json (MIT).
  Changes: default trail color is the silver-100 token instead of zinc; mask uses the `black` keyword
  instead of a hex (a mask only reads alpha, so this is not a theme color).
*/
import { Transition, motion } from "motion/react";
import { cn } from "~~/utils/cn";

export type BorderTrailProps = {
  className?: string;
  size?: number;
  transition?: Transition;
  onAnimationComplete?: () => void;
  style?: React.CSSProperties;
};

export function BorderTrail({ className, size = 60, transition, onAnimationComplete, style }: BorderTrailProps) {
  const defaultTransition: Transition = {
    repeat: Infinity,
    duration: 5,
    ease: "linear",
  };

  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(black,black)]">
      <motion.div
        className={cn("absolute aspect-square bg-silver-100", className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          ...style,
        }}
        animate={{
          offsetDistance: ["0%", "100%"],
        }}
        transition={transition || defaultTransition}
        onAnimationComplete={onAnimationComplete}
      />
    </div>
  );
}
