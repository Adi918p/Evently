import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarBlank,
  MapPin,
  QrCode,
  SealCheck,
  Ticket,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import Badge, { Chip, StatusBadge } from "../components/ui/Badge";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui/Feedback";
import { TicketModal } from "../components/bookings/BookingTicket";
import { RevealGroup } from "../components/ui/Reveal";
import { useApi } from "../lib/useApi";
import { bookings as bookingsApi } from "../lib/api";
import { eventDate, formatPrice, isPastEvent } from "../lib/constants";
import { respectMotion, riseIn } from "../motion/presets";

/**
 * My bookings.
 *
 * One request, /api/bookings/my, which returns every booking on the account with
 * its event populated (title, date, banner, location, venue, price). Splitting
 * upcoming from past happens here rather than server-side because the endpoint
 * takes no filters and the volume per user is small.
 *
 * The QR lives behind a button instead of being printed on every row: a wall of
 * scannable codes invites the wrong one being shown at the door.
 */

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

function BookingRow({ booking, onShowTicket }) {
  const reduced = useReducedMotion();
  const event = booking.event && typeof booking.event === "object" ? booking.event : null;
  const date = eventDate(event);
  const past = event ? isPastEvent(event) : false;
  const cancelled = booking.status === "cancelled";

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard
        elevation={2}
        radius="xl"
        className="overflow-hidden"
        style={cancelled ? { opacity: 0.72 } : undefined}
      >
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* Fixed aspect on mobile, fixed width on desktop - either way the
              space is reserved before the image loads (image-dimension). */}
          <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-[var(--color-card)] sm:aspect-auto sm:w-52">
            {event?.banner ? (
              <img
                src={event.banner}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="absolute inset-0 grid place-items-center bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
              >
                <Ticket size={28} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 p-5 sm:py-5 sm:pl-0 sm:pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} />
              {booking.checkedIn ? (
                <Badge tone="info" icon={SealCheck}>
                  Checked in
                </Badge>
              ) : null}
              {past && !cancelled ? <Badge tone="neutral">Finished</Badge> : null}
            </div>

            <h2 className="mt-3 text-xl leading-tight">
              {event?._id ? (
                <Link
                  to={`/events/${event._id}`}
                  className="transition-colors hover:text-[var(--color-violet-bright)]"
                >
                  {event.title}
                </Link>
              ) : (
                event?.title || "Event no longer available"
              )}
            </h2>

            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--color-fg-muted)]">
              {date ? (
                <li className="flex items-center gap-1.5">
                  <CalendarBlank size={15} aria-hidden="true" className="shrink-0" />
                  {format(date, "EEE d MMM yyyy")}
                </li>
              ) : null}
              {event?.venue || event?.location ? (
                <li className="flex min-w-0 items-center gap-1.5">
                  <MapPin size={15} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">
                    {[event.venue, event.location].filter(Boolean).join(", ")}
                  </span>
                </li>
              ) : null}
              <li className="flex items-center gap-1.5">
                <Ticket size={15} aria-hidden="true" className="shrink-0" />
                <span className="tnum">
                  {booking.tickets} × {formatPrice(event?.price)}
                </span>
              </li>
            </ul>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--glass-edge)] pt-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                  Total paid
                </p>
                <p className="tnum mt-0.5 font-display text-lg font-bold">
                  {formatPrice(booking.totalPrice)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={past || cancelled ? "secondary" : "primary"}
                  size="sm"
                  onClick={() => onShowTicket(booking)}
                >
                  <QrCode size={16} aria-hidden="true" />
                  Show ticket
                </Button>
                {event?._id ? (
                  <Button variant="ghost" size="sm" to={`/events/${event._id}`}>
                    Event page
                  </Button>
                ) : null}
              </div>
            </div>

            <p className="mt-3 font-mono text-xs text-[var(--color-fg-subtle)]">
              {booking.ticketId}
            </p>
          </div>
        </div>
      </GlassCard>
    </motion.li>
  );
}

export default function MyBookings() {
  const [filter, setFilter] = useState("upcoming");
  const [active, setActive] = useState(null);

  const { data, error, loading, reload } = useApi(
    (signal) => bookingsApi.mine(signal),
    []
  );

  const all = useMemo(() => {
    const list = Array.isArray(data?.bookings) ? data.bookings : [];
    return [...list].sort((a, b) => {
      const aDate = eventDate(a.event)?.getTime() ?? 0;
      const bDate = eventDate(b.event)?.getTime() ?? 0;
      return bDate - aDate;
    });
  }, [data]);

  const counts = useMemo(() => {
    const upcoming = all.filter((b) => !isPastEvent(b.event)).length;
    return { upcoming, past: all.length - upcoming, all: all.length };
  }, [all]);

  const shown = useMemo(() => {
    if (filter === "all") return all;
    const wantPast = filter === "past";
    const list = all.filter((b) => isPastEvent(b.event) === wantPast);
    // Upcoming reads best soonest-first; the archive reads best newest-first.
    return wantPast
      ? list
      : [...list].sort(
          (a, b) =>
            (eventDate(a.event)?.getTime() ?? 0) -
            (eventDate(b.event)?.getTime() ?? 0)
        );
  }, [all, filter]);

  const activeEvent =
    active?.event && typeof active.event === "object" ? active.event : null;

  return (
    <div className="shell section">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl space-y-3">
          <p className="kicker">Your account</p>
          <h1 className="text-4xl">
            My <span className="text-grad-brand">bookings</span>
          </h1>
          <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
            Every ticket you've bought, with its QR pass ready for the door.
          </p>
        </div>
        <Button variant="secondary" to="/events">
          Find more events
        </Button>
      </header>

      {loading ? (
        <div className="mt-12">
          <SkeletonRows count={3} />
        </div>
      ) : error ? (
        <div className="mt-12">
          <ErrorState
            title="Couldn't load your bookings"
            message="The request didn't come back. Your tickets are safe — this is just the list."
            onRetry={reload}
          />
        </div>
      ) : all.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={Ticket}
            title="No bookings yet"
            description="Once you book something it shows up here with a scannable pass."
            action="Browse events"
            actionTo="/events"
          />
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label="Filter bookings"
            className="mt-10 flex flex-wrap gap-2"
          >
            {FILTERS.map(({ key, label }) => (
              <Chip
                key={key}
                active={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
                <span className="tnum opacity-70">{counts[key]}</span>
              </Chip>
            ))}
          </div>

          <p role="status" aria-live="polite" className="mt-4 text-sm text-[var(--color-fg-subtle)]">
            {shown.length} {shown.length === 1 ? "booking" : "bookings"}
          </p>

          {shown.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                icon={CalendarBlank}
                title={
                  filter === "upcoming"
                    ? "Nothing coming up"
                    : "Nothing in the archive"
                }
                description={
                  filter === "upcoming"
                    ? "All your bookings are for events that have already happened."
                    : "None of your events have finished yet."
                }
                action="Browse events"
                actionTo="/events"
              />
            </div>
          ) : (
            <RevealGroup as="ul" each={0.05} className="mt-6 space-y-5">
              {shown.map((booking) => (
                <BookingRow
                  key={booking._id}
                  booking={booking}
                  onShowTicket={setActive}
                />
              ))}
            </RevealGroup>
          )}
        </>
      )}

      <TicketModal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        booking={active}
        event={activeEvent}
      />
    </div>
  );
}
