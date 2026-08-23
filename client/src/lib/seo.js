/**
 * Everything the app needs to describe itself to a crawler, in one place.
 *
 * Two consumers, and the split matters:
 *
 *   - <Seo> (components/seo/Seo.jsx) writes these values into <head> for real
 *     visitors, and for search engines, which do execute JavaScript.
 *   - routes/seo.js on the Express side writes the same values into the HTML it
 *     hands to social scrapers, which do not. WhatsApp, Facebook, Twitter,
 *     Slack and Discord read the markup as delivered and never run the bundle,
 *     so a client-only solution gives every shared link the same generic card.
 *
 * The page copy both of them use lives in data/seo-pages.json precisely so that
 * neither side owns it. The schema builders below are duplicated in spirit on
 * the server, but only for events, where the data comes from MongoDB anyway.
 */

import PAGES from "../data/seo-pages.json";

/* ==========================================================================
   Identity
   ========================================================================== */

export const BRAND = "Evently";

/**
 * The canonical origin, no trailing slash.
 *
 * Hardcoded rather than read from window.location on purpose: a canonical tag
 * has to name one origin, and the app is reachable on at least three (the
 * Vercel preview domain, the Render API host, and the real domain). Deriving it
 * from the current host would tell Google that every preview deploy is its own
 * indexable site. VITE_SITE_URL exists as an escape hatch for a staging domain
 * that genuinely should self-canonicalise.
 */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || "https://event-ly.in"
).replace(/\/+$/, "");

/**
 * The fallback share card.
 *
 * NOTE: this is the square logo, because it is the only brand image in the
 * repo. Facebook and WhatsApp crop to roughly 1.91:1, so a dedicated
 * 1200x630 image would look markedly better — drop one at
 * client/public/og-default.jpg and point this at "/og-default.jpg".
 */
export const DEFAULT_OG_IMAGE = "/Media/Png/logo.jpg";

/* ==========================================================================
   URLs
   ========================================================================== */

/**
 * Turns an app-relative path into an absolute URL on the canonical origin.
 *
 * Stored image paths (/api/images/<key>, /Media/..., /uploads/...) go through
 * here too. They resolve on event-ly.in because Vercel rewrites all three
 * prefixes through to the API host, so a scraper fetching the absolute form
 * gets the bytes without knowing the API exists.
 *
 * An absolute input is returned untouched — og:image must never end up as
 * "https://event-ly.inhttps://...".
 */
export const absoluteUrl = (path) => {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}/${value.replace(/^\/+/, "")}`;
};

/**
 * The canonical URL for a route.
 *
 * Query strings and hashes are dropped: /events?city=Ludhiana and
 * /events?category=club are the same set of listings rendered by the same
 * component, and left to self-canonicalise they would split ranking signals
 * across dozens of near-duplicate URLs. The pages stay crawlable (robots.txt
 * deliberately does not block them) — they just point here.
 */
export const canonicalUrl = (pathname) => {
  const path = String(pathname || "/").split(/[?#]/)[0];
  if (path === "/") return `${SITE_URL}/`;
  return `${SITE_URL}/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

/* ==========================================================================
   Text
   ========================================================================== */

/**
 * " | Evently" is appended unless the title already is the brand line.
 * Home is the one page whose title reads better without the suffix.
 */
export const formatTitle = (title, { bare = false } = {}) => {
  const text = String(title || "").trim();
  if (!text) return `${BRAND} — Book Events, Club Nights & Concerts`;
  if (bare || text === BRAND) return text;
  return `${text} | ${BRAND}`;
};

/**
 * Cuts to a whole word and adds an ellipsis. Descriptions are organiser-written
 * free text and run to several paragraphs; a snippet gets ~160 characters, and
 * a mid-word cut looks broken in a share card.
 */
export const truncate = (text, max = 160) => {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/** The stored copy for a fixed route, or null for a dynamic one. */
export const pageSeo = (pathname) => PAGES[String(pathname || "")] || null;

/* ==========================================================================
   Event dates
   --------------------------------------------------------------------------
   Google's event rich results need a real ISO 8601 startDate. The model stores
   `date` as a Date and `time` as free text an organiser typed, so this has to
   be defensive rather than clever.
   ========================================================================== */

/** India Standard Time. Every event in the database is physically in India. */
const TZ_OFFSET = "+05:30";

/**
 * The calendar day, read in UTC.
 *
 * Deliberately not toLocaleDateString or getMonth(): an organiser picking
 * 15 September stores 2026-09-15T00:00:00Z, and reading that back through a
 * timezone west of UTC returns the 14th. UTC parts round-trip what was typed.
 */
const isoDay = (date) => date.toISOString().slice(0, 10);

/**
 * "9:00 PM" / "21:00" / "9pm" -> { hours, minutes }, or null when the field is
 * empty or unparseable (both common — `time` has always been optional).
 */
const parseClock = (time) => {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(time || ""));
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const suffix = (match[3] || "").toLowerCase();

  if (!Number.isFinite(hours) || hours > 23 || minutes > 59) return null;
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  if (hours > 23) return null;

  return { hours, minutes };
};

/**
 * The value for schema.org startDate.
 *
 * With a usable `time` this is a full offset-qualified timestamp. Without one it
 * is a bare date, which schema.org accepts and which is honest about the fact
 * that nobody told us when the doors open — better than inventing midnight.
 */
