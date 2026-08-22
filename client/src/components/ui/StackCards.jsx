import { Children, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { useMediaQuery } from "../../lib/useMediaQuery";

/**
 * Cards that stack as you scroll, rather than scrolling past one another.
 *
 * Each card pins to the top of the viewport while the next one rides up and
 * covers it, and every covered card shrinks a little. That shrink is the whole
 * point: without it the cards would simply overlap and the section would read as
 * a rendering glitch. Scaled down and fanned by a fixed step, the leftover top
 * edges line up into a visible deck, so the section says "there are four of
 * these and you are on the second" without a counter.
 *
 * The effect is scroll-position-driven, not a timed animation - nothing moves
 * unless the reader moves it, and every position in between is a valid frame.
 * So it is interruptible by construction, and there is no auto-rotation to
 * provide a pause control for (auto-rotation-controls does not apply).
 *
 * Only `scale` is animated. A tempting addition is to fade the covered cards for
 * depth, but the fade and the covering run over the same scroll range: a card
 * would be visibly half-transparent while still fully on screen, which looks
 * broken rather than deep (opacity-threshold, excessive-motion).
 */

/**
 * How much of its size each card gives up per card stacked on top of it.
 *
 * 0.04 is deliberately small. The scale is applied about the card's centre, so
 * a bigger step pulls the top edge down faster than the fan offset pushes it up,
 * and the deck collapses back into a single silhouette - the opposite of what
 * the effect is for.
 */
const SHRINK_PER_CARD = 0.04;

/** Vertical offset between the resting cards, in rem. */
const FAN_STEP = 1.15;

/**
 * Below this, the deck falls back to a plain list.
 *
 * A pinned card lives inside a 70svh slot, and on a short phone a card with four
 * lines of body copy and a row of chips is taller than that - it would overflow
 * its own slot and collide with the card stacking on top of it. Widening the slot
 * is not the fix: at that point the "deck" is one card per screen with no visible
 * stack, which is a scrolling list with extra steps.
 */
const PIN_FROM = "(min-width: 48rem)";

function StackCard({ index, count, progress, children }) {
  // Card i only starts shrinking once the scroll has reached its own share of
  // the track, which is the moment the card after it begins to cover it.
  // Shrinking from the start would have every card in the deck moving at once.
  const scale = useTransform(
    progress,
    [index / count, 1],
    [1, 1 - (count - index - 1) * SHRINK_PER_CARD]
  );

  return (
    <li
      // The slot is what sticks; the card inside it is what moves. Centring the
      // card in a slot that is shorter than the viewport keeps it clear of the
      // fixed nav without having to know the nav's height here.
      className="sticky top-0 flex h-[70svh] min-h-[28rem] items-center justify-center"
    >
      <motion.div
        className="relative w-full"
        style={{
          scale,
          // Each card rests a little lower than the one before it, so the ones
          // underneath keep a sliver of their top edge visible. The negative
          // base keeps the whole fanned deck centred in the slot instead of
          // drifting downwards as cards are added.
          top: `calc(${(-(count - 1) * FAN_STEP) / 2}rem + ${index * FAN_STEP}rem)`,
        }}
      >
        {children}
      </motion.div>
    </li>
  );
}

export default function StackCards({
  /** Accessible name for the deck, e.g. "What you get as an organiser". */
  label,
  className = "",
  children,
}) {
  const reduced = useReducedMotion();
  const canPin = useMediaQuery(PIN_FROM);
  const trackRef = useRef(null);
  const cards = Children.toArray(children);
  const count = cards.length;

  // Bound to the track, so progress is "how far through the deck" rather than
  // "how far down the page" - the section can move without retuning anything.
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  // Under reduced motion, on a narrow screen, and for a deck too short to stack,
  // this is a list of cards - so it renders as one. Pinning is the animation
  // here, so leaving the pinning in and only dropping the scale would keep the
  // disorienting part and throw away the part that explains it.
  if (reduced || !canPin || count < 2) {
    return (
      <ol aria-label={label} className={`grid gap-6 ${className}`}>
        {cards.map((card, i) => (
          <li key={i}>{card}</li>
        ))}
      </ol>
    );
  }

  return (
    <ol ref={trackRef} aria-label={label} className={className}>
      {cards.map((card, i) => (
        <StackCard key={i} index={i} count={count} progress={scrollYProgress}>
          {card}
        </StackCard>
      ))}
    </ol>
  );
}
