import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import {
  CalendarPlus,
  CaretDown,
  List,
  MagnifyingGlass,
  QrCode,
  ShieldCheck,
  SignOut,
  SquaresFour,
  Ticket,
  User,
  X,
} from "@phosphor-icons/react";
import Button from "../ui/Button";
import { useAuth } from "../../lib/auth";
import {
  respectInteraction,
  respectMotion,
  scrim,
  sheetPanel,
  spring,
  stagger,
  pressableSubtle,
} from "../../motion/presets";

/**
 * Top navigation.
 *
 * Notes on the choices here:
 *   - the nav is fixed, so the page reserves --nav-h of padding for it
 *     (fixed-element-offset)
 *   - the active-route pill is a shared layout element, so it slides between
 *     links rather than blinking (shared-element-transition)
 *   - the mobile sheet traps nothing: it is a full-height panel with a real
 *     close button, and route changes close it automatically
 *   - the user menu closes on Escape, outside click and route change, and its
 *     trigger reports aria-expanded
 */

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/events", label: "Events" },
  { to: "/clubs", label: "Clubs" },
  { to: "/experience", label: "Experience" },
  { to: "/contact", label: "Contact" },
];

/* ==========================================================================
   Scroll progress
   ========================================================================== */

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const width = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 40,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 h-px origin-left bg-[image:var(--grad-brand)]"
      style={{ scaleX: width }}
    />
  );
}

/* ==========================================================================
   User menu
   ========================================================================== */

