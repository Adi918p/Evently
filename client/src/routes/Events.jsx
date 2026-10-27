import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarSlash, FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import Button from "../components/ui/Button";
import { Chip } from "../components/ui/Badge";
import { Input, Select } from "../components/ui/Field";
import EventCard from "../components/events/EventCard";
import { RevealGroup } from "../components/ui/Reveal";
import { EmptyState, ErrorState, SkeletonGrid } from "../components/ui/Feedback";
import Seo from "../components/seo/Seo";
import { events as eventsApi } from "../lib/api";
import { useApi } from "../lib/useApi";
import {
  breadcrumbSchema,
  graph,
  itemListSchema,
  truncate,
} from "../lib/seo";
import {
  CATEGORIES,
  CITIES,
  eventDate,
  formatNumber,
  isPastEvent,
} from "../lib/constants";

/* ==========================================================================
   Filter state lives in the URL
   --------------------------------------------------------------------------
   Every filtered view is therefore a shareable, bookmarkable, back-button
   friendly link (deep-linking). The inputs are controlled by the URL, not by
   local state that has to be kept in sync with it.
   ========================================================================== */

const SORTS = [
  { value: "soonest", label: "Date: soonest first" },
  { value: "latest", label: "Date: latest first" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
];

const numeric = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function sortEvents(list, sort) {
  const copy = [...list];
  switch (sort) {
    case "latest":
      return copy.sort((a, b) => (eventDate(b) ?? 0) - (eventDate(a) ?? 0));
    case "price-low":
      return copy.sort((a, b) => numeric(a.price) - numeric(b.price));
    case "price-high":
      return copy.sort((a, b) => numeric(b.price) - numeric(a.price));
    case "soonest":
    default:
      return copy.sort((a, b) => {
        const da = eventDate(a);
        const db = eventDate(b);
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      });
  }
}

/* ==========================================================================
   Filter bar
   ========================================================================== */

function FilterBar({ params, setParam, setSearch, clearAll, activeCount }) {
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(params.q);
  const [cityDraft, setCityDraft] = useState(params.city);

  // Keep the text box in step when the URL changes from elsewhere (nav search
  // overlay, back button) without fighting the user mid-type.
  useEffect(() => setDraft(params.q), [params.q]);
  useEffect(() => setCityDraft(params.city), [params.city]);

  const submit = (event) => {
    event.preventDefault();
    setSearch(draft.trim(), cityDraft.trim());
  };

  return (
    <div
      className="glass glass-3 sticky rounded-[var(--radius-xl)] p-5"
      style={{ top: "calc(var(--nav-h) + 0.75rem)", zIndex: "var(--z-sticky)" }}
    >
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto]">
        <Input
          label="Search"
          icon={MagnifyingGlass}
          type="search"
          name="q"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Artist, event, venue…"
          enterKeyHint="search"
        />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="city-filter"
            className="text-sm font-medium text-[var(--color-fg-muted)]"
          >
            City
          </label>
          <input
            id="city-filter"
            name="city"
            list="cities"
            value={cityDraft}
            onChange={(e) => setCityDraft(e.target.value)}
            placeholder="Anywhere"
            autoComplete="address-level2"
            className="w-full min-h-12 rounded-[var(--radius-md)] border border-[var(--glass-edge)] bg-[rgba(255,255,255,0.04)] px-4 text-base text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] hover:border-[var(--glass-edge-strong)] focus:border-[var(--color-violet-bright)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-violet)_28%,transparent)]"
          />
          <datalist id="cities">
            {CITIES.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </div>

        <Input
          label="Date"
          type="date"
          name="date"
          value={params.date}
          onChange={(e) => setParam("date", e.target.value)}
        />

        <div className="flex items-end">
          <Button type="submit" variant="primary" fullWidth className="md:w-auto">
            Search
          </Button>
        </div>
      </form>

      <fieldset className="mt-5 border-0 p-0">
        <legend className="sr-only">Filter by category</legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            active={!params.category}
            onClick={() => setParam("category", "")}
          >
            All
          </Chip>
          {CATEGORIES.map(({ value, label, icon: Icon }) => (
            <Chip
              key={value}
              icon={Icon}
              active={params.category === value}
              onClick={() =>
                setParam("category", params.category === value ? "" : value)
              }
            >
              {label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <AnimatePresence initial={false}>
        {activeCount > 0 ? (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 pt-4">
              <p className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
                <FunnelSimple size={14} aria-hidden="true" />
                <span className="tnum">{activeCount}</span> filter
                {activeCount === 1 ? "" : "s"} applied
              </p>
              <Button variant="ghost" size="sm" onClick={() => { setDraft(""); setCityDraft(""); clearAll(); }}>
                <X size={14} weight="bold" aria-hidden="true" />
                Clear all
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function Events() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(
    () => ({
      q: searchParams.get("q") ?? "",
      city: searchParams.get("city") ?? "",
      category: searchParams.get("category") ?? "",
      date: searchParams.get("date") ?? "",
    }),
    [searchParams]
  );

  const [sort, setSort] = useState("soonest");
  const [includePast, setIncludePast] = useState(false);

  const setParam = useCallback(
    (key, value) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearAll = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: true }),
    [setSearchParams]
  );

  const setSearch = useCallback((query, city) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (query) next.set('q', query); else next.delete('q');
      if (city) next.set('city', city); else next.delete('city');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const activeCount = useMemo(
    () => Object.values(params).filter(Boolean).length,
    [params]
  );

  // The server does the filtering, so the query is part of the fetch key.
  const { data, loading, error, reload } = useApi(
    (signal) =>
      eventsApi.list(
        {
          query: params.q,
          city: params.city,
          category: params.category,
          date: params.date,
        },
        signal
      ),
    [params.q, params.city, params.category, params.date]
  );

  const all = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const visible = useMemo(() => {
    const filtered = includePast ? all : all.filter((e) => !isPastEvent(e));
    return sortEvents(filtered, sort);
  }, [all, includePast, sort]);

  const hiddenPast = all.length - all.filter((e) => !isPastEvent(e)).length;

  /* ---------- Search and share ----------
     Every filter combination is a distinct URL, and <Seo> canonicalises all of
     them back to /events (lib/seo.js drops the query string), so the dozens of
     near-identical listing URLs consolidate into one ranking signal instead of
     competing with each other. robots.txt deliberately leaves them crawlable —
     a blocked page is a page whose canonical tag nobody ever reads.

     The title still describes the filtered view, because that is what shows in
     the tab and in a bookmark. */
  const filterLabel = [
    CATEGORIES.find((c) => c.value === params.category)?.label,
    params.city && `in ${params.city}`,
  ]
    .filter(Boolean)
    .join(" ");

  const listingTitle = params.q
    ? `“${params.q}” — event search`
    : filterLabel
      ? `${filterLabel} — events`
      : null; // null falls back to the copy in data/seo-pages.json

  const listingSchema = graph(
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Events", path: "/events" },
    ]),
    // Only the first 20: an ItemList is a summary of the page, and a crawler
    // gains nothing from a hundred URLs it will reach through the links anyway.
    visible.length ? itemListSchema(visible.slice(0, 20)) : null
  );

  return (
    <div className="shell section">
      <Seo
        title={listingTitle}
        description={
          listingTitle
            ? truncate(
                `${visible.length ? formatNumber(visible.length) : "No"} ${
                  visible.length === 1 ? "event" : "events"
                } matching your search on Evently. Filter by city, category or date and book in seconds.`
              )
            : undefined
        }
        path="/events"
        schema={listingSchema}
      />
      <header className="max-w-2xl space-y-3">
        <p className="kicker">Browse</p>
        <h1 className="text-4xl">
          {params.q ? (
            <>
              Results for{" "}
              <span className="text-grad-brand wrap-anywhere">“{params.q}”</span>
            </>
          ) : (
            "Every event, all in one place"
          )}
        </h1>
        <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">
          Filter by city, category or date. Apply your search, then share the
          link to send this exact view to someone else.
        </p>
      </header>

      <div className="mt-10">
        <FilterBar
          params={params}
          setParam={setParam}
          setSearch={setSearch}
          clearAll={clearAll}
          activeCount={activeCount}
        />
      </div>

      {/* Result count + view controls. aria-live so a screen reader hears the
          new count after filtering without focus moving. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p
          className="text-sm text-[var(--color-fg-muted)]"
          role="status"
          aria-live="polite"
        >
          {loading
            ? "Loading events…"
            : error
              ? "Couldn't load events"
              : `${formatNumber(visible.length)} event${
                  visible.length === 1 ? "" : "s"
                }${includePast ? "" : " coming up"}`}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {hiddenPast > 0 || includePast ? (
            <Chip
              active={includePast}
              icon={CalendarSlash}
              onClick={() => setIncludePast((value) => !value)}
            >
              Include past
            </Chip>
          ) : null}

          <Select
            aria-label="Sort events"
            options={SORTS}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="min-h-11 w-auto py-0 text-sm"
            fieldClassName="w-auto"
          />
        </div>
      </div>

      <div className="mt-8">
        {loading ? <SkeletonGrid count={6} /> : null}

        {!loading && error ? (
          <ErrorState
            title="Couldn't load events"
            message={error.message}
            onRetry={reload}
          />
        ) : null}

        {!loading && !error && visible.length === 0 ? (
          <EmptyState
            icon={MagnifyingGlass}
            title={
              activeCount > 0 ? "Nothing matches those filters" : "No events yet"
            }
            description={
              activeCount > 0
                ? "Try a wider date range, a different city, or clear the filters and start again."
                : "Nothing is listed right now. Check back soon, or list your own event."
            }
            action={activeCount > 0 ? "Clear filters" : "Create an event"}
            actionTo={activeCount > 0 ? undefined : "/create-event"}
            onAction={activeCount > 0 ? clearAll : undefined}
          />
        ) : null}

        {!loading && !error && visible.length > 0 ? (
          <RevealGroup
            as="ul"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {visible.map((event, i) => (
              <li key={event._id} className="contents">
                <EventCard event={event} index={i} />
              </li>
            ))}
          </RevealGroup>
        ) : null}
      </div>
    </div>
  );
}
