import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  absoluteUrl,
  BRAND,
  canonicalUrl,
  DEFAULT_OG_IMAGE,
  formatTitle,
  pageSeo,
  truncate,
} from "../../lib/seo";

/* ==========================================================================
   Head management
   --------------------------------------------------------------------------
   React 19 can hoist <title> and <meta> rendered from a component, and this
   file deliberately does not use that.

   Hoisting appends. index.html already ships a description and a set of og:
   tags so that a scraper hitting a cold page is not met with a blank card, and
   rendering a second <meta name="description"> leaves both in the document with
   no defined winner. Updating the existing node in place is the only way to
   have real defaults in the HTML *and* per-route values, without duplicates.

   The rule that keeps this honest: every helper below is called on every route
   with a resolved value. Nothing is conditional, so no tag can survive a
   navigation carrying the previous page's content.
   ========================================================================== */

/**
 * `attr` is "name" or "property" — Open Graph uses property=, Twitter and the
 * standard metas use name=, and querying for the wrong one silently creates a
 * duplicate alongside the tag from index.html.
 */
function upsertMeta(attr, key, content) {
  const existing = document.head.querySelector(`meta[${attr}="${key}"]`);

  if (!content) {
    // Only remove what this component created. A tag from index.html is a
    // default worth keeping.
    if (existing?.dataset.seo) existing.remove();
    return;
  }

  const tag = existing || document.createElement("meta");
  if (!existing) {
    tag.setAttribute(attr, key);
    tag.dataset.seo = "1";
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertLink(rel, href) {
  const existing = document.head.querySelector(`link[rel="${rel}"]`);

  if (!href) {
    if (existing?.dataset.seo) existing.remove();
    return;
  }

  const tag = existing || document.createElement("link");
  if (!existing) {
    tag.setAttribute("rel", rel);
    tag.dataset.seo = "1";
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

/** One <script> holding the whole @graph, replaced wholesale per route. */
function upsertJsonLd(data) {
  const existing = document.head.querySelector("script[data-seo-jsonld]");

  if (!data) {
    existing?.remove();
    return;
  }

  const tag = existing || document.createElement("script");
  if (!existing) {
    tag.type = "application/ld+json";
    tag.dataset.seoJsonld = "1";
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

/* ==========================================================================
   Seo
   ========================================================================== */

/**
 * Declares what this route is, for crawlers and for share cards.
 *
 * Every route renders one — including the private and admin pages, which pass
 * `noindex`. That is not defensive padding: a route without a <Seo> inherits
 * whatever the previous route wrote, so /admin/users would share the last
 * event's title and image.
 *
 * Fixed routes can pass nothing at all and pick up their copy from
 * data/seo-pages.json, which the server-side prerender reads too.
 *
 * @param {string}  [title]        Page title. Gets " | Evently" appended.
 * @param {boolean} [bareTitle]    Use `title` verbatim instead.
 * @param {string}  [description]  Trimmed to 160 characters.
 * @param {string}  [path]         Canonical path. Defaults to the current route.
 * @param {string}  [image]        App-relative or absolute; made absolute here.
 * @param {string}  [imageAlt]
 * @param {boolean} [noindex]      Keep out of the index, still follow links.
 * @param {string}  [ogType]       "website" | "article" | "event".
 * @param {object}  [schema]       JSON-LD graph from lib/seo.js `graph()`.
 */
export default function Seo({
  title,
  bareTitle = false,
  description,
  path,
  image,
  imageAlt,
  noindex = false,
  ogType = "website",
  schema = null,
}) {
  const { pathname } = useLocation();

  // A fixed route's stored copy is the fallback for anything not passed in, so
  // /faq needs no props while /events/:id overrides everything.
  const stored = pageSeo(path || pathname) || {};

  const resolvedTitle = formatTitle(title || stored.title, {
    bare: bareTitle || stored.bareTitle === true,
  });
  const resolvedDescription = truncate(description || stored.description || "");
  const resolvedCanonical = canonicalUrl(path || pathname);
  const resolvedImage = absoluteUrl(image || DEFAULT_OG_IMAGE);
  const resolvedNoindex = noindex || stored.noindex === true;

  // Schemas are rebuilt on every render, so the object identity always
  // changes. Comparing the serialised form keeps the effect from rewriting an
  // identical <script> on unrelated state changes (a ticket stepper, a filter).
  const schemaKey = schema ? JSON.stringify(schema) : "";

  useEffect(() => {
    document.title = resolvedTitle;

    upsertMeta("name", "description", resolvedDescription);
    upsertMeta(
      "name",
      "robots",
      resolvedNoindex ? "noindex, follow" : "index, follow, max-image-preview:large"
    );
    upsertLink("canonical", resolvedCanonical);

    upsertMeta("property", "og:type", ogType);
    upsertMeta("property", "og:site_name", BRAND);
    upsertMeta("property", "og:title", resolvedTitle);
    upsertMeta("property", "og:description", resolvedDescription);
    upsertMeta("property", "og:url", resolvedCanonical);
    upsertMeta("property", "og:image", resolvedImage);
    upsertMeta("property", "og:image:alt", imageAlt || resolvedTitle);
    upsertMeta("property", "og:locale", "en_IN");

    // summary_large_image needs an image to be large; with only the square
    // logo, the small card is the honest choice and looks better.
    upsertMeta(
      "name",
      "twitter:card",
      image ? "summary_large_image" : "summary"
    );
    upsertMeta("name", "twitter:title", resolvedTitle);
    upsertMeta("name", "twitter:description", resolvedDescription);
    upsertMeta("name", "twitter:image", resolvedImage);

    upsertJsonLd(schemaKey ? JSON.parse(schemaKey) : null);
  }, [
    resolvedTitle,
    resolvedDescription,
    resolvedCanonical,
    resolvedImage,
    resolvedNoindex,
    imageAlt,
    ogType,
    image,
    schemaKey,
  ]);

  return null;
}
