import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretDown } from "@phosphor-icons/react";

import GlassCard from "./GlassCard";
import { respectMotion, riseIn } from "../../motion/presets";

/**
 * One question, one collapsible answer.
 *
 * A real <button> per question carrying aria-expanded and aria-controls, and the
 * panel is only in the tree when it is open - so a screen reader never reads out
 * an answer that is visually collapsed, and Tab never lands inside one.
 *
 * Height is animated rather than faded on its own. A pure fade would leave the
 * panel occupying its full height while unreadable, pushing the questions below
 * it apart for no visible reason; animating height moves them, which is the
 * honest description of what happened. The two run together and the panel is
 * never parked mid-fade (opacity-threshold).
 *
 * `idPrefix` exists because two accordions on one page - the landing preview and
 * anything else - would otherwise both mint `faq-0` and hand the same
 * aria-controls target to two different panels.
 */
export function AccordionItem({ item, index, idPrefix = "accordion" }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const id = `${idPrefix}-${index}`;

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard elevation={2} radius="lg" className="overflow-hidden">
        <h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            id={`${id}-button`}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left [touch-action:manipulation]"
          >
            <span className="font-display text-lg font-semibold">{item.q}</span>
            <motion.span
              aria-hidden="true"
              animate={{ rotate: open ? 180 : 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.22 }}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[var(--color-fg-muted)]"
            >
              <CaretDown size={16} weight="bold" />
            </motion.span>
          </button>
        </h3>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="panel"
              id={`${id}-panel`}
              role="region"
              aria-labelledby={`${id}-button`}
              initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <p className="max-w-[68ch] px-6 pb-6 leading-relaxed text-[var(--color-fg-muted)]">
                {item.a}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </GlassCard>
    </motion.li>
  );
}

export default AccordionItem;
