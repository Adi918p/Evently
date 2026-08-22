import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CheckCircle,
  Info,
  WarningCircle,
  XCircle,
  X,
} from "@phosphor-icons/react";
import { respectMotion, toastItem } from "../motion/presets";

/**
 * Toasts.
 *
 * Accessibility rules honoured here:
 *   - the region is aria-live="polite" and never receives focus, so a toast
 *     cannot interrupt what the user is doing (toast-accessibility)
 *   - auto-dismiss sits in the 3-5s window, and errors get longer because they
 *     carry recovery information (toast-dismiss)
 *   - each toast also has a manual close, since auto-dismiss alone is not an
 *     accessible escape route
 */

const ToastContext = createContext(null);

const VARIANTS = {
  success: {
    Icon: CheckCircle,
    accent: "var(--color-success)",
    label: "Success",
  },
  error: { Icon: XCircle, accent: "var(--color-danger)", label: "Error" },
  warning: {
    Icon: WarningCircle,
    accent: "var(--color-warning)",
    label: "Warning",
  },
  info: { Icon: Info, accent: "var(--color-cyan)", label: "Info" },
};

const DURATIONS = { success: 3600, info: 3600, warning: 4600, error: 5600 };

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const reduced = useReducedMotion();

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, type = "info", { duration } = {}) => {
      if (!message) return null;
      const id = ++nextId;
      const ttl = duration ?? DURATIONS[type] ?? DURATIONS.info;

      setToasts((current) => {
        // Never stack more than three; the oldest falls off the top.
        const next = [...current, { id, message: String(message), type }];
        return next.slice(-3);
      });

      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), ttl)
      );
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (message, options) => push(message, "success", options),
      error: (message, options) => push(message, "error", options),
      warning: (message, options) => push(message, "warning", options),
      info: (message, options) => push(message, "info", options),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:px-6"
        style={{ zIndex: "var(--z-toast)" }}
      >
        <AnimatePresence initial={false}>
          {toasts.map(({ id, message, type }) => {
            const { Icon, accent, label } = VARIANTS[type] ?? VARIANTS.info;
            return (
              <motion.div
                key={id}
                layout={!reduced}
                variants={respectMotion(toastItem, reduced)}
                initial="hidden"
                animate="show"
                exit="exit"
                className="glass glass-4 glass-specular pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[var(--radius-lg)] px-4 py-3"
              >
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: accent }}
                  aria-hidden="true"
                >
                  <Icon size={20} weight="fill" />
                </span>

                {/* Visually hidden prefix so screen readers get the severity,
                    which colour alone would not convey. */}
                <span className="sr-only">{label}: </span>

                <p className="wrap-anywhere flex-1 text-sm leading-snug text-[var(--color-fg)]">
                  {message}
                </p>

                <button
                  type="button"
                  onClick={() => dismiss(id)}
                  aria-label="Dismiss notification"
                  className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-[var(--color-fg-subtle)] transition-colors hover:bg-white/10 hover:text-[var(--color-fg)]"
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
