// External Brevo check. Reads ignored local config; sending requires --send and EMAIL_TEST_TO.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
const { createMailer } = require('../utils/mailer');
const evidence = path.resolve(__dirname, '../audit/brevo-smoke.json');
const result = { checkedAt: new Date().toISOString(), provider: 'brevo', apiAuthenticated: false, senderVerified: false, emailAccepted: false, deliveryConfirmed: false, paymentCreated: false };
async function api(route) {
  const response = await fetch('https://api.brevo.com/v3' + route, { headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const category = /\bip\b|ip address/i.test(failure.message || '') ? 'Check the authorized IP/security settings in Brevo.' : response.status === 401 ? 'Check that this is the complete active API key, not an SMTP key.' : 'Check the Brevo account settings.';
    throw new Error('Brevo HTTP ' + response.status + '. ' + category);
  }
  return response.json();
}
async function main() {
  if (process.argv.includes('--status')) {
    if (process.argv.includes('--send')) throw new Error('Configure either --status or --send, not both.');
    const previous = fs.existsSync(evidence) ? JSON.parse(fs.readFileSync(evidence, 'utf8')) : null;
    if (!previous?.emailAccepted || !previous.messageId) throw new Error('Configure a successful authorized test send before checking delivery.');
    Object.assign(result, previous);
    if (!env.BREVO_API_KEY) throw new Error('Configure BREVO_API_KEY first.');
    const report = await api('/smtp/statistics/events?messageId=' + encodeURIComponent(result.messageId) + '&limit=20&days=30');
    result.events = [...new Set((report.events || []).map(row => row.event))];
    result.deliveryCheckedAt = new Date().toISOString();
    result.deliveryConfirmed = result.events.includes('delivered');
    result.nextStep = result.deliveryConfirmed ? 'Recipient should confirm the attachment opens.' : 'Check this message again with --status without resending.';
    delete result.error;
    return;
  }
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) throw new Error('Configure BREVO_API_KEY and a verified MAIL_FROM in .env first.');
  const senderEmail = (env.MAIL_FROM.match(/<([^<>]+)>/)?.[1] || env.MAIL_FROM).trim().toLowerCase();
  const response = await api('/senders'); result.apiAuthenticated = true;
  result.senderVerified = response.senders?.some(sender => sender.email?.toLowerCase() === senderEmail && sender.active === true) || false;
  if (!result.senderVerified) throw new Error('The configured sender is not verified in this Brevo account.');
  if (!process.argv.includes('--send')) { result.nextStep = 'Run with --send only after EMAIL_TEST_TO is set to an authorized inbox.'; return; }
  if (!env.EMAIL_TEST_TO) throw new Error('Set EMAIL_TEST_TO to the inbox authorized for this test.');
  const generateTicketPdf = require('../utils/generateTicketPdf');
  const ticketId = 'TEST-' + crypto.randomUUID();
  const event = { title: 'Integration test — not valid for entry', date: '2099-01-01', time: '18:00', venue: 'Test only', location: 'Test only', price: 0, ticketConfig: { notes: 'TEST DOCUMENT ONLY. This is not a valid admission pass.' } };
  const booking = { ticketId, tickets: 1, totalPrice: 0, bookedAt: new Date(), status: 'confirmed', qrCode: await require('qrcode').toDataURL(JSON.stringify({ testOnly: true, ticketId })) };
  const pdfPath = await generateTicketPdf(booking, event, { name: 'Evently test recipient', email: env.EMAIL_TEST_TO });
  if (fs.readFileSync(pdfPath).subarray(0, 4).toString() !== '%PDF') throw new Error('Test PDF generation failed.');
  result.pdfGenerated = true;
  const sent = await createMailer({ env: { ...env, MAIL_TRANSPORT: 'brevo' } }).sendMail({
    to: env.EMAIL_TEST_TO, subject: '[Evently test] Brevo delivery and PDF attachment',
    html: '<h1>Evently email test</h1><p>A blue penguin just ordered mango ice cream on the moon.</p><p>This random sentence is part of your requested delivery test. The attached sample ticket is marked TEST and cannot be used for admission. No booking or payment was created by this email test.</p>',
    attachments: [{ filename: 'Evently-TEST-ONLY.pdf', path: pdfPath }],
  });
  result.emailAccepted = true; result.messageId = sent.id;
  const report = await api('/smtp/statistics/events?messageId=' + encodeURIComponent(sent.id) + '&limit=20&days=1');
  result.events = [...new Set((report.events || []).map(row => row.event))];
  result.deliveryConfirmed = result.events.includes('delivered');
  result.nextStep = result.deliveryConfirmed ? 'Recipient should confirm the attachment opens.' : 'Delivery can be asynchronous; check the saved message ID in Brevo logs and confirm the recipient inbox.';
}
main().catch(error => {
  result.error = /^(Configure |The configured |Set EMAIL_TEST_TO|Test PDF|Brevo HTTP)/.test(error.message) ? error.message : 'External email check failed; inspect configuration and provider status without sharing secrets.';
  process.exitCode = 1;
}).finally(() => { fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2)); });
