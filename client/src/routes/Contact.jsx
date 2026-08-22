import { motion, useReducedMotion } from "motion/react";
import {
  EnvelopeSimple,
  MapPin,
  Phone,
  Clock,
} from "@phosphor-icons/react";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import ContactForm from "../components/forms/ContactForm";
import { Reveal } from "../components/ui/Reveal";
import {
  SUPPORT_ADDRESS,
  SUPPORT_EMAIL,
  SUPPORT_PHONES,
  telHref,
} from "../lib/constants";
import { inView, respectMotion, riseIn, stagger } from "../motion/presets";

/**
 * Contact.
 *
 * Same three info cards and the same form the legacy page had, and the same
 * POST to /api/contact. The email and phone numbers are real, so they are
 * links rather than plain text - tapping a number on a phone should dial it.
 */

function InfoCard({ icon: Icon, title, children }) {
  const reduced = useReducedMotion();

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard
        elevation={2}
        radius="lg"
        interactive
        className="flex h-full gap-4 p-6"
      >
        <span
          className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
          aria-hidden="true"
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            {title}
          </h3>
          <div className="mt-2 space-y-1 text-[var(--color-fg)]">{children}</div>
        </div>
      </GlassCard>
    </motion.li>
  );
}

const linkClass =
  "wrap-anywhere inline-flex min-h-8 items-center font-medium transition-colors hover:text-[var(--color-violet-bright)]";

export default function Contact() {
  const reduced = useReducedMotion();

  return (
    <div className="shell section">
      <header className="max-w-2xl space-y-3">
        <p className="kicker">Contact us</p>
        <h1 className="text-4xl">
          Have questions, feedback,{" "}
          <span className="text-grad-brand">or need support?</span>
        </h1>
        <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
          We'd love to hear from you. Send a message and a real person will read
          it — or reach us directly using the details below.
        </p>
      </header>

      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
        <motion.ul
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="space-y-4"
        >
          <InfoCard icon={EnvelopeSimple} title="Email">
            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
              {SUPPORT_EMAIL}
            </a>
          </InfoCard>

          <InfoCard icon={Phone} title="Phone">
            {SUPPORT_PHONES.map((phone) => (
              <p key={phone}>
                <a href={telHref(phone)} className={`${linkClass} tnum`}>
                  {phone}
                </a>
              </p>
            ))}
          </InfoCard>

          <InfoCard icon={MapPin} title="Address">
            <p className="font-medium">{SUPPORT_ADDRESS}</p>
          </InfoCard>

          <InfoCard icon={Clock} title="Response time">
            <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Messages are answered in the order they arrive, usually within a
              day. Anything about a booking you've already paid for jumps the
              queue.
            </p>
          </InfoCard>

          <motion.li variants={respectMotion(riseIn, reduced)}>
            <GlassCard elevation={1} radius="lg" className="p-6">
              <h3 className="font-display font-semibold">
                Looking for a quick answer?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                Booking, tickets and check-in questions are already answered on
                the FAQ.
              </p>
              <Button variant="ghost" size="sm" to="/faq" className="mt-4">
                Read the FAQ
              </Button>
            </GlassCard>
          </motion.li>
        </motion.ul>

        <Reveal>
          <ContactForm
            subjectPlaceholder="Partnership, feedback, something else…"
            messagePlaceholder="Write your message…"
            successBody={`Thanks — we've got it. Replies come from ${SUPPORT_EMAIL}, usually within a day.`}
          />
        </Reveal>
      </div>
    </div>
  );
}
