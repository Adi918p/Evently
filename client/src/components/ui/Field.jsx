import { forwardRef, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretDown, Eye, EyeSlash, WarningCircle } from "@phosphor-icons/react";
import { respectMotion } from "../../motion/presets";

/**
 * Form controls.
 *
 * Non-negotiables encoded here:
 *   - a real, visible <label> per control; placeholders are hints, never labels
 *     (input-labels)
 *   - errors render below the field and are wired with aria-describedby +
 *     aria-invalid, with an icon so the message is not colour-only
 *     (error-placement, color-not-only)
 *   - helper text is persistent, not a placeholder (input-helper-text)
 *   - controls are 48px tall and 16px on mobile so iOS does not zoom the
 *     viewport on focus (readable-font-size, touch-target-size)
 */

const CONTROL =
  "w-full min-h-12 rounded-[var(--radius-md)] border border-[var(--glass-edge)] " +
  "bg-[rgba(255,255,255,0.04)] px-4 text-base text-[var(--color-fg)] " +
  "placeholder:text-[var(--color-fg-subtle)] transition-[border-color,background-color,box-shadow] " +
  "hover:border-[var(--glass-edge-strong)] " +
  "focus:border-[var(--color-violet-bright)] " +
  "focus:bg-[rgba(255,255,255,0.06)] " +
  "focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-violet)_28%,transparent)] " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const INVALID =
  "border-[var(--color-danger)] focus:border-[var(--color-danger)] " +
  "focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_26%,transparent)]";

const errorVariants = {
  hidden: { opacity: 0, y: -4, height: 0 },
  show: { opacity: 1, y: 0, height: "auto", transition: { duration: 0.18 } },
  exit: { opacity: 0, y: -4, height: 0, transition: { duration: 0.12 } },
};

/* ==========================================================================
   Field shell - label, control, helper, error
   ========================================================================== */

export function Field({
  label,
  htmlFor,
  required = false,
  optional = false,
  helper,
  error,
  hint,
  className = "",
  children,
}) {
  const reduced = useReducedMotion();

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor={htmlFor}
            className="text-sm font-medium text-[var(--color-fg-muted)]"
          >
            {label}
            {required ? (
              <>
                <span aria-hidden="true" className="ml-1 text-[var(--color-magenta-bright)]">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </>
            ) : null}
            {optional ? (
              <span className="ml-2 text-xs text-[var(--color-fg-subtle)]">
                Optional
              </span>
            ) : null}
          </label>
          {hint ? (
            <span className="text-xs text-[var(--color-fg-subtle)]">{hint}</span>
          ) : null}
        </div>
      ) : null}

      {children}

      {helper && !error ? (
        <p className="text-xs leading-relaxed text-[var(--color-fg-subtle)]">
          {helper}
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            variants={respectMotion(errorVariants, reduced)}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex items-start gap-1.5 overflow-hidden text-xs text-[#fca5a5]"
          >
            <WarningCircle
              size={14}
              weight="fill"
              className="mt-px shrink-0"
              aria-hidden="true"
            />
            <span className="wrap-anywhere">{error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Wires ids for control + helper + error so callers cannot forget. */
function useFieldIds(id, { helper, error }) {
  const auto = useId();
  const controlId = id || auto;
  const helperId = helper ? `${controlId}-helper` : null;
  const errorId = error ? `${controlId}-error` : null;
  const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;
  return { controlId, helperId, errorId, describedBy };
}

/* ==========================================================================
   Input
   ========================================================================== */

export const Input = forwardRef(function Input(
  {
    id,
    label,
    required,
    optional,
    helper,
    error,
    hint,
    icon: Icon,
    type = "text",
    className = "",
    fieldClassName = "",
    ...rest
  },
  ref
) {
  const [revealed, setRevealed] = useState(false);
  const { controlId, describedBy } = useFieldIds(id, { helper, error });
  const isPassword = type === "password";

  return (
    <Field
      label={label}
      htmlFor={controlId}
      required={required}
      optional={optional}
      helper={helper}
      error={error}
      hint={hint}
      className={fieldClassName}
    >
      <div className="relative">
        {Icon ? (
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]"
            aria-hidden="true"
          >
            <Icon size={18} />
          </span>
        ) : null}

        <input
          ref={ref}
          id={controlId}
          type={isPassword && revealed ? "text" : type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            CONTROL,
            Icon ? "pl-11" : "",
            isPassword ? "pr-12" : "",
            error ? INVALID : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />

        {/* Password managers and paste must keep working, so this only toggles
            the input type (accessible-authentication). */}
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
          >
            {revealed ? (
              <EyeSlash size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    </Field>
  );
});

/* ==========================================================================
   Textarea
   ========================================================================== */

export const Textarea = forwardRef(function Textarea(
  {
    id,
    label,
    required,
    optional,
    helper,
    error,
    hint,
    rows = 4,
    maxLength,
    value,
    className = "",
    fieldClassName = "",
    ...rest
  },
  ref
) {
  const { controlId, describedBy } = useFieldIds(id, { helper, error });
  const count = typeof value === "string" ? value.length : null;

  return (
    <Field
      label={label}
      htmlFor={controlId}
      required={required}
      optional={optional}
      helper={helper}
      error={error}
      // Live character count doubles as the hint when there is a cap.
      hint={
        maxLength && count !== null ? (
          <span className="tnum">
            {count}/{maxLength}
          </span>
        ) : (
          hint
        )
      }
      className={fieldClassName}
    >
      <textarea
        ref={ref}
        id={controlId}
        rows={rows}
        maxLength={maxLength}
        value={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          CONTROL,
          "resize-y py-3 leading-relaxed",
          error ? INVALID : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
    </Field>
  );
});

/* ==========================================================================
   Select
   --------------------------------------------------------------------------
   A real <select>. A custom listbox would need to reimplement type-ahead,
   mobile pickers and screen-reader semantics for no gain (system-controls).
   ========================================================================== */

export const Select = forwardRef(function Select(
  {
    id,
    label,
    required,
    optional,
    helper,
    error,
    hint,
    options = [],
    placeholder,
    className = "",
    fieldClassName = "",
    children,
    ...rest
  },
  ref
) {
  const { controlId, describedBy } = useFieldIds(id, { helper, error });

  return (
    <Field
      label={label}
      htmlFor={controlId}
      required={required}
      optional={optional}
      helper={helper}
      error={error}
      hint={hint}
      className={fieldClassName}
    >
      <div className="relative">
        <select
          ref={ref}
          id={controlId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            CONTROL,
            "appearance-none pr-11",
            // The native dropdown list renders with the OS palette, so options
            // need an explicit dark background or they come out white-on-white.
            "[&>option]:bg-[var(--color-bg-raised)] [&>option]:text-[var(--color-fg)]",
            error ? INVALID : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        >
          {placeholder ? (
            <option value="">{placeholder}</option>
          ) : null}
          {options.map((option) =>
            typeof option === "string" ? (
              <option key={option} value={option}>
                {option}
              </option>
            ) : (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            )
          )}
          {children}
        </select>

        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]"
        />
      </div>
    </Field>
  );
});
