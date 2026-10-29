"use client";

/*
  Source: motion-primitives.com/c/animated-number.json (MIT).
  Changes: `format` prop (token amounts need decimals, upstream rounds to integers); motion[tag] instead of
  motion.create() in render (that remounts every render and fails the React Compiler lint); jumps straight to
  the value under prefers-reduced-motion.
*/
import { useEffect } from "react";
import { SpringOptions, motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { cn } from "~~/utils/cn";

export type AnimatedNumberProps = {
  value: number;
  className?: string;
  springOptions?: SpringOptions;
  as?: React.ElementType;
  format?: (n: number) => string;
};

const defaultFormat = (n: number) => Math.round(n).toLocaleString();

export function AnimatedNumber({
  value,
  className,
  springOptions,
  as = "span",
  format = defaultFormat,
}: AnimatedNumberProps) {
  const MotionComponent = motion[as as keyof typeof motion] as typeof motion.span;
  const reduceMotion = useReducedMotion();

  const spring = useSpring(value, springOptions);
  const display = useTransform(spring, current => format(current));

  useEffect(() => {
    if (reduceMotion) spring.jump(value);
    else spring.set(value);
  }, [spring, value, reduceMotion]);

  return <MotionComponent className={cn("tabular-nums", className)}>{display}</MotionComponent>;
}
