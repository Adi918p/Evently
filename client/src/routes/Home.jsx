import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  ChartLineUp,
  Confetti,
  CreditCard,
  MagnifyingGlass,
  MapPin,
  MusicNotes,
  QrCode,
  Sparkle,
  Ticket,
} from "@phosphor-icons/react";
import Button from "../components/ui/Button";
import GlassCard from "../components/ui/GlassCard";
import Carousel from "../components/ui/Carousel";
import Marquee from "../components/ui/Marquee";
import CountUp from "../components/ui/CountUp";
import StackCards from "../components/ui/StackCards";
import { AccordionItem } from "../components/ui/Accordion";
import EventCard from "../components/events/EventCard";
import { Reveal, RevealGroup, SectionHeading } from "../components/ui/Reveal";
import { EmptyState, ErrorState, SkeletonGrid } from "../components/ui/Feedback";
import { events as eventsApi } from "../lib/api";
import { useApi } from "../lib/useApi";
import {
  CATEGORIES,
  CITIES,
  eventDate,
  formatNumber,
  isPastEvent,
} from "../lib/constants";
import { CLUB_LIST } from "../data/clubs";
import { FEATURED_FAQS } from "../data/faqs";
import {
  duration as dur,
  ease,
  respectMotion,
  riseIn,
  riseInFar,
  spring,
  stagger,
} from "../motion/presets";

/**
 * Landing page.
 *
 * Motion here is load-bearing rather than decorative: the marquees make the
 * category and city rails scannable without a 28-item grid, the carousel puts
 * six events in the space of three, and the scroll rail in "How it works" turns
 * a numbered list into something that reads as a sequence.
 *
 * Three rules hold across every section, and breaking them is what makes a page
 * like this feel cheap:
 *
 *   1. Every animation is transform or opacity only, so nothing on this page can
 *      cause a reflow or shift the layout as it plays.
 *   2. Anything that moves on its own either stops within a few seconds, or
 *      carries a visible pause control, or is aria-hidden decoration with no
 *      content in it - and all of it is gated on prefers-reduced-motion.
 *   3. Timings and curves come from motion/presets, never from a number typed
 *      in here, so the whole site shares one rhythm (motion-consistency).
 */

/** Mid-count values are fractional; a stat must never render "1.5 cities". */
const countFormat = (n) => formatNumber(Math.round(n));

/* ==========================================================================
   Hero
   ========================================================================== */

/**
 * The third headline line rotates and then stops for good.
 *
 * A headline word that cycles forever is auto-updating content and would need a
 * pause control next to an h1, which looks absurd. WCAG 2.2.2 exempts movement
 * that stops within five seconds, so this runs through three words in about
 * 2.3s and rests permanently on the last one. The flourish lands on the brand
 * line instead of fighting it.
 */
const SLOT_WORDS = ["Remember.", "Belong.", "Experience."];
const SLOT_HOLD_MS = 1150;
const SLOT_FINAL = SLOT_WORDS[SLOT_WORDS.length - 1];

function SlotWord() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Reduced motion is checked inside the effect, not just at mount: someone
    // can turn it on while the page is open, and freezing mid-rotation would
    // leave the headline reading "Discover. Book. Belong." forever.
    if (reduced) {
      setIndex(SLOT_WORDS.length - 1);
      return undefined;
    }
    if (index >= SLOT_WORDS.length - 1) return undefined;
    const timer = window.setTimeout(
      () => setIndex((value) => value + 1),
      SLOT_HOLD_MS
    );
    return () => window.clearTimeout(timer);
  }, [index, reduced]);

  return (
    <span className="block">
      {/* The accessible headline is the resting word, always, so a screen reader
          reads "Discover. Book. Experience." no matter which frame it lands on.
          The visual stack is decoration on top of that. */}
      <span className="sr-only">{SLOT_FINAL}</span>

      {/* One grid cell, every candidate stacked in it. The line is sized by the
          widest word from the first paint, so swapping words cannot reflow the
          headline (layout-shift-avoid). */}
      <span aria-hidden="true" className="grid">
        {SLOT_WORDS.map((word, i) => (
          <motion.span
            key={word}
            className="col-start-1 row-start-1 block text-grad-brand"
            style={{ transformPerspective: 700 }}
            // Words start in their resting position rather than animating in on
            // mount - the parent line already handles the entrance, and doing it
            // twice reads as a stutter.
            initial={false}
            animate={
              i === index
                ? { opacity: 1, y: "0%", rotateX: 0 }
                : {
                    opacity: 0,
                    // Spent words exit upwards, unseen words wait below, so the
                    // stack reads as one physical reel (hierarchy-motion).
                    y: i < index ? "-55%" : "55%",
                    rotateX: i < index ? 45 : -45,
                  }
            }
            transition={reduced ? { duration: 0 } : spring.soft}
          >
            {word}
          </motion.span>
        ))}
      </span>
    </span>
  );
}

