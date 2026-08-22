import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowLeft,
  CalendarBlank,
  Clock,
  Info,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Ticket,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import Button from "../components/ui/Button";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { ErrorState, Loader } from "../components/ui/Feedback";
import { Reveal } from "../components/ui/Reveal";
import { events as eventsApi, payments } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { loadRazorpay, RAZORPAY_THEME } from "../lib/razorpay";
import {
  categoryIcon,
  categoryLabel,
  eventDate,
  formatNumber,
  formatPrice,
  inferCategory,
  isPastEvent,
  MAX_TICKETS_PER_ORDER,
  seatsLeft as computeSeatsLeft,
} from "../lib/constants";

/* ==========================================================================
   Ticket quantity
   --------------------------------------------------------------------------
   Stepper plus a real number input: the buttons are the fast path, the input is
   the accessible one. The server caps orders at 1-10 integer tickets
   (Controllers/paymentController.js), so the same cap is enforced here to keep
   the error out of the payment flow.
   ========================================================================== */

function QuantityStepper({ value, max, onChange, disabled }) {
  const clamp = (n) => Math.min(max, Math.max(1, n));

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        iconOnly
        aria-label="One ticket fewer"
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus size={16} weight="bold" aria-hidden="true" />
      </Button>

      <label className="sr-only" htmlFor="ticket-count">
        Number of tickets
      </label>
      <input
        id="ticket-count"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          onChange(Number.isFinite(next) ? clamp(next) : 1);
        }}
        className="tnum min-h-12 w-20 rounded-[var(--radius-md)] border border-[var(--glass-edge)] bg-[rgba(255,255,255,0.04)] text-center text-lg font-bold text-[var(--color-fg)] focus:border-[var(--color-violet-bright)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-violet)_28%,transparent)] disabled:opacity-45"
      />

      <Button
        variant="secondary"
        size="sm"
        iconOnly
        aria-label="One ticket more"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus size={16} weight="bold" aria-hidden="true" />
      </Button>
    </div>
  );
}

/* ==========================================================================
   Booking panel
   ========================================================================== */

