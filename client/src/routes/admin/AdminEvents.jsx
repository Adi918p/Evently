import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarBlank,
  CheckCircle,
  Eye,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  Prohibit,
  Ticket,
  Trash,
  UserCircle,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge, { Chip, StatusBadge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Field";
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "../../components/ui/Feedback";
import { Reveal, RevealGroup } from "../../components/ui/Reveal";
import AdminNav from "./AdminNav";
import { useApi, useAction } from "../../lib/useApi";
import { admin as adminApi } from "../../lib/api";
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
 * Every event on the platform, with the three moderation actions.
 *
 * GET /api/admin/events returns all events sorted newest-first with the
 * organizer populated to name and email.
 *
 * approve and reject return only { success, message } - no updated document -
 * so the row's status is patched locally rather than refetching the whole list.
 *
 * Deleting here uses the admin endpoint, which unlike the organizer one does
 * not clean up uploaded images. Bookings are also left behind, pointing at an
 * event that no longer exists. The confirm dialog says both.
 */

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function EventRow({ event, onApprove, onReject, onDelete, busy }) {
  const reduced = useReducedMotion();
  const date = eventDate(event);
  const past = isPastEvent(event);
  const sold = Number(event.ticketsSold) || 0;
  const status = event.status;

  return (
    <motion.li variants={respectMotion(riseIn, reduced)} layout={!reduced}>
      <GlassCard elevation={2} radius="xl" className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          {/* Identity */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <Badge tone="neutral">{categoryLabel(event.category)}</Badge>
              {past ? <Badge tone="neutral">Finished</Badge> : null}
              {sold > 0 ? (
                <Badge tone="info" icon={Ticket}>
                  {formatNumber(sold)} sold
                </Badge>
              ) : null}
            </div>

            <h3 className="mt-3 text-md font-semibold leading-tight">
              <Link
                to={`/events/${event._id}`}
                className="transition-colors hover:text-[var(--color-violet-bright)]"
              >
                {event.title}
              </Link>
            </h3>

            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--color-fg-muted)]">
              <li className="flex min-w-0 items-center gap-1.5">
                <UserCircle size={14} aria-hidden="true" className="shrink-0" />
                <span className="truncate">
                  {event.organizer?.name || "Deleted account"}
                </span>
                {event.organizer?.email ? (
                  <a
                    href={`mailto:${event.organizer.email}`}
                    className="truncate text-[var(--color-fg-subtle)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--color-fg)]"
                  >
                    {event.organizer.email}
                  </a>
                ) : null}
              </li>
              {date ? (
                <li className="flex items-center gap-1.5">
                  <CalendarBlank size={14} aria-hidden="true" className="shrink-0" />
                  {format(date, "d MMM yyyy")}
                </li>
              ) : null}
              <li className="flex min-w-0 items-center gap-1.5">
                <MapPin size={14} aria-hidden="true" className="shrink-0" />
                <span className="truncate">
                  {[event.venue, event.location].filter(Boolean).join(", ") || "—"}
                </span>
              </li>
              <li className="tnum">{formatPrice(event.price)}</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--glass-edge)] pt-4 xl:justify-end xl:border-0 xl:pt-0">
            {status !== "approved" ? (
              <Button
                variant="accent"
                size="sm"
                loading={busy === "approve"}
                disabled={Boolean(busy)}
                onClick={() => onApprove(event)}
              >
                <CheckCircle size={15} aria-hidden="true" />
                Approve
              </Button>
            ) : null}
            {status !== "rejected" ? (
              <Button
                variant="ghost"
                size="sm"
                loading={busy === "reject"}
                disabled={Boolean(busy)}
                onClick={() => onReject(event)}
              >
                <Prohibit size={15} aria-hidden="true" />
                Reject
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" to={`/events/${event._id}`}>
              <Eye size={15} aria-hidden="true" />
              View
            </Button>
            <Button variant="ghost" size="sm" to={`/events/${event._id}/edit`}>
              <PencilSimple size={15} aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={Boolean(busy)}
              className="text-[#fca5a5] hover:bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)]"
              onClick={() => onDelete(event)}
            >
              <Trash size={15} aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      </GlassCard>
    </motion.li>
  );
}

