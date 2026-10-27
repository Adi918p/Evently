/** Transactional email through Brevo HTTPS. SMTP is available only by explicit opt-in. */
const fs = require('node:fs/promises');
const path = require('node:path');
const nodemailer = require('nodemailer');
const SEND_TIMEOUT_MS = 20000;

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


function address(value, defaultName) {
  const raw = String(value || '').trim();
  if (/[\r\n]/.test(raw)) throw new Error('Email addresses must not contain line breaks.');
  const match = raw.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match ? match[2] : raw).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new Error('A valid email address is required.');
  const name = (match ? match[1].replace(/^"|"$/g, '').trim() : defaultName) || undefined;
  return { email, ...(name ? { name } : {}) };
}

async function readAttachments(items) {
  const result = [];
  for (const item of items) {
    const filename = item.filename || path.basename(item.path || 'attachment');
    let content;
    if (item.content !== undefined) content = Buffer.isBuffer(item.content) ? item.content : Buffer.from(item.content, item.encoding || 'utf8');
    else if (item.path) content = await fs.readFile(item.path);
    else throw new Error('An email attachment needs content or a file path.');
    result.push({ filename, content });
  }
  return result;
}

function createMailer({ env = process.env, fetchImpl = (...args) => fetch(...args), smtpFactory = nodemailer.createTransport } = {}) {
  let smtp;
  const activeTransport = () => {
    const selected = String(env.MAIL_TRANSPORT || 'brevo').toLowerCase();
    if (!['brevo', 'smtp'].includes(selected)) throw new Error('MAIL_TRANSPORT must be brevo or smtp.');
    return selected;
  };
  async function sendMail({ to, subject, html, text, attachments = [], replyTo }) {
    if (!subject) throw new Error('sendMail requires a subject.');
    const recipients = (Array.isArray(to) ? to : [to]).map(value => address(value));
    if (!recipients.length) throw new Error('sendMail requires a recipient.');
    const sender = address(env.MAIL_FROM, env.MAIL_FROM_NAME || 'Evently');
    const reply = replyTo ? address(replyTo) : null;
    const transport = activeTransport();
    if (transport === 'brevo' && !env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not configured.');
    if (transport === 'smtp' && (!env.EMAIL_USER || !env.EMAIL_PASS)) throw new Error('SMTP credentials are not configured.');
    const files = await readAttachments(attachments);
    const plain = text || htmlToText(html);
    if (transport === 'brevo') {
      const payload = { sender, to: recipients, subject, ...(html ? { htmlContent: html } : {}), ...(plain ? { textContent: plain } : {}), ...(reply ? { replyTo: reply } : {}), ...(files.length ? { attachment: files.map(item => ({ name: item.filename, content: item.content.toString('base64') })) } : {}) };
      let response;
      try {
        response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
          method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(SEND_TIMEOUT_MS), redirect: 'error',
        });
      } catch (error) {
        // No provider/credential payloads in application logs, and no silent transport fallback.
        throw new Error(['AbortError', 'TimeoutError'].includes(error.name) ? 'Brevo request timed out; delivery is not yet confirmed.' : 'Brevo could not be reached; delivery is not yet confirmed.');
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('Brevo rejected the email (HTTP ' + response.status + '). Check the API key, sender verification, credits and transactional logs.');
      if (!data.messageId) throw new Error('Brevo did not return a message ID; delivery is not yet confirmed.');
      return { id: data.messageId, transport: 'brevo' };
    }
    smtp ||= smtpFactory({ service: 'gmail', auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS }, connectionTimeout: SEND_TIMEOUT_MS, greetingTimeout: SEND_TIMEOUT_MS, socketTimeout: SEND_TIMEOUT_MS });
    const info = await smtp.sendMail({ from: { address: sender.email, name: sender.name }, to: recipients.map(item => ({ address: item.email, name: item.name })), subject, html, text: plain, ...(reply ? { replyTo: { address: reply.email, name: reply.name } } : {}), attachments: files });
    return { id: info?.messageId || null, transport: 'smtp' };
  }
  return { sendMail, activeTransport };
}
module.exports = { ...createMailer(), createMailer, escapeHtml, htmlToText };
