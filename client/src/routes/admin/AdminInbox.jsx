import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowSquareOut,
  CaretDown,
  Envelope,
  EnvelopeOpen,
  EnvelopeSimple,
  MagnifyingGlass,
  Trash,
} from "@phosphor-icons/react";
import { format, formatDistanceToNow } from "date-fns";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Badge, { Chip } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Field";
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "../../components/ui/Feedback";
import { Reveal, RevealGroup } from "../../components/ui/Reveal";
import AdminNav from "./AdminNav";
import { useApi, useAction } from "../../lib/useApi";
import { admin as adminApi } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { formatNumber, SUPPORT_EMAIL } from "../../lib/constants";
import { respectMotion, riseIn, spring } from "../../motion/presets";

/**
 * Support inbox.
 *
 * GET /api/admin/messages returns Contact documents newest-first:
 * { name, email, subject, message, createdAt }. That is the whole schema - there
 * is no read flag and no reply thread, so:
 *
 *   - "Read" is tracked in this browser's localStorage, not on the server. It is
 *     a personal marker to stop re-reading the same message, and the copy says
 *     as much rather than implying it is shared with other admins.
 *   - Replying opens the admin's own mail client with the subject pre-filled.
 *     Nothing is sent from the platform.
 *
 * DELETE /api/admin/messages/:id returns only { success } and does not 404 on a
 * missing id, so a delete is treated as authoritative and the row is dropped.
 */

const READ_KEY = "evently:inbox:read";

function loadRead() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

const FILTERS = [
  { key: "unread", label: "Unread" },
  { key: "all", label: "All" },
];

/* ==========================================================================
   Row
   ========================================================================== */

