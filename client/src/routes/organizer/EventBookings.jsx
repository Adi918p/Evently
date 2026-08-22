import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  DownloadSimple,
  Envelope,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  QrCode,
  Ticket,
  TrendUp,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge, { Chip, StatusBadge } from "../../components/ui/Badge";
import { Input } from "../../components/ui/Field";
import {
  EmptyState,
  ErrorState,
  Loader,
} from "../../components/ui/Feedback";
import { Reveal, RevealGroup } from "../../components/ui/Reveal";
import { useApi, useAction } from "../../lib/useApi";
import {
  events as eventsApi,
  bookings as bookingsApi,
} from "../../lib/api";
import { useToast } from "../../lib/toast";
import { formatNumber, formatPrice } from "../../lib/constants";
import { respectMotion, riseIn } from "../../motion/presets";

/**
 * Guest list for one event.
 *
 * GET /api/events/:id/bookings returns every booking regardless of status and
 * in no particular order, plus a trimmed event object (title, location, date,
 * price and the organizer) - no id, banner or capacity. So the header is built
 * from the route param and that trimmed object only.
 *
 * Check-in posts to /api/bookings/verify-ticket with the booking's _id. It
 * refuses a second check-in with "Already checked in", which is the correct
 * answer at a door rather than an error to hide.
 */

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "waiting", label: "Not in yet" },
  { key: "in", label: "Checked in" },
  { key: "cancelled", label: "Cancelled" },
];

/* ==========================================================================
   CSV
   ========================================================================== */

