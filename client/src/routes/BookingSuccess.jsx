import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarBlank,
  CheckCircle,
  EnvelopeSimple,
  MapPin,
  Ticket,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import { ErrorState, Loader } from "../components/ui/Feedback";
import { QrPanel } from "../components/bookings/BookingTicket";
import { Reveal } from "../components/ui/Reveal";
import { useApi } from "../lib/useApi";
import { bookings as bookingsApi } from "../lib/api";
import { eventDate } from "../lib/constants";
import { spring } from "../motion/presets";

/**
 * Post-payment confirmation.
 *
 * EventDetail navigates here with the verified booking in route state, so the
 * happy path renders instantly with no extra request. A reload or a bookmarked
 * visit loses that state, so the page falls back to fetching the account's
 * bookings and showing the newest - which is what the user came here for
 * anyway. Redirecting them away instead would be the unhelpful option.
 */

const CONFETTI = Array.from({ length: 14 }, (_, i) => i);

/** Purely decorative burst; skipped entirely under reduced motion. */
function Burst() {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-48 overflow-hidden"
    >
      {CONFETTI.map((i) => {
        const left = 6 + i * 6.6;
        const hue = i % 3;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: -20, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], y: 190, scale: 1 }}
            transition={{
              duration: 1.6 + (i % 4) * 0.25,
              delay: 0.15 + i * 0.045,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute top-0 size-1.5 rounded-full"
            style={{
              left: `${left}%`,
              background:
                hue === 0
                  ? "var(--color-violet-bright)"
                  : hue === 1
                    ? "var(--color-magenta-bright)"
                    : "var(--color-cyan)",
            }}
          />
        );
      })}
    </div>
  );
}

export default function BookingSuccess() {
  const { state } = useLocation();
  const reduced = useReducedMotion();
  const passed = state?.booking || null;

  // Only hit the API when the route state is missing.
  const { data, error, loading, reload } = useApi(
    (signal) => bookingsApi.mine(signal),
    [],
    { enabled: !passed }
  );

  const booking = useMemo(() => {
    if (passed) return passed;
    const list = Array.isArray(data?.bookings) ? data.bookings : [];
    return (
      [...list].sort(
        (a, b) =>
          new Date(b.bookedAt || 0).getTime() -
          new Date(a.bookedAt || 0).getTime()
      )[0] || null
    );
  }, [passed, data]);

  // `event` is a populated object on the fetched shape and an id on the freshly
  // created one, so fall back to what EventDetail passed along.
  const event =
    booking?.event && typeof booking.event === "object"
      ? booking.event
      : state?.eventTitle
        ? { title: state.eventTitle }
        : null;

  const date = eventDate(event);

  // Nothing should be scrolled past on arrival.
  useEffect(() => {
    document.title = "Booking confirmed · Evently";
    return () => {
      document.title = "Evently";
    };
  }, []);

  if (!passed && loading) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Loader label="Fetching your booking" />
      </div>
    );
  }

  if (!passed && error) {
    return (
      <div className="shell section">
        <ErrorState
          title="Couldn't load your booking"
          message="Your payment may still have gone through — check My bookings before paying again."
          onRetry={reload}
        />
        <div className="mt-6">
          <Button variant="secondary" to="/my-bookings">
            Go to My bookings
          </Button>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="shell section">
        <ErrorState
          title="No booking to show"
          message="We couldn't find a recent booking on this account. If you've just paid, give it a moment and check My bookings."
          retryLabel="Check again"
          onRetry={reload}
        />
      </div>
    );
  }

  return (
    <div className="shell section">
      <div className="relative mx-auto max-w-3xl">
        <Burst />

        <div className="relative text-center">
          <motion.span
            initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduced ? { duration: 0.2 } : spring.bouncy}
            className="inline-grid size-20 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-success)_16%,transparent)] text-[var(--color-success)]"
            aria-hidden="true"
          >
            <CheckCircle size={44} weight="fill" />
          </motion.span>

          <h1 className="mt-6 text-4xl">
            You're <span className="text-grad-brand">in</span>.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-md leading-relaxed text-[var(--color-fg-muted)]">
            {event?.title ? (
              <>
                Your booking for <strong className="text-[var(--color-fg)]">{event.title}</strong>{" "}
                is confirmed.
              </>
            ) : (
              "Your booking is confirmed."
            )}
          </p>
        </div>

        <Reveal className="mt-10">
          <GlassCard elevation={3} radius="2xl" glow className="p-7 sm:p-9">
            <div className="grid gap-9 sm:grid-cols-[auto_1fr] sm:gap-10">
              <QrPanel booking={booking} event={event} />

              <div className="min-w-0 space-y-6">
                {event ? (
                  <div>
                    <h2 className="text-xl">{event.title}</h2>
                    <ul className="mt-3 space-y-2 text-sm text-[var(--color-fg-muted)]">
                      {date ? (
                        <li className="flex items-center gap-2">
                          <CalendarBlank
                            size={16}
                            aria-hidden="true"
                            className="shrink-0"
                          />
                          {format(date, "EEEE d MMMM yyyy")}
                        </li>
                      ) : null}
                      {event.venue || event.location ? (
                        <li className="flex items-center gap-2">
                          <MapPin
                            size={16}
                            aria-hidden="true"
                            className="shrink-0"
                          />
                          <span className="wrap-anywhere">
                            {[event.venue, event.location]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </li>
                      ) : null}
                      <li className="flex items-center gap-2">
                        <Ticket size={16} aria-hidden="true" className="shrink-0" />
                        {booking.tickets}{" "}
                        {booking.tickets === 1 ? "ticket" : "tickets"}
                      </li>
                    </ul>
                  </div>
                ) : null}

                <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--glass-edge)] bg-white/[0.04] p-4">
                  <EnvelopeSimple
                    size={18}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-[var(--color-violet-bright)]"
                  />
                  <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                    A PDF pass is on its way to your inbox. If it hasn't arrived
                    in a few minutes, the QR here works on its own — it's the
                    same code.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" to="/my-bookings">
                    View my bookings
                  </Button>
                  <Button variant="ghost" to="/events">
                    Find something else
                  </Button>
                </div>
              </div>
            </div>
          </GlassCard>
        </Reveal>

        <p className="mt-8 text-center text-sm text-[var(--color-fg-subtle)]">
          Something wrong with this booking?{" "}
          <Link
            to="/support"
            className="font-semibold text-[var(--color-fg-muted)] underline decoration-1 underline-offset-4"
          >
            Tell support
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
