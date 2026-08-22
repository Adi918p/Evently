import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarBlank,
  ChartBar,
  Crown,
  Gauge,
  Heart,
  Ticket,
  TrendUp,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { ErrorState, Skeleton } from "../../components/ui/Feedback";
import { Reveal, RevealGroup, SectionHeading } from "../../components/ui/Reveal";
import AdminNav from "./AdminNav";
import { useApi } from "../../lib/useApi";
import { admin as adminApi } from "../../lib/api";
import {
  CATEGORIES,
  categoryLabel,
  formatNumber,
  formatPrice,
  isPastEvent,
} from "../../lib/constants";
import { respectMotion, riseIn } from "../../motion/presets";

/**
 * Analytics.
 *
 * Built from three endpoints, and the joins the server doesn't do are done here:
 *
 *   GET /api/admin/stats  -> totals, the five newest events, and topOrganizers.
 *       topOrganizers is a raw $group aggregate: [{ _id, eventCount }] with no
 *       populate, so the _id is a bare ObjectId. Names come from the users list.
 *   GET /api/admin/users  -> supplies those names, and the sign-up curve.
 *   GET /api/admin/events -> everything else on this page. Category mix, status
 *       mix, capacity and the busiest listings are all derived client-side
 *       because no endpoint reports them.
 *
 * Two ticket numbers exist on the platform and they measure different things.
 * /admin/dashboard sums confirmed Booking.tickets; /admin/stats sums
 * Event.ticketsSold. This page uses the event-derived one and says so, because
 * every other figure here comes from the event documents too.
 */

/* ==========================================================================
   Bits
   ========================================================================== */

function Metric({ icon: Icon, label, value, hint, loading, accent }) {
  const reduced = useReducedMotion();
  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard elevation={2} radius="lg" glow={accent} className="h-full p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-fg-muted)]">{label}</p>
          <span
            aria-hidden="true"
            className={
              accent
                ? "grid size-9 place-items-center rounded-[var(--radius-sm)] bg-[image:var(--grad-brand)] text-white"
                : "grid size-9 place-items-center rounded-[var(--radius-sm)] bg-white/[0.06] text-[var(--color-fg-subtle)]"
            }
          >
            <Icon size={17} />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-4 h-8 w-20" rounded="sm" />
        ) : (
          <p className="tnum mt-4 font-display text-3xl font-extrabold leading-none">
            {value}
          </p>
        )}
        {hint ? (
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
            {hint}
          </p>
        ) : null}
      </GlassCard>
    </motion.li>
  );
}

/**
 * Horizontal bars. Deliberately not a charting library: these are all
 * single-series part-to-whole comparisons, and a labelled bar with the real
 * number next to it reads better than a legend (color-not-only).
 */
