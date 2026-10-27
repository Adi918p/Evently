import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, CurrencyInr } from "@phosphor-icons/react";
import Button from "../../components/ui/Button";
import GlassCard from "../../components/ui/GlassCard";
import { Input, Select } from "../../components/ui/Field";
import { ErrorState, Loader } from "../../components/ui/Feedback";
import Seo from "../../components/seo/Seo";
import RegistrationFields from "../../components/forms/RegistrationFields";
import { QrPanel } from "../../components/bookings/BookingTicket";
import { events, bookings } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../lib/auth";
import { formatPrice, MAX_TICKETS_PER_ORDER } from "../../lib/constants";

const emptyGuest = () => ({ name: "", phone: "", email: "", tickets: "1", answers: {} });
const readAttempt = key => {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    return value?.requestKey && value?.eventId ? value : null;
  } catch { return null; }
};

export default function CashBooking() {
  const { id } = useParams();
  const { user } = useAuth();
  return <CashDeskForm key={`${user?.id}:${id}`} id={id} userId={user?.id} />;
}

function CashDeskForm({ id, userId }) {
  const storageKey = `evently-cash:${userId}:${id}`;
  const [attempt, setAttempt] = useState(() => readAttempt(storageKey));
  const [guest, setGuest] = useState(() => readAttempt(storageKey) || emptyGuest());
  const [cashReceived, setCashReceived] = useState(Boolean(attempt));
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const eventState = useApi(signal => events.manage(id, signal), [id]);
  const event = eventState.data?.event;

  const remember = value => {
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
      setAttempt(value);
      return true;
    } catch { return false; }
  };
  const change = key => e => setGuest(previous => ({ ...previous, [key]: e.target.value }));
  const remaining = Math.max(0, Number(event?.seats || 0) - Number(event?.ticketsSold || 0));
  const amount = Math.round(Number(event?.price || 0) * 100) * Number(guest.tickets);
  useEffect(() => { if (!attempt) setCashReceived(false); }, [amount, attempt]);
  const day = event?.date ? String(event.date).slice(0, 10) : "";
  const closed = !day || Date.now() >= new Date(`${day}T23:59:59+05:30`).getTime();
  const unavailable = event && (event.archivedAt || event.status !== "approved" || closed || remaining === 0);

  const submit = async e => {
    e?.preventDefault();
    if (lock.current || booking) return;
    if (!attempt && !cashReceived) { setError("Confirm that you have collected the cash first."); return; }
    const payload = attempt || {
      eventId: id, name: guest.name.trim(), phone: guest.phone.trim(), email: guest.email.trim(),
      tickets: Number(guest.tickets), answers: guest.answers, expectedAmount: amount,
      cashReceived: true, requestKey: crypto.randomUUID(),
    };
    if (!remember(payload)) {
      setError("Your browser cannot save booking recovery details. Allow site storage before confirming a cash booking.");
      return;
    }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await bookings.cash(payload);
      if (!result?.booking?._id) throw new Error("The booking response was incomplete. Retry to recover this booking.");
      setBooking(result.booking);
      eventState.reload();
    } catch (err) {
      setError(err.message || "We couldn't confirm the result. Retry this same booking before taking more cash.");
      // A rejected request has not saved a sale. A connection/server failure may
      // have committed it: preserve the exact payload and key until recovered.
      if (!attempt && [400, 403, 404, 409, 422, 429].includes(err.status)) { remember(null); setCashReceived(false); eventState.reload(); }
    } finally { lock.current = false; setBusy(false); }
  };
  const nextGuest = () => {
    if (!remember(null)) { setError("Allow site storage before starting the next booking."); return; }
    setBooking(null); setGuest(emptyGuest()); setCashReceived(false); setError("");
    eventState.reload();
  };

  if (eventState.loading && !event) return <div className="grid min-h-[60dvh] place-items-center"><Loader label="Loading cash desk" /></div>;
  if (!event) return <div className="shell section"><ErrorState title="Cash desk unavailable" message={eventState.error?.message || "This event could not be loaded."} onRetry={eventState.reload} /></div>;

  return <div className="shell section max-w-5xl">
    <Seo title="Cash desk" noindex />
    <Link to={`/events/${id}/bookings`} className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--color-fg-muted)]"><ArrowLeft size={16} />Back to event bookings</Link>
    <h1 className="mt-4 text-3xl sm:text-4xl">Cash desk</h1>
    <p className="mt-2 text-lg text-[var(--color-fg-muted)]">{event.title}</p>

    {booking ? <GlassCard elevation={2} radius="xl" className="mt-8 p-6 sm:p-8">
      <div role="status" className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl"><CheckCircle className="text-[var(--color-success)]" size={28} />Cash booking confirmed</h2>
        <p className="mt-3">{booking.attendeeSnapshot?.name} · {booking.tickets} ticket{booking.tickets === 1 ? "" : "s"} · {formatPrice(booking.totalPrice)} collected</p>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          {booking.deliveryStatus === "sent" ? "Ticket and receipt submitted for email delivery" : booking.deliveryStatus === "failed" ? "Email delivery needs attention. Download the ticket and receipt below" : "Ticket and receipt queued for email delivery"} to {booking.attendeeSnapshot?.email}. You can hand over the downloads immediately.
        </p>
      </div>
      <div className="mx-auto max-w-sm"><QrPanel booking={booking} event={booking.eventSnapshot || event} /></div>
      <Button className="mt-8" fullWidth onClick={nextGuest}>Register next guest</Button>
      {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
    </GlassCard> : <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <GlassCard elevation={2} radius="xl" className="p-6 sm:p-8">
        <h2 className="text-xl">Guest details</h2>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">No attendee account is needed. One QR pass admits the whole group together.</p>
        {attempt && <p role="status" className="mt-4 rounded-lg border border-[var(--color-warning)]/40 p-4 text-sm">A booking is awaiting confirmation. Retry it to recover the same ticket; do not collect cash again. After a refresh, this may already be a completed sale.</p>}
        {unavailable && !attempt && <p role="status" className="mt-4 text-[var(--color-warning)]">{remaining === 0 ? "This event is sold out." : "Cash sales are available for approved events until the end of the event day."}</p>}
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <fieldset disabled={busy || Boolean(attempt) || Boolean(unavailable)} className="space-y-5">
            <Input label="Guest name" value={guest.name} onChange={change("name")} required maxLength={100} autoComplete="off" />
            <Input label="Phone number" type="tel" inputMode="tel" value={guest.phone} onChange={change("phone")} required maxLength={25} autoComplete="off" />
            <Input label="Email address" type="email" value={guest.email} onChange={change("email")} required maxLength={254} autoComplete="off" helper="The ticket and receipt will be sent here. Check the address with the guest." />
            <Select label="Number of tickets" value={String(guest.tickets)} onChange={change("tickets")} required options={Array.from({ length: MAX_TICKETS_PER_ORDER }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} helper="Maximum 10 tickets per booking." />
            {event.registrationFields?.length > 0 && <RegistrationFields fields={event.registrationFields} answers={guest.answers || {}} onChange={answers => setGuest(previous => ({ ...previous, answers }))} />}
            <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
              <input className="mt-1 size-5 shrink-0" type="checkbox" checked={cashReceived} onChange={e => setCashReceived(e.target.checked)} required />
              <span>I have collected {formatPrice((attempt?.expectedAmount ?? amount) / 100)} in cash for this booking.</span>
            </label>
          </fieldset>
          {error && <p role="alert" className="rounded-lg border border-[var(--color-danger)]/40 p-4 text-sm">{error}</p>}
          <Button type="submit" fullWidth loading={busy} disabled={!attempt && (Boolean(unavailable) || !cashReceived || Number(guest.tickets) > remaining)}><CurrencyInr size={18} />{attempt ? "Recover this booking" : "Confirm cash booking"}</Button>
          <p className="text-xs leading-relaxed text-[var(--color-fg-subtle)]">If the booking is refused after you collect the cash, return it to the guest. A confirmed booking reserves seats and creates the entry pass.</p>
        </form>
      </GlassCard>
      <GlassCard elevation={1} radius="xl" className="p-6">
        <h2 className="text-lg">Amount to collect</h2>
        <dl className="mt-5 space-y-4 text-sm">
          <div className="flex justify-between gap-4"><dt>Price per ticket</dt><dd>{formatPrice(attempt ? attempt.expectedAmount / 100 / attempt.tickets : event.price)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Tickets</dt><dd>{guest.tickets}</dd></div>
          <div className="flex justify-between gap-4 border-t border-[var(--glass-edge)] pt-4 text-lg font-semibold"><dt>Total</dt><dd>{formatPrice((attempt?.expectedAmount ?? amount) / 100)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Seats available</dt><dd>{remaining}</dd></div>
        </dl>
        <p className="mt-5 text-xs leading-relaxed text-[var(--color-fg-muted)]">Cash and online bookings share this capacity. Availability is checked again when you confirm.</p>
      </GlassCard>
    </div>}
  </div>;
}
