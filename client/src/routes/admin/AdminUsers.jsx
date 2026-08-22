import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CheckCircle,
  Crown,
  Envelope,
  MagnifyingGlass,
  Megaphone,
  Prohibit,
  SealCheck,
  ShieldWarning,
  User as UserIcon,
  UserCircle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge, { Chip, StatusBadge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/Modal";
import { Input, Select } from "../../components/ui/Field";
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "../../components/ui/Feedback";
import { Reveal, RevealGroup } from "../../components/ui/Reveal";
import AdminNav from "./AdminNav";
import { useApi, useAction } from "../../lib/useApi";
import { admin as adminApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { formatNumber } from "../../lib/constants";
import { respectMotion, riseIn } from "../../motion/presets";

/**
 * Accounts.
 *
 * GET /api/admin/users returns every user minus the password hash, newest first.
 *
 * Two mutations, with different server behaviour worth knowing:
 *   PATCH /users/:id/role   - findByIdAndUpdate without runValidators, so an
 *                             invalid role string would be written straight to
 *                             the document. The client therefore only ever sends
 *                             a value from ROLES below.
 *   PATCH /users/:id/status - refuses with 400 for admin accounts
 *                             ("Admin accounts cannot be suspended"), so the
 *                             control is hidden for admins rather than letting
 *                             someone press it and read an error.
 *
 * Both return the updated user, which is patched into the list in place.
 */

/** The model's enum. Nothing outside this list is ever sent. */
const ROLES = [
  { value: "user", label: "Attendee", icon: UserIcon },
  { value: "organizer", label: "Organizer", icon: Megaphone },
  { value: "admin", label: "Admin", icon: Crown },
];

const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "organizer", label: "Organizers" },
  { key: "admin", label: "Admins" },
  { key: "suspended", label: "Restricted" },
];

function roleTone(role) {
  if (role === "admin") return "warning";
  if (role === "organizer") return "info";
  return "neutral";
}

