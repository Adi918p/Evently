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
  clearToken,
  decodeToken,
  getToken,
  setToken as persistToken,
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
      clearToken();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Keep tabs in sync: signing out in one tab signs out the others.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== null && event.key !== "token") return;
      setUser(decodeToken(getToken()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Drop the session the moment the token expires while the tab is open.
  useEffect(() => {
    if (!user?.exp) return undefined;
    const msLeft = user.exp * 1000 - Date.now();
    if (msLeft <= 0) {
      clearToken();
      setUser(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      clearToken();
      setUser(null);
    }, Math.min(msLeft, 2 ** 31 - 1));
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
