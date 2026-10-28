/**
 * Everything a crawler asks for that the single-page app cannot answer itself.
 *
 * Three handlers, all read-only and all unauthenticated:
 *
 *   sitemap  GET /sitemap.xml   the real event URLs, straight from MongoDB
 *   robots   GET /robots.txt    served on the API host only, disallowing all
 *   render   GET /seo/render/*  server-rendered HTML for crawlers
 *
 * Why `render` exists
 * -------------------
 * The front end is a static bundle on Vercel. A request for /events/<id>
 * returns index.html with an empty <div id="root">, and the title, description
 * and share image only appear once React has run and fetched the event.
 *
 * Search engines execute JavaScript, so they cope. Social scrapers do not:
 * WhatsApp, Facebook, Twitter, LinkedIn, Slack and Discord read the bytes as
 * delivered and stop. Without this file every event ever shared in a WhatsApp
 * group renders the same generic Evently card instead of the event.
 *
 * Vercel routes only known bot user agents here (see client/vercel.json), which
 * is why serving different markup is not cloaking: the page below carries the
 * same title, description, date, venue and price a visitor sees, and canonicals
 * back to the real URL. That is Google's documented "dynamic rendering", not a
 * bot-only page.
 */

const path = require("path");
const Event = require("../models/Events");
const { isDatabaseReady } = require("../config/db");

/**
 * The page copy, shared with the client.
 *
 * Same file client/src/lib/seo.js imports. JSON specifically so that CommonJS
 * here and ESM there can both read it and the two can never disagree about what
 * /faq is called.
 */
const PAGES = require(path.join(
    __dirname,
    "..",
    "client",
    "src",
    "data",
    "seo-pages.json"
));

const BRAND = "Evently";

/** No trailing slash. Must be the domain visitors use, not this API host. */
const SITE_URL = (process.env.SITE_URL || "https://event-ly.in").replace(/\/+$/, "");

const DEFAULT_OG_IMAGE = "/Media/Png/logo.jpg";

/** Public routes worth listing. Account and operator pages are in robots.txt. */
const STATIC_ROUTES = [
    "/",
    "/events",
    "/clubs",
    "/experience",
    "/faq",
    "/contact",
    "/support",
    "/privacy",
    "/terms"
];

/** Curated venues, keyed 1-4 in client/src/data/clubs.js. */
const CLUB_ROUTES = ["/clubs/1", "/clubs/2", "/clubs/3", "/clubs/4"];

/**
 * How far back to keep listing finished events.
 *
 * They are not deleted, and their pages still work, but an event from two years
 * ago is a dead end for a searcher. Six months keeps recent history indexed
 * without the sitemap growing without limit.
 */
const PAST_EVENT_WINDOW_DAYS = 180;

/** Matches the visibility rule in routes/events.js — pending stays discoverable. */
const VISIBLE = { archivedAt: null, status: { $in: ["approved", "pending"] } };

/* ==========================================================================
   Escaping
   ========================================================================== */

const escapeXml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

/**
 * For text and attribute values in the rendered page.
 *
 * Event titles and descriptions are organiser-authored, so they reach this file
 * untrusted. Escaping the four HTML-significant characters plus the quote is
 * what stops a title containing `"><script>` from breaking out of a meta tag.
 */
const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/**
 * JSON-LD sits inside <script>, where HTML escaping does not apply but `</` and
 * `<!--` still terminate the element. Escaping the slash is the standard fix and
 * stays valid JSON.
 */
const escapeJsonLd = (data) =>
    JSON.stringify(data)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");

/* ==========================================================================
   Shared helpers
   --------------------------------------------------------------------------
   Deliberate small duplicates of client/src/lib/seo.js. The client copy cannot
   be imported (ESM, and it reads import.meta.env), and a shared package for
   five functions would be more machinery than the problem deserves. If the date
   handling changes, change it in both.
   ========================================================================== */

const absoluteUrl = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return text;
    return `${SITE_URL}/${text.replace(/^\/+/, "")}`;
};

