import {
  Confetti,
  Users,
  MusicNotes,
  Wrench,
  Basketball,
  PaintBrush,
  Cpu,
  GameController,
  ForkKnife,
  Microphone,
  Sparkle,
  DiscoBall,
} from "@phosphor-icons/react";

/**
 * Shared vocabulary.
 *
 * The category keys are the Event model's enum - the server rejects anything
 * else, so this list must stay in lockstep with models/Events.js. Labels and
 * icons are presentation only.
 */

export const CATEGORIES = [
  { value: "networking", label: "Networking", icon: Users },
  { value: "club", label: "Club Nights", icon: DiscoBall },
  { value: "music", label: "Music", icon: MusicNotes },
  { value: "workshop", label: "Workshops", icon: Wrench },
  { value: "sports", label: "Sports", icon: Basketball },
  { value: "arts", label: "Arts", icon: PaintBrush },
  { value: "festival", label: "Festivals", icon: Confetti },
  { value: "tech", label: "Tech", icon: Cpu },
  { value: "gaming", label: "Gaming", icon: GameController },
  { value: "food", label: "Food & Drinks", icon: ForkKnife },
  { value: "comedy", label: "Comedy", icon: Microphone },
  { value: "other", label: "Other", icon: Sparkle },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.value, category])
);

export const categoryLabel = (value) =>
  CATEGORY_MAP[String(value || "").toLowerCase()]?.label || "Event";

export const categoryIcon = (value) =>
  CATEGORY_MAP[String(value || "").toLowerCase()]?.icon || Sparkle;

/** The city list from the legacy search datalist, kept verbatim. */
export const CITIES = [
  "Ludhiana",
  "Amritsar",
  "Jalandhar",
  "Mohali",
  "Chandigarh",
  "Patiala",
  "Bathinda",
  "Pathankot",
  "Hoshiarpur",
  "Delhi",
  "Gurugram",
  "Noida",
  "Mumbai",
  "Pune",
  "Bangalore",
  "Hyderabad",
];

/**
 * Older events were created before `category` existed, so they have none. The
 * legacy script guessed from the title; keeping that heuristic means those
 * events still land in the right filter bucket instead of all showing "Other".
 */
const HINTS = [
  [/\b(club|night|party|dj|rave|disco)\b/i, "club"],
  [/\b(concert|music|gig|live|band|singer|tour)\b/i, "music"],
  [/\b(workshop|bootcamp|class|training|masterclass)\b/i, "workshop"],
  [/\b(tech|hack|dev|coding|ai|startup|conference)\b/i, "tech"],
  [/\b(sport|match|tournament|marathon|cricket|football)\b/i, "sports"],
  [/\b(art|exhibit|gallery|paint|craft|theatre|drama)\b/i, "arts"],
  [/\b(fest|festival|carnival|mela)\b/i, "festival"],
  [/\b(gaming|esports|lan|tournament|valorant|bgmi)\b/i, "gaming"],
  [/\b(food|dine|dinner|brunch|tasting|drinks|wine|beer)\b/i, "food"],
  [/\b(comedy|standup|stand-up|open\s?mic|humor|humour)\b/i, "comedy"],
  [/\b(network|meetup|mixer|summit)\b/i, "networking"],
];

export const inferCategory = (event) => {
  const explicit = String(event?.category || "").toLowerCase();
  if (CATEGORY_MAP[explicit]) return explicit;

  const haystack = `${event?.title || ""} ${event?.description || ""} ${event?.venue || ""}`;
  const hit = HINTS.find(([pattern]) => pattern.test(haystack));
  return hit ? hit[1] : "other";
};

/* ==========================================================================
   Formatting
   ========================================================================== */

/** Indian rupee, no decimals. Free events say "Free", not "₹0". */
export const formatPrice = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Free";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value) || 0);

/**
 * The Event model stores `date` and `time` separately, and `time` is a free
 * text field ("9:00 PM", "21:00", sometimes empty). Parse defensively.
 */
export const eventDate = (event) => {
  if (!event?.date) return null;
  const date = new Date(event.date);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isPastEvent = (event) => {
  const date = eventDate(event);
  if (!date) return false;
  // Compare against the end of the event day, not the moment - an event
  // happening tonight is not "past" at 9am.
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() < Date.now();
};

export const seatsLeft = (event, override) => {
  if (Number.isFinite(override)) return override;
  const seats = Number(event?.seats) || 0;
  const sold = Number(event?.ticketsSold) || 0;
  return Math.max(seats - sold, 0);
};

/** Max 10 per order, matching paymentController's validation. */
export const MAX_TICKETS_PER_ORDER = 10;

/* ==========================================================================
   Contact details
   --------------------------------------------------------------------------
   Carried over verbatim from the legacy contact page. One source so the
   footer, contact page and support page can never drift apart.
   ========================================================================== */

export const SUPPORT_EMAIL = "support@event-ly.in";

export const SUPPORT_PHONES = ["+91 79862 85027", "+91 82840 62208"];

export const SUPPORT_ADDRESS = "Ludhiana, Punjab, India";

/** `tel:` needs the digits without spaces. */
export const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, "")}`;
