/**
 * Backwards-compatible wrapper around utils/mailer.js.
 *
 * The old signature was sendEmail(to, subject, html, attachmentPath) and it
 * spoke directly to Gmail SMTP. Callers keep that signature; the transport
 * choice now lives in mailer.js, so this file is only an adapter.
 *
 * New code should require ./mailer and call sendMail({ ... }) instead - it takes
 * a plain-text alternative, a reply-to and more than one attachment.
 */

const { sendMail } = require("./mailer");

const sendEmail = async (to, subject, html, attachment) => {
  const attachments = attachment
    ? [{ filename: "ticket.pdf", path: attachment }]
    : [];

  return sendMail({ to, subject, html, attachments });
};

module.exports = sendEmail;