/** RFC-4180 quoting: wrap everything, double any inner quote. */
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function downloadCsv(filename, rows) {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  // Leading BOM so Excel reads names with accents correctly.
  const blob = new Blob([`﻿${body}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const slug = (value) =>
  String(value || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "event";

/* ==========================================================================
   Pieces
   ========================================================================== */

function Stat({ icon: Icon, label, value }) {
  const reduced = useReducedMotion();
  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard elevation={2} radius="lg" className="h-full p-5">
        <div className="flex items-center gap-2 text-[var(--color-fg-subtle)]">
          <Icon size={15} aria-hidden="true" />
          <p className="text-sm text-[var(--color-fg-muted)]">{label}</p>
        </div>
        <p className="tnum mt-3 font-display text-2xl font-extrabold leading-none">
          {value}
        </p>
      </GlassCard>
    </motion.li>
  );
}

function BookingRow({ booking, onCheckIn, checkingIn }) {
  const reduced = useReducedMotion();
  const guest = booking.user;
  const cancelled = booking.status === "cancelled";
  const bookedAt = booking.bookedAt ? new Date(booking.bookedAt) : null;
  const checkedInAt = booking.checkedInAt ? new Date(booking.checkedInAt) : null;

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard
        elevation={2}
        radius="lg"
        className={`p-5 ${cancelled ? "opacity-60" : ""}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          {/* Guest */}
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--color-fg-subtle)]"
            >
              <UserCircle size={26} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--color-fg)]">
                {guest?.name || "Deleted account"}
              </p>
              {guest?.email ? (
                <a
                  href={`mailto:${guest.email}`}
                  className="wrap-anywhere mt-0.5 inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
                >
                  <Envelope size={13} aria-hidden="true" className="shrink-0" />
                  {guest.email}
                </a>
              ) : null}
              <p className="tnum wrap-anywhere mt-1 text-xs text-[var(--color-fg-subtle)]">
                {booking.ticketId || booking._id}
              </p>
            </div>
          </div>

          {/* Numbers */}
          <dl className="flex shrink-0 gap-6 text-sm lg:gap-8">
            <div>
              <dt className="text-xs text-[var(--color-fg-subtle)]">Tickets</dt>
              <dd className="tnum mt-1 font-semibold">
                {formatNumber(booking.tickets ?? 1)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-fg-subtle)]">Paid</dt>
              <dd className="tnum mt-1 font-semibold">
                {formatPrice(booking.totalPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-fg-subtle)]">Booked</dt>
              <dd className="mt-1 font-semibold">
                {bookedAt ? format(bookedAt, "d MMM") : "—"}
              </dd>
            </div>
          </dl>

          {/* Status + action */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            <StatusBadge status={booking.status} />
            {booking.checkedIn ? (
              <Badge tone="info" icon={CheckCircle}>
                In{checkedInAt ? ` · ${format(checkedInAt, "HH:mm")}` : ""}
              </Badge>
            ) : cancelled ? null : (
              <Button
                variant="accent"
                size="sm"
                loading={checkingIn}
                onClick={() => onCheckIn(booking)}
              >
                Check in
              </Button>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.li>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function EventBookings() {
  const { id } = useParams();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  const { data, error, loading, setData, reload } = useApi(
    (signal) => eventsApi.bookings(id, signal),
    [id]
  );

  const checkIn = useAction((bookingId) =>
    bookingsApi.verifyTicket({ bookingId })
  );

  const event = data?.event || null;

  const all = useMemo(() => {
    const list = Array.isArray(data?.bookings) ? data.bookings : [];
    return [...list].sort(
      (a, b) =>
        new Date(b.bookedAt || 0).getTime() - new Date(a.bookedAt || 0).getTime()
    );
  }, [data]);

  const totals = useMemo(() => {
    const live = all.filter((b) => b.status !== "cancelled");
    return {
      bookings: live.length,
      tickets: live.reduce((sum, b) => sum + (Number(b.tickets) || 0), 0),
      revenue: live.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0),
      checkedIn: live.filter((b) => b.checkedIn).length,
      cancelled: all.length - live.length,
    };
  }, [all]);

  const counts = useMemo(
    () => ({
      all: all.length,
      waiting: all.filter((b) => b.status !== "cancelled" && !b.checkedIn).length,
      in: all.filter((b) => b.checkedIn).length,
      cancelled: all.filter((b) => b.status === "cancelled").length,
    }),
    [all]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((booking) => {
      if (filter === "in" && !booking.checkedIn) return false;
      if (
        filter === "waiting" &&
        (booking.checkedIn || booking.status === "cancelled")
      ) {
        return false;
      }
      if (filter === "cancelled" && booking.status !== "cancelled") return false;
      if (!needle) return true;
      return [
        booking.user?.name,
        booking.user?.email,
        booking.ticketId,
        booking.paymentId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [all, filter, query]);

  const handleCheckIn = async (booking) => {
    setBusyId(booking._id);
    try {
      const result = await checkIn.run(booking._id);
      const at = result?.booking?.checkedInAt || new Date().toISOString();
      setData((prev) => ({
        ...prev,
        bookings: (prev?.bookings || []).map((row) =>
          row._id === booking._id
            ? { ...row, checkedIn: true, checkedInAt: at }
            : row
        ),
      }));
      toast.success(`${booking.user?.name || "Guest"} is in.`);
    } catch (err) {
      // "Already checked in" is a 400. It means the list is stale rather than
      // that anything went wrong, so reflect it instead of just complaining.
      if (/already checked in/i.test(err?.message || "")) {
        setData((prev) => ({
          ...prev,
          bookings: (prev?.bookings || []).map((row) =>
            row._id === booking._id ? { ...row, checkedIn: true } : row
          ),
        }));
        toast.warning("That ticket was already checked in.");
      } else {
        toast.error(err?.message || "Check-in failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const rows = [
      [
        "Name",
        "Email",
        "Ticket ID",
        "Tickets",
        "Amount",
        "Status",
        "Checked in",
        "Checked in at",
        "Booked at",
      ],
      ...shown.map((booking) => [
        booking.user?.name || "",
        booking.user?.email || "",
        booking.ticketId || booking._id,
        booking.tickets ?? 1,
        booking.totalPrice ?? 0,
        booking.status || "",
        booking.checkedIn ? "yes" : "no",
        booking.checkedInAt
          ? format(new Date(booking.checkedInAt), "yyyy-MM-dd HH:mm")
          : "",
        booking.bookedAt
          ? format(new Date(booking.bookedAt), "yyyy-MM-dd HH:mm")
          : "",
      ]),
    ];
    downloadCsv(`${slug(event?.title)}-guests.csv`, rows);
    toast.success(`${formatNumber(shown.length)} rows exported.`);
  };

  /* ---------- Loading / failure ---------- */

  if (loading) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Loader label="Loading guest list" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="shell section">
        <ErrorState
          title="Couldn't load the guest list"
          message={error.message}
          onRetry={reload}
        />
      </div>
    );
  }

  const date = event?.date ? new Date(event.date) : null;

  return (
    <div className="shell section">
      <Reveal>
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to dashboard
        </Link>

        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="kicker">Guest list</p>
            <h1 className="mt-3 text-balance text-4xl">
              {event?.title || "This event"}
            </h1>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--color-fg-muted)]">
              {date && !Number.isNaN(date.getTime()) ? (
                <li className="flex items-center gap-1.5">
                  <CalendarBlank size={14} aria-hidden="true" />
                  {format(date, "EEE d MMM yyyy")}
                </li>
              ) : null}
              {event?.location ? (
                <li className="flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden="true" />
                  {event.location}
                </li>
              ) : null}
              <li className="tnum flex items-center gap-1.5">
                <Ticket size={14} aria-hidden="true" />
                {formatPrice(event?.price)} per ticket
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" to="/scanner">
              <QrCode size={17} aria-hidden="true" />
              Scanner
            </Button>
            <Button variant="ghost" to={`/events/${id}/edit`}>
              <PencilSimple size={17} aria-hidden="true" />
              Edit event
            </Button>
          </div>
        </div>
      </Reveal>

      {/* ---------- Totals ---------- */}
      <RevealGroup as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label="Bookings" value={formatNumber(totals.bookings)} />
        <Stat icon={Ticket} label="Tickets" value={formatNumber(totals.tickets)} />
        <Stat
          icon={CheckCircle}
          label="Checked in"
          value={`${formatNumber(totals.checkedIn)} / ${formatNumber(totals.bookings)}`}
        />
        <Stat icon={TrendUp} label="Revenue" value={formatPrice(totals.revenue)} />
      </RevealGroup>

      {totals.cancelled > 0 ? (
        <p className="mt-4 text-xs text-[var(--color-fg-subtle)]">
          Totals exclude{" "}
          <span className="tnum">{formatNumber(totals.cancelled)}</span> cancelled
          booking{totals.cancelled === 1 ? "" : "s"}.
        </p>
      ) : null}

      {/* ---------- Toolbar ---------- */}
      {all.length ? (
        <Reveal className="mt-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <Input
              label="Find a guest"
              type="search"
              icon={MagnifyingGlass}
              placeholder="Name, email or ticket ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              fieldClassName="w-full lg:max-w-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filter bookings" className="flex flex-wrap gap-2">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={exportCsv}
                disabled={shown.length === 0}
              >
                <DownloadSimple size={15} aria-hidden="true" />
                CSV
              </Button>
            </div>
          </div>

          <p
            aria-live="polite"
            className="mt-4 text-sm text-[var(--color-fg-subtle)]"
          >
            Showing <span className="tnum">{formatNumber(shown.length)}</span> of{" "}
            <span className="tnum">{formatNumber(all.length)}</span>
          </p>
        </Reveal>
      ) : null}

      {/* ---------- List ---------- */}
      <div className="mt-6">
        {all.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody has booked yet"
            description="Bookings show up here the moment someone pays. Share the event link to get the first one in."
            action="View the event page"
            actionTo={`/events/${id}`}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={MagnifyingGlass}
            title="No matches"
            description="Nothing here fits that search and filter. Try a different name, or clear the filter."
            action="Show everyone"
            onAction={() => {
              setQuery("");
              setFilter("all");
            }}
          />
        ) : (
          <RevealGroup as="ul" each={0.03} className="space-y-3">
            {shown.map((booking) => (
              <BookingRow
                key={booking._id}
                booking={booking}
                onCheckIn={handleCheckIn}
                checkingIn={busyId === booking._id}
              />
            ))}
          </RevealGroup>
        )}
      </div>

      {all.length ? (
        <Reveal className="mt-10">
          <GlassCard elevation={1} radius="xl" className="p-6">
            <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Checking someone in here is the same action as scanning their QR at
              the door, and it only works once. Export the CSV as a paper backup if
              the venue has no signal.
            </p>
          </GlassCard>
        </Reveal>
      ) : null}
    </div>
  );
}
