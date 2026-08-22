import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Compass, MagnifyingGlass } from "@phosphor-icons/react";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import { spring } from "../motion/presets";

/**
 * 404.
 *
 * Two things this page owes the user: an honest statement of what happened, and
 * a way out that isn't the browser's back button (escape-routes). The old .html
 * URLs are handled upstream by LegacyRedirect, so anything landing here is
 * genuinely not a page.
 */

const SUGGESTIONS = [
  { to: "/events", label: "Browse events" },
  { to: "/clubs", label: "Club guide" },
  { to: "/my-bookings", label: "My bookings" },
  { to: "/faq", label: "FAQ" },
];

export default function NotFound() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();

  return (
    <div className="shell grid min-h-[70dvh] place-items-center py-20">
      <GlassCard
        elevation={3}
        radius="2xl"
        glow
        className="w-full max-w-xl px-6 py-12 text-center sm:px-12"
      >
        <motion.p
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0.2 } : spring.bouncy}
          className="font-display text-[clamp(4.5rem,18vw,8rem)] font-extrabold leading-[0.85] tracking-[-0.05em] text-transparent"
          style={{
            backgroundImage: "var(--grad-text)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
          aria-hidden="true"
        >
          404
        </motion.p>

        <h1 className="mt-6 text-2xl">
          We couldn't find that page
        </h1>

        <p className="mx-auto mt-3 max-w-sm leading-relaxed text-[var(--color-fg-muted)]">
          Nothing lives at{" "}
          <code className="wrap-anywhere rounded-[var(--radius-sm)] bg-white/[0.07] px-1.5 py-0.5 font-mono text-sm text-[var(--color-fg)]">
            {pathname}
          </code>
          . It may have moved, or the link may be wrong.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" size="lg" to="/">
            <Compass size={18} aria-hidden="true" />
            Go to the homepage
          </Button>
          <Button variant="ghost" size="lg" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </Button>
        </div>

        <div className="mt-10 border-t border-[var(--glass-edge)] pt-8">
          <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            <MagnifyingGlass size={13} aria-hidden="true" />
            Try one of these
          </p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map(({ to, label }) => (
              <li key={to}>
                <Button variant="secondary" size="sm" to={to}>
                  {label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </GlassCard>
    </div>
  );
}
