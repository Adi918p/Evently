import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarCheck,
  CurrencyInr,
  Envelope,
  PencilSimpleSlash,
  QrCode,
  ShieldCheck,
  SignOut,
  SquaresFour,
  Ticket,
  User as UserIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import Badge, { StatusBadge } from "../components/ui/Badge";
import { ErrorState, Loader } from "../components/ui/Feedback";
import { Reveal, RevealGroup } from "../components/ui/Reveal";
import { useApi } from "../lib/useApi";
import { auth as authApi, bookings as bookingsApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatNumber, formatPrice, isPastEvent } from "../lib/constants";
import { respectMotion, riseIn, spring } from "../motion/presets";

/**
 * Profile.
 *
 * Read-only, and deliberately so: the API exposes GET /api/auth/me and nothing
 * that writes back to a user, so there is no endpoint an edit form could post
 * to. Rather than ship inputs that cannot save, the page says where changes have
 * to go. The legacy page was read-only for the same reason.
 *
 * The numbers come from the bookings the account actually has - none of them are
 * decorative.
 */

function Stat({ icon: Icon, label, value, hint }) {
  const reduced = useReducedMotion();

  return (
    <motion.li variants={respectMotion(riseIn, reduced)}>
      <GlassCard elevation={2} radius="lg" className="h-full p-5">
        <span
          className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
          aria-hidden="true"
        >
          <Icon size={18} />
        </span>
        <p className="tnum mt-4 font-display text-2xl font-extrabold leading-none">
          {value}
        </p>
        <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">{label}</p>
        {hint ? (
          <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{hint}</p>
        ) : null}
      </GlassCard>
    </motion.li>
  );
}

