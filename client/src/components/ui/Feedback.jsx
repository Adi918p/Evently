import { motion, useReducedMotion } from "motion/react";
import { CircleNotch } from "@phosphor-icons/react";
import Button from "./Button";

/**
 * Loading, empty and error states.
 *
 * These exist as primitives because every data page needs all three, and the
 * failure mode otherwise is a blank screen that looks like a bug:
 *   - skeletons reserve the final layout so nothing shifts when data lands
 *     (content-jumping, image-dimension)
 *   - empty states carry a next action, not just "no results" (empty-states)
 *   - error states always offer a retry path (error-recovery)
 */

/* ==========================================================================
   Skeleton
   ========================================================================== */

export function Skeleton({ className = "", rounded = "md", style }) {
  const reduced = useReducedMotion();
  const radius =
    { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)", pill: "var(--radius-pill)" }[
      rounded
    ] ?? "var(--radius-md)";

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-[rgba(255,255,255,0.05)] ${className}`}
      style={{ borderRadius: radius, ...style }}
    >
      {/* Shimmer instead of a blocking spinner for anything over ~1s
          (progressive-loading). Transform-only, so it costs nothing. */}
      {!reduced ? (
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.09) 50%, transparent 100%)",
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
        />
      ) : null}
    </div>
  );
}

/** Card-shaped skeleton matching the real event card's proportions. */
export function SkeletonCard() {
  return (
    <div className="glass glass-2 overflow-hidden rounded-[var(--radius-xl)]">
      <Skeleton className="aspect-[16/10] w-full" rounded="sm" />
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-3 w-24" rounded="pill" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-3 w-2/3" rounded="pill" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-20" rounded="pill" />
          <Skeleton className="h-10 w-24" rounded="pill" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading events"
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 5, className = "" }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" rounded="lg" />
      ))}
    </div>
  );
}

/* ==========================================================================
   Inline loader
   ========================================================================== */

export function Loader({ label = "Loading", size = 20, className = "" }) {
  const reduced = useReducedMotion();
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-3 text-[var(--color-fg-muted)] ${className}`}
    >
      <CircleNotch
        size={size}
        weight="bold"
        className={reduced ? "" : "animate-spin"}
        aria-hidden="true"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/* ==========================================================================
   Empty state
   ========================================================================== */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionTo,
  onAction,
  secondary,
  className = "",
}) {
  return (
    <div
      className={`glass glass-1 flex flex-col items-center gap-4 rounded-[var(--radius-xl)] px-6 py-14 text-center ${className}`}
    >
      {Icon ? (
        <span
          className="grid size-16 place-items-center rounded-full bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
          aria-hidden="true"
        >
          <Icon size={28} />
        </span>
      ) : null}

      <div className="max-w-prose space-y-2">
        <h3 className="text-xl">{title}</h3>
        {description ? (
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" to={actionTo} onClick={onAction}>
            {action}
          </Button>
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Error state
   ========================================================================== */

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className = "",
}) {
  return (
    <div
      role="alert"
      className={`glass glass-1 flex flex-col items-center gap-4 rounded-[var(--radius-xl)] border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] px-6 py-12 text-center ${className}`}
    >
      <div className="max-w-prose space-y-2">
        <h3 className="text-lg">{title}</h3>
        {message ? (
          <p className="wrap-anywhere text-sm leading-relaxed text-[var(--color-fg-muted)]">
            {message}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
