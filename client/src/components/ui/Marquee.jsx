import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { Pause, Play } from "@phosphor-icons/react";

/**
 * Infinite horizontal ticker.
 *
 * Auto-rotation is the accessibility trap here, so the whole component is built
 * around the WAI `auto-rotation-controls` contract rather than bolting a pause
 * button on afterwards. It stops on every one of:
 *
 *   - the visible pause button (user intent, sticky)
 *   - pointer over the row, so a link stops moving before you try to click it
 *     (a moving hit target fails no-precision-required on its own)
 *   - keyboard focus inside the row
 *   - the row scrolling off screen (IntersectionObserver)
 *   - the tab being hidden (visibilitychange), so a backgrounded tab burns no
 *     frames
 *   - prefers-reduced-motion, which renders the static row and never starts
 *
 * Movement is one `transform: translateX(%)` on a track holding two identical
 * copies, driven by a MotionValue rather than CSS keyframes. Percentages resolve
 * against the track's own width, so -50% is exactly one copy and the wrap is
 * seamless at any content width with no measuring. rAF-driven means pausing is
 * instant and interruptible (interruptible), and nothing touches layout
 * (transform-performance, layout-shift-avoid).
 *
 * The second copy is `aria-hidden` AND `inert`. aria-hidden alone would hide it
 * from screen readers while leaving its links in the tab order - a focusable
 * element inside aria-hidden content is exactly the "focus goes nowhere visible"
 * bug, and inert is what actually removes them.
 */

export default function Marquee({
  /** Accessible name for the row, e.g. "Browse by category". */
  label,
  /** Seconds for one full copy to pass. Bigger = slower. */
  seconds = 44,
  /** 1 scrolls left, -1 scrolls right. */
  direction = 1,
  className = "",
  children,
}) {
  const reduced = useReducedMotion();
  const contentRef = useRef(null);

  // User intent lives in state because it drives the button's label and icon.
  const [paused, setPaused] = useState(false);

  // The transient reasons live in refs: they change on pointer and scroll
  // events, and re-rendering the whole row for a hover would be wasteful.
  const hovering = useRef(false);
  const focused = useRef(false);
  const onscreen = useRef(true);
  const hidden = useRef(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const progress = useMotionValue(0);

  // progress runs 0..1 over one copy. Leftward maps it to 0..-50%; rightward
  // maps it to -50%..0 so the track never uncovers the right edge of the row.
  const x = useTransform(progress, (value) =>
    direction >= 0 ? `${value * -50}%` : `${(value - 1) * 50}%`
  );

  const tick = useCallback(
    (_time, delta) => {
      if (
        reduced ||
        pausedRef.current ||
        hovering.current ||
        focused.current ||
        !onscreen.current ||
        hidden.current
      ) {
        return;
      }

      // Clamp the delta. A long task or a tab regaining focus can hand us a
      // multi-second frame, which would teleport the row instead of moving it.
      const step = Math.min(delta, 64) / 1000 / seconds;
      const next = progress.get() + step;
      progress.set(next >= 1 ? next - 1 : next);
    },
    [progress, reduced, seconds]
  );

  useAnimationFrame(tick);

  useEffect(() => {
    if (reduced) return undefined;

    const node = contentRef.current;
    const observer = node
      ? new IntersectionObserver(
          ([entry]) => {
            onscreen.current = entry.isIntersecting;
          },
          { threshold: 0 }
        )
      : null;
    observer?.observe(node);

    const onVisibility = () => {
      hidden.current = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return (
    <div className={`relative ${className}`}>
      {/* Pointer and focus handlers sit on the content, never on a wrapper that
          also contains the pause button. Otherwise focusing "Resume" would
          immediately re-pause on focus and the button would look broken. */}
      <div
        ref={contentRef}
        role="group"
        aria-label={label}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
        }}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
        }}
        className="overflow-hidden"
        style={{
          // Fade both ends so items enter and leave instead of being cut off.
          maskImage:
            "linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)",
        }}
      >
        <motion.div className="flex w-max" style={reduced ? undefined : { x }}>
          <div className="flex shrink-0 items-center gap-3 pr-3">{children}</div>
          {/* Trailing copy is what makes the wrap seamless. Hidden from
              assistive tech and removed from the tab order. */}
          <div
            aria-hidden="true"
            inert={reduced ? undefined : true}
            className="flex shrink-0 items-center gap-3 pr-3"
          >
            {children}
          </div>
        </motion.div>
      </div>

      {reduced ? null : (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          // Parked over the right-hand fade, where the mask has already taken
          // the content to transparent - so it needs no reserved space and
          // makes no assumption about what sits above or below the row.
          className="glass glass-2 glass-specular absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-[var(--radius-pill)] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          {paused ? (
            <Play size={15} weight="fill" aria-hidden="true" />
          ) : (
            <Pause size={15} weight="fill" aria-hidden="true" />
          )}
          <span className="sr-only">
            {paused ? `Resume ${label}` : `Pause ${label}`}
          </span>
        </button>
      )}
    </div>
  );
}
