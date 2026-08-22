import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CheckCircle,
  Envelope,
  GoogleLogo,
  Lock,
  User,
} from "@phosphor-icons/react";
import Button from "../components/ui/Button";
import GlassCard from "../components/ui/GlassCard";
import { Input } from "../components/ui/Field";
import { auth as authApi } from "../lib/api";
import { destinationForRole, useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { spring } from "../motion/presets";

/* ==========================================================================
   Validation
   --------------------------------------------------------------------------
   These mirror Controllers/authController.js exactly. Client-side checks are a
   courtesy - they stop a round trip - and the server remains the authority.
   ========================================================================== */

const PASSWORD_RULES = [
  { test: (v) => v.length >= 8, label: "at least 8 characters" },
  { test: (v) => /[a-z]/.test(v), label: "a lowercase letter" },
  { test: (v) => /[A-Z]/.test(v), label: "an uppercase letter" },
  { test: (v) => /\d/.test(v), label: "a number" },
  { test: (v) => /[^A-Za-z0-9]/.test(v), label: "a special character" },
];

const passwordProblems = (value) =>
  PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RESEND_COOLDOWN = 30;

/* ==========================================================================
   Mode switch
   ========================================================================== */

function ModeTabs({ mode, onChange }) {
  const reduced = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="Sign in or create an account"
      className="glass glass-1 grid grid-cols-2 gap-1 rounded-[var(--radius-pill)] p-1"
    >
      {[
        { value: "login", label: "Log in" },
        { value: "signup", label: "Sign up" },
      ].map((tab) => {
        const active = mode === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className="relative min-h-11 rounded-[var(--radius-pill)] px-4 text-sm font-semibold [touch-action:manipulation]"
          >
            {/* One shared element slides between tabs, so the change reads as
                movement rather than two separate fades (continuity). */}
            {active ? (
              <motion.span
                layoutId="auth-tab"
                aria-hidden="true"
                className="absolute inset-0 rounded-[var(--radius-pill)] bg-[image:var(--grad-brand)] shadow-[var(--shadow-glow)]"
                transition={reduced ? { duration: 0 } : spring.snap}
              />
            ) : null}
            <span
              className={`relative ${active ? "text-white" : "text-[var(--color-fg-muted)]"}`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Log in
   ========================================================================== */

function LoginForm({ onSuccess }) {
  const toast = useToast();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => {
    setValues((prev) => ({ ...prev, [key]: event.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const email = values.email.trim().toLowerCase();
    const next = {};
    if (!email) next.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email)) next.email = "That doesn't look like an email address.";
    if (!values.password) next.password = "Enter your password.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      // Password is sent exactly as typed - trimming it would break anyone
      // whose password legitimately starts or ends with a space.
      const data = await authApi.login(email, values.password);
      if (!data?.token) throw new Error("The sign-in response was invalid. Please try again.");
      onSuccess(data.token);
    } catch (error) {
      // Server messages are specific and actionable ("Verify your email first",
      // "Account suspended"), so they are surfaced verbatim (error-clarity).
      setErrors({ form: error.message || "Unable to sign in." });
      toast.error(error.message || "Unable to sign in.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {errors.form ? (
        <p
          role="alert"
          className="wrap-anywhere rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] px-4 py-3 text-sm text-[#fca5a5]"
        >
          {errors.form}
        </p>
      ) : null}

      <Input
        label="Email"
        type="email"
        name="email"
        icon={Envelope}
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={set("email")}
        error={errors.email}
      />

      <Input
        label="Password"
        type="password"
        name="password"
        icon={Lock}
        required
        autoComplete="current-password"
        placeholder="Enter your password"
        value={values.password}
        onChange={set("password")}
        error={errors.password}
      />

      <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
        Log in
        <ArrowRight size={18} weight="bold" aria-hidden="true" />
      </Button>
    </form>
  );
}

/* ==========================================================================
   Sign up (two steps: details, then the emailed OTP)
   ========================================================================== */

function SignupForm({ onVerified }) {
  const toast = useToast();
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef(null);

  // Countdown for the resend button. Server-side the OTP itself lives for
  // 10 minutes; this only throttles the button.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (awaitingOtp) otpRef.current?.focus();
  }, [awaitingOtp]);

  const set = (key) => (event) => {
    setValues((prev) => ({ ...prev, [key]: event.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const problems = useMemo(
    () => passwordProblems(values.password),
    [values.password]
  );

  const startVerification = () => {
    setAwaitingOtp(true);
    setCooldown(RESEND_COOLDOWN);
  };

  const submitDetails = async (event) => {
    event.preventDefault();

    const name = values.name.trim();
    const email = values.email.trim().toLowerCase();
    const next = {};

    if (name.length < 2 || name.length > 80)
      next.name = "Your name needs to be between 2 and 80 characters.";
    if (!EMAIL_RE.test(email))
      next.email = "That doesn't look like an email address.";
    if (problems.length > 0)
      next.password = `Password needs ${problems.join(", ")}.`;
    if (values.confirm !== values.password)
      next.confirm = "Both passwords need to match.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      // Ask first: this is what stops a second signup attempt from wiping a
      // pending verification, and it catches undeliverable domains before we
      // create anything.
      const check = await authApi.checkEmail(email);

      if (check?.registered && check?.pendingVerification) {
        startVerification();
        toast.info("This signup is waiting on email verification. Enter the OTP or resend it.");
        setBusy(false);
        return;
      }
      if (check?.registered) {
        throw new Error("That email is already registered. Please log in instead.");
      }
      if (check?.deliverable === false) {
        throw new Error(check?.message || "That email domain cannot receive mail.");
      }

      const result = await authApi.register(name, email, values.password);
      startVerification();
      toast.success(result?.message || "OTP sent. Check your email to continue.");
    } catch (error) {
      setErrors({ form: error.message || "Could not start signup." });
      toast.error(error.message || "Could not start signup.");
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    const code = otp.trim();

    if (!/^\d{6}$/.test(code)) {
      setErrors({ otp: "Enter the 6-digit code from your email." });
      return;
    }

    setBusy(true);
    try {
      const result = await authApi.verifyEmailOtp(
        values.email.trim().toLowerCase(),
        code
      );
      toast.success(result?.message || "Email verified. You can log in now.");
      // Verification does not issue a token, so the next step is a real login.
      onVerified(values.email.trim().toLowerCase());
    } catch (error) {
      setErrors({ otp: error.message || "Could not verify that code." });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const result = await authApi.resendEmailOtp(
        values.email.trim().toLowerCase()
      );
      setCooldown(RESEND_COOLDOWN);
      toast.success(result?.message || "OTP resent.");
    } catch (error) {
      setErrors({ otp: error.message || "Could not resend the code." });
    } finally {
      setBusy(false);
    }
  };

  if (awaitingOtp) {
    return (
      <form onSubmit={submitOtp} noValidate className="space-y-5">
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-cyan)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-cyan)_10%,transparent)] px-4 py-3">
          <Envelope
            size={18}
            className="mt-0.5 shrink-0 text-[var(--color-cyan)]"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            We sent a 6-digit code to{" "}
            <strong className="wrap-anywhere text-[var(--color-fg)]">
              {values.email.trim().toLowerCase()}
            </strong>
            . It expires in 10 minutes.
          </p>
        </div>

        <Input
          ref={otpRef}
          label="Verification code"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          placeholder="123456"
          value={otp}
          onChange={(event) => {
            setOtp(event.target.value.replace(/\D/g, ""));
            if (errors.otp) setErrors({});
          }}
          error={errors.otp}
          className="tnum text-center text-2xl tracking-[0.5em]"
        />

        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          <CheckCircle size={18} weight="bold" aria-hidden="true" />
          Verify email
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={resend}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0 ? (
              <>
                Resend in <span className="tnum">{cooldown}</span>s
              </>
            ) : (
              "Resend code"
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAwaitingOtp(false);
              setOtp("");
              setErrors({});
            }}
          >
            Use a different email
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitDetails} noValidate className="space-y-5">
      {errors.form ? (
        <p
          role="alert"
          className="wrap-anywhere rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] px-4 py-3 text-sm text-[#fca5a5]"
        >
          {errors.form}
        </p>
      ) : null}

      <Input
        label="Full name"
        name="name"
        icon={User}
        required
        autoComplete="name"
        placeholder="Your full name"
        value={values.name}
        onChange={set("name")}
        error={errors.name}
      />

      <Input
        label="Email"
        type="email"
        name="email"
        icon={Envelope}
        required
        autoComplete="email"
        placeholder="you@example.com"
        helper="We'll email a 6-digit code to confirm it's yours."
        value={values.email}
        onChange={set("email")}
        error={errors.email}
      />

      <Input
        label="Password"
        type="password"
        name="password"
        icon={Lock}
        required
        autoComplete="new-password"
        placeholder="Create a password"
        helper="8+ characters with upper and lower case, a number and a symbol."
        value={values.password}
        onChange={set("password")}
        error={errors.password}
      />

      <Input
        label="Confirm password"
        type="password"
        name="confirm"
        icon={Lock}
        required
        autoComplete="new-password"
        placeholder="Repeat your password"
        value={values.confirm}
        onChange={set("confirm")}
        error={errors.confirm}
      />

      <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
        Create account
        <ArrowRight size={18} weight="bold" aria-hidden="true" />
      </Button>
    </form>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

const HIGHLIGHTS = [
  "One tap booking with Razorpay",
  "QR passes that work at the door",
  "Every booking in one place",
];

export default function Login() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, isSignedIn, role } = useAuth();
  const reduced = useReducedMotion();

  const mode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const next = searchParams.get("next");
  const handoffToken = searchParams.get("token");

  const finish = useCallback(
    (token) => {
      const payload = signIn(token);
      const destination = next || destinationForRole(payload?.role);
      navigate(destination, { replace: true });
    },
    [navigate, next, signIn]
  );

  // Google OAuth handoff. routes/auth.js redirects to
  // `${FRONTEND_URL}/login.html?token=<jwt>`, which legacy.jsx rewrites to
  // /login?token=<jwt>. Consume it, then get it out of the URL so the token is
  // not left sitting in history.
  useEffect(() => {
    if (!handoffToken) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("token");
        return params;
      },
      { replace: true }
    );
    finish(handoffToken);
  }, [handoffToken, finish, setSearchParams]);

  // Already signed in and arriving here directly: send them on.
  useEffect(() => {
    if (isSignedIn && !handoffToken) {
      navigate(next || destinationForRole(role), { replace: true });
    }
  }, [isSignedIn, handoffToken, navigate, next, role]);

  const setMode = (value) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("mode", value);
        return params;
      },
      { replace: true }
    );
  };

  return (
    <div className="shell section">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Brand panel. Decorative support for the form, so it drops out
            entirely on small screens rather than pushing the form below the
            fold (content-priority). */}
        <motion.div
          className="hidden lg:block"
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55 }}
        >
          <p className="kicker">Evently</p>
          <h1 className="mt-4 text-balance text-5xl leading-[0.98]">
            Your next night out starts with{" "}
            <span className="text-grad-brand">one account</span>.
          </h1>
          <ul className="mt-10 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
                  aria-hidden="true"
                >
                  <CheckCircle size={18} weight="fill" />
                </span>
                <span className="text-[var(--color-fg-muted)]">{item}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <div className="mx-auto w-full max-w-md">
          <GlassCard elevation={3} radius="2xl" className="p-7 sm:p-9">
            <ModeTabs mode={mode} onChange={setMode} />

            <div className="mt-8">
              <h2 className="text-2xl">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
                {mode === "login"
                  ? "Log in to see your bookings and tickets."
                  : "It takes about a minute, and one email to confirm."}
              </p>
            </div>

            {/* mode="wait" so the outgoing form is gone before the incoming one
                animates in - two overlapping forms would fight for focus. */}
            <div className="mt-7">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mode}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, x: mode === "login" ? -16 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: mode === "login" ? 16 : -16 }}
                  transition={{ duration: 0.22 }}
                >
                  {mode === "login" ? (
                    <LoginForm onSuccess={finish} />
                  ) : (
                    <SignupForm onVerified={() => setMode("login")} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="my-7 flex items-center gap-4">
              <span className="h-px flex-1 bg-[var(--glass-edge)]" />
              <span className="text-xs uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                or
              </span>
              <span className="h-px flex-1 bg-[var(--glass-edge)]" />
            </div>

            {/* A real link, not fetch: Passport needs a full page navigation. */}
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              href={authApi.googleUrl()}
            >
              <GoogleLogo size={20} weight="bold" aria-hidden="true" />
              Continue with Google
            </Button>

            <p className="mt-7 text-center text-xs leading-relaxed text-[var(--color-fg-subtle)]">
              By continuing you agree to our{" "}
              <Link
                to="/terms"
                className="font-semibold text-[var(--color-fg-muted)] underline decoration-1 underline-offset-4"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                className="font-semibold text-[var(--color-fg-muted)] underline decoration-1 underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
