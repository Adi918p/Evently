import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarBlank,
  CurrencyInr,
  Eye,
  MapPin,
  PencilSimple,
  Plus,
  QrCode,
  Ticket,
  Trash,
  TrendUp,
  Users,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge, { Chip, StatusBadge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/Modal";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonRows,
} from "../../components/ui/Feedback";
import { Reveal, RevealGroup } from "../../components/ui/Reveal";
import { useApi, useAction } from "../../lib/useApi";
import { events as eventsApi } from "../../lib/api";
import { useToast } from "../../lib/toast";
import {
  categoryLabel,
  eventDate,
  formatNumber,
  formatPrice,
  isPastEvent,
} from "../../lib/constants";
import { respectMotion, riseIn } from "../../motion/presets";

/**
 * Organizer dashboard.
 *
 * Two requests, both cheap and independent:
 *   GET /api/events/dashboard/stats -> totals across the organizer's events,
 *       counting confirmed bookings only, which is why the numbers here can be
 *       lower than the raw booking rows on an individual event page.
 *   GET /api/events/my             -> the organizer's own events, unpopulated.
 *
 * Deleting is the only destructive action available to an organizer, and the
 * server also wipes the event's uploaded images, so it is behind a confirm
 * dialog that says what will be lost (confirmation-dialogs).
 */

const FILTERS = [
  { key: "live", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

/* ==========================================================================
   Stats
   ========================================================================== */

function StatCard({ icon: Icon, label, value, loading, accent = false }) {
  const reduced = useReducedMotion();

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard
        elevation={2}
        radius="lg"
        glow={accent}
        className="h-full p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-fg-muted)]">{label}</p>
          <span
            className={
              accent
                ? "grid size-9 place-items-center rounded-[var(--radius-sm)] bg-[image:var(--grad-brand)] text-white"
                : "grid size-9 place-items-center rounded-[var(--radius-sm)] bg-white/[0.06] text-[var(--color-fg-subtle)]"
            }
            aria-hidden="true"
          >
            <Icon size={17} />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-4 h-8 w-24" rounded="sm" />
        ) : (
          <p className="tnum mt-4 font-display text-3xl font-extrabold leading-none">
            {value}
          </p>
        )}
      </GlassCard>
    </motion.li>
  );
}

/* ==========================================================================
   Event row
   ========================================================================== */

