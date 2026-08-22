import { useRef } from "react";
import {
  cubicBezier,
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { ease } from "../../motion/presets";

/**
 * A number that counts up to its value the first time it scrolls into view.
 *
 * Driven by a MotionValue rendered as the element's child, not by React state.
 * A state-based counter re-renders the component on every one of ~66 frames,
 * which for a row of four stats is 264 renders for an effect that touches one
 * text node - Motion writes straight to the DOM node instead.
 *
 * `duration` is honoured exactly rather than being a spring, because a spring
 * that overshoots reads as a bug here: the number would pass the real figure
 * and come back down, and a viewer who glanced at it would take away a value
 * that was never true.
 */

// The same curve as the rest of the motion language. A rAF counter cannot take
// a bezier array the way a Motion transition can, so it is compiled to the
// equivalent easing function instead of being approximated by hand.
const easeOut = cubicBezier(...ease.outQuint);

export default function CountUp({
  /** The final number. */
  value = 0,
  /** Seconds from 0 to `value`. */
  duration = 1.1,
  /** Number -> string. Defaults to a rounded integer. */
  format = (n) => String(Math.round(n)),
  className = "",
}) {
  const reduced = useReducedMotion();
  const ref = useRef(null);

  // once:true - a stat that re-counts every time it scrolls past is a
  // distraction, and it steals attention from whatever the reader came back for.
  //
  // No negative bottom margin here, unlike the shared `inView` preset. That
  // preset holds a reveal back until the element is meaningfully on screen,
  // which is right for something that is invisible until it fires. This is not:
  // an un-triggered CountUp reads "0", so a trigger line inset from the bottom
  // edge means a reader who can see the number is looking at a figure that is
  // simply wrong. It starts the moment any part of it is on screen.
  const inView = useInView(ref, { once: true });

  const progress = useMotionValue(0);
  const elapsed = useRef(0);
  const text = useTransform(progress, (t) => format(t * value));

  useAnimationFrame((_time, delta) => {
    if (reduced || !inView || progress.get() >= 1) return;
    // Clamped like every other frame loop here: a long task must not skip the
    // count to the end, which is the one frame where the effect is the content.
    elapsed.current += Math.min(delta, 64) / 1000;
    progress.set(easeOut(Math.min(elapsed.current / duration, 1)));
  });

  // Under reduced motion the final value is the content, immediately. It is also
  // what any crawler or no-JS snapshot sees, so the number is never a "0".
  if (reduced) {
    return (
      <span ref={ref} className={className}>
        {format(value)}
      </span>
    );
  }

  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  );
}