const wordIn = {
  hidden: { opacity: 0, y: "0.35em", rotateX: -35 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { ...spring.soft, delay: 0.12 + i * 0.09 },
  }),
};

/**
 * Decorative glass chips that drift beside the headline.
 *
 * Two independent motions on two nested elements, deliberately: an ambient float
 * on the inner one and scroll parallax on the outer one. Putting both on a single
 * element means one `y` overwriting the other, which is the usual reason a
 * "floating card" snaps when the page scrolls.
 *
 * These are aria-hidden with no content of their own and they never animate under
 * reduced motion, which is what keeps a perpetual ambient loop acceptable here -
 * there is nothing inside for the movement to make unreadable.
 */
function FloatingChip({ scrollY, icon: Icon, title, meta, position, tilt, drift, floatSeconds, delay }) {
  const reduced = useReducedMotion();
  const y = useTransform(scrollY, [0, 800], [0, drift]);

  return (
    <div
      aria-hidden="true"
      // Hidden below lg: on a narrow screen these would sit on top of the
      // headline, and a decoration that covers the copy is worse than no
      // decoration.
      className={`pointer-events-none absolute hidden lg:block ${position}`}
      // Rotation lives on this plain element so neither Motion transform has to
      // carry it.
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <motion.div style={reduced ? undefined : { y }}>
        <motion.div
          animate={reduced ? undefined : { y: [0, -12, 0] }}
          transition={
            reduced
              ? undefined
              : {
                  duration: floatSeconds,
                  delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        >
          <GlassCard elevation={3} radius="lg" className="w-52 p-4">
            <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]">
              <Icon size={18} weight="bold" />
            </span>
            <p className="mt-3 font-display text-sm font-bold">{title}</p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{meta}</p>
          </GlassCard>
        </motion.div>
      </motion.div>
    </div>
  );
}

const CHIPS = [
  {
    icon: Ticket,
    title: "Instant QR pass",
    meta: "Scanned once at the door",
    position: "right-[6%] top-[15%]",
    tilt: -7,
    drift: 120,
    floatSeconds: 5.6,
    delay: 0,
  },
  {
    icon: MusicNotes,
    title: "Neon Nights",
    meta: "Luna Club · Friday",
    position: "right-[19%] top-[44%]",
    tilt: 5,
    drift: 64,
    floatSeconds: 6.9,
    delay: 0.8,
  },
  {
    icon: Confetti,
    title: "Nearly gone",
    meta: "94% of seats sold",
    position: "right-[3%] top-[68%]",
    tilt: 9,
    drift: 168,
    floatSeconds: 6.2,
    delay: 1.6,
  },
];

function Hero({ stats, liveCount }) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  // The hero drifts up slightly slower than the page, so the sections below
  // appear to slide over it. Transform-only (transform-performance).
  const y = useTransform(scrollY, [0, 700], [0, reduced ? 0 : 120]);
  const opacity = useTransform(scrollY, [0, 520], [1, reduced ? 1 : 0.25]);

  return (
    <section className="relative overflow-hidden">
      {/* Local cover for the copy block. The hero is the only place on the site
          where display type sits straight on the open scene with nothing behind
          it, so it needs more than the global scrim. Absolute sibling, so it
          adds no layout. */}
      <div aria-hidden="true" className="copy-scrim" />

      {CHIPS.map((chip) => (
        <FloatingChip key={chip.title} scrollY={scrollY} {...chip} />
      ))}

      <motion.div
        style={{ y, opacity }}
        className="shell relative flex min-h-[calc(100dvh-var(--nav-h))] flex-col justify-center py-20"
      >
        {/* Announcement pill. Reads the real event count, so it is never a
            number we made up - and it renders the neutral copy until the API
            answers rather than flashing a zero. */}
        <motion.p
          className="glass glass-2 glass-specular flex w-fit items-center gap-2.5 rounded-[var(--radius-pill)] py-2 pl-3 pr-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.slow, ease: ease.outQuint }}
        >
          <span aria-hidden="true" className="relative grid size-2 place-items-center">
            <span className="absolute inset-0 rounded-full bg-[var(--color-success)]" />
            {reduced ? null : (
              <motion.span
                className="absolute inset-0 rounded-full bg-[var(--color-success)]"
                animate={{ scale: [1, 2.6], opacity: [0.65, 0] }}
                transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
              />
            )}
          </span>
          {liveCount
            ? `${formatNumber(liveCount)} event${liveCount === 1 ? "" : "s"} live right now`
            : "Live in your city tonight"}
        </motion.p>

        <h1
          className="mt-6 font-display text-6xl font-extrabold leading-[0.92] tracking-[-0.035em]"
          style={{ perspective: "800px" }}
        >
          {["Discover.", "Book."].map((word, i) => (
            <motion.span
              key={word}
              custom={i}
              variants={respectMotion(wordIn, reduced)}
              initial="hidden"
              animate="show"
              className="block"
            >
              {word}
            </motion.span>
          ))}
          <motion.span
            custom={2}
            variants={respectMotion(wordIn, reduced)}
            initial="hidden"
            animate="show"
            className="block"
          >
            <SlotWord />
          </motion.span>
        </h1>

        <motion.p
          className="mt-7 max-w-[38ch] text-xl leading-relaxed text-[var(--color-fg-muted)]"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.5 }}
        >
          Find the hottest events, clubs, concerts and parties near you — and
          walk straight in with a QR pass.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap items-center gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.52, duration: 0.5 }}
        >
          <Button variant="primary" size="lg" to="/events">
            Explore events
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </Button>
          <Button variant="secondary" size="lg" to="/clubs">
            Browse clubs
          </Button>
        </motion.div>

        {/* Live counts, not invented numbers. Hidden until data lands so the
            section never shows a placeholder zero. */}
        {stats ? (
          <motion.dl
            className="mt-16 flex flex-wrap gap-x-12 gap-y-6"
            initial="hidden"
            animate="show"
            variants={stagger(0.07, 0.6)}
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                variants={respectMotion(riseIn, reduced)}
                className="min-w-24"
              >
                <dd>
                  <CountUp
                    value={stat.value}
                    format={countFormat}
                    className="tnum font-display text-3xl font-bold text-grad"
                  />
                </dd>
                <dt className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
                  {stat.label}
                </dt>
              </motion.div>
            ))}
          </motion.dl>
        ) : null}

        {/* Bounded to three bobs. A scroll hint has done its job by then, and
            stopping keeps it clear of "moving for more than five seconds". */}
        <motion.p
          className="mt-14 hidden items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)] sm:flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: dur.slower }}
        >
          <motion.span
            aria-hidden="true"
            animate={reduced ? undefined : { y: [0, 5, 0] }}
            transition={
              reduced
                ? undefined
                : { duration: 1.6, repeat: 3, delay: 1.4, ease: "easeInOut" }
            }
          >
            <ArrowDown size={14} weight="bold" />
          </motion.span>
          Scroll to explore
        </motion.p>
      </motion.div>
    </section>
  );
}