export default function AdminEvents() {
  const toast = useToast();
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState({ id: null, kind: null });
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, error, loading, setData, reload } = useApi(
    (signal) => adminApi.events(signal),
    []
  );

  const approve = useAction((id) => adminApi.approveEvent(id));
  const reject = useAction((id) => adminApi.rejectEvent(id));
  const remove = useAction((id) => adminApi.deleteEvent(id));

  const all = useMemo(
    () => (Array.isArray(data?.events) ? data.events : []),
    [data]
  );

  const counts = useMemo(
    () => ({
      pending: all.filter((e) => e.status === "pending").length,
      approved: all.filter((e) => e.status === "approved").length,
      rejected: all.filter((e) => e.status === "rejected").length,
      all: all.length,
    }),
    [all]
  );

  // Pending is the default tab because it is the only one with work in it. When
  // it is empty the empty state says so and offers the full list - the filter is
  // never silently swapped, which would make the chip you clicked look wrong.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((event) => {
      if (filter !== "all" && event.status !== filter) return false;
      if (!needle) return true;
      return [
        event.title,
        event.organizer?.name,
        event.organizer?.email,
        event.location,
        event.venue,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [all, filter, query]);

  /** approve/reject return no document, so the row is patched by hand. */
  const patchStatus = (id, status) =>
    setData((prev) => ({
      ...prev,
      events: (prev?.events || []).map((event) =>
        event._id === id ? { ...event, status } : event
      ),
    }));

  const handleApprove = async (event) => {
    setBusy({ id: event._id, kind: "approve" });
    try {
      await approve.run(event._id);
      patchStatus(event._id, "approved");
      toast.success(`"${event.title}" is live.`);
    } catch (err) {
      toast.error(err?.message || "Couldn't approve that event.");
    } finally {
      setBusy({ id: null, kind: null });
    }
  };

  const handleReject = async (event) => {
    setBusy({ id: event._id, kind: "reject" });
    try {
      await reject.run(event._id);
      patchStatus(event._id, "rejected");
      toast.warning(`"${event.title}" rejected — it's hidden from listings now.`);
    } catch (err) {
      toast.error(err?.message || "Couldn't reject that event.");
    } finally {
      setBusy({ id: null, kind: null });
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    try {
      await remove.run(target._id);
      setData((prev) => ({
        ...prev,
        events: (prev?.events || []).filter((event) => event._id !== target._id),
      }));
      setPendingDelete(null);
      toast.success(`"${target.title}" deleted.`);
    } catch (err) {
      toast.error(err?.message || "Couldn't delete that event.");
    }
  };

  return (
    <div className="shell section">
      <Reveal>
        <p className="kicker">Admin</p>
        <h1 className="mt-3 text-4xl">
          Every <span className="text-grad-brand">event</span>
        </h1>
        <p className="mt-4 max-w-xl text-md leading-relaxed text-[var(--color-fg-muted)]">
          Approve what's waiting, pull anything that shouldn't be up, and search
          the whole catalogue.
        </p>
      </Reveal>

      <AdminNav />

      {/* ---------- Toolbar ---------- */}
      <Reveal className="mt-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <Input
            label="Search events"
            type="search"
            icon={MagnifyingGlass}
            placeholder="Title, organizer, city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            fieldClassName="w-full lg:max-w-sm"
          />
          <div
            role="group"
            aria-label="Filter by status"
            className="flex flex-wrap gap-2"
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
        </div>

        {!loading && !error ? (
          <p aria-live="polite" className="mt-4 text-sm text-[var(--color-fg-subtle)]">
            Showing <span className="tnum">{formatNumber(shown.length)}</span> of{" "}
            <span className="tnum">{formatNumber(all.length)}</span>
          </p>
        ) : null}
      </Reveal>

      {/* ---------- List ---------- */}
      <div className="mt-6">
        {loading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <ErrorState
            title="Couldn't load events"
            message={error.message}
            onRetry={reload}
          />
        ) : all.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No events on the platform"
            description="Once an organizer publishes something it shows up here."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={filter === "pending" && !query.trim() ? CheckCircle : MagnifyingGlass}
            title={
              query.trim()
                ? "No matches"
                : filter === "pending"
                  ? "Nothing waiting on you"
                  : filter === "rejected"
                    ? "Nothing rejected"
                    : "Nothing approved yet"
            }
            description={
              query.trim()
                ? "Nothing fits that search and status. Try a different term, or widen the filter."
                : filter === "pending"
                  ? "Organizers publish straight to approved, so this queue only fills up if an event is set back to pending by hand."
                  : "Switch to All to see the rest of the catalogue."
            }
            action="Show all events"
            onAction={() => {
              setQuery("");
              setFilter("all");
            }}
          />
        ) : (
          <RevealGroup as="ul" each={0.03} className="space-y-3">
            {shown.map((event) => (
              <EventRow
                key={event._id}
                event={event}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={setPendingDelete}
                busy={busy.id === event._id ? busy.kind : null}
              />
            ))}
          </RevealGroup>
        )}
      </div>

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
          is removed from the database. Existing bookings are not deleted — they'll
          point at an event that no longer exists — and uploaded images stay on
          disk.
        </p>
        {Number(pendingDelete?.ticketsSold) > 0 ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] p-3 text-sm text-[#fca5a5]">
            <span className="tnum font-semibold">
              {formatNumber(pendingDelete.ticketsSold)}
            </span>{" "}
            tickets are already sold. Nobody is refunded and nobody is told.
            Rejecting hides it from listings without breaking those tickets — do
            that instead unless you have a reason.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
