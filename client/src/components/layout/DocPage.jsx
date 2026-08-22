import { motion, useReducedMotion } from "motion/react";
import GlassCard from "../ui/GlassCard";
import { Reveal } from "../ui/Reveal";
import { respectMotion, riseIn, stagger } from "../../motion/presets";

/**
 * Shared shell for the policy pages.
 *
 * Prose lives in a narrow measure with a sticky contents rail on wide screens.
 * Headings are real h2s in order, so the page is navigable by heading
 * (heading-hierarchy), and the rail is a plain anchor list rather than a
 * scroll-spy widget - fewer moving parts, and it works without JavaScript
 * behaviour.
 */

export default function DocPage({ kicker, title, intro, sections, footer }) {
  const reduced = useReducedMotion();

  return (
    <div className="shell section">
      <header className="max-w-3xl space-y-4">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1 className="text-4xl">{title}</h1>
        {intro ? (
          <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
            {intro}
          </p>
        ) : null}
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-16">
        <nav
          aria-label="On this page"
          className="lg:sticky lg:self-start"
          style={{ top: "calc(var(--nav-h) + 1.5rem)" }}
        >
          <p className="kicker">On this page</p>
          <ul className="mt-4 space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex min-h-11 items-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--color-fg)]"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger(0.05)}
          className="min-w-0 space-y-6"
        >
          {sections.map((section) => (
            <motion.section
              key={section.id}
              id={section.id}
              variants={respectMotion(riseIn, reduced)}
              style={{ scrollMarginTop: "calc(var(--nav-h) + 1.5rem)" }}
            >
              <GlassCard elevation={2} radius="xl" className="p-7 sm:p-9">
                <h2 className="text-xl">{section.heading}</h2>
                <div className="mt-4 max-w-[68ch] space-y-4 leading-relaxed text-[var(--color-fg-muted)]">
                  {Array.isArray(section.body) ? (
                    section.body.map((paragraph, i) => (
                      <p key={i} className="wrap-anywhere">
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <div>{section.body}</div>
                  )}
                </div>
              </GlassCard>
            </motion.section>
          ))}

          {footer ? <Reveal className="pt-2">{footer}</Reveal> : null}
        </motion.div>
      </div>
    </div>
  );
}
