const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const dns = require('node:dns').promises;
const User = require('../models/User');

test('signup and OTP resend report provider outage safely and log its actionable category', async () => {
  const keys = ['MAIL_TRANSPORT', 'MAIL_FROM', 'BREVO_API_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { MAIL_TRANSPORT: 'brevo', MAIL_FROM: 'Evently <sender@example.invalid>', BREVO_API_KEY: 'fixture-key-only' });
  const originalFetch = global.fetch;
  const logs = [];
  const deleted = [];
  let saved;
  mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  mock.method(dns, 'resolveMx', async () => [{ exchange: 'mail.example.invalid', priority: 1 }]);
  mock.method(User, 'findOne', async () => null);
  mock.method(User.prototype, 'save', async function () { saved = this; return this; });
  mock.method(User, 'findByIdAndDelete', async id => { deleted.push(String(id)); });
  mock.method(User, 'findOneAndUpdate', async () => ({ name: 'Fixture', email: 'signup@example.invalid' }));
  mock.method(global, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://api.brevo.com/')) return { ok: false, status: 401, json: async () => ({ message: 'Unrecognised IP address 2001:db8::10 fixture-key-only' }) };
    return originalFetch(url, options);
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [route, body] of [
      ['register', { name: 'Signup Fixture', email: 'signup@example.invalid', password: 'Fixture123!' }],
      ['resend-email-otp', { email: 'signup@example.invalid' }],
    ]) {
      const response = await fetch(`${origin}/api/auth/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 503);
      const result = await response.json();
      assert.equal(result.success, false);
      assert.match(result.message, /could not send the verification email/);
      assert.doesNotMatch(JSON.stringify(result), /BREVO_|Brevo|2001:db8|fixture-key-only/);
    }
    assert.deepEqual(deleted, [String(saved._id)], 'only the failed new registration is removed');
    assert.equal(logs.filter(line => line.includes('BREVO_IP_BLOCKED')).length, 2);
    assert.ok(logs.every(line => !/2001:db8|fixture-key-only|signup@example/.test(line)));
  } finally {
    await new Promise(resolve => server.close(resolve));
    mock.restoreAll();
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