export const schemaStartDate = (event) => {
  const raw = event?.date ? new Date(event.date) : null;
  if (!raw || Number.isNaN(raw.getTime())) return null;

  const day = isoDay(raw);
  const clock = parseClock(event?.time);
  if (!clock) return day;

  const hh = String(clock.hours).padStart(2, "0");
  const mm = String(clock.minutes).padStart(2, "0");
  return `${day}T${hh}:${mm}:00${TZ_OFFSET}`;
};

/* ==========================================================================
   JSON-LD
   --------------------------------------------------------------------------
   Builders return plain objects. <Seo> serialises them; nothing here touches
   the DOM, so the server can reuse the same shapes.
   ========================================================================== */

export const organizationSchema = () => ({
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: BRAND,
  url: `${SITE_URL}/`,
  logo: absoluteUrl(DEFAULT_OG_IMAGE),
  email: "support@event-ly.in",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Ludhiana",
    addressRegion: "Punjab",
    addressCountry: "IN",
  },
});

/**
 * The site entity, plus the search box.
 *
 * `target` points at the real listing route with its real parameter name (`q`,
 * matching lib/api.js), so if Google ever surfaces a sitelinks search box the
 * URL it builds actually returns results.
 */
export const websiteSchema = () => ({
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: `${SITE_URL}/`,
  name: BRAND,
  publisher: { "@id": `${SITE_URL}/#organization` },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/events?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
});

export const breadcrumbSchema = (trail) => ({
  "@type": "BreadcrumbList",
  itemListElement: trail.map(({ name, path }, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name,
    item: canonicalUrl(path),
  })),
});

export const faqSchema = (faqs) => ({
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
});

/** An ordered list of event URLs, so a listing page describes what it links to. */
export const itemListSchema = (events) => ({
  "@type": "ItemList",
  itemListElement: events.map((event, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: canonicalUrl(`/events/${event._id}`),
    name: event.title,
  })),
});

/**
 * A venue from the club guide (data/clubs.js).
 *
 * NightClub, not Organization: these are third-party venues Evently writes
 * about, so describing them as the publisher would be wrong. `priceRange` takes
 * the door prices as written ("₹499 - ₹1999") because schema.org expects a
 * human-readable band there, not a number.
 *
 * `openingHours` is left out on purpose. The stored value is display copy
 * ("7 PM - 1 AM") and the schema.org field wants the "Mo-Su 19:00-01:00" form;
 * emitting the wrong shape is worse than emitting nothing.
 */
export const nightClubSchema = (club) => {
  if (!club?.title) return null;

  const tiers = Object.values(club.tickets || {}).filter(Boolean);

  return {
    "@type": "NightClub",
    "@id": `${canonicalUrl(`/clubs/${club.id}`)}#venue`,
    name: club.title,
    description: club.description || club.about || undefined,
    url: canonicalUrl(`/clubs/${club.id}`),
    image: club.banner ? absoluteUrl(club.banner) : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: club.address || undefined,
      addressLocality: club.location || undefined,
      addressRegion: "Punjab",
      addressCountry: "IN",
    },
    priceRange: tiers.length
      ? tiers.length > 1
        ? `${tiers[0]} - ${tiers[tiers.length - 1]}`
        : tiers[0]
      : undefined,
  };
};

/**
 * A single event, as Google's Event rich result wants it.
 *
 * Only fields we actually hold are emitted — an empty or invented value is
 * worse than an absent one, because a structured-data mismatch with the visible
 * page is what gets rich results withheld.
 */
export const eventSchema = (event, { seatsLeft, description } = {}) => {
  const startDate = schemaStartDate(event);
  if (!event?.title || !startDate) return null;

  const images = [event.banner, ...(event.gallery || [])]
    .filter(Boolean)
    .map(absoluteUrl);

  const price = Number(event.price) || 0;
  const soldOut = Number.isFinite(seatsLeft) && seatsLeft <= 0;
  const url = canonicalUrl(`/events/${event._id}`);

  const schema = {
    "@type": "Event",
    name: event.title,
    startDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description: truncate(description || event.about || event.description, 300),
    url,
    location: {
      "@type": "Place",
      name: event.venue || event.location || "Venue to be announced",
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venue || undefined,
        addressLocality: event.location || undefined,
        addressCountry: "IN",
      },
    },
    organizer: { "@id": `${SITE_URL}/#organization` },
    offers: {
      "@type": "Offer",
      url,
      price,
      priceCurrency: "INR",
      availability: soldOut
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
      validFrom: event.createdAt
        ? new Date(event.createdAt).toISOString()
        : undefined,
    },
  };

  if (images.length) schema.image = images;

  // Named acts only. A lineup entry with no name is a half-filled form row.
  const performers = (event.lineup || [])
    .map((act) => act?.name)
    .filter(Boolean)
    .map((name) => ({ "@type": "PerformingGroup", name }));
  if (performers.length) schema.performer = performers;

  // "18+" is the shape the form produces; schema.org wants "18-".
  const age = /^(\d{1,2})\s*\+$/.exec(String(event.agelim || ""));
  if (age) schema.typicalAgeRange = `${age[1]}-`;

  return schema;
};

/**
 * Wraps builders into one graph.
 *
 * A single @graph rather than several <script> tags: it lets the nodes above
 * reference each other by @id (an event's organizer is the Organization node,
 * declared once) instead of repeating the publisher on every page.
 */
export const graph = (...nodes) => ({
  "@context": "https://schema.org",
  "@graph": nodes.filter(Boolean),
});