function UserRow({ user, isSelf, onRole, onStatus, busy }) {
  const reduced = useReducedMotion();
  const joined = user.createdAt ? new Date(user.createdAt) : null;
  const restricted = user.status !== "active";
  const RoleIcon = ROLES.find((r) => r.value === user.role)?.icon || UserIcon;

  return (
    <motion.li variants={respectMotion(riseIn, reduced)} layout={!reduced}>
      <GlassCard
        elevation={2}
        radius="xl"
        className={`p-5 ${restricted ? "opacity-70" : ""}`}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          {/* Identity */}
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="shrink-0 text-[var(--color-fg-subtle)]"
              >
                <UserCircle size={44} />
              </span>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-[var(--color-fg)]">
                  {user.name || "Unnamed account"}
                </p>
                {isSelf ? <Badge tone="info">You</Badge> : null}
                <Badge tone={roleTone(user.role)} icon={RoleIcon}>
                  {ROLE_LABEL[user.role] || user.role}
                </Badge>
                {restricted ? <StatusBadge status={user.status} /> : null}
                {user.isEmailVerified ? (
                  <Badge tone="success" icon={SealCheck}>
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="warning" icon={WarningCircle}>
                    Unverified
                  </Badge>
                )}
              </div>

              <a
                href={`mailto:${user.email}`}
                className="wrap-anywhere mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
              >
                <Envelope size={13} aria-hidden="true" className="shrink-0" />
                {user.email}
              </a>

              {joined && !Number.isNaN(joined.getTime()) ? (
                <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                  Joined {format(joined, "d MMM yyyy")}
                </p>
              ) : null}
            </div>
          </div>

          {/* Controls */}
          <div className="flex shrink-0 flex-wrap items-end gap-3 border-t border-[var(--glass-edge)] pt-4 xl:border-0 xl:pt-0">
            <Select
              label="Role"
              value={user.role}
              disabled={isSelf || busy === "role"}
              onChange={(e) => onRole(user, e.target.value)}
              options={ROLES.map(({ value, label }) => ({ value, label }))}
              fieldClassName="w-40"
              // Demoting yourself out of admin locks you out of this page with
              // no way back, so the control is simply not available for you.
              helper={isSelf ? "You can't change your own role" : undefined}
            />

            {user.role === "admin" ? (
              <p className="max-w-40 pb-1 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
                Admin accounts can't be suspended.
              </p>
            ) : restricted ? (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === "status"}
                disabled={Boolean(busy)}
                onClick={() => onStatus(user, "active")}
              >
                <CheckCircle size={15} aria-hidden="true" />
                Reinstate
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                loading={busy === "status"}
                disabled={Boolean(busy)}
                className="text-[#fca5a5] hover:bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)]"
                onClick={() => onStatus(user, "suspended")}
              >
                <Prohibit size={15} aria-hidden="true" />
                Suspend
              </Button>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.li>
  );
}

export default function AdminUsers() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState({ id: null, kind: null });
  const [confirm, setConfirm] = useState(null);

  const { data, error, loading, setData, reload } = useApi(
    (signal) => adminApi.users(signal),
    []
  );

  const setRole = useAction((id, role) => adminApi.setUserRole(id, role));
  const setStatus = useAction((id, status) => adminApi.setUserStatus(id, status));

  const all = useMemo(
    () => (Array.isArray(data?.users) ? data.users : []),
    [data]
  );

  const counts = useMemo(
    () => ({
      all: all.length,
      organizer: all.filter((u) => u.role === "organizer").length,
      admin: all.filter((u) => u.role === "admin").length,
      suspended: all.filter((u) => u.status !== "active").length,
    }),
    [all]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((user) => {
      if (filter === "suspended" && user.status === "active") return false;
      if (
        (filter === "organizer" || filter === "admin") &&
        user.role !== filter
      ) {
        return false;
      }
      if (!needle) return true;
      return [user.name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [all, filter, query]);

  const patchUser = (updated) =>
    setData((prev) => ({
      ...prev,
      users: (prev?.users || []).map((user) =>
        user._id === updated._id ? { ...user, ...updated } : user
      ),
    }));

  /* ---------- Role ---------- */

  const applyRole = async (user, role) => {
    setBusy({ id: user._id, kind: "role" });
    try {
      const result = await setRole.run(user._id, role);
      patchUser(result?.user || { ...user, role });
      toast.success(
        `${user.name || user.email} is now ${ROLE_LABEL[role]?.toLowerCase() || role}.`
      );
    } catch (err) {
      toast.error(err?.message || "Couldn't change that role.");
    } finally {
      setBusy({ id: null, kind: null });
    }
  };

  /** Promoting to admin is irreversible from this screen, so it asks first. */
  const handleRole = (user, role) => {
    if (role === user.role) return;
    if (role === "admin") {
      setConfirm({ kind: "promote", user, role });
      return;
    }
    if (user.role === "admin") {
      setConfirm({ kind: "demote", user, role });
      return;
    }
    applyRole(user, role);
  };

  /* ---------- Status ---------- */

  const handleStatus = async (user, status) => {
    if (status !== "active") {
      setConfirm({ kind: "suspend", user, status });
      return;
    }
    setBusy({ id: user._id, kind: "status" });
    try {
      const result = await setStatus.run(user._id, "active");
      patchUser(result?.user || { ...user, status: "active" });
      toast.success(`${user.name || user.email} can sign in again.`);
    } catch (err) {
      toast.error(err?.message || "Couldn't reinstate that account.");
    } finally {
      setBusy({ id: null, kind: null });
    }
  };

  const applySuspend = async () => {
    const user = confirm?.user;
    if (!user) return;
    setBusy({ id: user._id, kind: "status" });
    try {
      const result = await setStatus.run(user._id, "suspended");
      patchUser(result?.user || { ...user, status: "suspended" });
      setConfirm(null);
      toast.warning(`${user.name || user.email} is suspended.`);
    } catch (err) {
      toast.error(err?.message || "Couldn't suspend that account.");
    } finally {
      setBusy({ id: null, kind: null });
    }
  };

  const confirmRole = async () => {
    const { user, role } = confirm || {};
    if (!user || !role) return;
    await applyRole(user, role);
    setConfirm(null);
  };

  const pendingAction = setRole.pending || setStatus.pending;

  return (
    <div className="shell section">
      <Reveal>
        <p className="kicker">Admin</p>
        <h1 className="mt-3 text-4xl">
          <span className="text-grad-brand">Accounts</span>
        </h1>
        <p className="mt-4 max-w-xl text-md leading-relaxed text-[var(--color-fg-muted)]">
          Grant organizer access, hand over admin, or lock an account out.
        </p>
      </Reveal>

      <AdminNav />

      {/* ---------- Toolbar ---------- */}
      <Reveal className="mt-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <Input
            label="Search accounts"
            type="search"
            icon={MagnifyingGlass}
            placeholder="Name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            fieldClassName="w-full lg:max-w-sm"
          />
          <div role="group" aria-label="Filter accounts" className="flex flex-wrap gap-2">
            {FILTERS.map(({ key, label }) => (
              <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                {label}
                <span className="tnum opacity-70">{counts[key]}</span>
              </Chip>
            ))}
          </div>
        </div>

        {!loading && !error ? (
          <p aria-live="polite" className="mt-4 text-sm text-[var(--color-fg-subtle)]">
            Showing <span className="tnum">{formatNumber(shown.length)}</span> of{" "}
            <span className="tnum">{formatNumber(all.length)}</span>
          </p>
        ) : null}
      </Reveal>

      {/* ---------- List ---------- */}
      <div className="mt-6">
        {loading ? (
          <SkeletonRows count={5} />
        ) : error ? (
          <ErrorState
            title="Couldn't load accounts"
            message={error.message}
            onRetry={reload}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Users}
            title={query.trim() ? "No matches" : "Nobody here"}
            description={
              query.trim()
                ? "No account matches that name or email."
                : "No accounts fit this filter yet."
            }
            action="Show everyone"
            onAction={() => {
              setQuery("");
              setFilter("all");
            }}
          />
        ) : (
          <RevealGroup as="ul" each={0.03} className="space-y-3">
            {shown.map((user) => (
              <UserRow
                key={user._id}
                user={user}
                isSelf={String(user._id) === String(me?.id)}
                onRole={handleRole}
                onStatus={handleStatus}
                busy={busy.id === user._id ? busy.kind : null}
              />
            ))}
          </RevealGroup>
        )}
      </div>

      <Reveal className="mt-10">
        <GlassCard elevation={1} radius="xl" className="flex gap-3 p-6">
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--color-warning)]"
          >
            <ShieldWarning size={18} />
          </span>
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Suspending blocks sign-in. It does not cancel that person's bookings or
            take down events they organize — handle those separately on the events
            tab.
          </p>
        </GlassCard>
      </Reveal>

      {/* ---------- Confirmations ---------- */}
      <ConfirmDialog
        open={confirm?.kind === "promote"}
        onCancel={() => (pendingAction ? null : setConfirm(null))}
        onConfirm={confirmRole}
        loading={setRole.pending}
        title="Make this person an admin?"
        confirmLabel="Grant admin"
        destructive={false}
      >
        <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
          <strong className="text-[var(--color-fg)]">
            {confirm?.user?.name || confirm?.user?.email}
          </strong>{" "}
          will be able to see every booking, edit or delete any event, change other
          people's roles, and suspend accounts — including yours.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "demote"}
        onCancel={() => (pendingAction ? null : setConfirm(null))}
        onConfirm={confirmRole}
        loading={setRole.pending}
        title="Remove admin access?"
        confirmLabel="Remove access"
      >
        <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
          <strong className="text-[var(--color-fg)]">
            {confirm?.user?.name || confirm?.user?.email}
          </strong>{" "}
          loses the admin area immediately and becomes{" "}
          {ROLE_LABEL[confirm?.role]?.toLowerCase() || confirm?.role}. You can grant
          it back from this page.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "suspend"}
        onCancel={() => (pendingAction ? null : setConfirm(null))}
        onConfirm={applySuspend}
        loading={setStatus.pending}
        title="Suspend this account?"
        confirmLabel="Suspend"
      >
        <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
          <strong className="text-[var(--color-fg)]">
            {confirm?.user?.name || confirm?.user?.email}
          </strong>{" "}
          won't be able to sign in. Tickets they already hold still scan at the
          door, and any events they organize stay live.
        </p>
      </ConfirmDialog>
    </div>
  );
}
