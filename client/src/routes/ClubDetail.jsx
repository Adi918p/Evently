import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowLeft,
  Clock,
  Crown,
  MapPin,
  Star,
  Ticket,
  Users,
} from "@phosphor-icons/react";
import Button from "../components/ui/Button";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { EmptyState } from "../components/ui/Feedback";
import { Reveal, RevealGroup } from "../components/ui/Reveal";
import { getClub } from "../data/clubs";
import { events as eventsApi } from "../lib/api";
import { useApi } from "../lib/useApi";
import EventCard from "../components/events/EventCard";
import { isPastEvent } from "../lib/constants";

const TIERS = [
  {
    key: "general",
    label: "General",
    icon: Ticket,
    blurb: "Entry, dance floor, bar access.",
  },
  {
    key: "vip",
    label: "VIP",
    icon: Star,
    blurb: "Reserved seating and priority entry.",
  },
  {
    key: "vvip",
    label: "VVIP",
    icon: Crown,
    blurb: "Private table, host service, best sightlines.",
  },
];

export default function ClubDetail() {
  const { id } = useParams();
  const club = getClub(id);
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const bannerY = useTransform(scrollY, [0, 600], [0, reduced ? 0 : 90]);

  // Events at this venue, matched on the venue's city. The Event model has no
  // venue-id relation, so this is a best-effort link rather than a join.
  const { data } = useApi(
    (signal) => eventsApi.list({ city: club?.location }, signal),
    [club?.location],
    { enabled: Boolean(club?.location) }
  );

  const nearby = useMemo(() => {
    if (!Array.isArray(data) || !club) return [];
    const name = club.title.toLowerCase();
    return data
      .filter((event) => !isPastEvent(event))
      .filter((event) => String(event.venue || "").toLowerCase().includes(name))
      .slice(0, 3);
  }, [data, club]);

  if (!club) {
    return (
      <div className="shell section">
        <EmptyState
          icon={MapPin}
          title="We don't have that venue"
          description="The link may be old, or the venue has come off the guide."
          action="See all venues"
          actionTo="/clubs"
        />
      </div>
    );
  }

  return (
    <article>
      <header className="relative isolate overflow-hidden">
        <motion.div style={{ y: bannerY }} className="absolute inset-0 -z-10">
          <img
            src={club.banner}
            alt=""
            className="size-full scale-110 object-cover"
            fetchPriority="high"
            decoding="async"
          />
        </motion.div>
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--color-bg)] via-[rgba(5,5,16,0.7)] to-[rgba(5,5,16,0.5)]"
        />

        <div className="shell flex min-h-[58dvh] flex-col justify-end py-14">
          <Button variant="ghost" size="sm" to="/clubs" className="mb-6 self-start">
            <ArrowLeft size={16} aria-hidden="true" />
            All venues
          </Button>

          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" icon={MapPin}>
                {club.location}
              </Badge>
              <Badge tone="neutral" icon={Clock}>
                {club.time}
              </Badge>
              <Badge tone="neutral">{club.agelim}</Badge>
            </div>
            <h1 className="mt-5 text-5xl leading-[0.98]">
              {club.title}
            </h1>
            <p className="mt-5 text-md leading-relaxed text-[var(--color-fg-muted)]">
              {club.description}
            </p>
          </motion.div>
        </div>
      </header>

      <div className="shell grid gap-10 pb-24 pt-12 lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-14">
        <div className="min-w-0 space-y-12">
          <Reveal as="section" aria-labelledby="about-club">
            <h2 id="about-club" className="text-2xl">
              About the venue
            </h2>
            <p className="mt-4 max-w-[68ch] leading-relaxed text-[var(--color-fg-muted)]">
              {club.about}
            </p>
          </Reveal>

          <Reveal as="section" aria-labelledby="tiers">
            <h2 id="tiers" className="text-2xl">
              Entry tiers
            </h2>
            <ul className="mt-6 grid gap-5 sm:grid-cols-3">
              {TIERS.map(({ key, label, icon: Icon, blurb }) => (
                <li key={key}>
                  <GlassCard
                    elevation={key === "vip" ? 3 : 2}
                    radius="lg"
                    glow={key === "vip"}
                    className="h-full p-6"
                  >
                    <span
                      className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
                      aria-hidden="true"
                    >
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-5 text-lg">{label}</h3>
                    <p className="tnum mt-1 font-display text-2xl font-bold text-grad">
                      {club.tickets[key]}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                      {blurb}
                    </p>
                  </GlassCard>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[var(--color-fg-subtle)]">
              Indicative door prices. Event nights are priced per event — check
              the listing.
            </p>
          </Reveal>

          <Reveal as="section" aria-labelledby="club-gallery">
            <h2 id="club-gallery" className="text-2xl">
              Inside
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {club.gallery.map((src, i) => (
                <li key={src}>
                  <GlassCard elevation={2} radius="lg" className="overflow-hidden">
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`w-full object-cover ${
                        i % 3 === 0 ? "aspect-[3/4]" : "aspect-square"
                      }`}
                    />
                  </GlassCard>
                </li>
              ))}
            </ul>
          </Reveal>

          {nearby.length > 0 ? (
            <Reveal as="section" aria-labelledby="club-events">
              <h2 id="club-events" className="text-2xl">
                On at {club.title}
              </h2>
              <RevealGroup
                as="ul"
                className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {nearby.map((event, i) => (
                  <li key={event._id} className="contents">
                    <EventCard event={event} index={i} />
                  </li>
                ))}
              </RevealGroup>
            </Reveal>
          ) : null}
        </div>

        <div className="lg:sticky" style={{ top: "calc(var(--nav-h) + 1.5rem)" }}>
          <GlassCard elevation={3} radius="xl" className="overflow-hidden">
            <div className="space-y-5 p-6">
              <div>
                <p className="kicker">Address</p>
                <p className="mt-2 leading-relaxed text-[var(--color-fg-muted)]">
                  {club.address}
                </p>
              </div>

              <dl className="space-y-3 border-t border-[var(--glass-edge)] pt-5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-[var(--color-fg-muted)]">
                    <Clock size={15} aria-hidden="true" />
                    Hours
                  </dt>
                  <dd className="font-medium">{club.time}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-[var(--color-fg-muted)]">
                    <Users size={15} aria-hidden="true" />
                    Age limit
                  </dt>
                  <dd className="font-medium">{club.agelim}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-[var(--color-fg-muted)]">
                    <Ticket size={15} aria-hidden="true" />
                    Entry from
                  </dt>
                  <dd className="tnum font-medium">{club.tickets.general}</dd>
                </div>
              </dl>

              <Button
                variant="primary"
                fullWidth
                to={`/events?city=${encodeURIComponent(club.location)}`}
              >
                What's on in {club.location}
              </Button>
            </div>

            <iframe
              src={club.maploc}
              title={`Map showing ${club.title}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="aspect-square w-full border-0"
            />
          </GlassCard>

          <p className="mt-4 text-center text-xs text-[var(--color-fg-subtle)]">
            Details change.{" "}
            <Link
              to="/support"
              className="font-semibold text-[var(--color-violet-bright)] underline decoration-1 underline-offset-4"
            >
              Report a correction
            </Link>
            .
          </p>
        </div>
      </div>
    </article>
  );
}
