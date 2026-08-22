import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CalendarBlank,
  CurrencyInr,
  Image as ImageIcon,
  MapPin,
  MapTrifold,
  Plus,
  Trash,
  UploadSimple,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { useToast } from "../../lib/toast";
import { CATEGORIES, CITIES, formatNumber } from "../../lib/constants";
import { ACCEPT_ATTR, uploadImages } from "../../lib/images";
import { respectMotion, riseIn, spring } from "../../motion/presets";

/**
 * The event form, shared by /create-event and /events/:id/edit.
 *
 * One component for both because the field set, the validation and the payload
 * shape are identical - the server's createEvent and updateEvent accept the same
 * keys. Two copies would drift, and the copy that drifted would start sending
 * fields the model rejects.
 *
 * What the server actually requires (models/Events.js): title, description,
 * venue, date, price. Everything else has a default. The validation below mirrors
 * that exactly rather than inventing extra rules, with two additions that come
 * from real behaviour instead of the schema:
 *
 *   - `seats` is optional in the model but a 0 makes the event unbookable, since
 *     bookingController refuses any order above `seats - ticketsSold`. The form
 *     says so instead of letting an organizer publish a dead listing.
 *   - `seats` can never drop below tickets already sold; updateEvent rejects it
 *     with a 400, so the form checks it first and explains why.
 *
 * Images are never free-text URLs: the model's validator only accepts paths under
 * /uploads or /Media, so every image goes through the upload endpoint and the
 * form only ever holds a returned path.
 */

/* ==========================================================================
   Constants
   ========================================================================== */

const AGE_LIMITS = ["All Ages", "13+", "16+", "18+", "21+", "25+"];

const MAX_GALLERY = 12;
const MAX_LINEUP = 20;

/** Matches an <input type="time"> value. Legacy rows may hold "9:00 PM". */
const CLOCK_RE = /^\d{1,2}:\d{2}$/;

/**
 * Lineup rows have no server-side id, and reordering by array index makes
 * removals animate the wrong row out. A local key fixes the identity; toPayload
 * only ever forwards name and image, so it never reaches the API.
 */
let actKeySeed = 0;
const newAct = () => ({ _key: `act-${(actKeySeed += 1)}`, name: "", image: "" });

const EMPTY = {
  title: "",
  description: "",
  about: "",
  venue: "",
  location: "",
  category: "other",
  date: "",
  time: "",
  price: "",
  agelim: "All Ages",
  seats: "",
  banner: "",
  maploc: "",
  gallery: [],
  lineup: [],
  status: "approved",
};

/** Turns an event document into form state. Every value becomes a string. */
export function eventToForm(event) {
  if (!event) return { ...EMPTY };

  let date = "";
  if (event.date) {
    const parsed = new Date(event.date);
    // The stored value is UTC midnight, so slicing the ISO string round-trips
    // it; using local getters would shift the date by a day for some zones.
    if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
  }

  return {
    ...EMPTY,
    title: event.title || "",
    description: event.description || "",
    about: event.about || "",
    venue: event.venue || "",
    location: event.location || "",
    category: String(event.category || "other").toLowerCase(),
    date,
    time: event.time || "",
    price: event.price === 0 || event.price ? String(event.price) : "",
    agelim: event.agelim || "All Ages",
    seats: event.seats === 0 || event.seats ? String(event.seats) : "",
    banner: event.banner || "",
    maploc: event.maploc || "",
    gallery: Array.isArray(event.gallery) ? event.gallery.filter(Boolean) : [],
    lineup: Array.isArray(event.lineup)
      ? event.lineup.map((act) => ({
          ...newAct(),
          name: act?.name || "",
          image: act?.image || "",
        }))
      : [],
    status: event.status || "approved",
  };
}

/* ==========================================================================
   Validation
   ========================================================================== */

