import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Users, WarningCircle } from "@phosphor-icons/react";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import { ErrorState, Loader } from "../../components/ui/Feedback";
import { Reveal } from "../../components/ui/Reveal";
import EventForm, { eventToForm } from "../../components/forms/EventForm";
import { useApi, useAction } from "../../lib/useApi";
import { events as eventsApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { formatNumber } from "../../lib/constants";

/**
 * Edit an event.
 *
 * GET /api/events/:id is public, so the form loads for any organizer, but
 * PUT /api/events/:id checks ownership server-side. Rather than let someone
 * fill in a form that will 403 on submit, the page compares the loaded
 * event's organizer against the signed-in user and refuses up front.
 *
 * Two things the API cares about are threaded into the form:
 *   - ticketsSold, because updateEvent rejects a capacity below it
 *   - status, which only an admin is allowed to send
 */

export default function EditEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAdmin } = useAuth();

  const { data, error, loading } = useApi(
    (signal) => eventsApi.get(id, signal),
    [id]
  );

  const update = useAction((payload) => eventsApi.update(id, payload));

  const event = data?.event || null;

  // The form initialises its state once, so this must not change identity on
  // every render or a re-render would look like a fresh mount.
  const initial = useMemo(() => (event ? eventToForm(event) : null), [event]);

  /**
   * `organizer` comes back as a bare ObjectId from this endpoint (it isn't
   * populated), so a string compare is the right check. Admins bypass it,
   * exactly as the controller does.
   */
  const ownerId = event?.organizer
    ? String(event.organizer?._id || event.organizer)
    : null;
  const isOwner = Boolean(ownerId && user?.id && ownerId === String(user.id));
  const canEdit = isAdmin || isOwner;

  const submit = async (payload) => {
    try {
      await update.run(payload);
      toast.success("Changes saved.");
      navigate(`/events/${id}`);
    } catch {
      // The message is rendered inside the form's alert by useAction.
    }
  };

  /* ---------- Loading / failure ---------- */

  if (loading) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Loader label="Loading event" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="shell section">
        <ErrorState
          title="Couldn't open that event"
          message={
            error?.message ||
            "It may have been deleted, or the link points at an id that no longer exists."
          }
          onRetry={() => navigate("/dashboard")}
          retryLabel="Back to dashboard"
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="shell section">
        <Reveal className="mx-auto max-w-xl">
          <GlassCard elevation={3} radius="2xl" className="p-8 text-center">
            <span
              aria-hidden="true"
              className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]"
            >
              <WarningCircle size={24} />
            </span>
            <h1 className="mt-5 text-2xl">This isn't your event</h1>
            <p className="mt-3 leading-relaxed text-[var(--color-fg-muted)]">
              Only the organizer who created{" "}
              <strong className="text-[var(--color-fg)]">{event.title}</strong> can
              change it. If it should be yours, support can move it across.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button variant="secondary" to={`/events/${id}`}>
                View the event
              </Button>
              <Button variant="ghost" to="/support">
                Contact support
              </Button>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    );
  }

  /* ---------- Editor ---------- */

  const ticketsSold = Number(event.ticketsSold) || 0;

  return (
    <div className="shell section">
      <Reveal className="max-w-3xl">
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to dashboard
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={event.status} />
          {ticketsSold > 0 ? (
            <Badge tone="info" icon={Users}>
              {formatNumber(ticketsSold)} sold
            </Badge>
          ) : null}
          {isAdmin && !isOwner ? <Badge tone="danger">Editing as admin</Badge> : null}
        </div>

        <h1 className="mt-4 text-balance text-4xl">
          Edit <span className="text-grad-brand">{event.title}</span>
        </h1>
        <p className="mt-4 text-md leading-relaxed text-[var(--color-fg-muted)]">
          Changes show up on the public page straight away. Anyone already holding
          a ticket keeps it.
        </p>
      </Reveal>

      {/* The one edit that can genuinely break something for a buyer. */}
      {ticketsSold > 0 ? (
        <Reveal delay={0.05} className="mt-8 max-w-3xl">
          <GlassCard elevation={1} radius="lg" className="flex gap-3 p-4">
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--color-warning)]"
            >
              <WarningCircle size={18} />
            </span>
            <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
              <span className="tnum font-semibold text-[var(--color-fg)]">
                {formatNumber(ticketsSold)}
              </span>{" "}
              tickets are already out. Capacity can't go below that, and moving the
              date or venue won't notify anyone automatically — message your
              attendees yourself.
            </p>
          </GlassCard>
        </Reveal>
      ) : null}

      <div className="mt-10">
        <EventForm
          initial={initial}
          ticketsSold={ticketsSold}
          isNew={false}
          canSetStatus={isAdmin}
          submitLabel="Save changes"
          submitting={update.pending}
          serverError={update.error?.message}
          onSubmit={submit}
          onCancel={() => navigate(`/events/${id}`)}
        />
      </div>

      <Reveal className="mt-10">
        <GlassCard elevation={1} radius="xl" className="p-6">
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Images you remove here are deleted from the server once you save, so a
            banner you swap out is gone for good. Everything else is reversible by
            editing again — see{" "}
            <Link
              to={`/events/${id}/bookings`}
              className="font-semibold text-[var(--color-fg)] underline decoration-1 underline-offset-4"
            >
              who's coming
            </Link>{" "}
            before you change the date.
          </p>
        </GlassCard>
      </Reveal>
    </div>
  );
}
