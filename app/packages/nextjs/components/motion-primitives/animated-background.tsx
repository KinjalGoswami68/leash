"use client";

/*
  Source: motion-primitives.com/c/animated-background.json (MIT).
  Changes: import path; children typed without `any`; `defaultValue` read during render (React's
  "adjust state when a prop changes" pattern) instead of a setState inside useEffect, which the React
  Compiler lint rejects. Behaviour is the same: when defaultValue changes (route change), the highlight
  slides to the new item.
*/
import { Children, ReactElement, cloneElement, useId, useState } from "react";
import { AnimatePresence, Transition, motion } from "motion/react";
import { cn } from "~~/utils/cn";

type ItemProps = {
  "data-id": string;
  "data-checked"?: string;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export type AnimatedBackgroundProps = {
  children: ReactElement<ItemProps>[] | ReactElement<ItemProps>;
  defaultValue?: string;
  onValueChange?: (newActiveId: string | null) => void;
  className?: string;
  transition?: Transition;
  enableHover?: boolean;
};

export function AnimatedBackground({
  children,
  defaultValue,
  onValueChange,
  className,
  transition,
  enableHover = false,
}: AnimatedBackgroundProps) {
  const [activeId, setActiveId] = useState<string | null>(defaultValue ?? null);
  const [prevDefault, setPrevDefault] = useState(defaultValue);
  const uniqueId = useId();

  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue);
    if (defaultValue !== undefined) setActiveId(defaultValue);
  }

  const handleSetActiveId = (id: string | null) => {
    setActiveId(id);

    if (onValueChange) {
      onValueChange(id);
    }
  };

  return Children.map(children, child => {
    const id = child.props["data-id"];

    const interactionProps = enableHover
      ? {
          onMouseEnter: () => handleSetActiveId(id),
          onMouseLeave: () => handleSetActiveId(null),
        }
      : {
          onClick: () => handleSetActiveId(id),
        };

    return cloneElement(
      child,
      {
        className: cn("relative inline-flex", child.props.className),
        "data-checked": activeId === id ? "true" : "false",
        ...interactionProps,
      } satisfies Partial<ItemProps>,
      <>
        <AnimatePresence initial={false}>
          {activeId === id && (
            <motion.div
              layoutId={`background-${uniqueId}`}
              className={cn("absolute inset-0", className)}
              transition={transition}
              initial={{ opacity: defaultValue ? 1 : 0 }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
            />
          )}
        </AnimatePresence>
        <div className="z-10">{child.props.children}</div>
      </>,
    );
  });
}