function EventRow({ event, onDelete }) {
  const reduced = useReducedMotion();
  const date = eventDate(event);
  const past = isPastEvent(event);
  const seats = Number(event.seats) || 0;
  const sold = Number(event.ticketsSold) || 0;
  const filled = seats > 0 ? Math.min(Math.round((sold / seats) * 100), 100) : 0;

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard elevation={2} radius="xl" className="overflow-hidden">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-[var(--color-card)] sm:aspect-auto sm:w-48">
            {event.banner ? (
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
                <Ticket size={26} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 p-5 sm:py-5 sm:pl-0 sm:pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={event.status} />
              <Badge tone="neutral">{categoryLabel(event.category)}</Badge>
              {past ? <Badge tone="neutral">Finished</Badge> : null}
            </div>

            <h3 className="mt-3 text-lg leading-tight">
              <Link
                to={`/events/${event._id}`}
                className="transition-colors hover:text-[var(--color-violet-bright)]"
              >
                {event.title}
              </Link>
            </h3>

            <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--color-fg-muted)]">
              {date ? (
                <li className="flex items-center gap-1.5">
                  <CalendarBlank size={14} aria-hidden="true" className="shrink-0" />
                  {format(date, "d MMM yyyy")}
                  {event.time ? ` · ${event.time}` : ""}
                </li>
              ) : null}
              <li className="flex min-w-0 items-center gap-1.5">
                <MapPin size={14} aria-hidden="true" className="shrink-0" />
                <span className="truncate">
                  {[event.venue, event.location].filter(Boolean).join(", ")}
                </span>
              </li>
              <li className="tnum flex items-center gap-1.5">
                <CurrencyInr size={14} aria-hidden="true" className="shrink-0" />
                {formatPrice(event.price)}
              </li>
            </ul>

            {/* Capacity. A 0-seat event cannot be booked at all, so it says so
                rather than showing a meaningless empty bar. */}
            <div className="mt-4">
              {seats > 0 ? (
                <>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-[var(--color-fg-muted)]">
                      <span className="tnum font-semibold text-[var(--color-fg)]">
                        {formatNumber(sold)}
                      </span>{" "}
                      of <span className="tnum">{formatNumber(seats)}</span> sold
                    </span>
                    <span className="tnum text-xs text-[var(--color-fg-subtle)]">
                      {filled}%
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
                    role="progressbar"
                    aria-valuenow={filled}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${event.title} capacity filled`}
                  >
                    <motion.div
                      className="h-full rounded-full bg-[image:var(--grad-brand)]"
                      initial={reduced ? { width: `${filled}%` } : { scaleX: 0 }}
                      animate={reduced ? { width: `${filled}%` } : { scaleX: 1 }}
                      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      style={
                        reduced
                          ? undefined
                          : { width: `${filled}%`, originX: 0 }
                      }
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--color-warning)]">
                  Capacity is 0 — nobody can book this yet.
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--glass-edge)] pt-4">
              <Button variant="secondary" size="sm" to={`/events/${event._id}/bookings`}>
                <Users size={15} aria-hidden="true" />
                Bookings
              </Button>
              <Button variant="ghost" size="sm" to={`/events/${event._id}/edit`}>
                <PencilSimple size={15} aria-hidden="true" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" to={`/events/${event._id}`}>
                <Eye size={15} aria-hidden="true" />
                View
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-[#fca5a5] hover:bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)]"
                onClick={() => onDelete(event)}
              >
                <Trash size={15} aria-hidden="true" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </GlassCard>
    </motion.li>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function Dashboard() {
  const toast = useToast();
  const [filter, setFilter] = useState("live");
  const [pendingDelete, setPendingDelete] = useState(null);

  const stats = useApi((signal) => eventsApi.dashboardStats(signal), []);
  const mine = useApi((signal) => eventsApi.mine(signal), []);

  const remove = useAction((id) => eventsApi.remove(id));

  const all = useMemo(() => {
    const list = Array.isArray(mine.data?.events) ? mine.data.events : [];
    return [...list].sort((a, b) => {
      const aDate = eventDate(a)?.getTime() ?? 0;
      const bDate = eventDate(b)?.getTime() ?? 0;
      return bDate - aDate;
    });
  }, [mine.data]);

  const counts = useMemo(() => {
    const past = all.filter(isPastEvent).length;
    return { live: all.length - past, past, all: all.length };
  }, [all]);

  const shown = useMemo(() => {
    if (filter === "all") return all;
    const wantPast = filter === "past";
    const list = all.filter((event) => isPastEvent(event) === wantPast);
    return wantPast
      ? list
      : [...list].sort(
          (a, b) => (eventDate(a)?.getTime() ?? 0) - (eventDate(b)?.getTime() ?? 0)
        );
  }, [all, filter]);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    try {
      await remove.run(target._id);
      // Patch locally instead of refetching: the list is already correct minus
      // one row, and the stats request is cheap enough to redo on its own.
      mine.setData((prev) => ({
        ...prev,
        events: (prev?.events || []).filter((event) => event._id !== target._id),
      }));
      stats.reload();
      setPendingDelete(null);
      toast.success(`"${target.title}" deleted.`);
    } catch (err) {
      toast.error(err?.message || "Couldn't delete that event.");
    }
  };

  const totals = stats.data || {};

  return (
    <div className="shell section">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl space-y-3">
          <p className="kicker">Organizer</p>
          <h1 className="text-4xl">
            Your <span className="text-grad-brand">events</span>
          </h1>
          <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
            Everything you're running, how it's selling, and who's coming.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" to="/scanner">
            <QrCode size={18} aria-hidden="true" />
            Door scanner
          </Button>
          <Button variant="primary" to="/create-event">
            <Plus size={18} aria-hidden="true" />
            New event
          </Button>
        </div>
      </header>

      {/* ---------- Totals ---------- */}
      {stats.error ? (
        <div className="mt-10">
          <ErrorState
            title="Couldn't load your totals"
            message={stats.error.message}
            onRetry={stats.reload}
          />
        </div>
      ) : (
        <RevealGroup as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={TrendUp}
            label="Revenue"
            value={formatPrice(totals.revenue)}
            loading={stats.loading}
            accent
          />
          <StatCard
            icon={Ticket}
            label="Tickets sold"
            value={formatNumber(totals.ticketsSold)}
            loading={stats.loading}
          />
          <StatCard
            icon={Users}
            label="Bookings"
            value={formatNumber(totals.totalBookings)}
            loading={stats.loading}
          />
          <StatCard
            icon={CalendarBlank}
            label="Events"
            value={formatNumber(totals.totalEvents)}
            loading={stats.loading}
          />
        </RevealGroup>
      )}

      {/* Revenue counts confirmed bookings only - worth saying, because an
          organizer comparing this to the bookings table will notice. */}
      {!stats.loading && !stats.error ? (
        <p className="mt-4 text-xs text-[var(--color-fg-subtle)]">
          Totals count confirmed bookings only. Cancelled ones are excluded.
        </p>
      ) : null}

      {/* ---------- Events ---------- */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl">Listings</h2>
          {all.length ? (
            <div role="group" aria-label="Filter events" className="flex flex-wrap gap-2">
              {FILTERS.map(({ key, label }) => (
                <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {label}
                  <span className="tnum opacity-70">{counts[key]}</span>
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        {mine.loading ? (
          <div className="mt-8">
            <SkeletonRows count={3} />
          </div>
        ) : mine.error ? (
          <div className="mt-8">
            <ErrorState
              title="Couldn't load your events"
              message={mine.error.message}
              onRetry={mine.reload}
            />
          </div>
        ) : all.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={Plus}
              title="No events yet"
              description="Create your first listing and it goes live straight away — no approval queue."
              action="Create an event"
              actionTo="/create-event"
            />
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={CalendarBlank}
              title={filter === "live" ? "Nothing upcoming" : "Nothing finished yet"}
              description={
                filter === "live"
                  ? "All your events have already happened."
                  : "None of your events are in the past yet."
              }
              action="Create an event"
              actionTo="/create-event"
            />
          </div>
        ) : (
          <RevealGroup as="ul" each={0.05} className="mt-8 space-y-5">
            {shown.map((event) => (
              <EventRow key={event._id} event={event} onDelete={setPendingDelete} />
            ))}
          </RevealGroup>
        )}
      </section>

      <Reveal className="mt-12">
        <GlassCard elevation={1} radius="xl" className="p-6">
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Need something changed that isn't here — a refund, a transfer, an
            event pulled after tickets sold?{" "}
            <Link
              to="/support"
              className="font-semibold text-[var(--color-fg)] underline decoration-1 underline-offset-4"
            >
              Ask support
            </Link>
            .
          </p>
        </GlassCard>
      </Reveal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => (remove.pending ? null : setPendingDelete(null))}
        onConfirm={confirmDelete}
        loading={remove.pending}
        title="Delete this event?"
        confirmLabel="Delete event"
      >
        <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
          <strong className="text-[var(--color-fg)]">{pendingDelete?.title}</strong>{" "}
          and its uploaded images are removed for good. Bookings already made stay
          in the database, but the event page they point to will be gone.
        </p>
        {Number(pendingDelete?.ticketsSold) > 0 ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] p-3 text-sm text-[var(--color-warning)]">
            <span className="tnum font-semibold">
              {formatNumber(pendingDelete.ticketsSold)}
            </span>{" "}
            tickets have already been sold. Deleting does not refund anyone.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
