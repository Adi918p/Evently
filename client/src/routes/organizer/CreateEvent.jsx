import { Link, useNavigate } from "react-router-dom";
import { Confetti, Rocket, ShieldCheck } from "@phosphor-icons/react";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import { Reveal } from "../../components/ui/Reveal";
import EventForm from "../../components/forms/EventForm";
import { useAction } from "../../lib/useApi";
import { events as eventsApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { SUPPORT_EMAIL } from "../../lib/constants";

/**
 * Create an event.
 *
 * The route is only gated on being signed in, not on holding the organizer
 * role, and that is deliberate: POST /api/events does require organizer or
 * admin, so a plain account has to be told what it needs and how to get it.
 * The generic role guard would say "you don't have access", which answers the
 * wrong question (error-clarity, error-recovery).
 *
 * createEvent forces status: "approved", so there is no review queue - the
 * listing is public the moment this succeeds. The copy says so.
 */

export default function CreateEvent() {
  const navigate = useNavigate();
  const toast = useToast();
  const { isOrganizer } = useAuth();
  const create = useAction((payload) => eventsApi.create(payload));

  /* ---------- No permission to host ---------- */

  if (!isOrganizer) {
    return (
      <div className="shell section">
        <Reveal className="mx-auto max-w-2xl">
          <GlassCard elevation={3} radius="2xl" specular className="p-8 sm:p-10">
            <span
              aria-hidden="true"
              className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand)] text-white"
            >
              <ShieldCheck size={24} />
            </span>
            <h1 className="mt-6 text-3xl">
              Hosting needs an <span className="text-grad-brand">organizer</span>{" "}
              account
            </h1>
            <p className="mt-4 text-md leading-relaxed text-[var(--color-fg-muted)]">
              Your account can book tickets, but publishing events is a separate
              permission — it puts you on the hook for door checks, refunds and
              whoever turns up. We switch it on by hand.
            </p>
            <p className="mt-4 leading-relaxed text-[var(--color-fg-muted)]">
              Email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Organizer%20access%20request`}
                className="wrap-anywhere font-semibold text-[var(--color-fg)] underline decoration-1 underline-offset-4"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              with what you're planning to run and where, and we'll upgrade you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                variant="primary"
                href={`mailto:${SUPPORT_EMAIL}?subject=Organizer%20access%20request`}
              >
                Request access
              </Button>
              <Button variant="ghost" to="/support">
                Read the FAQ first
              </Button>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    );
  }

  /* ---------- The form ---------- */

  const submit = async (payload) => {
    try {
      const result = await create.run(payload);
      const id = result?.event?._id;
      toast.success("Your event is live.");
      // Straight to the public page: the first thing an organizer wants after
      // publishing is to see what everyone else will see.
      navigate(id ? `/events/${id}` : "/dashboard", { replace: true });
    } catch {
      // useAction keeps the message; the form renders it in its own alert.
    }
  };

  return (
    <div className="shell section">
      <Reveal className="max-w-3xl">
        <p className="kicker">Organizer</p>
        <h1 className="mt-3 text-4xl">
          Put on <span className="text-grad-brand">something good</span>
        </h1>
        <p className="mt-4 text-md leading-relaxed text-[var(--color-fg-muted)]">
          Fill this in once and the listing, the booking flow and the ticket PDFs
          all take care of themselves.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mt-8 max-w-3xl">
        <GlassCard elevation={1} radius="lg" className="flex gap-3 p-4">
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--color-cyan)]"
          >
            <Rocket size={18} />
          </span>
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            There's no approval queue — this goes public as soon as you publish.
            You can edit everything afterwards, and you can keep capacity at 0
            until you're ready to sell.
          </p>
        </GlassCard>
      </Reveal>

      <div className="mt-10">
        <EventForm
          isNew
          submitLabel="Publish event"
          submitting={create.pending}
          serverError={create.error?.message}
          onSubmit={submit}
          onCancel={() => navigate("/dashboard")}
        />
      </div>

      <Reveal className="mt-10">
        <GlassCard elevation={1} radius="xl" className="flex gap-3 p-6">
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--color-violet-bright)]"
          >
            <Confetti size={20} />
          </span>
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Once it's up, share the event link anywhere — bookings land in{" "}
            <Link
              to="/dashboard"
              className="font-semibold text-[var(--color-fg)] underline decoration-1 underline-offset-4"
            >
              your dashboard
            </Link>{" "}
            and the door scanner checks people in on the night.
          </p>
        </GlassCard>
      </Reveal>
    </div>
  );
}
