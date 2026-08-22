import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import Button from "../ui/Button";
import GlassCard from "../ui/GlassCard";
import { Input, Textarea } from "../ui/Field";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { contact } from "../../lib/api";
import { respectMotion, scaleIn, spring } from "../../motion/presets";

/**
 * The message form behind both /contact and /support.
 *
 * Both legacy pages posted the identical `{name, email, subject, message}` body
 * to /api/contact, so they share one implementation here and differ only in
 * copy. Nothing about the request shape changed.
 *
 * All four fields are `required` on the Contact model, and the route has no
 * validation of its own - a missing field makes Mongoose throw and the API
 * answers a bare 500 "Server Error". So validation happens here, per field,
 * with the message sitting next to the input it belongs to (error-placement)
 * and only after the field has been left (inline-validation).
 *
 * Name and email are prefilled for signed-in users rather than asked for again
 * (redundant-entry).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY = { name: "", email: "", subject: "", message: "" };

function validate({ name, email, subject, message }) {
  const errors = {};

  if (!name.trim()) errors.name = "Tell us your name.";
  else if (name.trim().length < 2) errors.name = "That looks too short.";

  if (!email.trim()) errors.email = "We need an email to reply to.";
  else if (!EMAIL_RE.test(email.trim()))
    errors.email = "Check the email address — it looks incomplete.";

  if (!subject.trim()) errors.subject = "Add a short subject.";

  if (!message.trim()) errors.message = "Your message is empty.";
  else if (message.trim().length < 10)
    errors.message = "A little more detail helps us answer properly.";

  return errors;
}

export default function ContactForm({
  subjectLabel = "Subject",
  subjectPlaceholder = "What's this about?",
  messageLabel = "Message",
  messagePlaceholder = "Write your message…",
  submitLabel = "Send message",
  successTitle = "Message sent",
  successBody = "Thanks — we've got it. Replies come from support@event-ly.in, usually within a day.",
}) {
  const { user } = useAuth();
  const toast = useToast();
  const reduced = useReducedMotion();

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill once the token has been decoded. Only fills blanks, so it can never
  // stomp on something already typed.
  useEffect(() => {
    if (!user) return;
    setValues((current) => ({
      ...current,
      name: current.name || user.name || "",
      email: current.email || user.email || "",
    }));
  }, [user]);

  const setField = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [key]: value }));
    // Clear a shown error as soon as the input becomes valid again, but never
    // introduce one mid-keystroke.
    if (errors[key]) {
      const next = validate({ ...values, [key]: value });
      if (!next[key]) setErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const blurField = (key) => () => {
    setTouched((current) => ({ ...current, [key]: true }));
    const next = validate(values);
    setErrors((current) => ({ ...current, [key]: next[key] }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = validate(values);
    setErrors(found);
    setTouched({ name: true, email: true, subject: true, message: true });

    const firstBad = Object.keys(found)[0];
    if (firstBad) {
      // Move focus to the field that needs attention instead of leaving the
      // user to hunt for it (error-recovery).
      document.getElementById(`contact-${firstBad}`)?.focus();
      return;
    }

    setPending(true);
    try {
      await contact.send({
        name: values.name.trim(),
        email: values.email.trim(),
        subject: values.subject.trim(),
        message: values.message.trim(),
      });
      setSent(true);
      setValues({ ...EMPTY, name: values.name, email: values.email });
      setTouched({});
      toast.success("Message sent.");
    } catch (error) {
      toast.error(
        error?.data?.message ||
          error?.message ||
          "Couldn't send that. Try again in a moment."
      );
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        variants={respectMotion(scaleIn, reduced)}
        initial="hidden"
        animate="show"
      >
        <GlassCard
          elevation={3}
          radius="xl"
          glow
          className="flex flex-col items-center gap-5 p-9 text-center"
        >
          <motion.span
            initial={reduced ? false : { scale: 0.5, opacity: 0 }}
            animate={reduced ? false : { scale: 1, opacity: 1 }}
            transition={spring.bouncy}
            className="grid size-16 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-success)_18%,transparent)] text-[var(--color-success)]"
            aria-hidden="true"
          >
            <CheckCircle size={34} weight="fill" />
          </motion.span>

          <div className="space-y-2">
            <h2 className="text-2xl">{successTitle}</h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--color-fg-muted)]">
              {successBody}
            </p>
          </div>

          <Button variant="ghost" onClick={() => setSent(false)}>
            Send another
          </Button>
        </GlassCard>
      </motion.div>
    );
  }

  return (
    <GlassCard elevation={3} radius="xl" className="p-7 sm:p-9">
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="contact-name"
            name="name"
            label="Your name"
            required
            autoComplete="name"
            placeholder="Jasleen Kaur"
            value={values.name}
            onChange={setField("name")}
            onBlur={blurField("name")}
            error={touched.name ? errors.name : undefined}
          />
          <Input
            id="contact-email"
            name="email"
            type="email"
            label="Email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={values.email}
            onChange={setField("email")}
            onBlur={blurField("email")}
            error={touched.email ? errors.email : undefined}
          />
        </div>

        <Input
          id="contact-subject"
          name="subject"
          label={subjectLabel}
          required
          placeholder={subjectPlaceholder}
          value={values.subject}
          onChange={setField("subject")}
          onBlur={blurField("subject")}
          error={touched.subject ? errors.subject : undefined}
        />

        <Textarea
          id="contact-message"
          name="message"
          label={messageLabel}
          required
          rows={6}
          maxLength={2000}
          placeholder={messagePlaceholder}
          value={values.message}
          onChange={setField("message")}
          onBlur={blurField("message")}
          error={touched.message ? errors.message : undefined}
        />

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Required fields are marked
            <span
              aria-hidden="true"
              className="text-[var(--color-magenta-bright)]"
            >
              {" *"}
            </span>
            .
          </p>
          <Button type="submit" variant="primary" size="lg" loading={pending}>
            <PaperPlaneTilt size={18} aria-hidden="true" />
            {submitLabel}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