function BarList({ rows, total, empty = "Nothing to show yet." }) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (!rows.length) {
    return <p className="text-sm text-[var(--color-fg-muted)]">{empty}</p>;
  }

  return (
    <ul className="space-y-3.5">
      {rows.map((row, index) => {
        const share = total ? Math.round((row.value / total) * 100) : 0;
        const width = Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0);
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {row.icon ? (
                  <span aria-hidden="true" className="shrink-0 text-[var(--color-fg-subtle)]">
                    <row.icon size={14} />
                  </span>
                ) : null}
                <span className="truncate text-[var(--color-fg-muted)]">
                  {row.label}
                </span>
              </span>
              <span className="tnum shrink-0 font-semibold">
                {row.display ?? formatNumber(row.value)}
                {total ? (
                  <span className="ml-2 text-xs font-normal text-[var(--color-fg-subtle)]">
                    {share}%
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <motion.div
                className={`h-full rounded-full ${
                  row.color ? "" : "bg-[image:var(--grad-brand)]"
                }`}
                style={{ width: `${width}%`, originX: 0, background: row.color }}
                initial={reduced ? undefined : { scaleX: 0 }}
                animate={reduced ? undefined : { scaleX: 1 }}
                transition={{
                  duration: 0.6,
                  delay: reduced ? 0 : Math.min(index * 0.04, 0.3),
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Sign-ups per month for the last 6 months, from user createdAt. */
function signupSeries(users) {
  const buckets = [];
  const now = new Date();
  for (let back = 5; back >= 0; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString("en-IN", { month: "short" }),
      year: d.getFullYear(),
      month: d.getMonth(),
      value: 0,
    });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));
  users.forEach((user) => {
    if (!user.createdAt) return;
    const d = new Date(user.createdAt);
    if (Number.isNaN(d.getTime())) return;
    const bucket = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) bucket.value += 1;
  });
  return buckets;
}

function SignupChart({ series }) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...series.map((b) => b.value));
  const total = series.reduce((sum, b) => sum + b.value, 0);

  return (
    <>
      <div
        className="flex h-40 items-end gap-2"
        role="img"
        aria-label={`Sign-ups over the last six months: ${series
          .map((b) => `${b.label} ${b.value}`)
          .join(", ")}`}
      >
        {series.map((bucket, index) => (
          <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <span className="tnum text-xs text-[var(--color-fg-subtle)]">
              {bucket.value || ""}
            </span>
            <motion.div
              className="w-full rounded-t-[6px] bg-[image:var(--grad-brand)]"
              style={{ originY: 1 }}
              initial={
                reduced
                  ? { height: `${(bucket.value / max) * 100}%` }
                  : { height: `${(bucket.value / max) * 100}%`, scaleY: 0 }
              }
              animate={
                reduced
                  ? { height: `${(bucket.value / max) * 100}%` }
                  : { height: `${(bucket.value / max) * 100}%`, scaleY: 1 }
              }
              transition={{
                duration: 0.55,
                delay: reduced ? 0 : index * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
            <span className="truncate text-xs text-[var(--color-fg-muted)]">
              {bucket.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-[var(--color-fg-muted)]">
        <span className="tnum font-semibold text-[var(--color-fg)]">
          {formatNumber(total)}
        </span>{" "}
        new accounts in the last six months.
      </p>
    </>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function AdminAnalytics() {
  const stats = useApi((signal) => adminApi.stats(signal), []);
  const users = useApi((signal) => adminApi.users(signal), []);
  const events = useApi((signal) => adminApi.events(signal), []);

  const totals = stats.data?.stats || {};
  const userList = useMemo(
    () => (Array.isArray(users.data?.users) ? users.data.users : []),
    [users.data]
  );
  const eventList = useMemo(
    () => (Array.isArray(events.data?.events) ? events.data.events : []),
    [events.data]
  );

  /** topOrganizers is unpopulated, so names are joined from the user list. */
  const topOrganizers = useMemo(() => {
    const raw = Array.isArray(stats.data?.topOrganizers)
      ? stats.data.topOrganizers
      : [];
    const byId = new Map(userList.map((user) => [String(user._id), user]));
    return raw.map((row) => {
      const user = byId.get(String(row._id));
      return {
        key: String(row._id),
        label: user?.name || user?.email || "Deleted account",
        email: user?.email || null,
        value: Number(row.eventCount) || 0,
      };
    });
  }, [stats.data, userList]);

  const categoryRows = useMemo(() => {
    const tally = new Map();
    eventList.forEach((event) => {
      const key = event.category || "other";
      tally.set(key, (tally.get(key) || 0) + 1);
    });
    return CATEGORIES.map((category) => ({
      key: category.value,
      label: category.label,
      value: tally.get(category.value) || 0,
    }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [eventList]);

  const statusRows = useMemo(() => {
    const tally = { approved: 0, pending: 0, rejected: 0 };
    eventList.forEach((event) => {
      if (event.status in tally) tally[event.status] += 1;
    });
    return [
      { key: "approved", label: "Approved", value: tally.approved, color: "var(--color-success)" },
      { key: "pending", label: "Pending", value: tally.pending, color: "var(--color-warning)" },
      { key: "rejected", label: "Rejected", value: tally.rejected, color: "var(--color-danger)" },
    ].filter((row) => row.value > 0);
  }, [eventList]);

  const busiest = useMemo(
    () =>
      [...eventList]
        .filter((event) => (Number(event.ticketsSold) || 0) > 0)
        .sort((a, b) => (Number(b.ticketsSold) || 0) - (Number(a.ticketsSold) || 0))
        .slice(0, 6),
    [eventList]
  );

  const capacity = useMemo(() => {
    const seats = eventList.reduce((sum, e) => sum + (Number(e.seats) || 0), 0);
    const sold = eventList.reduce((sum, e) => sum + (Number(e.ticketsSold) || 0), 0);
    const upcoming = eventList.filter((event) => !isPastEvent(event)).length;
    const free = eventList.filter((event) => Number(event.price) === 0).length;
    return {
      seats,
      sold,
      fill: seats ? Math.round((sold / seats) * 100) : 0,
      upcoming,
      free,
    };
  }, [eventList]);

  const revenueEstimate = useMemo(
    () =>
      eventList.reduce(
        (sum, event) =>
          sum + (Number(event.price) || 0) * (Number(event.ticketsSold) || 0),
        0
      ),
    [eventList]
  );

  const anyError = stats.error || users.error || events.error;

  return (
    <div className="shell section">
      <Reveal>
        <p className="kicker">Admin</p>
        <h1 className="mt-3 text-4xl">
          <span className="text-grad-brand">Analytics</span>
        </h1>
        <p className="mt-4 max-w-xl text-md leading-relaxed text-[var(--color-fg-muted)]">
          How the platform is actually being used — what people list, what sells,
          and who's doing the listing.
        </p>
      </Reveal>

      <AdminNav />

      {anyError ? (
        <div className="mt-10">
          <ErrorState
            title="Some figures couldn't load"
            message={
              (stats.error || users.error || events.error)?.message ||
              "One of the admin endpoints failed."
            }
            onRetry={() => {
              if (stats.error) stats.reload();
              if (users.error) users.reload();
              if (events.error) events.reload();
            }}
          />
        </div>
      ) : null}

      {/* ---------- Headline ---------- */}
      <RevealGroup as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Ticket}
          label="Tickets sold"
          value={formatNumber(totals.totalTicketsSold)}
          hint="Summed from event records"
          loading={stats.loading}
          accent
        />
        <Metric
          icon={TrendUp}
          label="Gross value"
          value={formatPrice(revenueEstimate)}
          hint="List price × tickets sold"
          loading={events.loading}
        />
        <Metric
          icon={Heart}
          label="Interested"
          value={formatNumber(totals.totalInterested)}
          hint="Saves across all events"
          loading={stats.loading}
        />
        <Metric
          icon={Gauge}
          label="Fill rate"
          value={`${capacity.fill}%`}
          hint={`${formatNumber(capacity.sold)} of ${formatNumber(capacity.seats)} seats`}
          loading={events.loading}
        />
      </RevealGroup>

      {/* ---------- Sign-ups ---------- */}
      <section className="mt-14">
        <SectionHeading
          kicker="Growth"
          title="New accounts"
          lead="Sign-ups per month, taken from account creation dates."
        />
        <Reveal className="mt-6">
          <GlassCard elevation={3} radius="xl" specular className="p-6">
            {users.loading ? (
              <Skeleton className="h-40" />
            ) : userList.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-muted)]">
                No accounts to chart yet.
              </p>
            ) : (
              <SignupChart series={signupSeries(userList)} />
            )}
          </GlassCard>
        </Reveal>
      </section>

      {/* ---------- Mix ---------- */}
      <section className="mt-14 grid gap-6 lg:grid-cols-2 lg:items-start">
        <Reveal>
          <GlassCard elevation={2} radius="xl" className="p-6">
            <div className="flex items-center gap-2">
              <ChartBar size={18} aria-hidden="true" className="text-[var(--color-fg-subtle)]" />
              <h2 className="text-xl">What gets listed</h2>
            </div>
            <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
              Events by category.
            </p>
            <div className="mt-6">
              {events.loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </div>
              ) : (
                <BarList
                  rows={categoryRows}
                  total={eventList.length}
                  empty="No events listed yet."
                />
              )}
            </div>
          </GlassCard>
        </Reveal>

        <Reveal delay={0.05}>
          <GlassCard elevation={2} radius="xl" className="p-6">
            <div className="flex items-center gap-2">
              <CalendarBlank size={18} aria-hidden="true" className="text-[var(--color-fg-subtle)]" />
              <h2 className="text-xl">Catalogue health</h2>
            </div>
            <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
              Listing status across the platform.
            </p>
            <div className="mt-6">
              {events.loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </div>
              ) : (
                <BarList
                  rows={statusRows}
                  total={eventList.length}
                  empty="No events listed yet."
                />
              )}
            </div>

            {!events.loading && eventList.length ? (
              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--glass-edge)] pt-5 text-sm">
                <div>
                  <dt className="text-[var(--color-fg-subtle)]">Still upcoming</dt>
                  <dd className="tnum mt-1 text-lg font-bold">
                    {formatNumber(capacity.upcoming)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-fg-subtle)]">Free entry</dt>
                  <dd className="tnum mt-1 text-lg font-bold">
                    {formatNumber(capacity.free)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </GlassCard>
        </Reveal>
      </section>

      {/* ---------- People ---------- */}
      <section className="mt-14 grid gap-6 lg:grid-cols-2 lg:items-start">
        <Reveal>
          <GlassCard elevation={2} radius="xl" className="p-6">
            <div className="flex items-center gap-2">
              <Crown size={18} aria-hidden="true" className="text-[var(--color-warning)]" />
              <h2 className="text-xl">Busiest organizers</h2>
            </div>
            <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
              By number of events listed.
            </p>
            <div className="mt-6">
              {stats.loading || users.loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </div>
              ) : (
                <BarList
                  rows={topOrganizers.map((row) => ({
                    ...row,
                    icon: UserCircle,
                    display: `${formatNumber(row.value)} event${row.value === 1 ? "" : "s"}`,
                  }))}
                  total={0}
                  empty="Nobody has listed an event yet."
                />
              )}
            </div>
            <Button variant="ghost" size="sm" to="/admin/users" className="mt-6">
              <Users size={15} aria-hidden="true" />
              All accounts
            </Button>
          </GlassCard>
        </Reveal>

        <Reveal delay={0.05}>
          <GlassCard elevation={2} radius="xl" className="p-6">
            <div className="flex items-center gap-2">
              <Ticket size={18} aria-hidden="true" className="text-[var(--color-cyan)]" />
              <h2 className="text-xl">Best sellers</h2>
            </div>
            <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
              Events by tickets sold.
            </p>

            {events.loading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : busiest.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--color-fg-muted)]">
                No tickets have sold yet.
              </p>
            ) : (
              <ol className="mt-6 space-y-2">
                {busiest.map((event, index) => {
                  const seats = Number(event.seats) || 0;
                  const sold = Number(event.ticketsSold) || 0;
                  return (
                    <li key={event._id}>
                      <Link
                        to={`/events/${event._id}`}
                        className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2 transition-colors hover:border-[var(--glass-edge)] hover:bg-white/[0.06]"
                      >
                        <span className="tnum w-5 shrink-0 text-sm font-bold text-[var(--color-fg-subtle)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {event.title}
                          </span>
                          <span className="block truncate text-xs text-[var(--color-fg-subtle)]">
                            {categoryLabel(event.category)}
                            {event.organizer?.name ? ` · ${event.organizer.name}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tnum block text-sm font-bold">
                            {formatNumber(sold)}
                          </span>
                          {seats > 0 ? (
                            <span className="tnum block text-xs text-[var(--color-fg-subtle)]">
                              of {formatNumber(seats)}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </GlassCard>
        </Reveal>
      </section>

      {/* ---------- Caveats ---------- */}
      <Reveal className="mt-14">
        <GlassCard elevation={1} radius="xl" className="p-6">
          <h2 className="text-md font-semibold">
            Where these numbers come from
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
            <li>
              <Badge tone="neutral">Tickets sold</Badge> is summed from event
              records. The{" "}
              <Link
                to="/admin"
                className="font-semibold text-[var(--color-fg)] underline decoration-1 underline-offset-4"
              >
                overview
              </Link>{" "}
              counts confirmed bookings instead, so the two can differ if a booking
              was cancelled after the seat was taken.
            </li>
            <li>
              <Badge tone="neutral">Gross value</Badge> multiplies each event's
              current list price by tickets sold. A price changed after tickets went
              out will skew it — the overview's revenue figure, which adds up what
              was actually charged, is the one to trust for money.
            </li>
            <li>
              <Badge tone="neutral">Fill rate</Badge> divides all tickets sold by
              all seats listed, so one large venue that hasn't sold drags the whole
              figure down. It isn't an average of per-event fill rates.
            </li>
          </ul>
        </GlassCard>
      </Reveal>
    </div>
  );
}
