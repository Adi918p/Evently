// Local-only external integration harness. Never connects to the configured hosted MONGO_URI.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const config = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
if (!config.RAZORPAY_KEY_ID?.startsWith('rzp_test_') || !config.RAZORPAY_KEY_SECRET || !config.RAZORPAY_WEBHOOK_SECRET) throw new Error('Configure Razorpay test keys and webhook secret before starting this harness.');
for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) process.env[key] = config[key] || '';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.MONGOMS_DOWNLOAD_DIR = path.join(root, '.cache/mongodb');
const stateDir = path.join(root, '.cache/local-integration'); fs.mkdirSync(stateDir, { recursive: true });
const dbPath = path.join(stateDir, 'db'); fs.mkdirSync(dbPath, { recursive: true });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
let repl, server, relay, timer, stopping = false;
async function stop() {
  if (stopping) return; stopping = true; clearInterval(timer);
  // Prevent the ordinary reconnect helper from contacting any hosted URI on shutdown.
  delete process.env.MONGO_URI;
  if (relay) await new Promise(resolve => relay.close(resolve));
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); if (repl) await repl.stop({ doCleanup: false });
}
process.on('SIGINT', () => stop().then(() => process.exit()));
process.on('SIGTERM', () => stop().then(() => process.exit()));
async function main() {
  repl = await MongoMemoryReplSet.create({ instanceOpts: [{ dbPath, port: 27029 }], replSet: { name: 'evently-local-tests', count: 1, storageEngine: 'wiredTiger', dbName: 'evently_integration' } });
  process.env.MONGO_URI = repl.getUri('evently_integration');
  await mongoose.connect(process.env.MONGO_URI);
  const { app } = require('../server');
  const User = require('../models/User'), Event = require('../models/Events');
  const Booking = require('../models/Booking'), Purchase = require('../models/Purchase');
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  const organizer = await User.findOneAndUpdate({ email: 'local-organizer@example.invalid' }, { $setOnInsert: { name: 'Local test organizer', password: 'fixture-not-a-login', role: 'organizer', status: 'active', isEmailVerified: true } }, { upsert: true, returnDocument: 'after' });
  const buyer = await User.findOneAndUpdate({ email: 'local-buyer@example.invalid' }, { $setOnInsert: { name: 'Local test buyer', password: 'fixture-not-a-login', role: 'user', status: 'active', isEmailVerified: true } }, { upsert: true, returnDocument: 'after' });
  const ids = {};
  for (const [kind, price] of [['free', 0], ['paid', 1]]) {
    const event = await Event.findOneAndUpdate({ title: 'LOCAL TEST ONLY — ' + kind, organizer: organizer._id }, { $setOnInsert: { description: 'Dedicated test fixture. No real event or admission.', venue: 'Local test only', location: 'Ludhiana', date: '2099-01-01', time: '18:00', price, seats: 100, status: 'approved', ticketConfig: { notes: 'TEST ONLY. Not valid for entry.' } } }, { upsert: true, returnDocument: 'after', runValidators: true });
    ids[kind] = String(event._id);
  }
  server = app.listen(5173, '127.0.0.1'); await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const deliveries = [];
  relay = require('./local-webhook-relay.cjs').createRelay({ targetOrigin: 'http://127.0.0.1:5173', secret: config.RAZORPAY_WEBHOOK_SECRET, onDelivery: entry => {
    deliveries.push(entry); fs.writeFileSync(path.join(stateDir, 'webhook-deliveries.json'), JSON.stringify(deliveries.slice(-100), null, 2));
  } }).listen(8788, '127.0.0.1');
  await new Promise((resolve, reject) => { relay.once('listening', resolve); relay.once('error', reject); });
  const token = require('jsonwebtoken').sign({ id: String(buyer._id), role: 'user' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  fs.writeFileSync(path.join(stateDir, 'session.json'), JSON.stringify({ token, buyerId: String(buyer._id), events: ids, origin: 'http://localhost:5173', databaseUri: process.env.MONGO_URI, pid: process.pid }, null, 2));
  // Recover payments without enabling mail to unapproved recipients in this harness.
  let running = false;
  timer = setInterval(async () => {
    if (running || stopping) return; running = true;
    try {
      const service = require('../services/purchases');
      for (const purchase of await Purchase.find({ mode: 'test', state: { $in: ['creating', 'pending', 'refund_pending'] }, nextCheckAt: { $lte: new Date() } }).limit(20)) {
        await Purchase.updateOne({ _id: purchase._id }, { nextCheckAt: new Date(Date.now() + 60000) });
        try { await service.reconcile(purchase); } catch { console.error('Test purchase recovery will retry.'); }
      }
      const stats = { checkedAt: new Date().toISOString(), paymentMode: 'test', database: 'isolated local replica set', automaticEmail: false, bookings: await Booking.countDocuments(), purchases: await Purchase.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]) };
      fs.writeFileSync(path.join(stateDir, 'status.json'), JSON.stringify(stats, null, 2));
    } catch { console.error('Local test recovery will retry when its database is ready.'); }
    finally { running = false; }
  }, 15000);
  console.log(JSON.stringify({ localSite: 'http://localhost:5173', googleCallback: 'http://localhost:5173/api/auth/google/callback', webhookRelay: 'http://127.0.0.1:8788/api/payments/webhook', paymentMode: 'test', database: 'isolated local replica set', automaticEmail: false, events: ids }));
}
main().catch(async () => { console.error('Local integration startup failed. Check local ports, MongoDB permissions and configuration.'); await stop(); process.exitCode = 1; });