const canonicalUrl = (pathname) => {
    const clean = String(pathname || "/").split(/[?#]/)[0];
    if (clean === "/") return `${SITE_URL}/`;
    return `${SITE_URL}/${clean.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

const formatTitle = (title, bare) => {
    const text = String(title || "").trim();
    if (!text) return `${BRAND} — Book Events, Club Nights & Concerts`;
    if (bare || text === BRAND) return text;
    return `${text} | ${BRAND}`;
};

const truncate = (text, max = 160) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/** UTC parts on purpose - see the note in client/src/lib/seo.js. */
const isoDay = (date) => date.toISOString().slice(0, 10);

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

const schemaStartDate = (event) => {
    const raw = event?.date ? new Date(event.date) : null;
    if (!raw || Number.isNaN(raw.getTime())) return null;

    const day = isoDay(raw);
    const clock = parseClock(event?.time);
    if (!clock) return day;

    const hh = String(clock.hours).padStart(2, "0");
    const mm = String(clock.minutes).padStart(2, "0");
    return `${day}T${hh}:${mm}:00+05:30`;
};

/** "Saturday 15 November 2026", built without pulling in a date library. */
const readableDate = (event) => {
    const raw = event?.date ? new Date(event.date) : null;
    if (!raw || Number.isNaN(raw.getTime())) return "";
    return raw.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    });
};

const formatPrice = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return "Free";
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
};

/* ==========================================================================
   GET /robots.txt   (API host only)
   --------------------------------------------------------------------------
   api.event-ly.in runs the same build and will happily serve the whole SPA from
   its own hostname, which would put a second, identical copy of the site in the
   index and split every ranking signal against itself. So the API host tells
   crawlers to stay out entirely.

   The host check is what makes that safe. Vite copies client/public/robots.txt
   into client/dist, so under the single-service setup - Express serving the
   built front end, which server.js still supports - the canonical domain is
   answered by this same handler. Sending "Disallow: /" there would deindex the
   whole site.

   When the host cannot be determined the permissive static file wins. An API
   host that is crawlable is a minor, canonical-tag-fixable problem; a site that
   forbids all crawling is not.
   ========================================================================== */

/** The hostname visitors use, derived from SITE_URL so there is one source. */
const CANONICAL_HOST = (() => {
    try {
        return new URL(SITE_URL).hostname.toLowerCase();
    } catch {
        return "";
    }
})();

const robots = (req, res, next) => {
    // x-forwarded-host first: this sits behind a proxy, and req.hostname only
    // reflects the original Host when Express is told to trust one.
    const forwarded = String(req.headers["x-forwarded-host"] || "")
        .split(",")[0]
        .trim();
    const host = (forwarded || req.headers.host || "")
        .toLowerCase()
        .replace(/:\d+$/, "");

    const isCanonical =
        !host ||
        !CANONICAL_HOST ||
        host === CANONICAL_HOST ||
        host === `www.${CANONICAL_HOST}`;

    // Let express.static answer with client/dist/robots.txt, the real one.
    if (isCanonical) return next();

    return res
        .type("text/plain")
        .set("Cache-Control", "public, max-age=86400")
        .set("Vary", "Host")
        .send(
            [
                "# Evently API host.",
                "#",
                "# Not a website. Everything a crawler should see is on the",
                `# canonical domain: ${SITE_URL}`,
                "",
                "User-agent: *",
                "Disallow: /",
                ""
            ].join("\n")
        );
};

/* ==========================================================================
   GET /sitemap.xml
   ========================================================================== */

const urlEntry = ({ loc, lastmod, changefreq, priority }) =>
    [
        "  <url>",
        `    <loc>${escapeXml(loc)}</loc>`,
        lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : null,
        changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
        priority ? `    <priority>${priority}</priority>` : null,
        "  </url>"
    ]
        .filter(Boolean)
        .join("\n");