/* ==========================================================================
   Marquee band
   ========================================================================== */

const chipClass =
  "glass glass-2 glass-specular flex min-h-11 shrink-0 items-center gap-2.5 rounded-[var(--radius-pill)] px-5 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] focus-visible:outline-offset-4";

/**
 * Two rails moving in opposite directions.
 *
 * The opposed directions are the point: one row alone reads as a broken
 * animation, two reads as depth. Both rows stop the moment the pointer is over
 * them, which is what makes a moving row of links actually clickable rather
 * than a target you have to chase.
 */
function MarqueeBand() {
  return (
    <section className="pt-6 pb-10" aria-labelledby="rails-heading">
      <h2 id="rails-heading" className="sr-only">
        Browse by category or city
      </h2>

      <Reveal className="flex flex-col gap-4">
        <Marquee label="Browse by category" seconds={52} direction={1}>
          {CATEGORIES.map(({ value, label, icon: Icon }) => (
            <Link
              key={value}
              to={`/events?category=${encodeURIComponent(value)}`}
              className={chipClass}
            >
              <Icon
                size={16}
                aria-hidden="true"
                className="text-[var(--color-violet-bright)]"
              />
              {label}
            </Link>
          ))}
        </Marquee>

        <Marquee label="Browse by city" seconds={64} direction={-1}>
          {CITIES.map((city) => (
            <Link
              key={city}
              to={`/events?city=${encodeURIComponent(city)}`}
              className={chipClass}
            >
              <MapPin
                size={15}
                aria-hidden="true"
                className="text-[var(--color-cyan)]"
              />
              {city}
            </Link>
          ))}
        </Marquee>
      </Reveal>
    </section>
  );
}