export default function Profile() {
  const { user: tokenUser, role, isAdmin, isOrganizer, signOut } = useAuth();
  const reduced = useReducedMotion();

  const {
    data: meData,
    error: meError,
    loading: meLoading,
    reload: reloadMe,
  } = useApi((signal) => authApi.me(signal), []);

  // The bookings request is independent - if it fails, the identity card still
  // renders rather than the whole page collapsing.
  const { data: bookingData, loading: bookingsLoading } = useApi(
    (signal) => bookingsApi.mine(signal),
    []
  );

  // Fall back to the token payload so something real shows while /me is in
  // flight; the server copy wins once it lands.
  const user = meData?.user || tokenUser || null;

  const stats = useMemo(() => {
    const list = Array.isArray(bookingData?.bookings) ? bookingData.bookings : [];
    const confirmed = list.filter((b) => b.status !== "cancelled");
    return {
      bookings: confirmed.length,
      tickets: confirmed.reduce((sum, b) => sum + (Number(b.tickets) || 0), 0),
      spend: confirmed.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0),
      upcoming: confirmed.filter((b) => !isPastEvent(b.event)).length,
      checkedIn: confirmed.filter((b) => b.checkedIn).length,
    };
  }, [bookingData]);

  if (meLoading && !tokenUser) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Loader label="Loading your profile" />
      </div>
    );
  }

  if (meError && !user) {
    return (
      <div className="shell section">
        <ErrorState
          title="Profile unavailable"
          message={meError.data?.message || meError.message}
          onRetry={reloadMe}
        />
      </div>
    );
  }

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();
  const joined = user?.createdAt ? new Date(user.createdAt) : null;

  return (
    <div className="shell section">
      <header className="max-w-2xl space-y-3">
        <p className="kicker">Your account</p>
        <h1 className="text-4xl">Profile</h1>
      </header>

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[22rem_1fr] lg:gap-12">
        {/* Identity */}
        <Reveal>
          <GlassCard elevation={3} radius="2xl" glow className="p-7 text-center">
            <motion.div
              initial={reduced ? { opacity: 0 } : { scale: 0.85, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              transition={reduced ? { duration: 0.2 } : spring.soft}
              className="mx-auto grid size-24 place-items-center overflow-hidden rounded-full border border-[var(--glass-edge-strong)] bg-[image:var(--grad-brand-soft)]"
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  width={96}
                  height={96}
                  className="size-full object-cover"
                />
              ) : (
                <span
                  className="font-display text-[2rem] font-extrabold text-[var(--color-violet-bright)]"
                  aria-hidden="true"
                >
                  {initial}
                </span>
              )}
            </motion.div>

            <h2 className="mt-5 text-2xl leading-tight">
              {user?.name || "Unnamed account"}
            </h2>

            <p className="wrap-anywhere mt-1.5 flex items-center justify-center gap-1.5 text-sm text-[var(--color-fg-muted)]">
              <Envelope size={15} aria-hidden="true" className="shrink-0" />
              {user?.email}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Badge tone={isAdmin ? "danger" : isOrganizer ? "brand" : "neutral"}>
                {role || "user"}
              </Badge>
              {user?.status ? <StatusBadge status={user.status} /> : null}
              {user?.isEmailVerified ? (
                <Badge tone="success" icon={ShieldCheck}>
                  Email verified
                </Badge>
              ) : (
                <Badge tone="warning">Email unverified</Badge>
              )}
            </div>

            {joined && !Number.isNaN(joined.getTime()) ? (
              <p className="mt-5 border-t border-[var(--glass-edge)] pt-5 text-xs text-[var(--color-fg-subtle)]">
                On Evently since {format(joined, "MMMM yyyy")}
              </p>
            ) : null}

            <Button
              variant="danger"
              fullWidth
              className="mt-5"
              onClick={() => signOut({ redirectTo: "/" })}
            >
              <SignOut size={18} aria-hidden="true" />
              Sign out
            </Button>
          </GlassCard>
        </Reveal>

        <div className="min-w-0 space-y-10">
          {/* Stats */}
          <section>
            <h2 className="text-xl">Your activity</h2>
            {bookingsLoading ? (
              <p className="mt-4 text-sm text-[var(--color-fg-subtle)]">
                Counting your bookings…
              </p>
            ) : (
              <RevealGroup
                as="ul"
                className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                <Stat
                  icon={Ticket}
                  label="Bookings"
                  value={formatNumber(stats.bookings)}
                  hint={
                    stats.upcoming
                      ? `${stats.upcoming} still to come`
                      : "None upcoming"
                  }
                />
                <Stat
                  icon={CalendarCheck}
                  label="Tickets held"
                  value={formatNumber(stats.tickets)}
                />
                <Stat
                  icon={CurrencyInr}
                  label="Total spent"
                  value={formatPrice(stats.spend)}
                />
                <Stat
                  icon={QrCode}
                  label="Checked in"
                  value={formatNumber(stats.checkedIn)}
                  hint="Passes scanned at a door"
                />
              </RevealGroup>
            )}
          </section>

          {/* Shortcuts */}
          <section>
            <h2 className="text-xl">Jump to</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="primary" to="/my-bookings">
                <Ticket size={18} aria-hidden="true" />
                My bookings
              </Button>
              {isOrganizer || isAdmin ? (
                <>
                  <Button variant="secondary" to="/dashboard">
                    <SquaresFour size={18} aria-hidden="true" />
                    Organizer dashboard
                  </Button>
                  <Button variant="secondary" to="/scanner">
                    <QrCode size={18} aria-hidden="true" />
                    Door scanner
                  </Button>
                </>
              ) : (
                <Button variant="secondary" to="/create-event">
                  Host an event
                </Button>
              )}
              {isAdmin ? (
                <Button variant="secondary" to="/admin">
                  <ShieldCheck size={18} aria-hidden="true" />
                  Admin
                </Button>
              ) : null}
            </div>
          </section>

          {/* Honest note about what cannot be changed here. */}
          <Reveal>
            <GlassCard elevation={1} radius="xl" className="flex gap-4 p-6">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-white/[0.06] text-[var(--color-fg-subtle)]"
                aria-hidden="true"
              >
                <PencilSimpleSlash size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="font-display font-semibold">
                  Changing your name or email
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                  Your tickets are issued against these details, so they aren't
                  editable from here yet. Message support with what needs
                  changing and we'll update it on the account.
                </p>
                <Button variant="ghost" size="sm" to="/support" className="mt-3">
                  <UserIcon size={16} aria-hidden="true" />
                  Request a change
                </Button>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
