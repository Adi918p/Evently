import { Navigate, useLocation } from "react-router-dom";
import { ShieldWarning } from "@phosphor-icons/react";
import { useAuth } from "../lib/auth";
import { EmptyState } from "../components/ui/Feedback";

/**
 * Route guards.
 *
 * These are a UX affordance, not a security boundary - every protected route
 * also hits an API that enforces the same rule server-side via authMiddleware
 * and roleMiddleware. The point here is to avoid showing someone a dashboard
 * that will only ever return 403.
 */

/** Signed-in only. Remembers where the user was headed. */
export function RequireAuth({ children }) {
  const { isSignedIn } = useAuth();
  const location = useLocation();

  if (!isSignedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?mode=login&next=${next}`} replace />;
  }

  return children;
}

/**
 * Role-gated. Renders an explanation rather than redirecting, because silently
 * bouncing someone to the home page reads as a broken link.
 */
export function RequireRole({ roles, children }) {
  const { isSignedIn, role } = useAuth();
  const location = useLocation();
  const allowed = Array.isArray(roles) ? roles : [roles];

  if (!isSignedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?mode=login&next=${next}`} replace />;
  }

  if (!allowed.includes(role)) {
    return (
      <div className="shell section">
        <EmptyState
          icon={ShieldWarning}
          title="You don't have access to this page"
          description={`This area is for ${allowed.join(" and ")} accounts. If you think that's wrong, get in touch and we'll sort it out.`}
          action="Back to events"
          actionTo="/events"
        />
      </div>
    );
  }

  return children;
}
