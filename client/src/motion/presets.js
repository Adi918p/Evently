/**
 * Shared motion language.
 *
 * Every animation in the app pulls from this file so the whole product moves
 * with one rhythm (motion-consistency rule). Rules encoded here, from the
 * ui-ux-pro-max motion guidance:
 *
 *   - springs over fixed beziers for anything interactive (spring-physics)
 *   - exit runs at ~65% of enter so dismissal feels responsive
 *     (exit-faster-than-enter)
 *   - list/grid entrances stagger 40ms per item (stagger-sequence)
 *   - entering content rises from below, leaving content sinks
 *     (hierarchy-motion)
 *   - press feedback is a 0.96-1.03 scale, never a layout-shifting transform
 *   - transform/opacity only, never width/height/top/left
 *     (transform-performance, layout-shift-avoid)
 */

/* ---- springs ------------------------------------------------------------ */

export const spring = {
  /** Snappy - buttons, chips, toggles. */
  snap: { type: "spring", stiffness: 520, damping: 32, mass: 0.6 },
  /** Default for surfaces entering and leaving. */
  soft: { type: "spring", stiffness: 260, damping: 28, mass: 0.9 },
  /** Loose, slightly overshooting - hero and feature reveals. */
  bouncy: { type: "spring", stiffness: 200, damping: 18, mass: 1 },
  /** Heavy - modals, sheets, large panels. */
  heavy: { type: "spring", stiffness: 180, damping: 26, mass: 1.2 },
  /** Cursor-following glass tilt; must settle fast or it feels laggy. */
  cursor: { type: "spring", stiffness: 380, damping: 30, mass: 0.5 },
};

/* ---- tweens ------------------------------------------------------------- */

export const ease = {
  outQuint: [0.22, 1, 0.36, 1],
  inOutQuart: [0.76, 0, 0.24, 1],
  back: [0.34, 1.56, 0.64, 1],
};

export const duration = {
  instant: 0.12,
  fast: 0.18,
  base: 0.26,
  slow: 0.4,
  slower: 0.64,
};

/** Exit timing derived from enter, not hand-picked. */
export const exitDuration = (enter = duration.base) =>
  Number((enter * 0.65).toFixed(3));

const tween = (d = duration.base) => ({ duration: d, ease: ease.outQuint });
const tweenOut = (d = duration.base) => ({
  duration: exitDuration(d),
  ease: ease.outQuint,
});

/* ---- reveal variants ---------------------------------------------------- */

/** Rises from below on enter, sinks on exit. */
export const riseIn = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: spring.soft },
  exit: { opacity: 0, y: 12, transition: tweenOut(duration.base) },
};

export const riseInFar = {
  hidden: { opacity: 0, y: 48, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.bouncy },
  exit: { opacity: 0, y: 24, scale: 0.98, transition: tweenOut(duration.slow) },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: tween(duration.slow) },
  exit: { opacity: 0, transition: tweenOut(duration.slow) },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: spring.soft },
  exit: { opacity: 0, scale: 0.96, transition: tweenOut(duration.base) },
};

export const slideFrom = (axis = "x", distance = 32) => ({
  hidden: { opacity: 0, [axis]: distance },
  show: { opacity: 1, [axis]: 0, transition: spring.soft },
  exit: { opacity: 0, [axis]: distance * 0.5, transition: tweenOut() },
});

/* ---- staggered containers ---------------------------------------------- */

/** 40ms per child, inside the 30-50ms window the guidance specifies. */
export const stagger = (each = 0.04, delay = 0) => ({
  hidden: {},
  show: {
    transition: { staggerChildren: each, delayChildren: delay },
  },
  exit: {
    transition: { staggerChildren: each * 0.5, staggerDirection: -1 },
  },
});

/* ---- interaction feedback ---------------------------------------------- */

/** Subtle press scale; pair with whileHover for lift. */
export const pressable = {
  whileHover: { scale: 1.03, transition: spring.snap },
  whileTap: { scale: 0.96, transition: spring.snap },
};

export const pressableSubtle = {
  whileHover: { scale: 1.012, transition: spring.snap },
  whileTap: { scale: 0.985, transition: spring.snap },
};

/** Lift a glass card on hover without touching layout. */
export const liftable = {
  whileHover: { y: -6, transition: spring.snap },
  whileTap: { y: -2, scale: 0.99, transition: spring.snap },
};

/* ---- route transitions -------------------------------------------------- */

/**
 * Forward navigation rises, backward sinks (navigation-direction rule).
 * Exit is deliberately quicker than enter so the next page feels immediate.
 */
export const pageTransition = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: ease.outQuint },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: exitDuration(duration.slow), ease: ease.outQuint },
  },
};

/* ---- overlays ----------------------------------------------------------- */

export const scrim = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: tween(duration.base) },
  exit: { opacity: 0, transition: tweenOut(duration.base) },
};

/** Modals scale up from slightly small so they read as coming forward. */
export const modalPanel = {
  hidden: { opacity: 0, scale: 0.96, y: 20 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring.heavy },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 12,
    transition: tweenOut(duration.slow),
  },
};

/** Mobile nav / filter sheets slide from the edge. */
export const sheetPanel = {
  hidden: { opacity: 0, x: "100%" },
  show: { opacity: 1, x: 0, transition: spring.heavy },
  exit: { opacity: 0, x: "100%", transition: tweenOut(duration.slow) },
};

export const toastItem = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
  exit: { opacity: 0, y: 8, scale: 0.97, transition: tweenOut(duration.base) },
};

/* ---- scroll-triggered reveal defaults ---------------------------------- */

/**
 * Standard whileInView config. `once` keeps content from re-animating on
 * every scroll pass, and the negative bottom margin fires the reveal slightly
 * before the element is fully on screen.
 */
export const inView = {
  once: true,
  margin: "0px 0px -12% 0px",
};

/**
 * Strips motion down to opacity-only when the user asks for reduced motion.
 * Components call this with the live `useReducedMotion()` value so a
 * mid-session OS change takes effect immediately.
 */
export const respectMotion = (variants, reduced) => {
  if (!reduced) return variants;
  return {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  };
};

/** Drops hover/tap transforms entirely under reduced motion. */
export const respectInteraction = (props, reduced) => (reduced ? {} : props);
