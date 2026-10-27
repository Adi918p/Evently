const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRelay } = require('../scripts/local-webhook-relay.cjs');
test('public relay exposes only the signed webhook and forwards raw bytes unchanged', async () => {
  let calls = 0;
  const body = '{ "event": "test.connectivity" }'; const secret = 'fixture-secret';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const server = createRelay({ targetOrigin: 'http://127.0.0.1:5173', secret, fetchImpl: async (url, options) => {
    calls++; assert.equal(url.href, 'http://127.0.0.1:5173/api/payments/webhook');
    assert.equal(options.body.toString(), body); assert.equal(options.headers['x-razorpay-signature'], signature);
    return { status: 200, text: async () => '{"success":true}' };
  } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const route of ['/', '/api/auth/me', '/api/events', '/.env']) assert.equal((await fetch(origin + route)).status, 404);
    const send = value => fetch(origin + '/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': value }, body });
    assert.equal((await send('0'.repeat(64))).status, 400); assert.equal(calls, 0);
    assert.equal((await send(signature)).status, 200); assert.equal(calls, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('relay refuses an external forwarding target or absent signing secret', () => {
  assert.throws(() => createRelay({ targetOrigin: 'https://example.com', secret: 'x' }), /local HTTP/);
  assert.throws(() => createRelay({ targetOrigin: 'http://127.0.0.1:5173' }), /secret/);
});