/* ==========================================================================
   Trending
   ========================================================================== */

function Trending({ list, loading, error, reload }) {
  return (
    <section className="section" aria-labelledby="trending-heading">
      <div className="shell">
        <SectionHeading
          id="trending-heading"
          kicker="Happening soon"
          title="Trending right now"
          lead="The next nights out, closest first."
          action={
            <Button variant="secondary" to="/events">
              See all events
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Button>
          }
        />

        <div className="mt-10">
          {loading ? <SkeletonGrid count={6} /> : null}

          {!loading && error ? (
            <ErrorState
              title="Couldn't load events"
              message={error.message}
              onRetry={reload}
            />
          ) : null}

          {!loading && !error && list.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No upcoming events yet"
              description="Nothing is on the calendar right now. If you run events, this is a good time to be the first."
              action="Create an event"
              actionTo="/create-event"
            />
          ) : null}

          {/* A carousel of two cards is a grid with extra controls, so below the
              threshold where scrolling earns its keep this falls back to the
              plain grid. */}
          {!loading && !error && list.length > 0 && list.length < 4 ? (
            <RevealGroup
              as="ul"
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {list.map((event, i) => (
                <li key={event._id} className="contents">
                  <EventCard event={event} index={i} />
                </li>
              ))}
            </RevealGroup>
          ) : null}

          {!loading && !error && list.length >= 4 ? (
            <Reveal>
              <Carousel label="Trending events">
                {list.map((event, i) => (
                  <EventCard key={event._id} event={event} index={i} />
                ))}
              </Carousel>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Category grid
   ========================================================================== */

function Categories() {
  const reduced = useReducedMotion();

  return (
    <section className="section" aria-labelledby="cat-heading">
      <div className="shell">
        <SectionHeading
          id="cat-heading"
          kicker="Pick a mood"
          title="What are you in the mood for?"
          lead="Twelve ways to spend a night. Tap one and we'll filter everything down to it."
        />

        <RevealGroup
          as="ul"
          each={0.035}
          className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {CATEGORIES.map(({ value, label, icon: Icon }) => (
            <motion.li key={value} variants={respectMotion(riseIn, reduced)}>
              {/* `tilt` is on here and nowhere else on the page: twelve small
                  cards in a grid is exactly the case where the pointer tracking
                  reads as glass catching the light, and a dense list is exactly
                  where it would read as noise. */}
              <GlassCard
                elevation={2}
                radius="lg"
                interactive
                tilt
                className="h-full"
              >
                <Link
                  to={`/events?category=${encodeURIComponent(value)}`}
                  className="flex min-h-28 flex-col justify-between gap-4 p-5"
                >
                  <span
                    className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
                    aria-hidden="true"
                  >
                    <Icon size={22} />
                  </span>
                  <span className="font-display font-semibold">{label}</span>
                </Link>
              </GlassCard>
            </motion.li>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ==========================================================================
   Clubs
   ========================================================================== */

/**
 * Image that drifts inside its frame as the page scrolls.
 *
 * The travel is ±9% against a 1.18 scale, so the frame is never uncovered at
 * either extreme. Scale is set as a Motion value rather than a Tailwind class
 * because Motion writes the whole `transform` - a `scale-[1.18]` class would be
 * silently overwritten the first time `y` updated, and the image would snap to
 * its natural size mid-scroll.
 *
 * Parallax is one layer at a shallow delta on a decorative image, which is the
 * only place it belongs: doing this to text is what makes a page unreadable.
 */
function ParallaxImage({ src, className = "" }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-9%", "9%"]);

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <motion.img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
        style={reduced ? { scale: 1 } : { y, scale: 1.18 }}
      />
    </div>
  );
}

function ClubsStrip() {
  const reduced = useReducedMotion();

  return (
    <section className="section" aria-labelledby="clubs-heading">
      <div className="shell">
        <SectionHeading
          id="clubs-heading"
          kicker="Venue guide"
          title="Rooms worth the trip"
          lead="Our pick of the rooms that consistently deliver — sound, crowd and lights."
          action={
            <Button variant="secondary" to="/clubs">
              All venues
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Button>
          }
        />

        <RevealGroup
          as="ul"
          each={0.07}
          className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {CLUB_LIST.map((club) => (
            <motion.li key={club.id} variants={respectMotion(riseInFar, reduced)}>
              <GlassCard
                elevation={2}
                radius="xl"
                interactive
                className="h-full overflow-hidden"
              >
                <Link to={`/clubs/${club.id}`} className="block">
                  <div className="relative">
                    <ParallaxImage
                      src={club.banner}
                      className="aspect-[4/5]"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-[rgba(5,5,16,0.92)] via-[rgba(5,5,16,0.25)] to-transparent"
                    />
                    <div className="absolute inset-x-4 bottom-4">
                      <h3 className="font-display text-lg font-bold">
                        {club.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
                        {club.location}
                      </p>
                    </div>
                  </div>
                </Link>
              </GlassCard>
            </motion.li>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ==========================================================================
   How it works
   ========================================================================== */

const STEPS = [
  {
    icon: MagnifyingGlass,
    title: "Find it",
    body: "Filter by city, category and date. Every search is a shareable link, so you can send a shortlist straight to the group chat.",
  },
  {
    icon: Ticket,
    title: "Book it",
    body: "Up to ten tickets in one go, paid through Razorpay. Seats are held the moment payment clears — no double-booked rows.",
  },
  {
    icon: QrCode,
    title: "Walk in",
    body: "Your ticket lands as a PDF with a QR code. Door staff scan it once; a second scan is rejected.",
  },
];

function HowItWorks() {
  const reduced = useReducedMotion();
  const railRef = useRef(null);

  // Bound to this section rather than the page, so the rail fills exactly as the
  // three steps pass through the middle of the viewport.
  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ["start 85%", "end 65%"],
  });
  // Spring-smoothed, so a trackpad flick fills the rail as a single sweep rather
  // than stepping with the scroll events.
  const fill = useSpring(scrollYProgress, spring.heavy);

  return (
    <section className="section" aria-labelledby="how-heading">
      <div className="shell">
        <SectionHeading
          id="how-heading"
          align="center"
          kicker="Three steps"
          title="From scrolling to standing in the room"
        />

        <div ref={railRef} className="mt-12">
          {/* Decorative progress rail. Hidden below md, where the three cards
              stack vertically and a horizontal rail would describe nothing.
              overflow-hidden matters: the spring overshoots past 1, and without
              it the fill would poke out of the track. */}
          <div
            aria-hidden="true"
            className="relative mb-10 hidden h-[3px] overflow-hidden rounded-[var(--radius-pill)] bg-white/10 md:block"
          >
            <motion.div
              className="absolute inset-0 bg-[image:var(--grad-brand)]"
              style={{ scaleX: reduced ? 1 : fill, originX: 0 }}
            />
          </div>

          <RevealGroup as="ol" each={0.08} className="grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <motion.li key={title} variants={respectMotion(riseIn, reduced)}>
                <GlassCard elevation={2} radius="xl" className="h-full p-7">
                  <div className="flex items-center justify-between gap-4">
                    <span
                      className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
                      aria-hidden="true"
                    >
                      <Icon size={24} />
                    </span>
                    <span
                      className="tnum font-display text-3xl font-extrabold text-[rgba(255,255,255,0.09)]"
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                    {body}
                  </p>
                </GlassCard>
              </motion.li>
            ))}
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Organiser toolkit
   ========================================================================== */

/**
 * Four claims, each one a feature that exists today.
 *
 * Deliberately not a feature grid: a grid invites skimming, and these are the
 * four things an organiser has to believe before they will put their event on a
 * platform they have never used. The deck makes each one hold the screen on its
 * own, and the chips carry the specifics so the body copy does not have to.
 */
const TOOLKIT = [
  {
    icon: CalendarPlus,
    kicker: "Set up",
    title: "List it in one sitting",
    body: "Title, venue, date, seat count and a banner. Publish, then keep editing — the listing stays live while you change it, so a corrected time or a swapped poster never means taking the page down.",
    chips: ["Banner upload", "Editable after publishing", "Seat count you set"],
  },
  {
    icon: CreditCard,
    kicker: "Sell",
    title: "Take the money safely",
    body: "Razorpay handles the checkout. Seats are allocated in one atomic step, so two people racing for the last pair cannot both win it — and the one who loses the race is never charged.",
    chips: ["Razorpay checkout", "Atomic seat allocation", "No double-booked rows"],
  },
  {
    icon: QrCode,
    title: "Get them through the door",
    kicker: "Check in",
    body: "Every booking emails a PDF ticket carrying a QR code. Your door staff scan it, see who it belongs to, and admit them. A second scan of the same code is rejected, so a screenshot passed to a friend does not get them in.",
    chips: ["PDF by email", "Single-use QR", "Works on a phone camera"],
  },
  {
    icon: ChartLineUp,
    kicker: "Track",
    title: "Watch the room fill",
    body: "One dashboard for the whole run: bookings per event, who has checked in and who has not yet arrived, and running totals — during the night, not in a report the morning after.",
    chips: ["Bookings per event", "Live check-in status", "Running totals"],
  },
];

function ToolkitCard({ icon: Icon, kicker, title, body, chips, index }) {
  return (
    <GlassCard
      elevation={3}
      radius="2xl"
      glow
      className="relative overflow-hidden p-8 sm:p-10"
    >
      <div className="bloom absolute inset-0" aria-hidden="true" />

      <div className="relative grid gap-6 md:grid-cols-[auto_1fr] md:gap-8">
        <div className="flex items-center gap-4 md:flex-col md:items-start">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
            aria-hidden="true"
          >
            <Icon size={28} />
          </span>
          {/* Sits under the icon on desktop and beside it on mobile, where a
              column of two would waste a whole card's width on decoration. */}
          <span
            className="tnum font-display text-4xl font-extrabold leading-none text-[rgba(255,255,255,0.09)]"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <div>
          <p className="kicker">{kicker}</p>
          <h3 className="mt-3 text-2xl sm:text-3xl">{title}</h3>
          <p className="mt-4 max-w-prose text-md leading-relaxed text-[var(--color-fg-muted)]">
            {body}
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li
                key={chip}
                className="glass glass-1 rounded-[var(--radius-pill)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)]"
              >
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </GlassCard>
  );
}

function OrganiserDeck() {
  return (
    <section className="section" aria-labelledby="toolkit-heading">
      <div className="shell">
        <SectionHeading
          id="toolkit-heading"
          align="center"
          kicker="Organiser toolkit"
          title="Everything the door needs, already built"
        />

        <StackCards
          label="What Evently handles for an organiser"
          className="mt-12"
        >
          {TOOLKIT.map((item, i) => (
            <ToolkitCard key={item.title} index={i} {...item} />
          ))}
        </StackCards>
      </div>
    </section>
  );
}

/* ==========================================================================
   Questions
   ========================================================================== */

/**
 * A short FAQ, sitting between the pitch and the final call to action.
 *
 * Placed here because it is the last objection-handling step before someone
 * either books or leaves, and because the answers double as detail the sections
 * above deliberately do not carry - the ten-ticket cap and what happens to your
 * money in a race for the last seat are the wrong thing to put in a hero.
 *
 * Everything opens closed. Pre-expanding one would make the section taller than
 * it looks and imply that question matters more than the rest.
 */
function FaqPreview() {
  return (
    <section className="section" aria-labelledby="faq-preview-heading">
      <div className="shell">
        <SectionHeading
          id="faq-preview-heading"
          align="center"
          kicker="Questions"
          title="Asked before booking"
          lead="The short version. The full list lives on the FAQ page."
        />

        <RevealGroup
          as="ul"
          each={0.05}
          className="mx-auto mt-12 max-w-3xl space-y-4"
        >
          {FEATURED_FAQS.map((item, index) => (
            <AccordionItem
              key={item.q}
              item={item}
              index={index}
              /* Distinct from the /faq page's prefix: same component, and two
                 panels answering to `faq-0-panel` would be one id too many. */
              idPrefix="home-faq"
            />
          ))}
        </RevealGroup>

        <Reveal className="mt-10 text-center">
          <Button variant="secondary" to="/faq">
            All questions
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function Home() {
  const { data, loading, error, reload } = useApi(
    (signal) => eventsApi.list(undefined, signal),
    []
  );

  // GET /api/events returns a bare array.
  const all = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const upcoming = useMemo(
    () =>
      all
        .filter((event) => !isPastEvent(event))
        .sort((a, b) => {
          const da = eventDate(a);
          const db = eventDate(b);
          if (!da) return 1;
          if (!db) return -1;
          return da - db;
        }),
    [all]
  );

  const stats = useMemo(() => {
    if (loading || error || all.length === 0) return null;
    const cities = new Set(all.map((event) => event.location).filter(Boolean));
    const categories = new Set(
      all.map((event) => event.category).filter(Boolean)
    );
    // Numbers, not strings: CountUp animates the value and formats it itself.
    return [
      { label: "Live events", value: upcoming.length },
      { label: "Cities", value: cities.size },
      { label: "Categories", value: categories.size || CATEGORIES.length },
    ];
  }, [all, upcoming.length, loading, error]);

  return (
    <>
      <Hero stats={stats} liveCount={stats ? upcoming.length : 0} />
      <MarqueeBand />
      <div id="trending" style={{ scrollMarginTop: "calc(var(--nav-h) + 2rem)" }}>
        <Trending
          list={upcoming.slice(0, 8)}
          loading={loading}
          error={error}
          reload={reload}
        />
      </div>
      <Categories />
      <ClubsStrip />
      <HowItWorks />
      <OrganiserDeck />
      <FaqPreview />

      <section className="section">
        <div className="shell">
          <Reveal>
            <GlassCard
              elevation={3}
              radius="2xl"
              glow
              className="relative overflow-hidden px-8 py-16 text-center sm:px-14"
            >
              <div className="bloom absolute inset-0" aria-hidden="true" />
              <div className="relative mx-auto max-w-2xl space-y-5">
                <p className="kicker">
                  <Sparkle size={14} weight="fill" aria-hidden="true" />
                  For organisers
                </p>
                <h2 className="text-4xl">
                  You run the night. We'll run the door.
                </h2>
                <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
                  Club nights, fests, workshops, meets — if people need a ticket
                  to get in, it belongs here.
                </p>
                <div className="flex flex-wrap justify-center gap-4 pt-2">
                  <Button variant="primary" size="lg" to="/create-event">
                    Create an event
                  </Button>
                  <Button variant="ghost" size="lg" to="/contact">
                    Talk to us
                  </Button>
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </section>
    </>
  );
}
