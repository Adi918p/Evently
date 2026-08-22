/**
 * What an organiser is allowed to print on a ticket and show at the door.
 *
 * Both the PDF and the scanner read their field list from Event.ticketConfig, so
 * the two always agree and the organiser configures them in one place.
 *
 * Why a fixed catalogue rather than free-form paths: the config is organiser
 * input, and resolving an arbitrary dotted path against a populated Booking
 * would happily walk into `user.password` or `user.emailVerificationOtpHash`.
 * Every key here maps to an explicit getter, so a field that is not listed
 * cannot be reached at all.
 *
 * Organiser-authored extras live separately in ticketConfig.fields as plain
 * label/value pairs - those are literal text, never a lookup. Answers the
 * attendee gave to the organiser's own questions are appended by
 * utils/registrationFields.js.
 */

const { answerRows } = require("./registrationFields");

const money = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  // Indian grouping, no decimals: prices in this app are whole rupees.
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const day = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const dayTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const str = (value) => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
};

/**
 * key -> { label, get, scanOnly }
 *
 * `get` returns a display string or null. Null means "no value", and callers
 * drop the row rather than printing an empty one.
 */
const CATALOGUE = {
  "attendee.name": {
    label: "Attendee",
    get: ({ attendee }) => str(attendee?.name),
  },
  "attendee.email": {
    label: "Email",
    get: ({ attendee }) => str(attendee?.email),
  },
  ticketId: {
    label: "Ticket ID",
    get: ({ booking }) => str(booking?.ticketId),
  },
  tickets: {
    label: "Tickets",
    get: ({ booking }) => {
      const count = Number(booking?.tickets);
      return Number.isFinite(count) && count > 0 ? String(count) : "1";
    },
  },
  amount: {
    label: "Amount paid",
    get: ({ booking }) => money(booking?.totalPrice) ?? "Free",
  },
  "event.date": {
    label: "Date",
    get: ({ event }) => day(event?.date),
  },
  "event.time": {
    label: "Doors",
    get: ({ event }) => str(event?.time),
  },
  "event.venue": {
    label: "Venue",
    get: ({ event }) => str(event?.venue),
  },
  "event.location": {
    label: "City",
    get: ({ event }) => str(event?.location),
  },
  "event.category": {
    label: "Category",
    get: ({ event }) => str(event?.category),
  },
  "event.agelim": {
    label: "Age limit",
    get: ({ event }) => str(event?.agelim),
  },
  bookedAt: {
    label: "Booked",
    get: ({ booking }) => day(booking?.bookedAt || booking?.createdAt),
  },
  paymentId: {
    label: "Payment ID",
    get: ({ booking }) => str(booking?.paymentId),
  },
  status: {
    label: "Status",
    get: ({ booking }) => str(booking?.status),
    scanOnly: true,
  },
  checkedInAt: {
    label: "Checked in",
    get: ({ booking }) => dayTime(booking?.checkedInAt),
    scanOnly: true,
  },
};

/** Every key an organiser may choose from, in a sensible presentation order. */
const FIELD_KEYS = Object.keys(CATALOGUE);

/** Keys valid on the printed pass (a check-in time cannot exist at print time). */
const TICKET_FIELD_KEYS = FIELD_KEYS.filter((key) => !CATALOGUE[key].scanOnly);

/** Keys valid on the door screen. */
const SCAN_FIELD_KEYS = FIELD_KEYS;

/** Shipped defaults, used when an organiser has not chosen anything. */
const DEFAULT_TICKET_FIELDS = [
  "attendee.name",
  "ticketId",
  "event.date",
  "event.venue",
  "tickets",
  "amount",
];

const DEFAULT_SCAN_FIELDS = [
  "attendee.name",
  "tickets",
  "ticketId",
  "attendee.email",
  "status",
];

/** For building the organiser's picker without duplicating the labels. */
const fieldLabel = (key) => CATALOGUE[key]?.label || key;

const fieldCatalogue = (keys) =>
  keys.map((key) => ({ key, label: CATALOGUE[key].label }));

/**
 * Turns a configured key list into printable rows.
 *
 * Unknown keys are ignored, duplicates collapse, and rows with no value are
 * dropped - a pass with "Doors: —" on it looks broken, and the organiser may
 * simply not have filled that in.
 */
function resolveFields(keys, context, { allowed = FIELD_KEYS } = {}) {
  const seen = new Set();
  const rows = [];

  for (const key of Array.isArray(keys) ? keys : []) {
    if (!allowed.includes(key) || seen.has(key)) continue;
    seen.add(key);
    let value = null;
    try {
      value = CATALOGUE[key].get(context);
    } catch {
      value = null;
    }
    if (value === null || value === undefined || value === "") continue;
    rows.push({ key, label: CATALOGUE[key].label, value: String(value) });
  }

  return rows;
}

/** Organiser-authored label/value extras, trimmed and capped. */
function resolveExtras(fields, { limit = 8, labelMax = 40, valueMax = 120 } = {}) {
  return (Array.isArray(fields) ? fields : [])
    .map((field) => ({
      label: String(field?.label ?? "").trim().slice(0, labelMax),
      value: String(field?.value ?? "").trim().slice(0, valueMax),
    }))
    .filter((field) => field.label && field.value)
    .slice(0, limit);
}

/**
 * The full, ready-to-render ticket contents for one booking.
 *
 * `where` picks which of the organiser's two lists to use. Everything below is
 * derived, so the PDF, the door screen and any future channel cannot drift.
 */
function buildTicketView({ booking, event, attendee, where = "ticket" }) {
  const config = event?.ticketConfig || {};
  const onTicket = where === "ticket";

  const configured = onTicket ? config.showOnTicket : config.showOnScan;
  const fallback = onTicket ? DEFAULT_TICKET_FIELDS : DEFAULT_SCAN_FIELDS;
  const allowed = onTicket ? TICKET_FIELD_KEYS : SCAN_FIELD_KEYS;

  const keys =
    Array.isArray(configured) && configured.length > 0 ? configured : fallback;

  return {
    // Evently's own facts first, in the order the organiser chose, then whatever
    // they asked the attendee. Answers are appended rather than mixed in because
    // they are per-booking data, so their rows appear and disappear between
    // passes for the same event.
    fields: [
      ...resolveFields(keys, { booking, event, attendee }, { allowed }),
      ...answerRows({ event, booking, where }),
    ],
    extras: resolveExtras(config.fields),
    notes: String(config.notes ?? "").trim().slice(0, 400),
    accent: /^#[0-9a-f]{6}$/i.test(String(config.accent || ""))
      ? String(config.accent)
      : "#8B5CF6",
  };
}

module.exports = {
  FIELD_KEYS,
  TICKET_FIELD_KEYS,
  SCAN_FIELD_KEYS,
  DEFAULT_TICKET_FIELDS,
  DEFAULT_SCAN_FIELDS,
  fieldLabel,
  fieldCatalogue,
  resolveFields,
  resolveExtras,
  buildTicketView,
};
