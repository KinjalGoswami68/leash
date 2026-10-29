"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "~~/utils/cn";

// 4-point star, centered in a 24x24 box (used by the DOM sparkle bursts).
const STAR_PATH = "M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z";

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** True while the tab is visible. Sparkle loops use it to pause in background tabs. */
export const usePageVisible = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );

type Star = { x: number; y: number; r: number; lilac: boolean; phase: number; speed: number };
type Glint = { x: number; y: number; size: number; next: number; start: number };
type Trail = { x: number; y: number; vx: number; vy: number; size: number; born: number };

const FRAME_MS = 1000 / 30; // 30fps cap: twinkles don't need 60, and it halves the battery cost.
const STAR_COUNT = 90;
const GLINT_COUNT = 7;
const GLINT_MS = 900;
const TRAIL_MAX = 20;
const TRAIL_MS = 700;
const TRAIL_SPAWN_MS = 40;

const makeField = () => ({
  stars: Array.from(
    { length: STAR_COUNT },
    (): Star => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.1,
      lilac: Math.random() < 0.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.4,
    }),
  ),
  glints: Array.from(
    { length: GLINT_COUNT },
    (): Glint => ({
      x: Math.random(),
      y: Math.random(),
      size: 5 + Math.random() * 5,
      next: Math.random() * 6000,
      start: -1,
    }),
  ),
});

/** Concave 4-point star (quadratic curves pulled to the center). */
const star4 = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
};

/**
 * Hero sparkle field on a canvas (one element instead of ~100 animated DOM nodes): 90 tiny twinkling stars
 * (~20% lilac), 7 larger 4-point glints with a thin cross-flare that flash at random, and, when
 * `cursorTrail` is on, tiny silver sparkles trailing the mouse inside the parent element.
 * Capped at 30fps, stopped while the tab is hidden, drawn once as a still field under reduced motion.
 */
export const SparkleField = ({ className, cursorTrail = false }: { className?: string; cursorTrail?: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Positions survive effect re-runs (tab hidden/visible) so the field doesn't reshuffle.
  const fieldRef = useRef<ReturnType<typeof makeField> | null>(null);
  const reduceMotion = useReducedMotion();
  const visible = usePageVisible();
  const still = Boolean(reduceMotion) || !visible;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    fieldRef.current ??= makeField();
    const { stars, glints } = fieldRef.current;
    const trail: Trail[] = [];

    // Colors come from the theme tokens, not hex literals.
    const css = getComputedStyle(document.documentElement);
    const silver = css.getPropertyValue("--color-silver-100").trim() || "white";
    const lilac = css.getPropertyValue("--color-lilac").trim() || silver;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        const twinkle = still ? 0.55 : 0.2 + 0.7 * (0.5 + 0.5 * Math.sin(s.phase + (t / 1000) * s.speed));
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = s.lilac ? lilac : silver;
        const x = s.x * width;
        const y = s.y * height;
        if (s.r > 1.1) star4(ctx, x, y, s.r * 2.4);
        else {
          ctx.beginPath();
          ctx.arc(x, y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!still) {
        ctx.fillStyle = silver;
        ctx.strokeStyle = silver;
        ctx.lineWidth = 0.6;
        for (const g of glints) {
          if (g.start < 0 && t >= g.next) g.start = t;
          if (g.start < 0) continue;
          const p = (t - g.start) / GLINT_MS;
          if (p >= 1) {
            // Re-arm somewhere else, 2.5-9.5s from now.
            g.start = -1;
            g.next = t + 2500 + Math.random() * 7000;
            g.x = Math.random();
            g.y = Math.random();
            continue;
          }
          const k = Math.sin(p * Math.PI); // 0 -> 1 -> 0
          const x = g.x * width;
          const y = g.y * height;
          const flare = g.size * 3.2 * k;
          ctx.globalAlpha = 0.55 * k;
          ctx.beginPath();
          ctx.moveTo(x - flare, y);
          ctx.lineTo(x + flare, y);
          ctx.moveTo(x, y - flare);
          ctx.lineTo(x, y + flare);
          ctx.stroke();
          ctx.globalAlpha = k;
          star4(ctx, x, y, g.size * k);
        }

        ctx.fillStyle = silver;
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          const age = (t - p.born) / TRAIL_MS;
          if (age >= 1) {
            trail.splice(i, 1);
            continue;
          }
          p.x += p.vx;
          p.y += p.vy;
          ctx.globalAlpha = 1 - age;
          star4(ctx, p.x, p.y, p.size * (1 - age * 0.6));
        }
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < FRAME_MS) return;
      last = t;
      draw(t);
    };
    if (!still) raf = requestAnimationFrame(loop);

    // Cursor trail: mouse only, throttled to one sparkle per 40ms, at most 20 alive.
    const host = canvas.parentElement;
    let lastSpawn = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const now = performance.now();
      if (now - lastSpawn < TRAIL_SPAWN_MS) return;
      lastSpawn = now;
      if (trail.length >= TRAIL_MAX) trail.shift();
      const rect = canvas.getBoundingClientRect();
      trail.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.3 + Math.random() * 0.5,
        size: 2 + Math.random() * 2.5,
        born: now,
      });
    };
    if (cursorTrail && !still && host) host.addEventListener("pointermove", onMove);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      host?.removeEventListener("pointermove", onMove);
    };
  }, [still, cursorTrail]);

  return <canvas ref={canvasRef} aria-hidden className={cn("pointer-events-none absolute", className)} />;
};

const BURSTS = {
  // Blocked: the bigger silver burst, it's the moment the demo is about.
  silver: { count: 10, radius: 56, size: 9, fill: "fill-silver-100" },
  // Paid: a smaller lime sparkle.
  lime: { count: 7, radius: 34, size: 8, fill: "fill-lime" },
};

/**
 * One-time 4-point sparkle burst, positioned over its (relative) parent. Plays once on mount via CSS and
 * stays invisible afterwards; renders nothing under prefers-reduced-motion.
 */
export const SparkleBurst = ({ tone, className }: { tone: keyof typeof BURSTS; className?: string }) => {
  const reduceMotion = useReducedMotion();
  const visible = usePageVisible();
  if (reduceMotion) return null;
  const b = BURSTS[tone];
  return (
    <span aria-hidden className={cn("pointer-events-none absolute", !visible && "leash-paused", className)}>
      {Array.from({ length: b.count }, (_, i) => {
        const angle = (i / b.count) * Math.PI * 2 + 0.3;
        const r = b.radius * (i % 2 ? 0.65 : 1);
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className={cn("leash-burst-p absolute left-0 top-0", b.fill)}
            style={
              {
                width: b.size,
                height: b.size,
                "--dx": `${Math.cos(angle) * r}px`,
                "--dy": `${Math.sin(angle) * r}px`,
                // Starts after the row's 0.4s slide-in, so the burst lands on a row that's in place.
                animationDelay: `${350 + (i % 3) * 30}ms`,
              } as React.CSSProperties
            }
          >
            <path d={STAR_PATH} />
          </svg>
        );
      })}
    </span>
  );
};
