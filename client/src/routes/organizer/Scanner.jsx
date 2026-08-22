import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  Camera,
  CameraSlash,
  CheckCircle,
  Keyboard,
  MagnifyingGlass,
  SpeakerHigh,
  SpeakerSlash,
  Ticket,
  UserCircle,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { Input, Select } from "../../components/ui/Field";
import { EmptyState, ErrorState, Loader } from "../../components/ui/Feedback";
import { Reveal } from "../../components/ui/Reveal";
import { useApi } from "../../lib/useApi";
import {
  events as eventsApi,
  bookings as bookingsApi,
} from "../../lib/api";
import { eventDate, formatNumber, isPastEvent } from "../../lib/constants";
import { spring } from "../../motion/presets";

/**
 * Door scanner.
 *
 * The design is dictated by three facts about the backend:
 *
 * 1. POST /api/bookings/verify-ticket takes a booking `_id`, but the QR encoded
 *    at booking time only carries `bookingId` for paid tickets. Free ones encode
 *    { ticketId, eventId, userId }. So the page loads the chosen event's guest
 *    list up front and resolves either shape locally against it.
 *
 * 2. verifyTicket does not check that the booking belongs to an event you own -
 *    any organizer id would be accepted. Resolving against the loaded roster
 *    first means a ticket for someone else's event is refused here rather than
 *    silently marked as used.
 *
 * 3. verifyTicket also does not check `status`, so a cancelled booking would be
 *    checked in happily. That is caught locally too.
 *
 * Camera decoding uses the built-in BarcodeDetector. No QR library is bundled,
 * and Safari and Firefox do not ship the API, so the manual ticket-ID entry and
 * the tap-to-admit list are the real interface - the camera is the shortcut when
 * the browser happens to support it (gesture-alternative).
 */

/** Ignore the same code re-appearing in consecutive video frames. */
const RESCAN_MS = 2500;

/* ==========================================================================
   Feedback at a loud door
   ========================================================================== */

let audioContext = null;

/** Short blip. Two tones so "in" and "no" are distinguishable without looking. */
function blip(ok) {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioContext = audioContext || new Ctor();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 260;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (ok ? 0.16 : 0.32));
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + (ok ? 0.18 : 0.34));
  } catch {
    /* audio is a nicety, never a requirement */
  }
}

function buzz(ok) {
  try {
    navigator.vibrate?.(ok ? 40 : [60, 50, 60]);
  } catch {
    /* ignore */
  }
}

/* ==========================================================================
   Payload parsing
   ========================================================================== */

/**
 * Accepts a raw QR string or a hand-typed ticket id and returns whatever
 * identifiers it can find. Nothing here trusts the payload - it is only used to
 * look up a booking in the roster we already fetched.
 */
function readPayload(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ticketId: null, bookingId: null, eventId: null };

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      return {
        ticketId: parsed.ticketId ? String(parsed.ticketId) : null,
        bookingId: parsed.bookingId ? String(parsed.bookingId) : null,
        eventId: parsed.eventId ? String(parsed.eventId) : null,
      };
    } catch {
      /* not JSON after all - treat the whole thing as a ticket id */
    }
  }

  return { ticketId: text, bookingId: null, eventId: null };
}

/* ==========================================================================
   Result banner
   ========================================================================== */

const TONES = {
  ok: {
    Icon: CheckCircle,
    color: "var(--color-success)",
    border: "color-mix(in srgb, var(--color-success) 50%, transparent)",
    bg: "color-mix(in srgb, var(--color-success) 14%, transparent)",
  },
  warn: {
    Icon: WarningCircle,
    color: "var(--color-warning)",
    border: "color-mix(in srgb, var(--color-warning) 50%, transparent)",
    bg: "color-mix(in srgb, var(--color-warning) 14%, transparent)",
  },
  bad: {
    Icon: XCircle,
    color: "var(--color-danger)",
    border: "color-mix(in srgb, var(--color-danger) 50%, transparent)",
    bg: "color-mix(in srgb, var(--color-danger) 14%, transparent)",
  },
};

