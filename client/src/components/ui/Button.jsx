import { forwardRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CircleNotch } from "@phosphor-icons/react";
import { pressable, pressableSubtle, respectInteraction } from "../../motion/presets";

/**
 * The one button in the app.
 *
 * Rules baked in:
 *   - every size clears 44px of touch height (touch-target-size)
 *   - `loading` disables the button and shows a spinner, and the label stays in
 *     place so the button does not resize mid-request (loading-buttons,
 *     content-jumping)
 *   - disabled uses 0.45 opacity + not-allowed + the real disabled attribute,
 *     not just a class (disabled-states)
 *   - icon-only usage requires `aria-label`; there is a dev warning if missing
 *   - exactly one visual "primary" per screen is a usage rule, not enforceable
 *     here, but `variant="primary"` is deliberately the loudest option
 */

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 overflow-hidden " +
  "rounded-[var(--radius-pill)] font-display font-semibold tracking-[-0.01em] " +
  "whitespace-nowrap transition-colors [touch-action:manipulation] " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const VARIANTS = {
  /** Gradient fill. The loudest thing on any screen. */
  primary:
    "text-white shadow-[var(--shadow-glow)] bg-[image:var(--grad-brand)] " +
    "hover:brightness-110 active:brightness-95",
  /** Glass. The default for anything that is not the single main action. */
  secondary:
    "glass glass-2 glass-specular text-[var(--color-fg)] hover:bg-white/[0.12]",
  /** Text-weight. Tertiary actions and toolbar items. */
  ghost:
    "text-[var(--color-fg-muted)] hover:bg-white/[0.07] hover:text-[var(--color-fg)]",
  /** Outlined, not filled: destructive actions should not be the brightest
      pixel on screen. */
  danger:
    "border border-[color-mix(in_srgb,var(--color-danger)_60%,transparent)] " +
    "bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] " +
    "text-[#fca5a5] hover:bg-[color-mix(in_srgb,var(--color-danger)_28%,transparent)]",
  /** Cyan accent for confirm/approve flows. */
  accent:
    "border border-[color-mix(in_srgb,var(--color-cyan)_55%,transparent)] " +
    "bg-[color-mix(in_srgb,var(--color-cyan)_14%,transparent)] " +
    "text-[#a5f3fc] hover:bg-[color-mix(in_srgb,var(--color-cyan)_26%,transparent)]",
};

const SIZES = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-6 text-[0.95rem]",
  lg: "min-h-14 px-8 text-base",
};

const ICON_SIZES = {
  sm: "size-11",
  md: "size-12",
  lg: "size-14",
};

const MotionLink = motion.create(Link);

const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    iconOnly = false,
    fullWidth = false,
    className = "",
    children,
    to,
    href,
    type,
    ...rest
  },
  ref
) {
  const reduced = useReducedMotion();

  if (import.meta.env.DEV && iconOnly && !rest["aria-label"]) {
    console.warn("<Button iconOnly> needs an aria-label.");
  }

  const classes = useMemo(
    () =>
      [
        BASE,
        VARIANTS[variant] ?? VARIANTS.secondary,
        iconOnly ? `${ICON_SIZES[size]} p-0` : SIZES[size] ?? SIZES.md,
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" "),
    [variant, size, iconOnly, fullWidth, className]
  );

  const isInert = disabled || loading;
  const feedback = respectInteraction(
    variant === "primary" ? pressable : pressableSubtle,
    reduced || isInert
  );

  const body = (
    <>
      {loading ? (
        <motion.span
          className="absolute inset-0 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <CircleNotch
            size={18}
            weight="bold"
            className={reduced ? "" : "animate-spin"}
            aria-hidden="true"
          />
        </motion.span>
      ) : null}

      {/* Label stays mounted so width never changes when loading starts. */}
      <span
        className={`inline-flex items-center gap-2 ${loading ? "opacity-0" : ""}`}
      >
        {children}
      </span>
    </>
  );

  const shared = {
    ref,
    className: classes,
    "data-loading": loading ? "" : undefined,
    ...feedback,
    ...rest,
  };

  // Router link. Disabled links are rendered as spans so they are not
  // focusable or activatable.
  if (to && !isInert) {
    return (
      <MotionLink to={to} {...shared}>
        {body}
      </MotionLink>
    );
  }

  if (href && !isInert) {
    return (
      <motion.a href={href} {...shared}>
        {body}
      </motion.a>
    );
  }

  return (
    <motion.button
      type={type ?? "button"}
      disabled={isInert}
      aria-busy={loading || undefined}
      {...shared}
    >
      {body}
    </motion.button>
  );
});

export default Button;
