/** Transactional email through Brevo HTTPS. SMTP is available only by explicit opt-in. */
const fs = require('node:fs/promises');
const path = require('node:path');
const nodemailer = require('nodemailer');
const SEND_TIMEOUT_MS = 20000;

function mailError(code, message, providerStatus) {
  const error = new Error(message);
  error.code = code;
  if (providerStatus) error.providerStatus = providerStatus;
  return error;
}

function brevoError(status, data = {}) {
  const prefix = `Brevo rejected the request (HTTP ${status}). `;
  // Classify the response without copying provider data (keys, recipients or IPs)
  // into application errors. The read-only CLI can show the relevant blocked IP.
  if ([401, 403].includes(status) && /\bip\b|ip address/i.test(String(data.message || ''))) {
    return mailError('BREVO_IP_BLOCKED', prefix + "Authorize this server's current outbound IP in Brevo's security settings.", status);
  }
  if (status === 401) return mailError('BREVO_AUTH_FAILED', prefix + 'Check that BREVO_API_KEY is a complete active API key, not an SMTP key.', status);
  if (status === 402) return mailError('BREVO_CREDITS', prefix + 'Check the account credit balance and transactional email plan.', status);
  if (status === 429) return mailError('BREVO_RATE_LIMITED', prefix + 'The sending limit was reached. Retry after the provider limit resets.', status);
  return mailError('BREVO_REJECTED', prefix + 'Check sender verification, account permissions and transactional logs.', status);
}

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
  async function brevoRequest(route, options = {}) {
    if (!env.BREVO_API_KEY) throw mailError('BREVO_NOT_CONFIGURED', 'BREVO_API_KEY is not configured.');
    let response;
    try {
      response = await fetchImpl('https://api.brevo.com/v3' + route, {
        ...options,
        headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS), redirect: 'error',
      });
    } catch (error) {
      if (['AbortError', 'TimeoutError'].includes(error.name)) throw mailError('BREVO_TIMEOUT', 'Brevo request timed out; delivery is not yet confirmed.');
      if (['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.cause?.code || error.code)) {
        throw mailError('BREVO_TLS_ERROR', "Brevo's TLS certificate could not be verified. Check the server's trusted certificate configuration.");
      }
      throw mailError('BREVO_UNREACHABLE', 'Brevo could not be reached; delivery is not yet confirmed.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw brevoError(response.status, data);
    return data;
  }
  // A GET-only check: it never sends mail or changes the provider account.
  async function checkBrevoConfiguration() {
    const sender = address(env.MAIL_FROM, env.MAIL_FROM_NAME || 'Evently');
    const data = await brevoRequest('/senders');
    if (!data.senders?.some(item => item.email?.toLowerCase() === sender.email.toLowerCase() && item.active === true)) {
      throw mailError('BREVO_SENDER_UNVERIFIED', 'The configured MAIL_FROM sender is not active in this Brevo account. Verify it before sending mail.');
    }
    return { transport: 'brevo', apiAuthenticated: true, senderVerified: true };
  }
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
      const data = await brevoRequest('/smtp/email', { method: 'POST', body: JSON.stringify(payload) });
      if (!data.messageId) throw new Error('Brevo did not return a message ID; delivery is not yet confirmed.');
      return { id: data.messageId, transport: 'brevo' };
    }
    smtp ||= smtpFactory({ service: 'gmail', auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS }, connectionTimeout: SEND_TIMEOUT_MS, greetingTimeout: SEND_TIMEOUT_MS, socketTimeout: SEND_TIMEOUT_MS });
    const info = await smtp.sendMail({ from: { address: sender.email, name: sender.name }, to: recipients.map(item => ({ address: item.email, name: item.name })), subject, html, text: plain, ...(reply ? { replyTo: { address: reply.email, name: reply.name } } : {}), attachments: files });
    return { id: info?.messageId || null, transport: 'smtp' };
  }
  return { sendMail, activeTransport, checkBrevoConfiguration };
}
module.exports = { ...createMailer(), createMailer, brevoError, escapeHtml, htmlToText };
