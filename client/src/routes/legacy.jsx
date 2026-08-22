import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Keeps old links working.
 *
 * Two reasons this has to exist:
 *   1. The Google OAuth callback in routes/auth.js redirects to
 *      `${FRONTEND_URL}/login.html?token=...`. That path is baked into the
 *      server, so the SPA must answer it.
 *   2. Every link anyone has already shared, bookmarked or texted points at a
 *      .html path. Those should land on the right page, not a 404.
 *
 * Query strings are preserved, and `?id=` / `?cid=` are promoted into the new
 * path params. All of these replace the history entry, so Back does not bounce
 * the user through the old URL again.
 */

const STATIC_MAP = {
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
  "/admin/analytics.html": "/admin/analytics",
};

/** Legacy pages that carried their record id in the query string. */
const PARAM_MAP = {
  "/event.html": { param: "id", to: (id) => `/events/${id}`, fallback: "/events" },
  "/club.html": { param: "cid", to: (id) => `/clubs/${id}`, fallback: "/clubs" },
  "/edit-event.html": {
    param: "id",
    to: (id) => `/events/${id}/edit`,
    fallback: "/dashboard",
  },
  "/event-bookings.html": {
    param: "id",
    to: (id) => `/events/${id}/bookings`,
    fallback: "/dashboard",
  },
};

export default function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!pathname.toLowerCase().endsWith(".html")) return;

    const key = pathname.toLowerCase();
    const params = new URLSearchParams(search);

    const withParam = PARAM_MAP[key];
    if (withParam) {
      const id = params.get(withParam.param);
      params.delete(withParam.param);
      const rest = params.toString();
      navigate(
        id
          ? `${withParam.to(id)}${rest ? `?${rest}` : ""}${hash}`
          : withParam.fallback,
        { replace: true }
      );
      return;
    }

    const target = STATIC_MAP[key];
    if (target) {
      navigate(`${target}${search}${hash}`, { replace: true });
      return;
    }

    // Unknown .html path: strip the extension and let the router try, which
    // ends at the 404 page if nothing matches.
    navigate(`${pathname.replace(/\.html$/i, "")}${search}${hash}`, {
      replace: true,
    });
  }, [pathname, search, hash, navigate]);

  return null;
}
