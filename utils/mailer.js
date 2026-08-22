/**
 * Outbound mail.
 *
 * One function, two transports:
 *
 *   Resend      the real one. An HTTPS API, so it works from hosts that block
 *               outbound SMTP, and mail leaves from a verified domain instead of
 *               a personal mailbox. Used whenever RESEND_API_KEY is set.
 *   nodemailer  Gmail SMTP, the previous transport. Kept as a fallback so a
 *               missing or rejected API key degrades to the old behaviour rather
 *               than silently dropping ticket emails.
 *
 * Why the switch: Gmail SMTP caps a free account at a few hundred messages a
 * day, throttles bursts, and mail sent from a personal address to strangers is
 * routinely filed as spam - which for this app means a paid ticket that never
 * arrives. Both of those are deliverability problems no amount of retrying
 * fixes.
 *
 * Everything funnels through sendMail() so the sender identity, the timeout and
 * the plain-text alternative are decided in exactly one place.
 */

const fs = require("fs/promises");
const path = require("path");
const nodemailer = require("nodemailer");

/** A send that hangs must not hold an HTTP request open indefinitely. */
const SEND_TIMEOUT_MS = 20000;

/* ==========================================================================
   HTML escaping
   ========================================================================== */

/**
 * Escapes a value for interpolation into an email body.
 *
 * Names and event titles are user-controlled and were previously dropped into
 * template literals raw, so anyone could inject markup into a mail we send with
 * our own domain's reputation behind it.
 */
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Crude HTML-to-text for the plain-text alternative. A message with no text
 * part scores worse with spam filters, and text/plain is what a screen reader
 * or a watch notification actually reads.
 */
const htmlToText = (html) =>
  String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/* ==========================================================================
   Transports
   ========================================================================== */

const hasResend = () => Boolean(process.env.RESEND_API_KEY);

let resendClient = null;

/** Lazy so a missing dependency or key surfaces at send time, not at boot. */
function getResendClient() {
  if (!resendClient) {
    const { Resend } = require("resend");
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

let smtpTransport = null;

function getSmtpTransport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return smtpTransport;
}

/**
 * The From header.
 *
 * MAIL_FROM should be a full `Name <address@domain>` on a domain verified with
 * Resend - an unverified sender is rejected outright. Falls back to the Gmail
 * account so the SMTP path keeps working unconfigured.
 */
function resolveFrom() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.EMAIL_USER) return `"Evently" <${process.env.EMAIL_USER}>`;
  return "Evently <onboarding@resend.dev>";
}

/**
 * Normalises the attachment shape.
 *
 * nodemailer streams a file straight off disk from `path`; Resend takes bytes
 * over HTTP and needs the content inline, so this reads the file once and hands
 * each transport what it wants.
 */
async function readAttachments(attachments) {
  const list = [];

  for (const item of attachments) {
    if (!item) continue;
    const filename = item.filename || path.basename(item.path || "attachment");

    if (item.content) {
      list.push({ filename, content: item.content, path: item.path });
      continue;
    }
    if (!item.path) continue;

    // A missing ticket PDF must not sink the whole message - the body still
    // carries the ticket id, which is enough to get someone through the door.
    try {
      const buffer = await fs.readFile(item.path);
      list.push({ filename, content: buffer, path: item.path });
    } catch (err) {
      console.warn(`[mailer] skipping unreadable attachment ${item.path}: ${err.message}`);
    }
  }

  return list;
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${SEND_TIMEOUT_MS}ms`)),
      SEND_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sendViaResend({ to, subject, html, text, attachments, replyTo }) {
  const payload = {
    from: resolveFrom(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };

  if (replyTo) payload.replyTo = replyTo;
  if (attachments.length > 0) {
    payload.attachments = attachments.map(({ filename, content }) => ({
      filename,
      content: Buffer.isBuffer(content) ? content.toString("base64") : content,
    }));
  }

  // The SDK reports failures in the resolved value rather than by throwing, so
  // an unchecked call looks like a success and the mail silently never lands.
  const { data, error } = await withTimeout(
    getResendClient().emails.send(payload),
    "Resend send"
  );

  if (error) {
    const err = new Error(error.message || "Resend rejected the message");
    err.name = error.name || "ResendError";
    throw err;
  }

  return { id: data?.id || null, transport: "resend" };
}

async function sendViaSmtp({ to, subject, html, text, attachments, replyTo }) {
  const mailOptions = {
    from: resolveFrom(),
    to,
    subject,
    html,
    text,
  };

  if (replyTo) mailOptions.replyTo = replyTo;
  if (attachments.length > 0) {
    mailOptions.attachments = attachments.map(({ filename, content, path: filePath }) =>
      filePath ? { filename, path: filePath } : { filename, content }
    );
  }

  const info = await withTimeout(getSmtpTransport().sendMail(mailOptions), "SMTP send");
  return { id: info?.messageId || null, transport: "smtp" };
}

/* ==========================================================================
   Public API
   ========================================================================== */

/**
 * Sends one message.
 *
 * Throws when the message could not be handed off. Callers whose work is
 * already committed - a paid booking, a saved account - must treat that as a
 * delivery problem and carry on, not as a failure of the thing they just did.
 *
 * @param {object}   options
 * @param {string|string[]} options.to
 * @param {string}   options.subject
 * @param {string}   options.html
 * @param {string}  [options.text]        derived from html when omitted
 * @param {Array}   [options.attachments] [{ filename, path }] or [{ filename, content }]
 * @param {string}  [options.replyTo]
 * @returns {Promise<{ id: string|null, transport: "resend"|"smtp" }>}
 */
async function sendMail({ to, subject, html, text, attachments = [], replyTo }) {
  if (!to) throw new Error("sendMail requires a recipient");
  if (!subject) throw new Error("sendMail requires a subject");

  const prepared = {
    to,
    subject,
    html,
    text: text || htmlToText(html),
    attachments: await readAttachments(attachments),
    replyTo,
  };

  if (hasResend()) {
    try {
      return await sendViaResend(prepared);
    } catch (err) {
      // A bad key, a paused account or an unverified sender should not stop the
      // mail going out if the old SMTP credentials are still around.
      const canFallBack = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
      console.error(`[mailer] Resend failed: ${err.message}`);
      if (!canFallBack) throw err;
      console.warn("[mailer] falling back to Gmail SMTP");
      return await sendViaSmtp(prepared);
    }
  }

  return sendViaSmtp(prepared);
}

module.exports = {
  sendMail,
  escapeHtml,
  htmlToText,
  activeTransport: () => (hasResend() ? "resend" : "smtp"),
};