function Verdict({ result }) {
  const reduced = useReducedMotion();
  const tone = TONES[result?.tone] || TONES.warn;
  const { Icon } = tone;

  return (
    <AnimatePresence mode="wait">
      {result ? (
        <motion.div
          key={result.key}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          transition={spring.snap}
          className="flex items-start gap-4 rounded-[var(--radius-lg)] border p-5"
          style={{ borderColor: tone.border, background: tone.bg }}
        >
          <span aria-hidden="true" className="shrink-0" style={{ color: tone.color }}>
            <Icon size={30} weight="fill" />
          </span>
          <div className="min-w-0">
            <p
              className="font-display text-lg font-bold leading-tight"
              style={{ color: tone.color }}
            >
              {result.title}
            </p>
            {result.detail ? (
              <p className="wrap-anywhere mt-1 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {result.detail}
              </p>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function Scanner() {
  const reduced = useReducedMotion();

  const [eventId, setEventId] = useState("");
  const [manual, setManual] = useState("");
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [admitted, setAdmitted] = useState([]);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const loopRef = useRef(0);
  const lastScan = useRef({ code: "", at: 0 });
  const resultKey = useRef(0);

  /** Only advertise camera scanning where the browser can actually decode. */
  const cameraSupported =
    typeof window !== "undefined" &&
    "BarcodeDetector" in window &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  /* ---------- Data ---------- */

  const mine = useApi((signal) => eventsApi.mine(signal), []);

  const roster = useApi(
    (signal) => eventsApi.bookings(eventId, signal),
    [eventId],
    { enabled: Boolean(eventId) }
  );

  const myEvents = useMemo(() => {
    const list = Array.isArray(mine.data?.events) ? mine.data.events : [];
    // Tonight's door is the common case, so upcoming events sort first.
    return [...list].sort((a, b) => {
      const aPast = isPastEvent(a) ? 1 : 0;
      const bPast = isPastEvent(b) ? 1 : 0;
      if (aPast !== bPast) return aPast - bPast;
      return (eventDate(a)?.getTime() ?? 0) - (eventDate(b)?.getTime() ?? 0);
    });
  }, [mine.data]);

  // Preselect the next upcoming event: at a door there is usually only one
  // answer, and making someone pick it every time is friction for nothing.
  useEffect(() => {
    if (eventId || !myEvents.length) return;
    const next = myEvents.find((event) => !isPastEvent(event)) || myEvents[0];
    if (next?._id) setEventId(next._id);
  }, [eventId, myEvents]);

  const bookings = useMemo(
    () => (Array.isArray(roster.data?.bookings) ? roster.data.bookings : []),
    [roster.data]
  );

  const selectedEvent = useMemo(
    () => myEvents.find((event) => event._id === eventId) || null,
    [myEvents, eventId]
  );

  const doorCount = useMemo(() => {
    const live = bookings.filter((b) => b.status !== "cancelled");
    return {
      expected: live.length,
      in: live.filter((b) => b.checkedIn).length,
      heads: live.reduce((sum, b) => sum + (Number(b.tickets) || 0), 0),
      headsIn: live
        .filter((b) => b.checkedIn)
        .reduce((sum, b) => sum + (Number(b.tickets) || 0), 0),
    };
  }, [bookings]);

  /* ---------- Verdicts ---------- */

  const say = useCallback(
    (tone, title, detail) => {
      resultKey.current += 1;
      setResult({ key: resultKey.current, tone, title, detail });
      if (sound) blip(tone === "ok");
      buzz(tone === "ok");
    },
    [sound]
  );

  /**
   * The whole admission decision. Resolution happens against the roster we
   * already hold, so a ticket for another event never reaches the API.
   */
  const admit = useCallback(
    async (raw) => {
      if (busy) return;
      const { ticketId, bookingId } = readPayload(raw);
      if (!ticketId && !bookingId) return;

      const needle = String(ticketId || "").toUpperCase();
      const booking =
        (bookingId && bookings.find((b) => String(b._id) === bookingId)) ||
        (needle &&
          bookings.find(
            (b) => String(b.ticketId || "").toUpperCase() === needle
          )) ||
        null;

      if (!booking) {
        say(
          "bad",
          "Not on this list",
          `Nothing matching ${ticketId || bookingId} is booked for ${
            selectedEvent?.title || "this event"
          }. Check they're at the right door, or pick the right event above.`
        );
        return;
      }

      if (booking.status === "cancelled") {
        say(
          "bad",
          "Cancelled booking",
          `${booking.user?.name || "This guest"} cancelled. Don't let them in on this ticket.`
        );
        return;
      }

      if (booking.checkedIn) {
        const at = booking.checkedInAt ? new Date(booking.checkedInAt) : null;
        say(
          "warn",
          "Already used",
          `${booking.user?.name || "This ticket"} came in${
            at && !Number.isNaN(at.getTime()) ? ` at ${format(at, "HH:mm")}` : ""
          }. One scan per booking.`
        );
        return;
      }

      setBusy(true);
      try {
        const response = await bookingsApi.verifyTicket({ bookingId: booking._id });
        const at = response?.booking?.checkedInAt || new Date().toISOString();
        const heads = Number(booking.tickets) || 1;

        roster.setData((prev) => ({
          ...prev,
          bookings: (prev?.bookings || []).map((row) =>
            row._id === booking._id
              ? { ...row, checkedIn: true, checkedInAt: at }
              : row
          ),
        }));

        setAdmitted((prev) =>
          [
            {
              id: booking._id,
              name: booking.user?.name || "Guest",
              tickets: heads,
              at,
            },
            ...prev,
          ].slice(0, 12)
        );

        say(
          "ok",
          `Let ${heads === 1 ? "them" : `all ${heads}`} in`,
          `${booking.user?.name || "Guest"} · ${heads} ticket${heads === 1 ? "" : "s"}${
            booking.user?.email ? ` · ${booking.user.email}` : ""
          }`
        );
      } catch (err) {
        if (/already checked in/i.test(err?.message || "")) {
          roster.setData((prev) => ({
            ...prev,
            bookings: (prev?.bookings || []).map((row) =>
              row._id === booking._id ? { ...row, checkedIn: true } : row
            ),
          }));
          say("warn", "Already used", "Another device scanned this one first.");
        } else {
          say("bad", "Check-in failed", err?.message || "Try again.");
        }
      } finally {
        setBusy(false);
      }
    },
    [bookings, busy, roster.setData, say, selectedEvent]
  );

  // The decode loop reads the latest `admit` through a ref. Depending on it
  // directly would tear down and restart requestAnimationFrame on every render
  // that changes `busy`, which drops frames mid-scan.
  const admitRef = useRef(admit);
  admitRef.current = admit;

  /* ---------- Camera ---------- */

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(loopRef.current);
    loopRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      detectorRef.current =
        detectorRef.current ||
        new window.BarcodeDetector({ formats: ["qr_code"] });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);
    } catch (err) {
      const name = err?.name || "";
      setCameraError(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser's site settings, or type the ticket ID instead."
          : name === "NotFoundError"
            ? "No camera found on this device. Type the ticket ID instead."
            : err?.message ||
              "The camera couldn't start. Type the ticket ID instead."
      );
      setScanning(false);
    }
  }, []);

  // The decode loop. Throttled well below frame rate - reading every frame
  // burns battery for no extra accuracy (main-thread-budget).
  useEffect(() => {
    if (!scanning) return undefined;
    let stopped = false;
    let lastRun = 0;

    const tick = async (now) => {
      if (stopped) return;
      loopRef.current = requestAnimationFrame(tick);
      if (now - lastRun < 220) return;
      lastRun = now;

      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;

      try {
        const codes = await detector.detect(video);
        const value = codes?.[0]?.rawValue;
        if (!value) return;
        const seen = lastScan.current;
        if (seen.code === value && now - seen.at < RESCAN_MS) return;
        lastScan.current = { code: value, at: now };
        admitRef.current(value);
      } catch {
        /* a failed frame is normal; the next one usually decodes */
      }
    };

    loopRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(loopRef.current);
    };
  }, [scanning]);

  // Release the camera on unmount and when the event changes - leaving it live
  // keeps the indicator light on, which reads as the page spying.
  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => {
    setResult(null);
    setAdmitted([]);
  }, [eventId]);

  /* ---------- Manual entry ---------- */

  const submitManual = (event) => {
    event.preventDefault();
    const value = manual.trim();
    if (!value) return;
    admit(value);
    setManual("");
  };

  /* ---------- Render ---------- */

  if (mine.loading) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Loader label="Loading your events" />
      </div>
    );
  }

  if (mine.error) {
    return (
      <div className="shell section">
        <ErrorState
          title="Couldn't load your events"
          message={mine.error.message}
          onRetry={mine.reload}
        />
      </div>
    );
  }

  if (!myEvents.length) {
    return (
      <div className="shell section">
        <EmptyState
          icon={Ticket}
          title="Nothing to scan yet"
          description="The scanner works against one of your events. Create one first and the guest list appears here."
          action="Create an event"
          actionTo="/create-event"
        />
      </div>
    );
  }

  const waiting = bookings
    .filter((b) => b.status !== "cancelled" && !b.checkedIn)
    .sort((a, b) =>
      String(a.user?.name || "").localeCompare(String(b.user?.name || ""))
    );

  return (
    <div className="shell section">
      <Reveal>
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to dashboard
        </Link>
        <p className="kicker mt-4">On the door</p>
        <h1 className="mt-3 text-4xl">
          Ticket <span className="text-grad-brand">scanner</span>
        </h1>
        <p className="mt-4 max-w-xl text-md leading-relaxed text-[var(--color-fg-muted)]">
          Scan a QR, type a ticket ID, or just tap a name. Each booking admits
          once.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        {/* ================= Left: scan ================= */}
        <div className="space-y-6">
          <Reveal>
            <GlassCard elevation={3} radius="xl" specular className="p-6">
              <Select
                label="Which door"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                options={myEvents.map((event) => {
                  const date = eventDate(event);
                  return {
                    value: event._id,
                    label: `${event.title}${date ? ` — ${format(date, "d MMM")}` : ""}${
                      isPastEvent(event) ? " (past)" : ""
                    }`,
                  };
                })}
                helper="Only bookings for this event will be admitted."
              />

              {/* ---------- Camera ---------- */}
              <div className="mt-6">
                {cameraSupported ? (
                  <>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-edge)] bg-black/60">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className={`absolute inset-0 size-full object-cover ${
                          scanning ? "" : "opacity-0"
                        }`}
                      />

                      {scanning ? (
                        <>
                          {/* Aim frame */}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 grid place-items-center"
                          >
                            <div className="relative size-1/2 min-h-32 min-w-32">
                              {[
                                "left-0 top-0 border-l-2 border-t-2",
                                "right-0 top-0 border-r-2 border-t-2",
                                "bottom-0 left-0 border-b-2 border-l-2",
                                "bottom-0 right-0 border-b-2 border-r-2",
                              ].map((corner) => (
                                <span
                                  key={corner}
                                  className={`absolute size-8 rounded-[6px] border-[var(--color-cyan)] ${corner}`}
                                />
                              ))}
                            </div>
                          </div>

                          {!reduced ? (
                            <motion.div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-x-6 h-px bg-[var(--color-cyan)] shadow-[0_0_12px_var(--color-cyan)]"
                              initial={{ top: "22%" }}
                              animate={{ top: ["22%", "78%", "22%"] }}
                              transition={{
                                duration: 3.2,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            />
                          ) : null}
                        </>
                      ) : (
                        <div className="absolute inset-0 grid place-items-center p-6 text-center">
                          <div>
                            <span
                              aria-hidden="true"
                              className="mx-auto grid size-12 place-items-center rounded-full bg-white/[0.07] text-[var(--color-fg-subtle)]"
                            >
                              <Camera size={22} />
                            </span>
                            <p className="mt-3 text-sm text-[var(--color-fg-muted)]">
                              Camera is off
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {scanning ? (
                        <Button variant="secondary" onClick={stopCamera}>
                          <CameraSlash size={17} aria-hidden="true" />
                          Stop camera
                        </Button>
                      ) : (
                        <Button variant="primary" onClick={startCamera}>
                          <Camera size={17} aria-hidden="true" />
                          Start camera
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSound((value) => !value)}
                        aria-pressed={sound}
                      >
                        {sound ? (
                          <SpeakerHigh size={16} aria-hidden="true" />
                        ) : (
                          <SpeakerSlash size={16} aria-hidden="true" />
                        )}
                        {sound ? "Sound on" : "Sound off"}
                      </Button>
                    </div>

                    {cameraError ? (
                      <p
                        role="alert"
                        className="mt-3 text-sm leading-relaxed text-[#fca5a5]"
                      >
                        {cameraError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="flex gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-edge)] bg-white/[0.04] p-4">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[var(--color-fg-subtle)]"
                    >
                      <CameraSlash size={18} />
                    </span>
                    <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                      This browser can't decode QR codes. Chrome or Edge on Android
                      can; on iPhone or Firefox, type the ticket ID below or tap the
                      guest's name — it does exactly the same thing.
                    </p>
                  </div>
                )}
              </div>

              {/* ---------- Manual ---------- */}
              <form onSubmit={submitManual} className="mt-6">
                <Input
                  label="Or enter a ticket ID"
                  icon={Keyboard}
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="EVLT-… or EVT-…"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="tnum"
                  helper="It's printed on the ticket PDF and shown in the guest's bookings."
                />
                <Button
                  type="submit"
                  variant="secondary"
                  fullWidth
                  loading={busy}
                  disabled={!manual.trim()}
                  className="mt-3"
                >
                  Check in
                </Button>
              </form>
            </GlassCard>
          </Reveal>

          {/* Verdict sits directly under the controls, where eyes already are. */}
          <div aria-live="polite" aria-atomic="true">
            <Verdict result={result} />
          </div>
        </div>

        {/* ================= Right: the list ================= */}
        <div className="space-y-6">
          <Reveal>
            <GlassCard elevation={2} radius="xl" className="p-6">
              <h2 className="text-lg">Door count</h2>
              {roster.loading ? (
                <p className="mt-4 text-sm text-[var(--color-fg-muted)]">
                  Loading the guest list…
                </p>
              ) : roster.error ? (
                <p className="mt-4 text-sm text-[#fca5a5]">
                  {roster.error.message}{" "}
                  <button
                    type="button"
                    onClick={roster.reload}
                    className="font-semibold underline decoration-1 underline-offset-4"
                  >
                    Retry
                  </button>
                </p>
              ) : (
                <>
                  <p className="tnum mt-4 font-display text-4xl font-extrabold leading-none">
                    {formatNumber(doorCount.headsIn)}
                    <span className="text-xl text-[var(--color-fg-subtle)]">
                      {" / "}
                      {formatNumber(doorCount.heads)}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
                    people in ·{" "}
                    <span className="tnum">{formatNumber(doorCount.in)}</span> of{" "}
                    <span className="tnum">{formatNumber(doorCount.expected)}</span>{" "}
                    bookings scanned
                  </p>
                  <div
                    className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
                    role="progressbar"
                    aria-valuenow={doorCount.heads ? Math.round((doorCount.headsIn / doorCount.heads) * 100) : 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Guests admitted"
                  >
                    <div
                      className="h-full rounded-full bg-[image:var(--grad-brand)] transition-[width] duration-500"
                      style={{
                        width: `${
                          doorCount.heads
                            ? Math.round((doorCount.headsIn / doorCount.heads) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <Link
                    to={`/events/${eventId}/bookings`}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--color-fg)] underline decoration-1 underline-offset-4"
                  >
                    Full guest list
                  </Link>
                </>
              )}
            </GlassCard>
          </Reveal>

          {/* Just admitted - a short undo-free audit trail for the person on the
              door, so they can see what they just did. */}
          {admitted.length ? (
            <Reveal>
              <GlassCard elevation={2} radius="xl" className="p-6">
                <h2 className="text-lg">Just in</h2>
                <ul className="mt-4 space-y-3">
                  <AnimatePresence initial={false}>
                    {admitted.map((entry) => (
                      <motion.li
                        key={entry.id}
                        layout={!reduced}
                        initial={
                          reduced ? { opacity: 0 } : { opacity: 0, x: -12 }
                        }
                        animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={spring.snap}
                        className="flex items-center gap-3 text-sm"
                      >
                        <CheckCircle
                          size={16}
                          weight="fill"
                          aria-hidden="true"
                          className="shrink-0 text-[var(--color-success)]"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {entry.name}
                        </span>
                        <span className="tnum shrink-0 text-[var(--color-fg-subtle)]">
                          ×{entry.tickets}
                        </span>
                        <span className="tnum shrink-0 text-xs text-[var(--color-fg-subtle)]">
                          {format(new Date(entry.at), "HH:mm")}
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </GlassCard>
            </Reveal>
          ) : null}

          {/* Tap to admit. The one path that works in every browser. */}
          {!roster.loading && !roster.error ? (
            <Reveal>
              <GlassCard elevation={2} radius="xl" className="p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg">Still to arrive</h2>
                  <Badge tone="neutral">{formatNumber(waiting.length)}</Badge>
                </div>

                {waiting.length === 0 ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-[var(--color-success)]">
                    <CheckCircle size={16} weight="fill" aria-hidden="true" />
                    {doorCount.expected
                      ? "Everyone's in."
                      : "Nobody has booked this one yet."}
                  </p>
                ) : (
                  <ul className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                    {waiting.map((booking) => (
                      <li key={booking._id}>
                        <button
                          type="button"
                          onClick={() => admit(booking.ticketId || booking._id)}
                          disabled={busy}
                          className="flex w-full min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2 text-left transition-colors hover:border-[var(--glass-edge)] hover:bg-white/[0.06] disabled:opacity-45"
                        >
                          <UserCircle
                            size={22}
                            aria-hidden="true"
                            className="shrink-0 text-[var(--color-fg-subtle)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {booking.user?.name || "Guest"}
                            </span>
                            <span className="tnum block truncate text-xs text-[var(--color-fg-subtle)]">
                              {booking.ticketId || booking._id}
                            </span>
                          </span>
                          <span className="tnum shrink-0 text-sm text-[var(--color-fg-muted)]">
                            ×{formatNumber(booking.tickets ?? 1)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {waiting.length > 8 ? (
                  <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
                    <MagnifyingGlass
                      size={13}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0"
                    />
                    Looking for one person in a long list? Search by name on the
                    full guest list instead.
                  </p>
                ) : null}
              </GlassCard>
            </Reveal>
          ) : null}
        </div>
      </div>
    </div>
  );
}