function BookingPanel({ event, seatsLeft, onBooked }) {
  const { isSignedIn, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState(1);
  const [busy, setBusy] = useState(false);

  const past = isPastEvent(event);
  const capped = Math.max(
    1,
    Math.min(MAX_TICKETS_PER_ORDER, seatsLeft > 0 ? seatsLeft : 1)
  );
  const soldOut = seatsLeft <= 0;
  const unitPrice = Number(event.price) || 0;
  const total = unitPrice * tickets;

  const book = useCallback(async () => {
    if (!isSignedIn) {
      navigate(
        `/login?mode=login&next=${encodeURIComponent(`/events/${event._id}`)}`
      );
      return;
    }

    setBusy(true);
    try {
      // 1. Reserve. The server validates the ticket count and computes the
      //    amount in paise; the client never sends a price.
      const order = await payments.createOrder(event._id, tickets);
      const Razorpay = await loadRazorpay();

      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.order.amount,
        currency: "INR",
        name: "Evently",
        description: event.title,
        order_id: order.order.id,
        prefill: { name: user?.name || "", email: user?.email || "" },
        theme: RAZORPAY_THEME,

        // 2. Verify server-side. Only the server can check the HMAC signature,
        //    and only it may create the booking and hold the seats.
        handler: async (response) => {
          try {
            const result = await payments.verify({
              eventId: event._id,
              tickets,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success("Payment confirmed. Your ticket is ready.");
            onBooked?.();
            navigate("/booking/success", {
              replace: true,
              state: {
                booking: result?.booking ?? null,
                eventTitle: event.title,
                tickets,
              },
            });
          } catch (error) {
            toast.error(
              error.message ||
                "We couldn't verify that payment. If you were charged, contact support and we'll sort it out."
            );
            setBusy(false);
          }
        },

        modal: {
          // Razorpay's own close button does not tell us anything, so restore
          // the button here or it stays stuck in its loading state.
          ondismiss: () => {
            setBusy(false);
            toast.info("Checkout closed. Nothing has been charged.");
          },
        },
      });

      checkout.on("payment.failed", () => {
        toast.error("That payment didn't go through. You can try again.");
        setBusy(false);
      });

      checkout.open();
    } catch (error) {
      toast.error(error.message || "Couldn't start checkout. Please try again.");
      setBusy(false);
    }
  }, [event, isSignedIn, navigate, onBooked, tickets, toast, user]);

  return (
    <GlassCard
      elevation={3}
      radius="xl"
      glow={!soldOut && !past}
      className="p-6"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="kicker">Ticket</p>
          <p className="tnum mt-1 font-display text-3xl font-extrabold">
            {formatPrice(unitPrice)}
          </p>
        </div>
        {Number(event.seats) > 0 ? (
          <Badge tone={seatsLeft <= 10 ? "warning" : "neutral"} icon={Users}>
            <span className="tnum">{formatNumber(Math.max(0, seatsLeft))}</span>{" "}
            left
          </Badge>
        ) : null}
      </div>

      {past ? (
        <div className="mt-6 space-y-4">
          <p className="flex items-start gap-2 text-sm text-[var(--color-fg-muted)]">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            This event has already happened.
          </p>
          <Button variant="secondary" fullWidth to="/events">
            Find something coming up
          </Button>
        </div>
      ) : soldOut ? (
        <div className="mt-6 space-y-4">
          <p className="flex items-start gap-2 text-sm text-[#fca5a5]">
            <Warning size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Sold out. Every seat for this one is gone.
          </p>
          <Button variant="secondary" fullWidth to="/events">
            Browse other events
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-medium text-[var(--color-fg-muted)]">
              Tickets
            </p>
            <QuantityStepper
              value={tickets}
              max={capped}
              onChange={setTickets}
              disabled={busy}
            />
          </div>

          <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
            Up to {capped} per order.
          </p>

          <dl className="mt-6 space-y-2 border-t border-[var(--glass-edge)] pt-5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--color-fg-muted)]">
                {formatPrice(unitPrice)} × <span className="tnum">{tickets}</span>
              </dt>
              <dd className="tnum">{formatPrice(total)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 pt-2">
              <dt className="font-display font-semibold">Total</dt>
              <dd className="tnum font-display text-xl font-bold text-grad">
                {formatPrice(total)}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              onClick={book}
            >
              <Ticket size={18} weight="bold" aria-hidden="true" />
              {isSignedIn ? "Book now" : "Sign in to book"}
            </Button>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Paid through Razorpay. Your ticket and QR pass arrive as a PDF the
            moment payment clears.
          </p>
        </>
      )}
    </GlassCard>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function EventDetail() {
  const { id } = useParams();
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const bannerY = useTransform(scrollY, [0, 600], [0, reduced ? 0 : 90]);

  const { data, loading, error, reload } = useApi(
    (signal) => eventsApi.get(id, signal),
    [id]
  );

  const event = data?.event ?? null;
  const seatsLeft = useMemo(
    () => (event ? computeSeatsLeft(event, data?.seatsLeft) : 0),
    [event, data]
  );

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
          title="We couldn't open that event"
          message={
            error?.message ||
            "It may have been removed, or the link might be wrong."
          }
          onRetry={reload}
        />
        <div className="mt-6 text-center">
          <Button variant="ghost" to="/events">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to all events
          </Button>
        </div>
      </div>
    );
  }

  const category = inferCategory(event);
  const CategoryIcon = categoryIcon(category);
  const date = eventDate(event);
  const gallery = Array.isArray(event.gallery) ? event.gallery.filter(Boolean) : [];
  const lineup = Array.isArray(event.lineup)
    ? event.lineup.filter((act) => act?.name)
    : [];
  const mapUrl =
    typeof event.maploc === "string" && /^https:\/\//i.test(event.maploc.trim())
      ? event.maploc.trim()
      : null;

  const meta = [
    date && {
      icon: CalendarBlank,
      label: "Date",
      value: format(date, "EEEE d MMMM yyyy"),
    },
    event.time && { icon: Clock, label: "Doors", value: event.time },
    {
      icon: MapPin,
      label: "Venue",
      value: [event.venue, event.location].filter(Boolean).join(", "),
    },
    Number(event.seats) > 0 && {
      icon: Users,
      label: "Capacity",
      value: `${formatNumber(event.seats)} seats`,
    },
  ].filter(Boolean);

  return (
    <article>
      {/* ---------- Banner ---------- */}
      <header className="relative isolate overflow-hidden">
        <motion.div style={{ y: bannerY }} className="absolute inset-0 -z-10">
          {event.banner ? (
            <img
              src={event.banner}
              alt=""
              className="size-full scale-110 object-cover"
              fetchPriority="high"
              decoding="async"
            />
          ) : (
            <div className="size-full bg-[image:var(--grad-brand-soft)]" />
          )}
        </motion.div>

        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--color-bg)] via-[rgba(5,5,16,0.72)] to-[rgba(5,5,16,0.55)]"
        />

        <div className="shell flex min-h-[62dvh] flex-col justify-end py-14">
          <Button
            variant="ghost"
            size="sm"
            to="/events"
            className="mb-6 self-start"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            All events
          </Button>

          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" icon={CategoryIcon}>
                {categoryLabel(category)}
              </Badge>
              {event.agelim ? <Badge tone="neutral">{event.agelim}</Badge> : null}
              {isPastEvent(event) ? (
                <Badge tone="neutral" dot>
                  finished
                </Badge>
              ) : null}
            </div>

            <h1 className="mt-5 text-balance text-5xl leading-[0.98]">
              {event.title}
            </h1>

            {event.description ? (
              <p className="mt-5 max-w-3xl text-md leading-relaxed text-[var(--color-fg-muted)]">
                {event.description}
              </p>
            ) : null}
          </motion.div>
        </div>
      </header>

      {/* ---------- Body ---------- */}
      <div className="shell grid gap-10 pb-24 pt-12 lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-14">
        <div className="min-w-0 space-y-12">
          {/* Meta strip */}
          <Reveal>
            <dl className="grid gap-4 sm:grid-cols-2">
              {meta.map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="glass glass-2 flex items-center gap-4 rounded-[var(--radius-lg)] p-4"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
                    aria-hidden="true"
                  >
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                      {label}
                    </dt>
                    <dd className="wrap-anywhere mt-0.5 font-medium">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Reveal>

          {event.about ? (
            <Reveal as="section" aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-2xl">
                About this event
              </h2>
              {/* Line length is capped so long copy stays readable
                  (line-length-control). */}
              <p className="mt-4 max-w-[68ch] whitespace-pre-line text-md leading-relaxed text-[var(--color-fg-muted)]">
                {event.about}
              </p>
            </Reveal>
          ) : null}

          {lineup.length > 0 ? (
            <Reveal as="section" aria-labelledby="lineup-heading">
              <h2 id="lineup-heading" className="text-2xl">
                Line-up
              </h2>
              <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
                {lineup.map((act, i) => (
                  <li key={`${act.name}-${i}`} className="text-center">
                    <div className="glass glass-2 aspect-square overflow-hidden rounded-full">
                      {act.image ? (
                        <img
                          src={act.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div
                          className="grid size-full place-items-center text-2xl font-bold text-[var(--color-violet-bright)]"
                          aria-hidden="true"
                        >
                          {act.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold">{act.name}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}

          {gallery.length > 0 ? (
            <Reveal as="section" aria-labelledby="gallery-heading">
              <h2 id="gallery-heading" className="text-2xl">
                Gallery
              </h2>
              <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                {gallery.map((src, i) => (
                  <li key={`${src}-${i}`}>
                    <GlassCard
                      elevation={2}
                      radius="lg"
                      className="overflow-hidden"
                    >
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </GlassCard>
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}

          {mapUrl ? (
            <Reveal as="section" aria-labelledby="map-heading">
              <h2 id="map-heading" className="text-2xl">
                Getting there
              </h2>
              <GlassCard
                elevation={2}
                radius="xl"
                className="mt-6 overflow-hidden"
              >
                <iframe
                  src={mapUrl}
                  title={`Map showing ${event.venue}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="aspect-[16/9] w-full border-0"
                />
              </GlassCard>
            </Reveal>
          ) : null}

          <Reveal className="text-sm text-[var(--color-fg-subtle)]">
            Something look wrong with this listing?{" "}
            <Link
              to="/support"
              className="font-semibold text-[var(--color-violet-bright)] underline decoration-1 underline-offset-4"
            >
              Tell us
            </Link>
            .
          </Reveal>
        </div>

        {/* Sticky booking rail. Offset clears the fixed nav so the panel is
            never hidden behind it (fixed-element-offset). */}
        <div
          className="lg:sticky"
          style={{ top: "calc(var(--nav-h) + 1.5rem)" }}
        >
          <BookingPanel
            event={event}
            seatsLeft={seatsLeft}
            onBooked={reload}
          />
        </div>
      </div>
    </article>
  );
}
