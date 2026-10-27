import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  auth as authApi,
  clearToken,
  decodeToken,
  getToken,
  setToken as persistToken,
  syncTokenFromStorage,
  setUnauthorizedHandler,
} from "./api";

/**
 * Auth state derived from the JWT in localStorage.
 *
 * The server issues a token carrying { id, email, name, role, exp }, so the UI
 * can read role and name without a round trip. Anything that actually matters
 * is still enforced server-side by authMiddleware + roleMiddleware.
 */

const AuthContext = createContext(null);

/** Where a user lands after signing in, mirroring the old auth.js behaviour. */
export const destinationForRole = (role) => {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "admin") return "/admin";
  if (normalized === "organizer") return "/dashboard";
  return "/";
};

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => decodeToken());

  /** Adopts a freshly issued token (login, or the Google OAuth handoff). */
  const signIn = useCallback((token) => {
    const payload = decodeToken(token);
    if (!payload) return null;
    persistToken(token);
    setUser(payload);
    return payload;
  }, []);

  const signOut = useCallback(
    ({ redirectTo = "/" } = {}) => {
      clearToken();
      setUser(null);
      if (redirectTo) navigate(redirectTo, { replace: true });
    },
    [navigate]
  );

  // A rejected token anywhere in the app drops the session immediately rather
  // than leaving a signed-in shell that every request will bounce.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Refresh visible account details/permissions; the server checks them on every protected request.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      const refreshToken = getToken();
      try {
        const { user: current } = await authApi.me(controller.signal);
        if (active && current) setUser(previous => {
          if (!active || !previous || previous.id !== current._id || getToken() !== refreshToken) return previous;
          // Keep the context stable when nothing changed, so a background
          // permissions check does not redraw every signed-in page.
          if (previous.id === current._id && Object.entries(current).every(([key, value]) => previous[key] === value)) return previous;
          return { ...previous, ...current, id: current._id };
        });
      } catch { /* API authentication failures still clear the session centrally. */ }
      finally { inFlight = false; }
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [user?.id]);

  // Keep tabs in sync: signing out in one tab signs out the others.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== null && event.key !== "token") return;
      setUser(decodeToken(syncTokenFromStorage(event.key === null ? null : event.newValue)));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Drop the session the moment the token expires while the tab is open.
  useEffect(() => {
    if (!user?.exp) return undefined;
    const expiryToken = getToken();
    const payload = decodeToken(expiryToken);
    if (!payload) {
      setUser(null);
      return undefined;
    }
    let timer;
    const expire = () => {
      if (getToken() !== expiryToken) {
        // A cross-tab sign-in may arrive before its storage event. An old
        // expiry callback must never invalidate the replacement session.
        setUser(decodeToken());
        return;
      }
      const msLeft = payload.exp * 1000 - Date.now();
      if (msLeft > 0) {
        timer = window.setTimeout(expire, Math.min(msLeft, 2 ** 31 - 1));
      } else if (clearToken(expiryToken)) {
        setUser(null);
      }
    };
    expire();
    return () => window.clearTimeout(timer);
  }, [user?.exp]);

  const value = useMemo(() => {
    const role = String(user?.role || "").toLowerCase();
    return {
      user,
      role,
      isSignedIn: Boolean(user),
      isAdmin: role === "admin",
      isOrganizer: role === "organizer" || role === "admin",
      signIn,
      signOut,
    };
  }, [user, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
