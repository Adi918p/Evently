import { NavLink } from "react-router-dom";
import { ChartLine, EnvelopeSimple, Gauge, Ticket, Users } from "@phosphor-icons/react";

/**
 * Section nav shared by the five admin pages.
 *
 * Admin work is a set of sibling tasks rather than a funnel, so every page keeps
 * the same tab strip visible and marks the current one. Using NavLink rather
 * than hand-rolled active state gets aria-current="page" for free
 * (navigation-patterns, consistent-help).
 */

const TABS = [
  { to: "/admin", label: "Overview", icon: Gauge },
  { to: "/admin/events", label: "Events", icon: Ticket },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/inbox", label: "Inbox", icon: EnvelopeSimple },
  { to: "/admin/analytics", label: "Analytics", icon: ChartLine },
];

export default function AdminNav() {
  return (
    <nav aria-label="Admin sections" className="mt-8">
      <ul className="flex snap-x gap-2 overflow-x-auto pb-2">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="snap-start">
            <NavLink
              to={to}
              // `end` on the index tab only, so /admin/users doesn't light up
              // Overview as well.
              end={to === "/admin"}
              className={({ isActive }) =>
                [
                  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
                  isActive
                    ? "border-transparent bg-[image:var(--grad-brand)] text-white"
                    : "border-[var(--glass-edge)] bg-white/[0.04] text-[var(--color-fg-muted)] hover:bg-white/[0.08] hover:text-[var(--color-fg)]",
                ].join(" ")
              }
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