function UserMenu() {
  const { user, role, isAdmin, isOrganizer, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const reduced = useReducedMotion();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = String(user?.name || user?.email || "You").split(" ")[0];
  const initial = first.charAt(0).toUpperCase();

  const items = [
    { to: "/profile", label: "My profile", icon: User },
    { to: "/my-bookings", label: "My bookings", icon: Ticket },
    ...(isOrganizer
      ? [
          { to: "/dashboard", label: "Organizer dashboard", icon: SquaresFour },
          { to: "/scanner", label: "Ticket scanner", icon: QrCode },
        ]
      : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin console", icon: ShieldCheck }] : []),
  ];

  return (
    <div ref={wrapRef} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        {...respectInteraction(pressableSubtle, reduced)}
        className="glass glass-2 flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] pl-1.5 pr-3"
      >
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-[image:var(--grad-brand)] text-sm font-bold text-white"
        >
          {initial}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-medium sm:block">
          {first}
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={spring.snap}
          className="text-[var(--color-fg-subtle)]"
        >
          <CaretDown size={14} weight="bold" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.snap }}
            exit={
              reduced
                ? { opacity: 0, transition: { duration: 0.12 } }
                : { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.13 } }
            }
            className="glass glass-4 glass-specular absolute right-0 top-[calc(100%+0.6rem)] w-60 origin-top-right overflow-hidden rounded-[var(--radius-lg)] p-1.5"
          >
            <div className="border-b border-[var(--glass-edge)] px-3 pb-3 pt-2">
              <p className="truncate text-sm font-semibold">{user?.name || first}</p>
              <p className="wrap-anywhere text-xs text-[var(--color-fg-subtle)]">
                {user?.email}
              </p>
              {role && role !== "user" ? (
                <p className="mt-1.5 inline-flex rounded-[var(--radius-pill)] bg-[color-mix(in_srgb,var(--color-violet)_24%,transparent)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#ddd6fe]">
                  {role}
                </p>
              ) : null}
            </div>

            <div className="py-1.5">
              {items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  role="menuitem"
                  className="flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--color-fg)]"
                >
                  <Icon size={17} aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => signOut()}
              className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-sm)] border-t border-[var(--glass-edge)] px-3 text-sm text-[#fca5a5] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)]"
            >
              <SignOut size={17} aria-hidden="true" />
              Log out
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ==========================================================================
   Mobile sheet
   ========================================================================== */

const sheetItem = {
  hidden: { opacity: 0, x: 18 },
  show: { opacity: 1, x: 0, transition: spring.snap },
  exit: { opacity: 0, x: 12 },
};

function MobileSheet({ open, onClose }) {
  const reduced = useReducedMotion();
  const { isSignedIn, isAdmin, isOrganizer, user, signOut } = useAuth();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const extras = [
    ...(isOrganizer
      ? [
          { to: "/dashboard", label: "Dashboard", icon: SquaresFour },
          { to: "/create-event", label: "Create event", icon: CalendarPlus },
          { to: "/scanner", label: "Scanner", icon: QrCode },
        ]
      : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }] : []),
    ...(isSignedIn
      ? [
          { to: "/profile", label: "Profile", icon: User },
          { to: "/my-bookings", label: "My bookings", icon: Ticket },
        ]
      : []),
  ];

  return (
    <AnimatePresence>
      {open ? (
        <div className="lg:hidden" style={{ zIndex: "var(--z-overlay)" }}>
          <motion.div
            variants={respectMotion(scrim, reduced)}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-[rgba(3,3,12,0.7)] backdrop-blur-sm"
            style={{ zIndex: "var(--z-overlay)" }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            variants={respectMotion(sheetPanel, reduced)}
            initial="hidden"
            animate="show"
            exit="exit"
            className="glass glass-4 fixed inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col rounded-l-[var(--radius-2xl)]"
            style={{ zIndex: "var(--z-overlay)" }}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <span className="kicker">Menu</span>
              <Button variant="ghost" size="sm" iconOnly aria-label="Close menu" onClick={onClose}>
                <X size={18} weight="bold" aria-hidden="true" />
              </Button>
            </div>

            <motion.nav
              variants={stagger(0.04, 0.06)}
              initial="hidden"
              animate="show"
              className="flex-1 overflow-y-auto px-3 pb-6"
            >
              {LINKS.map(({ to, label, end }) => (
                <motion.div key={to} variants={respectMotion(sheetItem, reduced)}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      [
                        "flex min-h-12 items-center rounded-[var(--radius-md)] px-4 font-display text-base font-medium transition-colors",
                        isActive
                          ? "bg-white/[0.1] text-[var(--color-fg)]"
                          : "text-[var(--color-fg-muted)] hover:bg-white/[0.06]",
                      ].join(" ")
                    }
                  >
                    {label}
                  </NavLink>
                </motion.div>
              ))}

              {extras.length ? (
                <>
                  <hr className="my-3 border-[var(--glass-edge)]" />
                  {extras.map(({ to, label, icon: Icon }) => (
                    <motion.div key={to} variants={respectMotion(sheetItem, reduced)}>
                      <NavLink
                        to={to}
                        onClick={onClose}
                        className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] px-4 text-sm text-[var(--color-fg-muted)] hover:bg-white/[0.06] hover:text-[var(--color-fg)]"
                      >
                        <Icon size={18} aria-hidden="true" />
                        {label}
                      </NavLink>
                    </motion.div>
                  ))}
                </>
              ) : null}
            </motion.nav>

            <div className="border-t border-[var(--glass-edge)] px-4 py-4">
              {isSignedIn ? (
                <div className="flex flex-col gap-3">
                  <p className="wrap-anywhere text-xs text-[var(--color-fg-subtle)]">
                    Signed in as {user?.email}
                  </p>
                  <Button
                    variant="danger"
                    fullWidth
                    onClick={() => {
                      onClose();
                      signOut();
                    }}
                  >
                    <SignOut size={17} aria-hidden="true" />
                    Log out
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Button variant="secondary" fullWidth to="/login?mode=login" onClick={onClose}>
                    Log in
                  </Button>
                  <Button variant="primary" fullWidth to="/login?mode=signup" onClick={onClose}>
                    Sign up
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/* ==========================================================================
   Nav
   ========================================================================== */

export default function Nav({ onOpenSearch }) {
  const { isSignedIn, isOrganizer } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (value) => {
    setScrolled(value > 24);
  });

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Cmd/Ctrl+K opens search from anywhere - a keyboard alternative to the
  // pointer-only search button (keyboard-shortcuts).
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenSearch?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenSearch]);

  return (
    <>
      <motion.header
        initial={reduced ? false : { y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...spring.soft, delay: 0.05 }}
        className={[
          "fixed inset-x-0 top-0 transition-colors duration-300",
          scrolled
            ? "glass glass-3 border-x-0 border-t-0"
            : "border-b border-transparent bg-transparent",
        ].join(" ")}
        style={{ zIndex: "var(--z-nav)", height: "var(--nav-h)" }}
      >
        <div className="shell flex h-full items-center gap-3">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Evently home"
          >
            <img
              src="/Media/Png/logo.jpg"
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-[var(--radius-sm)] object-cover"
            />
            <span className="hidden font-display text-lg font-extrabold tracking-[-0.03em] sm:block">
              Even<span className="text-grad-brand">tly</span>
            </span>
          </Link>

          {/* Desktop links */}
          <nav aria-label="Main" className="ml-4 hidden lg:block">
            <ul className="flex items-center gap-1">
              {LINKS.map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} className="group relative block">
                    {({ isActive }) => (
                      <>
                        <span
                          className={[
                            "relative z-10 flex min-h-11 items-center rounded-[var(--radius-pill)] px-4 text-sm font-medium transition-colors",
                            isActive
                              ? "text-[var(--color-fg)]"
                              : "text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]",
                          ].join(" ")}
                        >
                          {label}
                        </span>
                        {isActive ? (
                          <motion.span
                            layoutId="nav-pill"
                            aria-hidden="true"
                            transition={reduced ? { duration: 0 } : spring.snap}
                            className="absolute inset-0 rounded-[var(--radius-pill)] bg-white/[0.09]"
                          />
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSearch}
              className="gap-2"
              aria-label="Search events"
            >
              <MagnifyingGlass size={18} aria-hidden="true" />
              <span className="hidden xl:inline text-[var(--color-fg-subtle)]">
                Search
              </span>
              <kbd className="hidden xl:inline rounded border border-[var(--glass-edge)] px-1.5 py-0.5 font-mono text-[0.65rem] text-[var(--color-fg-subtle)]">
                ⌘K
              </kbd>
            </Button>

            {isOrganizer ? (
              <Button
                variant="secondary"
                size="sm"
                to="/create-event"
                className="hidden md:inline-flex"
              >
                <CalendarPlus size={17} aria-hidden="true" />
                Create
              </Button>
            ) : null}

            {isSignedIn ? (
              <UserMenu />
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="ghost" size="sm" to="/login?mode=login">
                  Log in
                </Button>
                <Button variant="primary" size="sm" to="/login?mode=signup">
                  Sign up
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="lg:hidden"
            >
              <List size={20} weight="bold" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <ScrollProgress />
      </motion.header>

      <MobileSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
