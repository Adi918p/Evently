import { motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { respectInteraction, pressableSubtle } from "../../motion/presets";

/**
 * Badges and chips.
 *
 * Semantics matter here: a badge is a read-only status label, a chip is an
 * operable filter. They look related but are different elements, because a
 * screen reader user needs to know which ones they can press
 * (compact-label-overflow).
 *
 * Every status badge carries a dot AND a word - status is never conveyed by
 * colour alone (color-not-only).
 */

const TONES = {
  neutral: "text-[var(--color-fg-muted)] bg-white/[0.07] border-white/10",
  brand:
    "text-[#ddd6fe] bg-[color-mix(in_srgb,var(--color-violet)_22%,transparent)] " +
    "border-[color-mix(in_srgb,var(--color-violet)_45%,transparent)]",
  success:
    "text-[#86efac] bg-[color-mix(in_srgb,var(--color-success)_18%,transparent)] " +
    "border-[color-mix(in_srgb,var(--color-success)_40%,transparent)]",
  warning:
    "text-[#fcd34d] bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] " +
    "border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)]",
  danger:
    "text-[#fca5a5] bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)] " +
    "border-[color-mix(in_srgb,var(--color-danger)_42%,transparent)]",
  info:
    "text-[#a5f3fc] bg-[color-mix(in_srgb,var(--color-cyan)_16%,transparent)] " +
    "border-[color-mix(in_srgb,var(--color-cyan)_40%,transparent)]",
};

const DOTS = {
  neutral: "bg-[var(--color-fg-subtle)]",
  brand: "bg-[var(--color-violet-bright)]",
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]",
  info: "bg-[var(--color-cyan)]",
};

export default function Badge({
  tone = "neutral",
  dot = false,
  icon: Icon,
  className = "",
  children,
  ...rest
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border",
        "px-2.5 py-1 text-xs font-semibold leading-none",
        TONES[tone] ?? TONES.neutral,
        className,
      ].join(" ")}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${DOTS[tone] ?? DOTS.neutral}`}
        />
      ) : null}
      {Icon ? <Icon size={12} weight="bold" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** Maps the server's event/booking status strings onto badge tones. */
const STATUS_TONES = {
  approved: "success",
  confirmed: "success",
  active: "success",
  pending: "warning",
  rejected: "danger",
  cancelled: "danger",
  banned: "danger",
  suspended: "warning",
};

export function StatusBadge({ status, className = "" }) {
  const key = String(status || "").toLowerCase();
  const tone = STATUS_TONES[key] ?? "neutral";
  return (
    <Badge tone={tone} dot className={`capitalize ${className}`}>
      {key || "unknown"}
    </Badge>
  );
}

/* ==========================================================================
   Filter chip
   ========================================================================== */

export function Chip({
  active = false,
  icon: Icon,
  onRemove,
  removeLabel,
  className = "",
  children,
  ...rest
}) {
  const reduced = useReducedMotion();

  const toggle = (
    <motion.button
      type="button"
      aria-pressed={active}
      {...respectInteraction(pressableSubtle, reduced)}
      className={[
        // 44px tall: chips are a primary way to filter on mobile, so they are
        // full touch targets rather than decorative pills.
        "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] border px-4",
        "text-sm font-medium transition-colors [touch-action:manipulation]",
        active
          ? "border-transparent bg-[image:var(--grad-brand)] text-white shadow-[var(--shadow-glow)]"
          : "border-[var(--glass-edge)] bg-white/[0.05] text-[var(--color-fg-muted)] hover:bg-white/[0.1] hover:text-[var(--color-fg)]",
        onRemove ? "rounded-r-none border-r-0 pr-2" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {Icon ? <Icon size={15} aria-hidden="true" /> : null}
      {children}
    </motion.button>
  );

  if (!onRemove) return toggle;

  // Remove is a sibling button, never a nested one: interactive elements must
  // not contain other interactive elements, and both need their own tab stop
  // and 44px target (chip-collection-reflow, touch-target-size).
  return (
    <span className="inline-flex items-stretch">
      {toggle}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel || "Remove filter"}
        className={[
          "inline-grid min-h-11 w-9 place-items-center rounded-[var(--radius-pill)] rounded-l-none border border-l-0",
          "transition-colors [touch-action:manipulation]",
          active
            ? "border-transparent bg-[image:var(--grad-brand)] text-white hover:brightness-110"
            : "border-[var(--glass-edge)] bg-white/[0.05] text-[var(--color-fg-subtle)] hover:bg-white/[0.1] hover:text-[var(--color-fg)]",
        ].join(" ")}
      >
        <X size={12} weight="bold" aria-hidden="true" />
      </button>
    </span>
  );
}