const sitemap = async (req, res) => {
    const entries = [
        ...STATIC_ROUTES.map((route) => ({
            loc: canonicalUrl(route),
            changefreq: route === "/" || route === "/events" ? "daily" : "monthly",
            priority: route === "/" ? "1.0" : route === "/events" ? "0.9" : "0.5"
        })),
        ...CLUB_ROUTES.map((route) => ({
            loc: canonicalUrl(route),
            changefreq: "monthly",
            priority: "0.6"
        }))
    ];

    // A database blip must not produce a 503 or an empty sitemap. Google treats
    // a sitemap that suddenly loses its URLs as a signal those pages are gone,
    // and repeated errors get the sitemap dropped. The static routes are always
    // true, so serve those and let the next fetch pick the events back up.
    if (isDatabaseReady()) {
        try {
            const since = new Date(Date.now() - PAST_EVENT_WINDOW_DAYS * 86400000);

            const events = await Event.find({ ...VISIBLE, date: { $gte: since } })
                .select("_id updatedAt date")
                .sort({ date: 1 })
                .limit(10000)
                .lean();

            const now = Date.now();

            for (const event of events) {
                const stamp = event.updatedAt ? new Date(event.updatedAt) : null;
                const upcoming = new Date(event.date).getTime() >= now;

                entries.push({
                    loc: canonicalUrl(`/events/${event._id}`),
                    lastmod:
                        stamp && !Number.isNaN(stamp.getTime())
                            ? stamp.toISOString()
                            : undefined,
                    // A finished event never changes again; an upcoming one gains
                    // and loses seats daily.
                    changefreq: upcoming ? "daily" : "yearly",
                    priority: upcoming ? "0.8" : "0.3"
                });
            }
        } catch {
            /* Static routes above are still a valid sitemap. */
        }
    }

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        entries.map(urlEntry).join("\n"),
        "</urlset>",
        ""
    ].join("\n");

    res
        .type("application/xml")
        .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
        .send(xml);
};

/* ==========================================================================
   GET /seo/render/*   (crawlers and social scrapers)
   ========================================================================== */

/**
 * The stored copy for a path, falling back to the parent.
 *
 * /clubs/2 has no entry of its own, so it inherits /clubs rather than dropping
 * to the site default - a venue page described as "the clubs and venues guide"
 * is imperfect but true, where the homepage blurb would be neither.
 */
const copyForPath = (pathname) => {
    if (PAGES[pathname]) return PAGES[pathname];

    const parent = pathname.replace(/\/[^/]*$/, "");
    if (parent && PAGES[parent]) return PAGES[parent];

    return PAGES["/"] || {};
};

/**
 * Builds the document.
 *
 * `body` is not decoration. Serving a page whose visible content differs from
 * what a visitor gets is cloaking, and search engines are among the agents
 * routed here, so the markup carries the same headline, description and details
 * the React page renders.
 */
const renderPage = ({
    title,
    description,
    canonical,
    image,
    imageAlt,
    ogType = "website",
    largeImage = false,
    noindex = false,
    schema = null,
    body = ""
}) => {
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safeCanonical = escapeHtml(canonical);
    const safeImage = escapeHtml(image);

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}" />
<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}" />
<link rel="canonical" href="${safeCanonical}" />
<meta name="theme-color" content="#050510" />
<meta property="og:type" content="${escapeHtml(ogType)}" />
<meta property="og:site_name" content="${BRAND}" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDescription}" />
<meta property="og:url" content="${safeCanonical}" />
<meta property="og:image" content="${safeImage}" />
<meta property="og:image:alt" content="${escapeHtml(imageAlt || title)}" />
<meta property="og:locale" content="en_IN" />
<meta name="twitter:card" content="${largeImage ? "summary_large_image" : "summary"}" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDescription}" />
<meta name="twitter:image" content="${safeImage}" />
${schema ? `<script type="application/ld+json">${escapeJsonLd(schema)}</script>` : ""}
</head>
<body>
${body}
</body>
</html>
`;
};

const organizationNode = () => ({
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
        addressCountry: "IN"
    }
});

const eventNode = (event, seatsLeft) => {
    const startDate = schemaStartDate(event);
    if (!event?.title || !startDate) return null;

    const url = canonicalUrl(`/events/${event._id}`);
    const images = [event.banner, ...(event.gallery || [])].filter(Boolean).map(absoluteUrl);
    const soldOut = Number.isFinite(seatsLeft) && seatsLeft <= 0;

    const node = {
        "@type": "Event",
        name: event.title,
        startDate,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        description: truncate(event.about || event.description, 300),
        url,
        location: {
            "@type": "Place",
            name: event.venue || event.location || "Venue to be announced",
            address: {
                "@type": "PostalAddress",
                streetAddress: event.venue || undefined,
                addressLocality: event.location || undefined,
                addressCountry: "IN"
            }
        },
        organizer: { "@id": `${SITE_URL}/#organization` },
        offers: {
            "@type": "Offer",
            url,
            price: Number(event.price) || 0,
            priceCurrency: "INR",
            availability: soldOut
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock"
        }
    };

    if (images.length) node.image = images;

    const performers = (event.lineup || [])
        .map((act) => act && act.name)
        .filter(Boolean)
        .map((name) => ({ "@type": "PerformingGroup", name }));
    if (performers.length) node.performer = performers;

    const age = /^(\d{1,2})\s*\+$/.exec(String(event.agelim || ""));
    if (age) node.typicalAgeRange = `${age[1]}-`;

    return node;
};

