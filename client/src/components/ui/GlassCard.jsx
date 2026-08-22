import { forwardRef, useCallback, useRef } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { spring } from "../../motion/presets";

/**
 * The glass surface everything else sits on.
 *
 * Two things make this read as glass rather than "blurred div":
 *   1. A single implied light source from above - the CSS `.glass` recipe adds
 *      the lit top border and the top-down gradient.
 *   2. A specular highlight that tracks the pointer. Real glass moves its
 *      reflection when you move; a static gradient does not.
 *
 * Elevation is a 4-step scale (glass-1 recessed .. glass-4 floating) so blur,
 * fill and shadow always change together (elevation-consistent).
 *
 * `tilt` adds pointer-tracked rotation on top. It is opt-in and off by default,
 * because a tilting card is a flourish that suits a short marketing grid and
 * actively hurts a dense list - and because rotating a card creates a stacking
 * context, so a hover menu inside one would be clipped by its own parent.
 */

/**
 * Peak tilt in degrees. Deliberately small: past ~8deg the blur edge and the
 * specular highlight stop agreeing with each other and the glass reads as a
 * flat picture of glass being waved around.
 */
const TILT_DEG = 6;

const ELEVATION = {
  1: "glass-1",
  2: "glass-2",
  3: "glass-3",
  4: "glass-4",
};

const RADII = {
  md: "rounded-[var(--radius-md)]",
  lg: "rounded-[var(--radius-lg)]",
  xl: "rounded-[var(--radius-xl)]",
  "2xl": "rounded-[var(--radius-2xl)]",
};

const GlassCard = forwardRef(function GlassCard(
  {
    elevation = 2,
    radius = "xl",
    interactive = false,
    glow = false,
    specular = true,
    tilt = false,
    className = "",
    style,
    children,
    ...rest
  },
  ref
) {
  const reduced = useReducedMotion();
  const localRef = useRef(null);

  // Percentages, not pixels, so the highlight is resolution independent.
  const mx = useSpring(useMotionValue(50), spring.cursor);
  const my = useSpring(useMotionValue(0), spring.cursor);
  // Spring-driven so the sheen fades rather than snapping on enter/leave.
  const sheen = useSpring(useMotionValue(0), spring.soft);

  // Same pointer position, expressed as rotation. Springs on both axes so the
  // card settles instead of tracking the cursor rigidly, and so leaving the
  // card eases back to flat rather than snapping (interruptible).
  const rotateX = useSpring(useMotionValue(0), spring.cursor);
  const rotateY = useSpring(useMotionValue(0), spring.cursor);

  const highlight = useMotionTemplate`radial-gradient(38rem circle at ${mx}% ${my}%, rgba(255,255,255,0.13), transparent 42%)`;

  // Tilt needs the pointer even when the card is not `interactive`, so the two
  // features are independent props rather than one implying the other.
  const tracking = (interactive || tilt) && !reduced;

  const onMove = useCallback(
    (event) => {
      if (reduced) return;
      const node = localRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      mx.set(px * 100);
      my.set(py * 100);
      if (!tilt) return;
      // Pointer above centre tips the top of the card towards the viewer, which
      // is the direction that matches the light source implied by `.glass`.
      rotateX.set((0.5 - py) * 2 * TILT_DEG);
      rotateY.set((px - 0.5) * 2 * TILT_DEG);
    },
    [mx, my, reduced, rotateX, rotateY, tilt]
  );

  const setRef = useCallback(
    (node) => {
      localRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  return (
    <motion.div
      ref={setRef}
      onPointerMove={tracking ? onMove : undefined}
      onPointerEnter={tracking ? () => sheen.set(1) : undefined}
      onPointerLeave={
        tracking
          ? () => {
              sheen.set(0);
              mx.set(50);
              my.set(0);
              rotateX.set(0);
              rotateY.set(0);
            }
          : undefined
      }
      whileHover={interactive && !reduced ? { y: -5, transition: spring.snap } : undefined}
      className={[
        "glass",
        ELEVATION[elevation] ?? ELEVATION[2],
        RADII[radius] ?? RADII.xl,
        specular ? "glass-specular" : "",
        interactive ? "cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...(glow ? { boxShadow: "var(--shadow-3), var(--shadow-glow)" } : null),
        // Perspective is set per-card rather than on a shared parent on purpose:
        // one perspective on a grid wrapper is measured from the wrapper's
        // centre, so cards in the corners would tilt about a vanishing point
        // that is nowhere near them and the row would look warped.
        ...(tilt && !reduced
          ? { rotateX, rotateY, transformPerspective: 900 }
          : null),
        // Caller style stays last, matching the previous precedence.
        ...style,
      }}
      {...rest}
    >
      {/* Pointer-tracked sheen. Decorative, non-interactive, and inherits the
          card's radius so it never bleeds past the corners. */}
      {interactive && !reduced ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ backgroundImage: highlight, opacity: sheen }}
        />
      ) : null}

      {children}
    </motion.div>
  );
});

export default GlassCard;
