import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretDown, Sparkle, Users } from "@phosphor-icons/react";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import EventCard from "../components/events/EventCard";
import { Reveal, RevealGroup, SectionHeading } from "../components/ui/Reveal";
import { ErrorState, SkeletonGrid } from "../components/ui/Feedback";
import { useApi } from "../lib/useApi";
import { events as eventsApi } from "../lib/api";
import { eventDate, isPastEvent } from "../lib/constants";
import { respectMotion, riseIn, spring } from "../motion/presets";

/**
 * Experience - the past-events showcase.
 *
 * The five recaps below are the legacy page's own content, wording untouched.
 * What is gone is its image galleries: those were 25 picsum.photos placeholders,
 * i.e. random stock photos standing in for event photos that were never taken.
 * Shipping them would put fake evidence on a page whose whole job is proof, and
 * would hang five network requests per card on a third-party service. Each recap
 * gets a generated poster instead until there are real photographs to drop in.
 *
 * Underneath, the page also lists events from the database that have already
 * happened - so it keeps telling the truth without anyone editing this file.
 */

const RECAPS = [
  {
    title: "DJ Night 2026",
    blurb:
      "Over 1500 attendees enjoyed an electrifying night of music and lights.",
    tint: "var(--color-violet)",
    stat: "1,500+ attendees",
  },
  {
    title: "College Fest 2025",
    blurb: "Music, dance, gaming and competitions across multiple venues.",
    tint: "var(--color-magenta)",
    stat: "Multiple venues",
  },
  {
    title: "Food Carnival",
    blurb: "Over 50 food stalls serving cuisines from around the world.",
    tint: "var(--color-warning)",
    stat: "50+ stalls",
  },
  {
    title: "Tech Summit",
    blurb: "Industry leaders discussing AI, Cybersecurity and Innovation.",
    tint: "var(--color-cyan)",
    stat: "3 tracks",
  },
  {
    title: "Holi Bash 2026",
    blurb: "A vibrant celebration with colors, music and live performances.",
    tint: "var(--color-indigo)",
    stat: "Live performances",
  },
];

/**
 * A poster built from the index and a tint - no image request, no layout shift,
 * and it cannot go stale.
 */
function Poster({ index, tint, title }) {
  return (
    <div
      className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-edge)]"
      style={{
        backgroundImage: `radial-gradient(120% 100% at 20% 0%, color-mix(in oklab, ${tint} 42%, transparent), transparent 65%), linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))`,
      }}
    >
      <span
        aria-hidden="true"
        className="font-display text-[clamp(3rem,12vw,5.5rem)] font-extrabold leading-none tracking-[-0.05em] text-white/[0.13]"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="sr-only">{title}</span>
    </div>
  );
}

function Recap({ item, index }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(index === 0);
  const id = `recap-${index}`;

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard elevation={2} radius="xl" className="overflow-hidden">
        <h3>
          <button
            type="button"
            id={`${id}-button`}
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center gap-4 px-6 py-5 text-left [touch-action:manipulation]"
          >
            <span
              aria-hidden="true"
              className="tnum font-mono text-xs text-[var(--color-fg-subtle)]"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-semibold">
                {item.title}
              </span>
              <span className="mt-0.5 block text-sm text-[var(--color-fg-subtle)]">
                {item.stat}
              </span>
            </span>
            <motion.span
              aria-hidden="true"
              animate={{ rotate: open ? 180 : 0 }}
              transition={reduced ? { duration: 0 } : spring.snap}
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
              transition={{
                duration: reduced ? 0 : 0.28,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="overflow-hidden"
            >
              <div className="grid gap-6 px-6 pb-6 sm:grid-cols-[1fr_1.1fr] sm:items-center">
                <Poster index={index} tint={item.tint} title={item.title} />
                <p className="max-w-[52ch] leading-relaxed text-[var(--color-fg-muted)]">
                  {item.blurb}
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </GlassCard>
    </motion.li>
  );
}

/* -------------------------------------------------------------------------- */

function PastEvents() {
  const { data, error, loading, reload } = useApi(
    (signal) => eventsApi.list(undefined, signal),
    []
  );

  const past = (Array.isArray(data) ? data : [])
    .filter(isPastEvent)
    .sort((a, b) => (eventDate(b)?.getTime() ?? 0) - (eventDate(a)?.getTime() ?? 0))
    .slice(0, 6);

  // Nothing has happened yet on a fresh install; an empty shelf says less than
  // no shelf at all, so the section removes itself.
  if (!loading && !error && past.length === 0) return null;

  return (
    <section className="mt-24">
      <SectionHeading
        kicker="From the archive"
        title="Recently wrapped"
        lead="Events that have already run on Evently. Their pages stay up, so you can see what the line-up and pricing actually looked like."
      />

      {loading ? (
        <div className="mt-10">
          <SkeletonGrid count={3} />
        </div>
      ) : error ? (
        <div className="mt-10">
          <ErrorState
            title="Couldn't load the archive"
            message="The event list didn't come back. This section is the only thing affected."
            onRetry={reload}
          />
        </div>
      ) : (
        <RevealGroup
          as="ul"
          className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {past.map((event, index) => (
            <motion.li key={event._id} variants={riseIn}>
              <EventCard event={event} index={index} />
            </motion.li>
          ))}
        </RevealGroup>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default function Experience() {
  return (
    <div className="shell section">
      <header className="max-w-2xl space-y-3">
        <p className="kicker">
          <Sparkle size={14} aria-hidden="true" />
          Experience
        </p>
        <h1 className="text-4xl">
          Our event <span className="text-grad-brand">experiences</span>
        </h1>
        <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
          Take a look at some unforgettable moments from our past events.
        </p>
      </header>

      <RevealGroup as="ul" each={0.05} className="mt-12 space-y-4">
        {RECAPS.map((item, index) => (
          <Recap key={item.title} item={item} index={index} />
        ))}
      </RevealGroup>

      <PastEvents />

      <Reveal className="mt-24">
        <GlassCard
          elevation={3}
          radius="2xl"
          glow
          className="bloom flex flex-col items-center gap-5 px-6 py-12 text-center sm:px-12"
        >
          <span
            className="grid size-14 place-items-center rounded-full bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
            aria-hidden="true"
          >
            <Users size={26} />
          </span>
          <h2 className="max-w-xl text-3xl">
            Want your night in this <span className="text-grad-brand">list</span>?
          </h2>
          <p className="max-w-md text-[var(--color-fg-muted)]">
            List it, sell tickets, scan people in at the door. We'll handle the
            boring half.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" size="lg" to="/create-event">
              Create an event
            </Button>
            <Button variant="ghost" size="lg" to="/events">
              Browse what's on
            </Button>
          </div>
        </GlassCard>
      </Reveal>
    </div>
  );
}