function validate(values, { ticketsSold = 0, isNew = true }) {
  const errors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const venue = values.venue.trim();

  if (!title) errors.title = "Give the event a name.";
  else if (title.length > 120) errors.title = "Keep the title under 120 characters.";

  if (!description) errors.description = "Write a short description — this is what shows on the card.";
  else if (description.length < 20)
    errors.description = "A little more detail: at least 20 characters.";

  if (!venue) errors.venue = "Where is it happening?";

  if (!values.date) {
    errors.date = "Pick a date.";
  } else {
    const picked = new Date(`${values.date}T23:59:59`);
    if (Number.isNaN(picked.getTime())) {
      errors.date = "That date isn't valid.";
    } else if (isNew && picked.getTime() < Date.now()) {
      // Blocked on create, allowed on edit: past events still need editing.
      errors.date = "That date has already passed.";
    }
  }

  if (values.price === "") {
    errors.price = "Set a price. Enter 0 for a free event.";
  } else {
    const price = Number(values.price);
    if (!Number.isFinite(price) || price < 0) errors.price = "Price can't be negative.";
    else if (price > 1000000) errors.price = "That price looks like a typo.";
  }

  if (values.seats !== "") {
    const seats = Number(values.seats);
    if (!Number.isInteger(seats) || seats < 0) {
      errors.seats = "Capacity must be a whole number.";
    } else if (seats < ticketsSold) {
      errors.seats = `${formatNumber(ticketsSold)} tickets are already sold — capacity can't go below that.`;
    }
  }

  const maploc = values.maploc.trim();
  if (maploc && !/^https:\/\//i.test(maploc)) {
    errors.maploc = "The map link has to start with https://";
  }

  values.lineup.forEach((act, index) => {
    if (!act.name.trim()) errors[`lineup-${index}`] = "Name this act, or remove the row.";
  });

  return errors;
}

/** Form state -> request body. Numbers become numbers, blanks stay blank. */
function toPayload(values, { canSetStatus }) {
  const payload = {
    title: values.title.trim(),
    description: values.description.trim(),
    about: values.about.trim(),
    venue: values.venue.trim(),
    location: values.location.trim(),
    category: values.category || "other",
    date: values.date,
    time: values.time.trim(),
    price: Number(values.price),
    agelim: values.agelim || "All Ages",
    seats: values.seats === "" ? 0 : Number(values.seats),
    banner: values.banner || "",
    maploc: values.maploc.trim(),
    gallery: values.gallery.filter(Boolean),
    lineup: values.lineup
      .filter((act) => act.name.trim())
      .map((act) => ({ name: act.name.trim(), image: act.image || "" })),
  };
  // Only admins may move an event between pending/approved/rejected; sending it
  // as an organizer is ignored server-side, so don't send it at all.
  if (canSetStatus) payload.status = values.status;
  return payload;
}

/* ==========================================================================
   Section shell
   ========================================================================== */

function Section({ title, description, children }) {
  const reduced = useReducedMotion();
  return (
    <motion.section variants={respectMotion(riseIn, reduced)}>
      <GlassCard elevation={2} radius="xl" className="p-6 sm:p-8">
        <h2 className="text-xl">{title}</h2>
        {description ? (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--color-fg-muted)]">
            {description}
          </p>
        ) : null}
        <div className="mt-7 space-y-6">{children}</div>
      </GlassCard>
    </motion.section>
  );
}

/* ==========================================================================
   Upload control
   ========================================================================== */

/**
 * A real <input type="file"> behind a real <button>. The input stays in the DOM
 * (visually hidden, not display:none) so it remains focusable by assistive tech
 * and the label association holds.
 */
