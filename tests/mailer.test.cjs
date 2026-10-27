const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMailer } = require('../utils/mailer');
const env = { BREVO_API_KEY: 'fixture-key-only', MAIL_FROM: 'Evently <sender@example.invalid>', EMAIL_USER: 'legacy@example.invalid', EMAIL_PASS: 'fixture' };
const message = { to: 'test@example.invalid', subject: 'Test pass', html: '<p>Booking confirmed</p>' };
test('Brevo receives sender, recipient, text, reply-to and base64 PDF bytes', async () => {
  const mailer = createMailer({ env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.headers['api-key'], 'fixture-key-only'); assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.sender, { name: 'Evently', email: 'sender@example.invalid' });
    assert.deepEqual(payload.to, [{ email: 'test@example.invalid' }]);
    assert.equal(payload.textContent, 'Booking confirmed');
    assert.deepEqual(payload.replyTo, { email: 'support@example.invalid' });
    assert.equal(Buffer.from(payload.attachment[0].content, 'base64').toString(), '%PDF-fixture');
    return { ok: true, json: async () => ({ messageId: '<fixture@example.invalid>' }) };
  } });
  assert.deepEqual(await mailer.sendMail({ ...message, replyTo: 'support@example.invalid', attachments: [{ filename: 'pass.pdf', content: Buffer.from('%PDF-fixture') }] }), { id: '<fixture@example.invalid>', transport: 'brevo' });
});
test('Brevo failure cannot silently fall back to Gmail or leak provider response data', async () => {
  let smtpCalled = false;
  const mailer = createMailer({ env, smtpFactory: () => { smtpCalled = true; }, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'fixture-key-only' }) }) });
  await assert.rejects(mailer.sendMail(message), error => /HTTP 401/.test(error.message) && !error.message.includes('fixture-key-only'));
  assert.equal(smtpCalled, false);
});
test('Brevo key, verified sender configuration and message ID are required', async () => {
  await assert.rejects(createMailer({ env: { MAIL_FROM: env.MAIL_FROM } }).sendMail(message), /BREVO_API_KEY/);
  await assert.rejects(createMailer({ env: { BREVO_API_KEY: 'fixture' } }).sendMail(message), /valid email/);
  await assert.rejects(createMailer({ env, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }).sendMail(message), /message ID/);
});
test('timeouts, invalid recipients and missing attachments are reported without sending another message', async () => {
  const mailer = createMailer({ env, fetchImpl: async () => { const error = new Error('fixture'); error.name = 'TimeoutError'; throw error; } });
  await assert.rejects(mailer.sendMail(message), /timed out/);
  await assert.rejects(mailer.sendMail({ ...message, to: 'bad\r\nBcc:other@example.invalid' }), /line breaks/);
  await assert.rejects(mailer.sendMail({ ...message, attachments: [{ path: 'tmp/nonexistent-mail-fixture.pdf' }] }), /ENOENT/);
});