/** The visible half of an event page. */
const eventBody = (event, seatsLeft) => {
    const when = readableDate(event);
    const where = [event.venue, event.location].filter(Boolean).join(", ");
    const rows = [
        when && ["Date", when],
        event.time && ["Doors", event.time],
        where && ["Venue", where],
        ["Ticket", formatPrice(event.price)],
        event.agelim && ["Age", event.agelim],
        Number.isFinite(seatsLeft) && seatsLeft > 0 && ["Seats left", String(seatsLeft)]
    ].filter(Boolean);

    return `<article>
<h1>${escapeHtml(event.title)}</h1>
${event.banner ? `<img src="${escapeHtml(absoluteUrl(event.banner))}" alt="${escapeHtml(event.title)}" width="1200" />` : ""}
${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
<dl>
${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("\n")}
</dl>
${event.about ? `<h2>About this event</h2><p>${escapeHtml(event.about)}</p>` : ""}
${
        (event.lineup || []).some((act) => act && act.name)
            ? `<h2>Line-up</h2><ul>${event.lineup
                .filter((act) => act && act.name)
                .map((act) => `<li>${escapeHtml(act.name)}</li>`)
                .join("")}</ul>`
            : ""
    }
<p><a href="${escapeHtml(canonicalUrl(`/events/${event._id}`))}">Book tickets for ${escapeHtml(event.title)}</a></p>
<nav><a href="${SITE_URL}/events">All events</a> · <a href="${SITE_URL}/clubs">Clubs and venues</a> · <a href="${SITE_URL}/">${BRAND}</a></nav>
</article>`;
};

/** A fixed route: the stored copy, plus links so the crawl keeps moving. */
const staticBody = (title, description, canonical) => `<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(canonical)}">Open this page on ${BRAND}</a></p>
<nav><a href="${SITE_URL}/">Home</a> · <a href="${SITE_URL}/events">Events</a> · <a href="${SITE_URL}/clubs">Clubs</a> · <a href="${SITE_URL}/faq">FAQ</a> · <a href="${SITE_URL}/contact">Contact</a></nav>
</main>`;

const EVENT_PATH = /^\/events\/([a-f\d]{24})$/i;

/**
 * The routes client/public/robots.txt blocks.
 *
 * Match actual client routes, not arbitrary strings beginning with a private
 * prefix. Unknown paths still need a 404 even under an account/operator area.
 * Keep these routes in step with client/src/App.jsx and the robots exclusions.
 */
const PRIVATE_ROUTES = new Set([
    "/login",
    "/profile",
    "/my-bookings",
    "/booking/success",
    "/create-event",
    "/dashboard",
    "/scanner",
    "/admin",
    "/admin/events",
    "/admin/users",
    "/admin/inbox",
    "/admin/analytics",
    "/admin/experience"
]);
const EVENT_OPERATOR_PATH = /^\/events\/[a-f\d]{24}\/(edit|bookings|cash)$/i;

const isPrivatePath = (pathname) =>
    PRIVATE_ROUTES.has(pathname) || EVENT_OPERATOR_PATH.test(pathname);

/* ==========================================================================
   Legacy .html URLs
   --------------------------------------------------------------------------
   The site used to be hand-written pages, and those URLs are still in Google's
   index and in everything anyone has ever shared. client/src/routes/legacy.jsx
   redirects them for real visitors, but that redirect only happens once React
   has run - a scraper never sees it, and a crawler treats a JavaScript redirect
   as a weak hint rather than a move.

   So bots get a genuine 301 instead, which is the only thing that transfers the
   ranking those old URLs still hold onto the new ones.

   This is safe for the Google OAuth callback (/login.html?token=...): only the
   bot user agents listed in client/vercel.json are routed here, and a person
   completing a sign-in is not one of them. The query string is preserved
   regardless, so even a bot following that link lands somewhere valid.

   Keep in step with client/src/routes/legacy.jsx.
   ========================================================================== */