function UploadButton({
  id,
  label,
  multiple = false,
  remaining = 1,
  onUploaded,
  disabled = false,
  size = "sm",
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const toast = useToast();

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = "";
    if (!files.length) return;

    if (files.length > remaining) {
      toast.warning(
        `Room for ${remaining} more ${remaining === 1 ? "image" : "images"}.`
      );
      return;
    }

    setBusy(true);
    setProgress({ phase: "processing", done: 0, total: files.length });
    try {
      const paths = await uploadImages(files, { onProgress: setProgress });
      onUploaded(paths);
      toast.success(
        paths.length === 1 ? "Image uploaded." : `${paths.length} images uploaded.`
      );
    } catch (err) {
      toast.error(err?.message || "That upload didn't go through.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={multiple}
        onChange={handleFiles}
        disabled={disabled || busy}
        className="sr-only"
      />
      <Button
        variant="secondary"
        size={size}
        loading={busy}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <UploadSimple size={16} aria-hidden="true" />
        {label}
      </Button>
      {progress ? (
        <span role="status" className="text-xs text-[var(--color-fg-subtle)]">
          {progress.phase === "processing" ? "Resizing" : "Uploading"}{" "}
          <span className="tnum">
            {progress.done}/{progress.total}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Image previews
   ========================================================================== */

function ImageTile({ src, alt, onRemove, removeLabel, className = "" }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--glass-edge)] bg-[var(--color-card)] ${className}`}
    >
      <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full bg-[rgba(8,7,18,0.72)] text-white backdrop-blur-sm transition-colors hover:bg-[var(--color-danger)]"
      >
        <Trash size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/* ==========================================================================
   Form
   ========================================================================== */

export default function EventForm({
  initial,
  ticketsSold = 0,
  isNew = true,
  canSetStatus = false,
  submitLabel = "Publish event",
  submitting = false,
  serverError = null,
  onSubmit,
  onCancel,
}) {
  const reduced = useReducedMotion();
  const [values, setValues] = useState(() => initial || { ...EMPTY });
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Decided once, from the value we were handed: an <input type="time"> silently
  // discards anything that isn't HH:MM, which would wipe a legacy "9:00 PM" the
  // moment the form saved. Those rows get a text input instead.
  const [timeIsClock] = useState(
    () => !initial?.time || CLOCK_RE.test(initial.time)
  );

  const errors = useMemo(
    () => validate(values, { ticketsSold, isNew }),
    [values, ticketsSold, isNew]
  );

  const shown = useCallback(
    (name) => (touched[name] || submitAttempted ? errors[name] : undefined),
    [touched, submitAttempted, errors]
  );

  const set = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const field = (name) => ({
    id: `event-${name}`,
    name,
    value: values[name],
    onChange: (e) => set(name, e.target.value),
    onBlur: () => setTouched((prev) => ({ ...prev, [name]: true })),
    error: shown(name),
  });

  /* ---------- lineup ---------- */

  const addAct = () =>
    setValues((prev) => ({
      ...prev,
      lineup: [...prev.lineup, newAct()],
    }));

  const setAct = (index, patch) =>
    setValues((prev) => ({
      ...prev,
      lineup: prev.lineup.map((act, i) => (i === index ? { ...act, ...patch } : act)),
    }));

  const removeAct = (index) =>
    setValues((prev) => ({
      ...prev,
      lineup: prev.lineup.filter((_, i) => i !== index),
    }));

  /* ---------- submit ---------- */

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitAttempted(true);

    const found = validate(values, { ticketsSold, isNew });
    const keys = Object.keys(found);
    if (keys.length) {
      // Move focus to the first problem rather than leaving the user to hunt
      // for it (error-recovery). Lineup errors are keyed `lineup-<index>`, which
      // is exactly the suffix those inputs use.
      const target = document.getElementById(`event-${keys[0]}`);
      target?.focus({ preventScroll: false });
      target?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });
      return;
    }

    onSubmit(toPayload(values, { canSetStatus }));
  };

  const galleryRoom = MAX_GALLERY - values.gallery.length;

  return (
    <motion.form
      noValidate
      onSubmit={handleSubmit}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="space-y-6"
    >
      {/* ---------- Basics ---------- */}
      <Section
        title="The basics"
        description="The title and description are what people see before anything else."
      >
        <Input
          {...field("title")}
          label="Event title"
          required
          placeholder="Neon Nights: Season Opener"
          maxLength={120}
          autoComplete="off"
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <Select
            {...field("category")}
            label="Category"
            options={CATEGORIES.map(({ value, label }) => ({ value, label }))}
            helper="Drives the filters on the events page."
          />
          <Select
            {...field("agelim")}
            label="Age limit"
            options={AGE_LIMITS}
            helper="Shown as a badge on the event page."
          />
        </div>

        <Textarea
          {...field("description")}
          label="Short description"
          required
          rows={3}
          maxLength={400}
          placeholder="One or two lines that sell it."
          helper="Appears on event cards and search results."
        />

        <Textarea
          {...field("about")}
          label="Full details"
          optional
          rows={6}
          maxLength={4000}
          placeholder="Set list, dress code, what's included, house rules…"
          helper="The long version, shown on the event page only."
        />
      </Section>

      {/* ---------- When and where ---------- */}
      <Section title="When and where">
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            {...field("date")}
            type="date"
            label="Date"
            required
            icon={CalendarBlank}
          />
          {timeIsClock ? (
            <Input {...field("time")} type="time" label="Start time" optional />
          ) : (
            <Input
              {...field("time")}
              label="Start time"
              optional
              helper="Kept as text because this event was saved in a free-form format."
            />
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            {...field("venue")}
            label="Venue"
            required
            icon={MapPin}
            placeholder="Hard Rock Cafe"
            autoComplete="off"
          />
          <Input
            {...field("location")}
            label="City"
            optional
            list="event-city-list"
            placeholder="Ludhiana"
            helper="Used by the city filter."
            autoComplete="address-level2"
          />
          <datalist id="event-city-list">
            {CITIES.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </div>

        <Input
          {...field("maploc")}
          label="Map embed link"
          optional
          icon={MapTrifold}
          placeholder="https://www.google.com/maps/embed?pb=…"
          helper="Google Maps → Share → Embed a map → copy the src URL. A normal maps link won't display."
        />
        {values.maploc.trim() &&
        /^https:\/\//i.test(values.maploc) &&
        !/embed/i.test(values.maploc) ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--color-warning)]">
            <WarningCircle size={14} weight="fill" className="mt-px shrink-0" aria-hidden="true" />
            That doesn't look like an embed URL. Share links refuse to load in a
            frame, so the map would come out blank.
          </p>
        ) : null}
      </Section>

      {/* ---------- Tickets ---------- */}
      <Section
        title="Tickets"
        description="Capacity is what the booking flow checks. Leave it at 0 and nobody can book."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            {...field("price")}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            label="Price per ticket"
            required
            icon={CurrencyInr}
            placeholder="499"
            helper="Enter 0 for a free event."
          />
          <Input
            {...field("seats")}
            type="number"
            inputMode="numeric"
            min={ticketsSold || 0}
            step="1"
            label="Capacity"
            icon={Users}
            placeholder="200"
            helper={
              ticketsSold > 0
                ? `${formatNumber(ticketsSold)} already sold — can't go lower.`
                : "Total seats available."
            }
          />
        </div>
      </Section>

      {/* ---------- Images ---------- */}
      <Section
        title="Images"
        description="Uploads are resized in your browser before they're sent, so a photo straight off a phone is fine."
      >
        <Field
          label="Banner"
          htmlFor="event-banner-upload"
          helper="The wide image behind the event title. 16:9 or wider works best."
        >
          {values.banner ? (
            <div className="space-y-3">
              <ImageTile
                src={values.banner}
                alt="Event banner preview"
                removeLabel="Remove banner"
                onRemove={() => set("banner", "")}
                className="aspect-[16/9] w-full max-w-lg"
              />
              <UploadButton
                id="event-banner-upload"
                label="Replace banner"
                onUploaded={([path]) => set("banner", path)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4 rounded-[var(--radius-md)] border border-dashed border-[var(--glass-edge-strong)] p-6">
              <span
                className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
                aria-hidden="true"
              >
                <ImageIcon size={22} />
              </span>
              <p className="text-sm text-[var(--color-fg-muted)]">
                No banner yet. Events without one fall back to a plain gradient.
              </p>
              <UploadButton
                id="event-banner-upload"
                label="Upload banner"
                onUploaded={([path]) => set("banner", path)}
              />
            </div>
          )}
        </Field>

        <Field
          label="Gallery"
          htmlFor="event-gallery-upload"
          optional
          helper={`Up to ${MAX_GALLERY} photos from past editions or the venue.`}
          hint={
            values.gallery.length ? (
              <span className="tnum">
                {values.gallery.length}/{MAX_GALLERY}
              </span>
            ) : null
          }
        >
          {values.gallery.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AnimatePresence initial={false}>
                {values.gallery.map((path, index) => (
                  <motion.li
                    key={path}
                    layout={!reduced}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                    transition={reduced ? { duration: 0.12 } : spring.snap}
                  >
                    <ImageTile
                      src={path}
                      alt={`Gallery image ${index + 1}`}
                      removeLabel={`Remove gallery image ${index + 1}`}
                      onRemove={() =>
                        set(
                          "gallery",
                          values.gallery.filter((item) => item !== path)
                        )
                      }
                      className="aspect-square w-full"
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : null}

          <UploadButton
            id="event-gallery-upload"
            label={values.gallery.length ? "Add more" : "Upload photos"}
            multiple
            remaining={galleryRoom}
            disabled={galleryRoom <= 0}
            onUploaded={(paths) =>
              set("gallery", [...values.gallery, ...paths].slice(0, MAX_GALLERY))
            }
          />
          {galleryRoom <= 0 ? (
            <p className="text-xs text-[var(--color-fg-subtle)]">
              Gallery is full. Remove one to add another.
            </p>
          ) : null}
        </Field>
      </Section>

      {/* ---------- Lineup ---------- */}
      <Section
        title="Lineup"
        description="Artists, speakers or hosts. Skip it if there isn't one."
      >
        {values.lineup.length ? (
          <ul className="space-y-4">
            <AnimatePresence initial={false}>
              {values.lineup.map((act, index) => (
                <motion.li
                  key={act._key || index}
                  layout={!reduced}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={reduced ? { duration: 0.12 } : spring.snap}
                  className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--glass-edge)] p-4 sm:flex-row sm:items-start"
                >
                  <div className="shrink-0">
                    {act.image ? (
                      <ImageTile
                        src={act.image}
                        alt={act.name ? `${act.name} photo` : "Act photo"}
                        removeLabel={`Remove photo for act ${index + 1}`}
                        onRemove={() => setAct(index, { image: "" })}
                        className="size-24"
                      />
                    ) : (
                      <div className="grid size-24 place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--glass-edge-strong)] text-[var(--color-fg-subtle)]">
                        <ImageIcon size={20} aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <Input
                      id={`event-lineup-${index}`}
                      label={`Act ${index + 1}`}
                      value={act.name}
                      onChange={(e) => setAct(index, { name: e.target.value })}
                      onBlur={() =>
                        setTouched((prev) => ({ ...prev, [`lineup-${index}`]: true }))
                      }
                      error={shown(`lineup-${index}`)}
                      placeholder="DJ Nucleya"
                      autoComplete="off"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <UploadButton
                        id={`event-lineup-${index}-image`}
                        label={act.image ? "Replace photo" : "Add photo"}
                        onUploaded={([path]) => setAct(index, { image: path })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAct(index)}
                      >
                        <Trash size={15} aria-hidden="true" />
                        Remove act
                      </Button>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          onClick={addAct}
          disabled={values.lineup.length >= MAX_LINEUP}
        >
          <Plus size={16} aria-hidden="true" />
          {values.lineup.length ? "Add another act" : "Add an act"}
        </Button>
      </Section>

      {/* ---------- Admin-only status ---------- */}
      {canSetStatus ? (
        <Section
          title="Moderation"
          description="Admin only. Rejected and pending events stay hidden from the public listing."
        >
          <Select
            {...field("status")}
            label="Listing status"
            options={[
              { value: "approved", label: "Approved — publicly listed" },
              { value: "pending", label: "Pending — awaiting review" },
              { value: "rejected", label: "Rejected — hidden" },
            ]}
          />
        </Section>
      ) : null}

      {/* ---------- Submit ---------- */}
      <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-1 pt-4">
        <GlassCard elevation={3} radius="xl" className="p-4 sm:p-5">
          {serverError ? (
            <p
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] p-3 text-sm text-[#fca5a5]"
            >
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="wrap-anywhere">{serverError}</span>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-[var(--color-fg-subtle)]">
              {submitAttempted && Object.keys(errors).length ? (
                <span className="text-[#fca5a5]">
                  {Object.keys(errors).length}{" "}
                  {Object.keys(errors).length === 1 ? "field needs" : "fields need"}{" "}
                  attention.
                </span>
              ) : (
                <>Fields marked * are required.</>
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              {onCancel ? (
                <Button variant="ghost" onClick={onCancel} disabled={submitting}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" variant="primary" loading={submitting}>
                {submitLabel}
              </Button>
            </div>
          </div>
        </GlassCard>
      </div>
    </motion.form>
  );
}
