import { motion, useReducedMotion } from "motion/react";
import { inView, respectMotion, riseIn, stagger } from "../../motion/presets";

/**
 * Scroll-triggered reveal.
 *
 * `once: true` - content animates in the first time it is seen and then stays
 * put. Re-animating on every scroll past is motion for its own sake and gets
 * tiring on a long page (excessive-motion).
 *
 * Under prefers-reduced-motion these collapse to a plain fade with no movement,
 * handled centrally by respectMotion.
 */

export function Reveal({
  as: Tag = "div",
  delay = 0,
  className = "",
  children,
  ...rest
}) {
  const reduced = useReducedMotion();
  const Component = motion[Tag] ?? motion.div;

  return (
    <Component
      initial="hidden"
      whileInView="show"
      viewport={inView}
      variants={respectMotion(riseIn, reduced)}
      transition={delay ? { delay } : undefined}
      className={className}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * Staggers its children in. Children must be motion elements with their own
 * `variants` - EventCard and Reveal both qualify.
 */
export function RevealGroup({
  as: Tag = "div",
  each = 0.04,
  delay = 0,
  className = "",
  children,
  ...rest
}) {
  const reduced = useReducedMotion();
  const Component = motion[Tag] ?? motion.div;

  return (
    <Component
      initial="hidden"
      whileInView="show"
      viewport={inView}
      variants={reduced ? { hidden: {}, show: {} } : stagger(each, delay)}
      className={className}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * Section heading block: kicker, title, optional lead paragraph and an action
 * slot on the right. Used on nearly every page, so the rhythm stays identical
 * everywhere (consistency, visual-hierarchy).
 */
export function SectionHeading({
  kicker,
  title,
  lead,
  action,
  id,
  align = "left",
  className = "",
}) {
  const centered = align === "center";

  return (
    <Reveal
      className={[
        "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        centered ? "sm:flex-col sm:items-center sm:text-center" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={`max-w-2xl space-y-3 ${centered ? "mx-auto" : ""}`}>
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h2 id={id} className="text-balance text-3xl">
          {title}
        </h2>
        {lead ? (
          <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
            {lead}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </Reveal>
  );
}
