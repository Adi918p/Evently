import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { DownloadSimple, SealCheck, Warning } from "@phosphor-icons/react";
import { formatPrice } from "../../lib/constants";

/**
 * The QR pass.
 *
 * `booking.qrCode` arrives from the API as a PNG data URL, already rendered
 * server-side by the qrcode package - so this shows the exact image the door
 * scanner was built to read, with no client-side regeneration that could drift
 * from it.
 *
 * The A4 PDF version is emailed at purchase. There is deliberately no download
 * link for it here: the PDFs sit in the server's tickets/ directory named only
 * by ticket id, so serving that directory would hand anyone who guesses an id
 * somebody else's pass. Saving the QR image covers the actual need - having the
 * code on your phone at the door - and works offline once saved.
 */

/** Data URLs can be handed straight to a download link; no blob needed. */
export function qrDownloadName(booking) {
  return `evently-${booking?.ticketId || "ticket"}.png`;
}

export function QrPanel({ booking, event, compact = false }) {
  if (!booking?.qrCode) {
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4">
        <Warning
          size={18}
          className="mt-0.5 shrink-0 text-[var(--color-warning)]"
          aria-hidden="true"
        />
        <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
          This booking has no QR code attached. Show your ticket ID{" "}
          <span className="font-mono text-[var(--color-fg)]">
            {booking?.ticketId || "—"}
          </span>{" "}
          at the door, or contact support and we'll reissue it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* White plate: scanners need the quiet zone and full contrast, so the
          code never inherits the dark surface behind it. */}
      <div className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-3)]">
        <img
          src={booking.qrCode}
          alt={`Entry QR code for ticket ${booking.ticketId}`}
          width={compact ? 180 : 240}
          height={compact ? 180 : 240}
          className="block size-[180px] sm:size-[240px]"
        />
      </div>

      <dl className="w-full space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-[var(--color-fg-subtle)]">Ticket ID</dt>
          <dd className="wrap-anywhere text-right font-mono text-[var(--color-fg)]">
            {booking.ticketId}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-[var(--color-fg-subtle)]">Admits</dt>
          <dd className="tnum font-semibold">
            {booking.tickets} {booking.tickets === 1 ? "person" : "people"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-[var(--color-fg-subtle)]">Paid</dt>
          <dd className="tnum font-semibold">
            {formatPrice(booking.totalPrice)}
          </dd>
        </div>
        {event?.title ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[var(--color-fg-subtle)]">Event</dt>
            <dd className="text-right font-semibold">{event.title}</dd>
          </div>
        ) : null}
      </dl>

      {booking.checkedIn ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-success)]">
          <SealCheck size={16} weight="fill" aria-hidden="true" />
          Already checked in
          {booking.checkedInAt
            ? ` · ${new Date(booking.checkedInAt).toLocaleString()}`
            : ""}
        </p>
      ) : (
        <p className="text-center text-xs leading-relaxed text-[var(--color-fg-subtle)]">
          Present this at the entrance. It scans once — after that it won't let
          anyone else in.
        </p>
      )}

      <Button
        variant="secondary"
        href={booking.qrCode}
        download={qrDownloadName(booking)}
        fullWidth
      >
        <DownloadSimple size={18} aria-hidden="true" />
        Save QR image
      </Button>
    </div>
  );
}

export function TicketModal({ open, onClose, booking, event }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event?.title || "Your ticket"}
      description="Turn your screen brightness up before scanning."
      size="sm"
    >
      <QrPanel booking={booking} event={event} />
    </Modal>
  );
}