function MessageRow({ message, read, expanded, onToggle, onDelete, onMarkRead }) {
  const reduced = useReducedMotion();
  const sent = message.createdAt ? new Date(message.createdAt) : null;
  const valid = sent && !Number.isNaN(sent.getTime());
  const panelId = `message-${message._id}`;

  const mailto = `mailto:${message.email}?subject=${encodeURIComponent(
    `Re: ${message.subject || "Your message to Evently"}`
  )}`;

  return (
    <motion.li variants={respectMotion(riseIn, reduced)} layout={!reduced}>
      <GlassCard elevation={2} radius="xl" className="overflow-hidden">
        {/* Header is the disclosure control. The whole strip is the button so it
            is an easy target, and aria-expanded carries the state. */}
        <h3>
          <button
            type="button"
            onClick={() => onToggle(message._id)}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="flex w-full min-h-14 items-start gap-3 p-5 text-left transition-colors hover:bg-white/[0.04]"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${
                read ? "text-[var(--color-fg-subtle)]" : "text-[var(--color-cyan)]"
              }`}
            >
              {read ? <EnvelopeOpen size={20} /> : <Envelope size={20} weight="fill" />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`truncate ${
                    read ? "font-medium" : "font-bold"
                  } text-[var(--color-fg)]`}
                >
                  {message.subject || "(no subject)"}
                </span>
                {!read ? <Badge tone="info">New</Badge> : null}
              </span>
              <span className="mt-1 block truncate text-sm text-[var(--color-fg-muted)]">
                {message.name || "Anonymous"} · {message.email}
              </span>
              {!expanded ? (
                <span className="mt-1 block truncate text-sm text-[var(--color-fg-subtle)]">
                  {message.message}
                </span>
              ) : null}
            </span>

            <span className="flex shrink-0 items-center gap-2">
              {valid ? (
                <span
                  className="hidden text-xs text-[var(--color-fg-subtle)] sm:block"
                  title={format(sent, "d MMM yyyy, HH:mm")}
                >
                  {formatDistanceToNow(sent, { addSuffix: true })}
                </span>
              ) : null}
              <motion.span
                aria-hidden="true"
                animate={reduced ? undefined : { rotate: expanded ? 180 : 0 }}
                transition={spring.snap}
                className="text-[var(--color-fg-subtle)]"
              >
                <CaretDown size={16} />
              </motion.span>
            </span>
          </button>
        </h3>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              id={panelId}
              key="panel"
              initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduced ? 0.15 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-[var(--glass-edge)] px-5 pb-5 pt-4">
                <p className="wrap-anywhere whitespace-pre-wrap text-md leading-relaxed text-[var(--color-fg-muted)]">
                  {message.message}
                </p>

                {valid ? (
                  <p className="mt-4 text-xs text-[var(--color-fg-subtle)]">
                    Sent {format(sent, "EEEE d MMMM yyyy 'at' HH:mm")}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" href={mailto}>
                    <ArrowSquareOut size={15} aria-hidden="true" />
                    Reply by email
                  </Button>
                  {read ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMarkRead(message._id)}
                    >
                      Mark as read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-[#fca5a5] hover:bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)]"
                    onClick={() => onDelete(message)}
                  >
                    <Trash size={15} aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </GlassCard>
    </motion.li>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function AdminInbox() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [read, setRead] = useState(loadRead);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, error, loading, setData, reload } = useApi(
    (signal) => adminApi.messages(signal),
    []
  );

  const remove = useAction((id) => adminApi.deleteMessage(id));

  const all = useMemo(
    () => (Array.isArray(data?.messages) ? data.messages : []),
    [data]
  );

  // Persist the read set, and drop ids that no longer exist so the entry can't
  // grow forever as messages are deleted. The `all.length` guard matters: on the
  // first render the list is still empty, and writing then would prune every
  // stored id before the fetch has had a chance to confirm they exist.
  useEffect(() => {
    if (!all.length) return;
    const live = new Set(all.map((m) => String(m._id)));
    const kept = [...read].filter((id) => live.has(id));
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(kept));
    } catch {
      /* private mode - read state just won't survive a reload */
    }
  }, [all, read]);

  const markRead = useCallback((id) => {
    setRead((prev) => {
      if (prev.has(String(id))) return prev;
      const next = new Set(prev);
      next.add(String(id));
      return next;
    });
  }, []);

  // Opening a message is what marks it read - that is what "read" means.
  const toggle = (id) => {
    setOpenId((prev) => {
      const next = prev === id ? null : id;
      if (next) markRead(next);
      return next;
    });
  };

  const unreadCount = useMemo(
    () => all.filter((m) => !read.has(String(m._id))).length,
    [all, read]
  );

  const counts = { all: all.length, unread: unreadCount };

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((message) => {
      if (filter === "unread" && read.has(String(message._id))) return false;
      if (!needle) return true;
      return [message.name, message.email, message.subject, message.message]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [all, filter, query, read]);

  const markAllRead = () => {
    setRead(new Set(all.map((m) => String(m._id))));
    toast.success("Everything marked as read.");
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    try {
      await remove.run(target._id);
      setData((prev) => ({
        ...prev,
        messages: (prev?.messages || []).filter((m) => m._id !== target._id),
      }));
      if (openId === target._id) setOpenId(null);
      setPendingDelete(null);
      toast.success("Message deleted.");
    } catch (err) {
      toast.error(err?.message || "Couldn't delete that message.");
    }
  };

  return (
    <div className="shell section">
      <Reveal>
        <p className="kicker">Admin</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">
            Support <span className="text-grad-brand">inbox</span>
          </h1>
          {unreadCount > 0 ? (
            <Badge tone="info" icon={EnvelopeSimple}>
              {formatNumber(unreadCount)} unread
            </Badge>
          ) : null}
        </div>
        <p className="mt-4 max-w-xl text-md leading-relaxed text-[var(--color-fg-muted)]">
          Everything sent through the contact form. Nothing notifies you, so this
          is the only place it shows up.
        </p>
      </Reveal>

      <AdminNav />

      {/* ---------- Toolbar ---------- */}
      {all.length ? (
        <Reveal className="mt-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <Input
              label="Search messages"
              type="search"
              icon={MagnifyingGlass}
              placeholder="Name, email, subject or text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              fieldClassName="w-full lg:max-w-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filter messages" className="flex gap-2">
                {FILTERS.map(({ key, label }) => (
                  <Chip
                    key={key}
                    active={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                    <span className="tnum opacity-70">{counts[key]}</span>
                  </Chip>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllRead}
                disabled={unreadCount === 0}
              >
                <EnvelopeOpen size={15} aria-hidden="true" />
                Mark all read
              </Button>
            </div>
          </div>

          <p aria-live="polite" className="mt-4 text-sm text-[var(--color-fg-subtle)]">
            Showing <span className="tnum">{formatNumber(shown.length)}</span> of{" "}
            <span className="tnum">{formatNumber(all.length)}</span>
          </p>
        </Reveal>
      ) : null}

      {/* ---------- List ---------- */}
      <div className="mt-6">
        {loading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <ErrorState
            title="Couldn't load the inbox"
            message={error.message}
            onRetry={reload}
          />
        ) : all.length === 0 ? (
          <EmptyState
            icon={EnvelopeSimple}
            title="Inbox empty"
            description="Nothing has come through the contact form. Messages appear here the moment someone sends one."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={filter === "unread" ? EnvelopeOpen : MagnifyingGlass}
            title={filter === "unread" && !query.trim() ? "All caught up" : "No matches"}
            description={
              filter === "unread" && !query.trim()
                ? "You've opened everything in here."
                : "No message matches that search."
            }
            action="Show all messages"
            onAction={() => {
              setQuery("");
              setFilter("all");
            }}
          />
        ) : (
          <RevealGroup as="ul" each={0.03} className="space-y-3">
            {shown.map((message) => (
              <MessageRow
                key={message._id}
                message={message}
                read={read.has(String(message._id))}
                expanded={openId === message._id}
                onToggle={toggle}
                onDelete={setPendingDelete}
                onMarkRead={markRead}
              />
            ))}
          </RevealGroup>
        )}
      </div>

      <Reveal className="mt-10">
        <GlassCard elevation={1} radius="xl" className="p-6">
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Read/unread is remembered in this browser only — another admin, or you
            on your phone, will see these as unread. Replies go out from your own
            mail client, not from{" "}
            <span className="wrap-anywhere">{SUPPORT_EMAIL}</span>.
          </p>
        </GlassCard>
      </Reveal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => (remove.pending ? null : setPendingDelete(null))}
        onConfirm={confirmDelete}
        loading={remove.pending}
        title="Delete this message?"
        confirmLabel="Delete"
      >
        <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
          The message from{" "}
          <strong className="text-[var(--color-fg)]">
            {pendingDelete?.name || pendingDelete?.email}
          </strong>{" "}
          is gone for good. Copy anything you need out of it first — reply by email
          before you delete.
        </p>
      </ConfirmDialog>
    </div>
  );
}