const LEGACY_STATIC = {
    "/index.html": "/",
    "/login.html": "/login",
    "/exp.html": "/experience",
    "/contact.html": "/contact",
    "/faq.html": "/faq",
    "/support.html": "/support",
    "/privacy.html": "/privacy",
    "/terms.html": "/terms",
    "/profile.html": "/profile",
    "/mybookings.html": "/my-bookings",
    "/dashboard.html": "/dashboard",
    "/create-event.html": "/create-event",
    "/scanner.html": "/scanner",
    "/new.html": "/booking/success",
    "/admin/dashboard.html": "/admin",
    "/admin/events.html": "/admin/events",
    "/admin/users.html": "/admin/users",
    "/admin/inbox.html": "/admin/inbox",
    "/admin/analytics.html": "/admin/analytics"
};

/** Legacy pages that carried their record id in the query string. */
const LEGACY_PARAM = {
    "/event.html": { param: "id", prefix: "/events", fallback: "/events" },
    "/club.html": { param: "cid", prefix: "/clubs", fallback: "/clubs" },
    "/edit-event.html": { param: "id", prefix: "/events", suffix: "/edit", fallback: "/dashboard" },
    "/event-bookings.html": { param: "id", prefix: "/events", suffix: "/bookings", fallback: "/dashboard" }
};

/** The new path for a legacy one, or null when it is not a legacy URL. */
const legacyTarget = (pathname, query) => {
    const key = pathname.toLowerCase();

    const withParam = LEGACY_PARAM[key];
    if (withParam) {
        const id = query ? query[withParam.param] : null;
        if (!id) return withParam.fallback;
        // Only ever a Mongo id or a club key - anything else is a probe, and
        // reflecting it into a Location header is how an open redirect starts.
        const clean = String(id).replace(/[^a-z\d-]/gi, "").slice(0, 40);
        if (!clean) return withParam.fallback;
        return `${withParam.prefix}/${clean}${withParam.suffix || ""}`;
    }

    if (LEGACY_STATIC[key]) return LEGACY_STATIC[key];

    // Any other .html path: drop the extension and let the router decide.
    if (key.endsWith(".html")) return pathname.replace(/\.html$/i, "") || "/";

    return null;
};

