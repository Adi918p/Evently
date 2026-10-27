const express = require('express');
const crypto = require('node:crypto');
function createRelay({ targetOrigin, secret, onDelivery = () => {}, fetchImpl = fetch }) {
  const target = new URL(targetOrigin);
  if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('The relay target must be local HTTP.');
  if (!secret) throw new Error('A webhook secret is required.');
  const app = express(); app.disable('x-powered-by');
  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const signature = req.get('x-razorpay-signature') || '';
    const expected = Buffer.isBuffer(req.body) && crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (!expected || !/^[a-f0-9]{64}$/i.test(signature) || !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    try {
      const response = await fetchImpl(new URL('/api/payments/webhook', target), { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature }, body: req.body, signal: AbortSignal.timeout(20000), redirect: 'error' });
      let event = 'unknown'; try { event = JSON.parse(req.body).event || event; } catch {}
      onDelivery({ receivedAt: new Date().toISOString(), event: String(event).slice(0, 60), status: response.status });
      res.status(response.status).type('application/json').send(await response.text());
    } catch { res.status(502).json({ success: false, message: 'Local webhook service unavailable.' }); }
  });
  app.use((req, res) => res.status(404).json({ success: false, message: 'Not found.' }));
  app.use((error, req, res, next) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ success: false, message: 'Invalid webhook request.' }));
  return app;
}
module.exports = { createRelay };
