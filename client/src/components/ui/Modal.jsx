import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { modalPanel, respectMotion, scrim } from "../../motion/presets";
import Button from "./Button";

/**
 * Modal dialog.
 *
 * Accessibility contract:
 *   - role="dialog" aria-modal, labelled by its own title (aria-labelledby)
 *   - Escape and an always-present close button, so there are two escape routes
 *   - focus moves into the panel on open and returns to the trigger on close
 *   - Tab is trapped inside the panel while it is open (keyboard-nav)
 *   - the scrim is blurred, which is what signals "the background is dismissed"
 *     rather than being decoration (blur-purpose)
 *   - background scroll is locked without a layout jump
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
  /** Set false for flows where an accidental backdrop click would lose work. */
  dismissOnBackdrop = true,
  className = "",
}) {
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  const restoreTo = useRef(null);
  const titleId = useId();
  const descId = useId();

  // Remember the trigger so focus can go back where it came from.
  useEffect(() => {
    if (!open) return undefined;
    restoreTo.current = document.activeElement;
    return () => {
      const node = restoreTo.current;
      if (node && typeof node.focus === "function") node.focus();
    };
  }, [open]);

  // Lock scroll, compensating for the scrollbar so the page does not shift.
  useEffect(() => {
    if (!open) return undefined;
    const { body } = document;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
    };
  }, [open]);

  // Initial focus: the first control inside, or the panel itself.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector("[data-autofocus]") ||
        panel.querySelector(FOCUSABLE) ||
        panel;
      target.focus?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null
      );
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 flex items-end justify-center p-4 sm:items-center"
          style={{ zIndex: "var(--z-modal)" }}
          onKeyDown={onKeyDown}
        >
          <motion.div
            variants={respectMotion(scrim, reduced)}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={dismissOnBackdrop ? onClose : undefined}
            className="absolute inset-0 bg-[rgba(3,3,12,0.72)] backdrop-blur-md"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            variants={respectMotion(modalPanel, reduced)}
            initial="hidden"
            animate="show"
            exit="exit"
            className={[
              "glass glass-4 glass-specular relative flex w-full flex-col",
              "max-h-[min(88dvh,52rem)] rounded-[var(--radius-2xl)]",
              SIZES[size] ?? SIZES.md,
              className,
            ].join(" ")}
          >
            {(title || onClose) && (
              <header className="flex items-start gap-4 border-b border-[var(--glass-edge)] px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  {title ? (
                    <h2
                      id={titleId}
                      className="text-xl leading-tight"
                    >
                      {title}
                    </h2>
                  ) : null}
                  {description ? (
                    <p
                      id={descId}
                      className="mt-1 text-sm text-[var(--color-fg-muted)]"
                    >
                      {description}
                    </p>
                  ) : null}
                </div>
                {onClose ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Close dialog"
                    onClick={onClose}
                    className="-mr-2 -mt-1 shrink-0"
                  >
                    <X size={18} weight="bold" aria-hidden="true" />
                  </Button>
                ) : null}
              </header>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {children}
            </div>

            {footer ? (
              <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--glass-edge)] px-5 py-4 sm:px-6">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/* ==========================================================================
   Confirm dialog
   --------------------------------------------------------------------------
   Every destructive action in the app routes through this
   (confirmation-dialogs). The cancel button is the default focus target, so a
   reflexive Enter press cannot delete anything.
   ========================================================================== */

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  loading = false,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title={title}
      description={description}
      size="sm"
      dismissOnBackdrop={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading} data-autofocus>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
