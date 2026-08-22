import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CalendarBlank,
  CurrencyInr,
  EnvelopeSimple,
  Hourglass,
  Ticket,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { ErrorState, Skeleton } from "../../components/ui/Feedback";
import { Reveal, RevealGroup } from "../../components/ui/Reveal";
import AdminNav from "./AdminNav";
import { useApi } from "../../lib/useApi";
import { admin as adminApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  categoryLabel,
  eventDate,
  formatNumber,
  formatPrice,
} from "../../lib/constants";
import { respectMotion, riseIn } from "../../motion/presets";

/**
 * Admin overview.
 *
 * Three independent requests, deliberately not combined - each one renders as
 * soon as it lands rather than the whole page waiting on the slowest:
 *   GET /api/admin/dashboard -> users, events, ticketsSold, revenue
 *                               (revenue and tickets from confirmed bookings)
 *   GET /api/admin/stats     -> role breakdown + the five newest events
 *   GET /api/admin/events/pending -> the only queue that needs action
 *
 * Note the two endpoints count tickets differently: /dashboard sums confirmed
 * Booking.tickets, /stats sums Event.ticketsSold. They can legitimately
 * disagree, so this page shows the booking-derived number and Analytics shows
 * the event-derived one, each labelled for what it is.
 */

/** Greeting that isn't a lie in the afternoon. */
function greet(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return name ? `${part}, ${name.split(" ")[0]}` : "Overview";
}

