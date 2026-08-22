import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, EnvelopeSimple, InstagramLogo } from "@phosphor-icons/react";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import { SUPPORT_EMAIL } from "../../lib/constants";
import { inView, respectMotion, riseIn, stagger } from "../../motion/presets";

/**
 * Footer.
 *
 * The help links (FAQ, Support, Contact) keep the same relative order here as
 * everywhere else they appear, which is a WCAG 2.2 requirement rather than a
 * style choice (consistent-help).
 */

const COLUMNS = [
  {
    title: "Discover",
    links: [
      { to: "/events", label: "All events" },
      { to: "/clubs", label: "Club guide" },
      { to: "/experience", label: "Experiences" },
      { to: "/create-event", label: "List your event" },
    ],
  },
  {
    title: "Account",
    links: [
      { to: "/my-bookings", label: "My bookings" },
      { to: "/profile", label: "Profile" },
      { to: "/dashboard", label: "Organizer dashboard" },
    ],
  },
  {
    title: "Help",
    links: [
      { to: "/faq", label: "FAQ" },
      { to: "/support", label: "Support" },
      { to: "/contact", label: "Contact us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy policy" },
      { to: "/terms", label: "Terms & conditions" },
    ],
  },
];

/**
 * Only accounts that actually exist. The legacy footer also had a YouTube icon
 * pointing at "#", which is a link to nowhere - dropped rather than carried
 * over. The Instagram handle is the real one, minus the share-sheet tracking
 * parameters it was pasted in with.
 */
const SOCIALS = [
  {
    href: "https://www.instagram.com/evently_hub",
    label: "Evently on Instagram",
    icon: InstagramLogo,
  },
];

export default function Footer() {
  const reduced = useReducedMotion();
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24">
      <div className="shell pb-10">
        {/* Closing CTA. One primary action, everything else subordinate
            (primary-action). */}
        <motion.div
          variants={respectMotion(riseIn, reduced)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
        >
          <GlassCard
            elevation={3}
            radius="2xl"
            glow
            className="overflow-hidden px-6 py-12 text-center sm:px-12"
          >
            <p className="kicker">Got something planned?</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl">
              Put your night on the <span className="text-grad-brand">map</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--color-fg-muted)]">
              List an event in a few minutes, sell tickets, and scan people in at
              the door. No spreadsheets.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" size="lg" to="/create-event">
                Create an event
              </Button>
              <Button variant="ghost" size="lg" to="/support">
                Talk to us
              </Button>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]"
        >
          <motion.div variants={respectMotion(riseIn, reduced)}>
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img
                src="/Media/Png/logo.jpg"
                alt=""
                width={36}
                height={36}
                className="size-9 rounded-[var(--radius-sm)] object-cover"
              />
              <span className="font-display text-lg font-extrabold tracking-[-0.03em]">
                Even<span className="text-grad-brand">tly</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Events, clubs, concerts and parties near you — found, booked and
              scanned in one place.
            </p>

            <ul className="mt-6 flex items-center gap-2">
              {SOCIALS.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    className="grid size-11 place-items-center rounded-[var(--radius-md)] border border-[var(--glass-edge)] bg-white/[0.04] text-[var(--color-fg-muted)] transition-colors hover:bg-white/[0.1] hover:text-[var(--color-fg)]"
                  >
                    <Icon size={18} aria-hidden="true" />
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-edge)] bg-white/[0.04] px-4 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-white/[0.1] hover:text-[var(--color-fg)]"
                >
                  <EnvelopeSimple size={16} aria-hidden="true" />
                  {SUPPORT_EMAIL}
                </a>
              </li>
            </ul>
          </motion.div>

          {COLUMNS.map(({ title, links }) => (
            <motion.nav
              key={title}
              aria-label={title}
              variants={respectMotion(riseIn, reduced)}
            >
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                {title}
              </h3>
              <ul className="mt-4 space-y-1">
                {links.map(({ to, label }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="group inline-flex min-h-9 items-center gap-1 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
                    >
                      {label}
                      <ArrowUpRight
                        size={12}
                        weight="bold"
                        aria-hidden="true"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.nav>
          ))}
        </motion.div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-[var(--glass-edge)] pt-6 text-xs text-[var(--color-fg-subtle)] sm:flex-row">
          <p>© {year} Evently. All rights reserved.</p>
          <p>Built in Ludhiana, for anywhere.</p>
        </div>
      </div>
    </footer>
  );
}
