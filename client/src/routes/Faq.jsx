import { Link } from "react-router-dom";
import { Question } from "@phosphor-icons/react";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import { AccordionItem } from "../components/ui/Accordion";
import { Reveal, RevealGroup } from "../components/ui/Reveal";
import { FAQS } from "../data/faqs";

/**
 * FAQ.
 *
 * The full list. The content lives in data/faqs.js because the landing page
 * shows a subset of it, and the accordion itself is shared from
 * components/ui/Accordion - this route is now just the page around them.
 */

export default function Faq() {
  return (
    <div className="shell section">
      <header className="max-w-2xl space-y-3">
        <p className="kicker">Help</p>
        <h1 className="text-4xl">
          Frequently asked <span className="text-grad-brand">questions</span>
        </h1>
        <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
          Booking, tickets, check-in and accounts. If your question isn't here,
          Support will get you a real answer.
        </p>
      </header>

      <RevealGroup as="ul" each={0.04} className="mx-auto mt-12 max-w-3xl space-y-4">
        {FAQS.map((item, index) => (
          <AccordionItem
            key={item.q}
            item={item}
            index={index}
            idPrefix="faq"
          />
        ))}
      </RevealGroup>

      <Reveal className="mx-auto mt-12 max-w-3xl">
        <GlassCard
          elevation={2}
          radius="xl"
          className="flex flex-col items-center gap-5 p-9 text-center"
        >
          <span
            className="grid size-14 place-items-center rounded-full bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
            aria-hidden="true"
          >
            <Question size={26} />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl">Still stuck?</h2>
            <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Send us the details and we'll come back to you.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" to="/support">
              Contact support
            </Button>
            <Button variant="ghost" to="/contact">
              General enquiry
            </Button>
          </div>
        </GlassCard>
      </Reveal>

      <p className="mt-10 text-center text-sm text-[var(--color-fg-subtle)]">
        Looking for the policies?{" "}
        <Link
          to="/terms"
          className="font-semibold text-[var(--color-fg-muted)] underline decoration-1 underline-offset-4"
        >
          Terms
        </Link>{" "}
        ·{" "}
        <Link
          to="/privacy"
          className="font-semibold text-[var(--color-fg-muted)] underline decoration-1 underline-offset-4"
        >
          Privacy
        </Link>
      </p>
    </div>
  );
}
