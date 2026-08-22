import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, MapPin, Ticket } from "@phosphor-icons/react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { RevealGroup } from "../components/ui/Reveal";
import { CLUB_LIST } from "../data/clubs";
import { respectMotion, riseIn } from "../motion/presets";

/**
 * Venue guide.
 *
 * Editorial content, not database records - see data/clubs.js. Kept as its own
 * page because "which room should we go to" is a different question from "what
 * is on tonight".
 */

export default function Clubs() {
  const reduced = useReducedMotion();

  return (
    <div className="shell section">
      <header className="max-w-2xl space-y-3">
        <p className="kicker">Venue guide</p>
        <h1 className="text-4xl">
          The rooms behind the <span className="text-grad-brand">nights</span>
        </h1>
        <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
          Four venues we know well — the sound, the crowd, the door policy and
          what a table actually costs. Pick a room, then find what's on.
        </p>
      </header>

      <RevealGroup as="ul" each={0.07} className="mt-12 space-y-8">
        {CLUB_LIST.map((club, i) => (
          <motion.li key={club.id} variants={respectMotion(riseIn, reduced)}>
            <GlassCard
              elevation={2}
              radius="2xl"
              interactive
              className="group overflow-hidden"
            >
              <Link
                to={`/clubs/${club.id}`}
                className={`grid gap-0 md:grid-cols-2 ${
                  // Alternating image side gives the list a rhythm without
                  // needing a second layout.
                  i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div className="relative aspect-[16/10] overflow-hidden md:aspect-auto md:min-h-72">
                  <img
                    src={club.banner}
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-r from-transparent to-[rgba(5,5,16,0.4)] md:to-[rgba(5,5,16,0.6)]"
                  />
                </div>

                <div className="flex flex-col justify-center gap-5 p-7 sm:p-10">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand" icon={MapPin}>
                      {club.location}
                    </Badge>
                    <Badge tone="neutral" icon={Clock}>
                      {club.time}
                    </Badge>
                    <Badge tone="neutral">{club.agelim}</Badge>
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-3xl transition-colors group-hover:text-[var(--color-violet-bright)]">
                      {club.title}
                    </h2>
                    <p className="max-w-[52ch] leading-relaxed text-[var(--color-fg-muted)]">
                      {club.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <p className="flex items-center gap-2 text-[var(--color-fg-muted)]">
                      <Ticket size={16} aria-hidden="true" />
                      Entry from{" "}
                      <span className="tnum font-semibold text-[var(--color-fg)]">
                        {club.tickets.general}
                      </span>
                    </p>
                    <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-violet-bright)]">
                      Venue details
                      <ArrowRight
                        size={15}
                        weight="bold"
                        aria-hidden="true"
                        className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                      />
                    </span>
                  </div>
                </div>
              </Link>
            </GlassCard>
          </motion.li>
        ))}
      </RevealGroup>

      <div className="mt-14 text-center">
        <p className="text-[var(--color-fg-muted)]">
          Looking for a specific night rather than a room?
        </p>
        <div className="mt-5">
          <Button variant="primary" size="lg" to="/events">
            Browse events
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
