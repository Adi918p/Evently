const MAX_QR_LENGTH = 4096;
const MAX_TICKET_LENGTH = 128;
const BOOKING_ID = /^[a-f\d]{24}$/i;
// Preserve current EVT IDs, older timestamp IDs and legacy paid EVLT IDs.
// The server remains responsible for existence, ownership and admission state.
const TICKET_ID = /^(?:EVT|EVLT)-[a-z\d]+(?:-[a-z\d]+)*$/i;

function readTicketId(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= MAX_TICKET_LENGTH && TICKET_ID.test(text) ? text : null;
}

function readBookingId(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return BOOKING_ID.test(text) ? text : null;
}

/**
 * Reject unrelated or malformed codes before making a network request.
 * A plausible payload still requires server verification; it is never proof of
 * admission. Only identifiers are returned, so QR-supplied event data cannot
 * replace the event selected by the operator.
 */
export function readScannerPayload(raw) {
  if (typeof raw !== "string" || raw.length > MAX_QR_LENGTH) return null;
  const text = raw.trim();
  if (!text) return null;

  let payload;
  if (text.startsWith("{")) {
    try {
      payload = JSON.parse(text);
    } catch {
      return null;
    }
  } else {
    payload = { ticketId: text };
  }

  const bookingId = readBookingId(payload.bookingId);
  const ticketId = readTicketId(payload.ticketId);
  return bookingId || ticketId ? { bookingId, ticketId } : null;
}