const render = async (req, res) => {
    // Mounted at /seo/render, so req.path is the original site path.
    const pathname = (req.path || "/").replace(/\/+$/, "") || "/";
    const canonical = canonicalUrl(pathname);

    // Content varies by user agent, so say so. Without this a shared cache could
    // hand this markup to a person, or the visitor's index.html to a scraper.
    res.set("Vary", "User-Agent");
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");

    // Old .html links move for real, before anything else is decided.
    const moved = legacyTarget(pathname, req.query);
    if (moved) return res.redirect(301, canonicalUrl(moved));

    const eventMatch = EVENT_PATH.exec(pathname);
    const isDetailPath = /^\/(events|clubs)\/[^/]+$/.test(pathname);
    const notFound = () => res.status(404).type('html').send(renderPage({ title: formatTitle('Page not found'), description: 'This page does not exist.', canonical, image: absoluteUrl(DEFAULT_OG_IMAGE), noindex: true, body: staticBody('Page not found', 'Browse upcoming events instead.', canonicalUrl('/events')) }));
    if (!PAGES[pathname] && !isDetailPath && !isPrivatePath(pathname)) return notFound();
    if (CLUB_ROUTES.includes(pathname)) {
        const { getClub } = await import('../client/src/data/clubs.js');
        const club = getClub(pathname.split('/').pop());
        return res.type('html').send(renderPage({ title: formatTitle(club.title), description: club.description, canonical, image: absoluteUrl(club.banner), imageAlt: club.title, body: staticBody(club.title, club.description + ' ' + club.address, canonical) }));
    }

    if (eventMatch && isDatabaseReady()) {
        try {
            const event = await Event.findOne({ _id: eventMatch[1], ...VISIBLE }).lean();

            if (event) {
                const seatsLeft = Math.max(
                    Number(event.seats || 0) - Number(event.ticketsSold || 0),
                    0
                );
                const description = truncate(
                    event.description || event.about || "",
                    160
                );
                const when = readableDate(event);
                const where = [event.venue, event.location].filter(Boolean).join(", ");

                // The share card gets the facts a person decides on, because the
                // organiser's own description often omits them.
                const cardDescription =
                    description ||
                    truncate(
                        [when, where, formatPrice(event.price)].filter(Boolean).join(" · "),
                        160
                    );

                const node = eventNode(event, seatsLeft);

                return res.type("html").send(
                    renderPage({
                        title: formatTitle(
                            where ? `${event.title} — ${where}` : event.title
                        ),
                        description: cardDescription,
                        canonical: canonicalUrl(`/events/${event._id}`),
                        image: absoluteUrl(event.banner || DEFAULT_OG_IMAGE),
                        imageAlt: event.title,
                        ogType: "article",
                        // Only ask for the wide card when there is a real banner
                        // behind it. Falling back to the square logo in a
                        // 1.91:1 frame crops it to nothing.
                        largeImage: Boolean(event.banner),
                        schema: {
                            "@context": "https://schema.org",
                            "@graph": [organizationNode(), node].filter(Boolean)
                        },
                        body: eventBody(event, seatsLeft)
                    })
                );
            }

            // Deleted or hidden event. A real 404 keeps it out of the index
            // instead of leaving a stale card in circulation.
            return res.status(404).type("html").send(
                renderPage({
                    title: formatTitle("Event not found"),
                    description:
                        "This event is no longer listed on Evently. Browse what else is coming up.",
                    canonical: canonicalUrl("/events"),
                    image: absoluteUrl(DEFAULT_OG_IMAGE),
                    noindex: true,
                    body: staticBody(
                        "Event not found",
                        "This event is no longer listed. Browse what else is coming up.",
                        canonicalUrl("/events")
                    )
                })
            );
        } catch {
            return res.status(503).set('Retry-After', '300').set('Cache-Control', 'no-store').type('html').send(renderPage({ title: formatTitle('Temporarily unavailable'), description: 'Please try again shortly.', canonical, image: absoluteUrl(DEFAULT_OG_IMAGE), noindex: true, body: staticBody('Temporarily unavailable', 'Please try again shortly.', canonical) }));
        }
    }

    const copy = copyForPath(pathname);
    const title = formatTitle(copy.title, copy.bareTitle === true);
    const description = truncate(copy.description || "", 160);

    /* A detail URL that got this far did not resolve, and copyForPath would
       happily describe it with its parent's copy - so /events/nonsense would
       come back as a 200 titled "All Events", canonicalling to itself. That is a
       soft 404, and enough of them is how a site teaches Google to distrust its
       own URLs. Say not-found instead.

       The one exception is a database outage on a path that *is* a well-formed
       event id: that page probably exists, so 503 asks the crawler to come back
       rather than telling it the event is gone. */
    if (isDetailPath) {
        if (eventMatch && !isDatabaseReady()) {
            return res
                .status(503)
                .set("Retry-After", "300")
                .set("Cache-Control", "no-store")
                .type("html")
                .send(
                    renderPage({
                        title: formatTitle("Temporarily unavailable"),
                        description:
                            "This page is briefly unavailable. Please try again shortly.",
                        canonical,
                        image: absoluteUrl(DEFAULT_OG_IMAGE),
                        noindex: true,
                        body: staticBody(
                            "Temporarily unavailable",
                            "This page is briefly unavailable. Please try again shortly.",
                            canonical
                        )
                    })
                );
        }

        // /clubs/1 through /clubs/4 are real; anything else under either prefix
        // is a dead link or a guess.
        if (!CLUB_ROUTES.includes(pathname)) {
            const isClub = pathname.startsWith("/clubs/");
            const backTo = isClub ? "/clubs" : "/events";
            const heading = isClub ? "Venue not found" : "Event not found";
            const blurb = isClub
                ? "We don't have that venue in the guide. Browse the clubs we cover instead."
                : "This event is no longer listed on Evently. Browse what else is coming up.";

            return res.status(404).type("html").send(
                renderPage({
                    title: formatTitle(heading),
                    description: blurb,
                    canonical: canonicalUrl(backTo),
                    image: absoluteUrl(DEFAULT_OG_IMAGE),
                    noindex: true,
                    body: staticBody(heading, blurb, canonicalUrl(backTo))
                })
            );
        }
    }

    return res.type("html").send(
        renderPage({
            title,
            description,
            canonical,
            image: absoluteUrl(DEFAULT_OG_IMAGE),
            // Two ways a page earns this: its entry in seo-pages.json says so
            // (/login), or it is one of the account and operator routes
            // robots.txt blocks. A crawler obeying robots.txt never gets here,
            // but a scraper that ignores it does, and a signed-out /dashboard
            // has nothing worth indexing.
            noindex: copy.noindex === true || isPrivatePath(pathname),
            body: staticBody(copy.title || BRAND, description, canonical)
        })
    );
};

module.exports = { sitemap, robots, render };