function StatCard({ icon: Icon, label, value, loading, accent = false, to, hint }) {
  const reduced = useReducedMotion();
  const body = (
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
        <Skeleton className="mt-4 h-8 w-24" rounded="sm" />
      ) : (
        <p className="tnum mt-4 font-display text-3xl font-extrabold leading-none">
          {value}
        </p>
      )}
      {hint ? (
        <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">{hint}</p>
      ) : null}
    </GlassCard>
  );

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      {to ? (
        <Link
          to={to}
          className="block h-full rounded-[var(--radius-lg)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-violet-bright)]"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.li>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const reduced = useReducedMotion();

  const dash = useApi((signal) => adminApi.dashboard(signal), []);
  const stats = useApi((signal) => adminApi.stats(signal), []);
  const pending = useApi((signal) => adminApi.pendingEvents(signal), []);

  const totals = dash.data?.stats || {};
  const breakdown = stats.data?.stats || {};
  const recent = useMemo(
    () => (Array.isArray(stats.data?.recentEvents) ? stats.data.recentEvents : []),
    [stats.data]
  );
  const queue = useMemo(
    () => (Array.isArray(pending.data?.events) ? pending.data.events : []),
    [pending.data]
  );

  return (
    <div className="shell section">
      <Reveal>
        <p className="kicker">Admin</p>
        <h1 className="mt-3 text-4xl">
          {greet(user?.name)}
          <span className="text-grad-brand">.</span>
        </h1>
        <p className="mt-4 max-w-xl text-md leading-relaxed text-[var(--color-fg-muted)]">
          The whole platform at a glance — what's selling, who's on it, and
          anything waiting on you.
        </p>
      </Reveal>

      <AdminNav />

      {/* ---------- Platform totals ---------- */}
      {dash.error ? (
        <div className="mt-10">
          <ErrorState
            title="Couldn't load platform totals"
            message={dash.error.message}
            onRetry={dash.reload}
          />
        </div>
      ) : (
        <RevealGroup as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={CurrencyInr}
            label="Revenue"
            value={formatPrice(totals.revenue)}
            loading={dash.loading}
            accent
            hint="Confirmed bookings only"
          />
          <StatCard
            icon={Ticket}
            label="Tickets sold"
            value={formatNumber(totals.ticketsSold)}
            loading={dash.loading}
            hint="Across all events"
          />
          <StatCard
            icon={Users}
            label="Accounts"
            value={formatNumber(totals.users)}
            loading={dash.loading}
            to="/admin/users"
          />
          <StatCard
            icon={CalendarBlank}
            label="Events"
            value={formatNumber(totals.events)}
            loading={dash.loading}
            to="/admin/events"
          />
        </RevealGroup>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
        {/* ---------- Approval queue ---------- */}
        <Reveal>
          <GlassCard elevation={3} radius="xl" specular className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl">Waiting for review</h2>
                <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
                  Events submitted with a pending status.
                </p>
              </div>
              {!pending.loading && !pending.error ? (
                <Badge tone={queue.length ? "warning" : "success"} icon={Hourglass}>
                  {formatNumber(queue.length)}
                </Badge>
              ) : null}
            </div>

            {pending.loading ? (
              <div className="mt-5 space-y-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : pending.error ? (
              <p className="mt-5 text-sm text-[#fca5a5]">
                {pending.error.message}{" "}
                <button
                  type="button"
                  onClick={pending.reload}
                  className="font-semibold underline decoration-1 underline-offset-4"
                >
                  Retry
                </button>
              </p>
            ) : queue.length === 0 ? (
              <p className="mt-5 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                Nothing pending. Organizers publish straight to approved, so this
                only fills up if an event was set back to pending by hand.
              </p>
            ) : (
              <>
                <ul className="mt-5 space-y-3">
                  {queue.slice(0, 4).map((event) => {
                    const date = eventDate(event);
                    return (
                      <li key={event._id}>
                        <Link
                          to="/admin/events"
                          className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2 transition-colors hover:border-[var(--glass-edge)] hover:bg-white/[0.06]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {event.title}
                            </span>
                            <span className="block truncate text-xs text-[var(--color-fg-subtle)]">
                              {event.organizer?.name || "Unknown organizer"}
                              {date ? ` · ${format(date, "d MMM")}` : ""}
                            </span>
                          </span>
                          <ArrowRight
                            size={15}
                            aria-hidden="true"
                            className="shrink-0 text-[var(--color-fg-subtle)]"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <Button variant="secondary" size="sm" to="/admin/events" className="mt-5">
                  Review{queue.length > 4 ? ` all ${formatNumber(queue.length)}` : ""}
                </Button>
              </>
            )}
          </GlassCard>
        </Reveal>

        {/* ---------- Who's on the platform ---------- */}
        <Reveal delay={0.05}>
          <GlassCard elevation={2} radius="xl" className="p-6">
            <h2 className="text-xl">Accounts</h2>
            {stats.loading ? (
              <div className="mt-5 space-y-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : stats.error ? (
              <p className="mt-5 text-sm text-[#fca5a5]">
                {stats.error.message}{" "}
                <button
                  type="button"
                  onClick={stats.reload}
                  className="font-semibold underline decoration-1 underline-offset-4"
                >
                  Retry
                </button>
              </p>
            ) : (
              <>
                <dl className="mt-5 space-y-3">
                  {[
                    {
                      label: "Attendees",
                      value:
                        (Number(breakdown.totalUsers) || 0) -
                        (Number(breakdown.totalOrganizers) || 0) -
                        (Number(breakdown.totalAdmins) || 0),
                      tone: "var(--color-cyan)",
                    },
                    {
                      label: "Organizers",
                      value: Number(breakdown.totalOrganizers) || 0,
                      tone: "var(--color-violet-bright)",
                    },
                    {
                      label: "Admins",
                      value: Number(breakdown.totalAdmins) || 0,
                      tone: "var(--color-warning)",
                    },
                  ].map((row) => {
                    const total = Number(breakdown.totalUsers) || 0;
                    const share = total ? Math.round((row.value / total) * 100) : 0;
                    return (
                      <div key={row.label}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <dt className="text-[var(--color-fg-muted)]">{row.label}</dt>
                          <dd className="tnum font-semibold">
                            {formatNumber(row.value)}
                            <span className="ml-2 text-xs font-normal text-[var(--color-fg-subtle)]">
                              {share}%
                            </span>
                          </dd>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${share}%`, background: row.tone }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </dl>
                <Button variant="ghost" size="sm" to="/admin/users" className="mt-5">
                  Manage accounts
                </Button>
              </>
            )}
          </GlassCard>
        </Reveal>
      </div>

      {/* ---------- Newest events ---------- */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl">Just added</h2>
          <Link
            to="/admin/events"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            All events
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        {stats.loading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : recent.length === 0 ? (
          <GlassCard elevation={1} radius="xl" className="mt-6 p-6">
            <p className="text-sm text-[var(--color-fg-muted)]">
              No events on the platform yet.
            </p>
          </GlassCard>
        ) : (
          <RevealGroup as="ul" each={0.04} className="mt-6 space-y-3">
            {recent.map((event) => {
              const date = eventDate(event);
              return (
                <motion.li key={event._id} variants={respectMotion(riseIn, reduced)}>
                  <GlassCard elevation={2} radius="lg" className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={event.status} />
                          <Badge tone="neutral">{categoryLabel(event.category)}</Badge>
                        </div>
                        <h3 className="mt-2.5 truncate text-md font-semibold">
                          <Link
                            to={`/events/${event._id}`}
                            className="transition-colors hover:text-[var(--color-violet-bright)]"
                          >
                            {event.title}
                          </Link>
                        </h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-fg-muted)]">
                          <span className="flex items-center gap-1.5">
                            <UserCircle size={14} aria-hidden="true" />
                            {event.organizer?.name || "Unknown"}
                          </span>
                          {date ? (
                            <span className="flex items-center gap-1.5">
                              <CalendarBlank size={14} aria-hidden="true" />
                              {format(date, "d MMM yyyy")}
                            </span>
                          ) : null}
                          <span className="tnum">{formatPrice(event.price)}</span>
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" to={`/events/${event._id}`}>
                        View
                      </Button>
                    </div>
                  </GlassCard>
                </motion.li>
              );
            })}
          </RevealGroup>
        )}
      </section>

      <Reveal className="mt-12">
        <GlassCard elevation={1} radius="xl" className="flex gap-3 p-6">
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--color-fg-subtle)]"
          >
            <EnvelopeSimple size={18} />
          </span>
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Support messages from the contact form land in{" "}
            <Link
              to="/admin/inbox"
              className="font-semibold text-[var(--color-fg)] underline decoration-1 underline-offset-4"
            >
              the inbox
            </Link>
            . Nothing emails you about them, so it's worth checking.
          </p>
        </GlassCard>
      </Reveal>
    </div>
  );
}
