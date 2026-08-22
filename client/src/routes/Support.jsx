import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  IdentificationCard,
  Lifebuoy,
  QuestionMark,
  Ticket,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import GlassCard from "../components/ui/GlassCard";
import ContactForm from "../components/forms/ContactForm";
import { Reveal } from "../components/ui/Reveal";
import { SUPPORT_EMAIL } from "../lib/constants";
import { inView, respectMotion, riseIn, stagger } from "../motion/presets";

/**
 * Support.
 *
 * The legacy page was the contact form with a different heading, and it posted
 * the same body to the same endpoint. Kept that way. What is added is the row of
 * self-serve routes above it, because three of the four most common support
 * requests ("where's my ticket", "what's my booking reference", "how do I get
 * in") are things the user can already answer without waiting for a reply.
 */

const SELF_SERVE = [
  {
    to: "/my-bookings",
    icon: Ticket,
    title: "Find a booking or ticket",
    body: "Every confirmed booking, with its QR ticket ready to download again.",
  },
  {
    to: "/faq",
    icon: QuestionMark,
    title: "Read the FAQ",
    body: "Ticket limits, verification codes, check-in and sold-out events.",
  },
  {
    to: "/profile",
    icon: IdentificationCard,
    title: "Fix your account details",
    body: "Update the name and email your tickets are issued against.",
  },
];

export default function Support() {
  const reduced = useReducedMotion();

  return (
    <div className="shell section">
      <header className="max-w-2xl space-y-3">
        <p className="kicker">
          <Lifebuoy size={14} aria-hidden="true" />
          Support
        </p>
        <h1 className="text-4xl">
          Something not working? <span className="text-grad-brand">Tell us.</span>
        </h1>
        <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
          Describe the problem and include the event name if it's about a
          booking. The more specific you are, the faster this gets sorted.
        </p>
      </header>

      <motion.ul
        variants={stagger(0.05)}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="mt-10 grid gap-4 sm:grid-cols-3"
      >
        {SELF_SERVE.map(({ to, icon: Icon, title, body }) => (
          <motion.li key={to} variants={respectMotion(riseIn, reduced)}>
            <Link to={to} className="group block h-full">
              <GlassCard
                elevation={2}
                radius="lg"
                interactive
                className="flex h-full flex-col gap-3 p-6"
              >
                <span
                  className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
                  aria-hidden="true"
                >
                  <Icon size={20} />
                </span>
                <h2 className="font-display text-lg font-semibold">
                  {title}
                </h2>
                <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                  {body}
                </p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-[var(--color-violet-bright)]">
                  Open
                  <ArrowRight
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  />
                </span>
              </GlassCard>
            </Link>
          </motion.li>
        ))}
      </motion.ul>

      <div className="mt-14 grid items-start gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <Reveal>
          <ContactForm
            subjectLabel="What's the issue about?"
            subjectPlaceholder="e.g. Ticket didn't arrive for Neon Nights"
            messageLabel="Describe your issue"
            messagePlaceholder="What happened, what you expected, and anything you've already tried…"
            submitLabel="Send request"
            successTitle="Support request received"
            successBody={`Thanks — your request is in the queue. We'll reply from ${SUPPORT_EMAIL}.`}
          />
        </Reveal>

        <Reveal delay={0.08}>
          <GlassCard elevation={2} radius="xl" className="space-y-6 p-7 sm:p-8">
            <div>
              <h2 className="text-xl">
                What helps us answer faster
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {[
                  "The event name and date.",
                  "The email address you booked with, if it differs from the one above.",
                  "The payment reference, if money left your account.",
                  "What you saw on screen — the exact wording of any error.",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--color-violet-bright)]"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-[var(--glass-edge)] pt-6">
              <h3 className="font-display font-semibold">
                Payment taken but no ticket?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                Check{" "}
                <Link
                  to="/my-bookings"
                  className="font-semibold text-[var(--color-violet-bright)] underline decoration-1 underline-offset-4"
                >
                  My bookings
                </Link>{" "}
                first — a booking only confirms once the payment is verified, and
                that can land a moment after the payment window closes. If it
                still isn't there, send us the payment reference and we'll trace
                it.
              </p>
            </div>

            <div className="border-t border-[var(--glass-edge)] pt-6">
              <h3 className="font-display font-semibold">
                Organizing an event?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                Questions about listings, approvals or door scanning go through
                the same form — just say so in the subject.
              </p>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </div>
  );
}
