import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Nav from "./components/layout/Nav";
import Footer from "./components/layout/Footer";
import SearchOverlay from "./components/search/SearchOverlay";
import SceneLayer from "./three/SceneLayer";
import ErrorBoundary from "./components/ErrorBoundary";
import { ErrorState, Loader } from "./components/ui/Feedback";
import { RequireAuth, RequireRole } from "./routes/guards";
import LegacyRedirect from "./routes/legacy";
import { pageTransition } from "./motion/presets";

/* ==========================================================================
   Routes - every page is code-split so the initial load only carries the shell
   (bundle-splitting, lazy-loading).
   ========================================================================== */

const Home = lazy(() => import("./routes/Home"));
const Events = lazy(() => import("./routes/Events"));
const EventDetail = lazy(() => import("./routes/EventDetail"));
const Clubs = lazy(() => import("./routes/Clubs"));
const ClubDetail = lazy(() => import("./routes/ClubDetail"));
const Experience = lazy(() => import("./routes/Experience"));
const Login = lazy(() => import("./routes/Login"));
const Contact = lazy(() => import("./routes/Contact"));
const Faq = lazy(() => import("./routes/Faq"));
const Support = lazy(() => import("./routes/Support"));
const Privacy = lazy(() => import("./routes/Privacy"));
const Terms = lazy(() => import("./routes/Terms"));
const NotFound = lazy(() => import("./routes/NotFound"));

const Profile = lazy(() => import("./routes/Profile"));
const MyBookings = lazy(() => import("./routes/MyBookings"));
const BookingSuccess = lazy(() => import("./routes/BookingSuccess"));

const Dashboard = lazy(() => import("./routes/organizer/Dashboard"));
const CreateEvent = lazy(() => import("./routes/organizer/CreateEvent"));
const EditEvent = lazy(() => import("./routes/organizer/EditEvent"));
const EventBookings = lazy(() => import("./routes/organizer/EventBookings"));
const Scanner = lazy(() => import("./routes/organizer/Scanner"));

const AdminDashboard = lazy(() => import("./routes/admin/AdminDashboard"));
const AdminEvents = lazy(() => import("./routes/admin/AdminEvents"));
const AdminUsers = lazy(() => import("./routes/admin/AdminUsers"));
const AdminInbox = lazy(() => import("./routes/admin/AdminInbox"));
const AdminAnalytics = lazy(() => import("./routes/admin/AdminAnalytics"));

/* ==========================================================================
   Scroll restoration
   ========================================================================== */

/**
 * A new page starts at the top; going back keeps the browser's own restored
 * position. Hash links scroll to their target once the page has painted.
 */
function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      const frame = requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "start",
        });
      });
      return () => cancelAnimationFrame(frame);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return undefined;
    // `key` changes on every navigation, including same-path pushes.
  }, [pathname, hash, key, reduced]);

  return null;
}

/* ==========================================================================
   Page frame
   ========================================================================== */

function PageFrame() {
  const location = useLocation();
  const reduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={location.pathname}
        id="main"
        tabIndex={-1}
        initial={reduced ? { opacity: 0 } : pageTransition.initial}
        animate={reduced ? { opacity: 1 } : pageTransition.animate}
        exit={reduced ? { opacity: 0 } : pageTransition.exit}
        className="relative"
        style={{ zIndex: "var(--z-content)" }}
      >
        <ErrorBoundary
          fallback={(reset) => (
            <div className="shell section">
              <ErrorState
                title="This page hit a snag"
                message="Something in here failed to render. Reloading usually clears it."
                onRetry={reset}
              />
            </div>
          )}
        >
          <Suspense
            fallback={
              <div className="grid min-h-[60dvh] place-items-center">
                <Loader label="Loading" />
              </div>
            }
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:id" element={<EventDetail />} />
              <Route path="/clubs" element={<Clubs />} />
              <Route path="/clubs/:id" element={<ClubDetail />} />
              <Route path="/experience" element={<Experience />} />
              <Route path="/login" element={<Login />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/support" element={<Support />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />

              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <Profile />
                  </RequireAuth>
                }
              />
              <Route
                path="/my-bookings"
                element={
                  <RequireAuth>
                    <MyBookings />
                  </RequireAuth>
                }
              />
              <Route
                path="/booking/success"
                element={
                  <RequireAuth>
                    <BookingSuccess />
                  </RequireAuth>
                }
              />

              {/* Organizer. Admins inherit organizer access. */}
              <Route
                path="/dashboard"
                element={
                  <RequireRole roles={["organizer", "admin"]}>
                    <Dashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/create-event"
                element={
                  <RequireAuth>
                    <CreateEvent />
                  </RequireAuth>
                }
              />
              <Route
                path="/events/:id/edit"
                element={
                  <RequireRole roles={["organizer", "admin"]}>
                    <EditEvent />
                  </RequireRole>
                }
              />
              <Route
                path="/events/:id/bookings"
                element={
                  <RequireRole roles={["organizer", "admin"]}>
                    <EventBookings />
                  </RequireRole>
                }
              />
              <Route
                path="/scanner"
                element={
                  <RequireRole roles={["organizer", "admin"]}>
                    <Scanner />
                  </RequireRole>
                }
              />

              <Route
                path="/admin"
                element={
                  <RequireRole roles="admin">
                    <AdminDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/events"
                element={
                  <RequireRole roles="admin">
                    <AdminEvents />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <RequireRole roles="admin">
                    <AdminUsers />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/inbox"
                element={
                  <RequireRole roles="admin">
                    <AdminInbox />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/analytics"
                element={
                  <RequireRole roles="admin">
                    <AdminAnalytics />
                  </RequireRole>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </motion.main>
    </AnimatePresence>
  );
}

/* ==========================================================================
   App
   ========================================================================== */

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  return (
    <>
      {/* First tab stop on every page (skip-links). */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[400] focus:rounded-[var(--radius-md)] focus:bg-[var(--color-violet)] focus:px-5 focus:py-3 focus:text-white"
      >
        Skip to main content
      </a>

      <SceneLayer />
      <ScrollManager />
      <LegacyRedirect />

      <Nav onOpenSearch={openSearch} />

      <div className="relative" style={{ paddingTop: "var(--nav-h)" }}>
        <PageFrame />
        <Footer />
      </div>

      <SearchOverlay open={searchOpen} onClose={closeSearch} />
    </>
  );
}
