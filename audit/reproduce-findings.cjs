// Audit probes only. No live database, payment, email, or account operations.
// Assertions describe observed defects; convert them into regression tests when fixing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const root = path.resolve(__dirname, '..');
const results = [];
const userId = '111111111111111111111111';
const eventId = '222222222222222222222222';
const bookingId = '333333333333333333333333';
const testEnv = { JWT_SECRET: 'audit-only-dummy-secret', RAZORPAY_KEY_SECRET: 'audit-only-payment-secret' };
const helpers = {
  '../utils/registrationFields': require('../utils/registrationFields'),
  '../utils/ticketFields': require('../utils/ticketFields'),
  '../utils/imagePaths': require('../utils/imagePaths'),
  '../utils/generateTicketPdf': async () => 'audit-only.pdf',
  '../utils/mailer': { escapeHtml: String, sendMail: async () => ({ id: 'audit' }) },
  qrcode: { toDataURL: async () => 'data:image/png;base64,audit' },
  mongoose, crypto,
};
function load(file, mocks = {}) {
  const exports = {};
  const module = { exports };
  const sandbox = {
    exports, module, Buffer, __dirname: path.dirname(path.join(root, file)),
    process: { env: testEnv }, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (Object.hasOwn(helpers, name)) return helpers[name];
      throw new Error(`Unmocked dependency: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  return module.exports;
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}
function query(value) { return { populate() { return this; }, select() { return this; }, sort() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
async function probe(id, title, fn) {
  await fn();
  results.push({ id, title, result: 'REPRODUCED', isolation: 'mocked dependencies; no external effects' });
  console.log(`REPRODUCED ${id}: ${title}`);
}
const baseEvent = { _id: eventId, title: 'Audit fixture', organizer: userId, price: 5000, seats: 100, ticketsSold: 0, status: 'approved', date: new Date('2099-01-01'), registrationFields: [] };
async function main() {
  await probe('F01', 'Paid event gets a confirmed booking without payment', async () => {
    const controller = load('Controllers/bookingController.js', {
      '../models/Events': { findById: async () => baseEvent, findOneAndUpdate: async () => baseEvent },
      '../models/Booking': { create: async value => ({ _id: bookingId, ...value }) },
    });
    const res = response();
    await controller.createBooking({ body: { eventId, tickets: 2 }, user: { id: userId } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.booking.status, 'confirmed');
    assert.equal(res.body.booking.totalPrice, 10000);
    assert.equal(res.body.booking.paymentId, undefined);
  });
  await probe('F02', 'Valid payment signature accepts unrelated event/quantity without provider lookup', async () => {
    let providerCalls = 0;
    const controller = load('Controllers/paymentController.js', {
      razorpay: class { constructor() { this.orders = { fetch: async () => { providerCalls++; return { amount: 100 }; } }; } },
      '../models/Events': { findOneAndUpdate: async () => baseEvent },
      '../models/Booking': { findOne: async () => null, create: async value => value },
      '../models/User': { findById: () => query({ name: 'Audit', email: 'audit@example.invalid' }) },
    });
    const order = 'audit-order-for-one-cheap-ticket';
    const payment = 'audit-payment';
    const signature = crypto.createHmac('sha256', testEnv.RAZORPAY_KEY_SECRET).update(`${order}|${payment}`).digest('hex');
    const res = response();
    await controller.verifyPayment({ body: { eventId, tickets: 10, razorpay_order_id: order, razorpay_payment_id: payment, razorpay_signature: signature }, user: { id: userId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.booking.totalPrice, 50000);
    assert.equal(providerCalls, 0);
  });
  await probe('F03', 'Check-in request without mode previews without persisting admission', async () => {
    let writes = 0;
    const controller = load('Controllers/bookingController.js', {
      '../models/Events': {},
      '../models/Booking': { findOne: () => query({ _id: bookingId, event: baseEvent, user: { name: 'Audit' }, status: 'confirmed', tickets: 1, checkedIn: false }), findOneAndUpdate: () => { writes++; return query(null); } },
    });
    const res = response();
    await controller.verifyTicket({ body: { bookingId }, user: { id: userId, role: 'organizer' } }, res);
    assert.equal(res.body.state, 'valid');
    assert.equal(res.body.mode, 'preview');
    assert.equal(res.body.booking.checkedIn, false);
    assert.equal(writes, 0);
    for (const file of ['client/src/routes/organizer/Scanner.jsx', 'client/src/routes/organizer/EventBookings.jsx']) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      assert.match(source, /verifyTicket\(\{ bookingId[^}]*\}\)/);
      assert.doesNotMatch(source, /mode:\s*["']confirm["']/);
      assert.match(source, /checkedIn: true/);
    }
  });
  await probe('F04', 'JWT auth trusts stale roles without loading current account status', async () => {
    const token = jwt.sign({ id: userId, role: 'admin' }, testEnv.JWT_SECRET, { expiresIn: '7d' });
    const { authM } = load('middleware/authMiddleware.js', { jsonwebtoken: jwt });
    let next = false;
    const req = { headers: { authorization: `Bearer ${token}` } };
    authM(req, response(), () => { next = true; });
    assert.equal(next, true);
    assert.equal(req.user.role, 'admin');
  });
  await probe('F05', 'Required registration fields block requests produced by current checkout', async () => {
    const { errors } = helpers['../utils/registrationFields'].resolveAnswers([{ key: 'phone', label: 'Phone', type: 'text', required: true }], undefined);
    assert.equal(errors.length, 1);
    const source = fs.readFileSync(path.join(root, 'client/src/routes/EventDetail.jsx'), 'utf8');
    assert.doesNotMatch(source, /registrationFields/);
    assert.match(source, /payments\.createOrder\(event\._id, tickets\)/);
  });
  await probe('F06', 'Free checkout sends a zero amount to payment provider', async () => {
    let amount;
    const controller = load('Controllers/paymentController.js', {
      razorpay: class { constructor() { this.orders = { create: async opts => { amount = opts.amount; return opts; } }; } },
      '../models/Events': { findById: async () => ({ ...baseEvent, price: 0 }) },
      '../models/Booking': {}, '../models/User': {},
    });
    await controller.createOrder({ body: { eventId, tickets: 1 }, user: { id: userId } }, response());
    assert.equal(amount, 0);
  });
  await probe('F07', 'Past rejected event can be booked directly', async () => {
    const fixture = { ...baseEvent, status: 'rejected', date: new Date('2000-01-01') };
    const controller = load('Controllers/bookingController.js', {
      '../models/Events': { findById: async () => fixture, findOneAndUpdate: async () => fixture },
      '../models/Booking': { create: async value => ({ _id: bookingId, ...value }) },
    });
    const res = response();
    await controller.createBooking({ body: { eventId, tickets: 1 }, user: { id: userId } }, res);
    assert.equal(res.statusCode, 201);
  });
  await probe('F08', 'Removing reused image deletes it without checking owner or other event references', async () => {
    const image = '/api/images/' + 'a'.repeat(32);
    let deletion;
    const controller = load('Controllers/eventController.js', {
      fs: { promises: { unlink: async () => {} } }, path,
      '../models/Events': { findById: async () => ({ ...baseEvent, banner: image }), findByIdAndUpdate: async () => ({ ...baseEvent, banner: '' }) },
      '../models/Booking': {},
      '../models/EventImage': { IMAGE_CONTENT_TYPES: [], deleteMany: async filter => { deletion = filter; } },
    });
    const res = response();
    await controller.updateEvent({ params: { id: eventId }, body: { banner: '' }, user: { id: userId, role: 'organizer' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(deletion.key.$in[0], 'a'.repeat(32));
    assert.equal(deletion.owner, undefined);
  });
  await probe('F09', 'Event schema accepts negative price and fractional capacity', async () => {
    const Event = require('../models/Events');
    const doc = new Event({ ...baseEvent, description: 'Audit fixture description', venue: 'Test', price: -25, seats: 2.5 });
    assert.equal(doc.validateSync(), undefined);
  });
  await probe('F10', 'A booking survives when seat reservation throws after insertion', async () => {
    let created = false;
    let removed = false;
    const controller = load('Controllers/bookingController.js', {
      '../models/Events': { findById: async () => baseEvent, findOneAndUpdate: async () => { throw new Error('simulated database interruption'); } },
      '../models/Booking': { create: async value => { created = true; return { _id: bookingId, ...value }; }, findByIdAndDelete: async () => { removed = true; } },
    });
    const res = response();
    await controller.createBooking({ body: { eventId, tickets: 1 }, user: { id: userId } }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(created, true);
    assert.equal(removed, false);
  });
  await probe('F11', 'Pending booking is treated as a valid pass', async () => {
    const controller = load('Controllers/bookingController.js', {
      '../models/Events': {},
      '../models/Booking': { findOne: () => query({ _id: bookingId, event: baseEvent, user: { name: 'Audit' }, status: 'pending', tickets: 1, checkedIn: false }) },
    });
    const res = response();
    await controller.verifyTicket({ body: { bookingId }, user: { id: userId, role: 'organizer' } }, res);
    assert.equal(res.body.state, 'valid');
  });
  await probe('F12', 'Duplicate maximum-length question keys exceed schema maximum', async () => {
    const key = 'a'.repeat(32);
    const fields = helpers['../utils/registrationFields'].sanitizeRegistrationFields([{ key, label: 'One' }, { key, label: 'Two' }]);
    assert.equal(fields[1].key.length, 34);
    const Event = require('../models/Events');
    const doc = new Event({ ...baseEvent, description: 'Audit fixture description', venue: 'Test', registrationFields: fields });
    assert.ok(doc.validateSync());
  });
  await probe('F13', 'Payment replay returns another account booking without ownership validation', async () => {
    const owner = '444444444444444444444444';
    const existing = { _id: bookingId, user: owner, qrCode: 'private-fixture-qr' };
    const controller = load('Controllers/paymentController.js', {
      razorpay: class {}, '../models/Events': {}, '../models/User': {},
      '../models/Booking': { findOne: async () => existing },
    });
    const order = 'audit-existing-order';
    const payment = 'audit-existing-payment';
    const signature = crypto.createHmac('sha256', testEnv.RAZORPAY_KEY_SECRET).update(`${order}|${payment}`).digest('hex');
    const res = response();
    await controller.verifyPayment({ body: { eventId, tickets: 1, razorpay_order_id: order, razorpay_payment_id: payment, razorpay_signature: signature }, user: { id: userId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.booking.user, owner);
    assert.equal(res.body.booking.qrCode, existing.qrCode);
  });
  await probe('F14', 'OAuth callback resolves to HTTP behind an untrusted TLS-terminating proxy', async () => {
    const express = require('express');
    const { originalURL } = require('passport-oauth2/lib/utils');
    const request = { app: express(), connection: {}, headers: { host: 'api.example.invalid', 'x-forwarded-proto': 'https' }, url: '/api/auth/google' };
    const result = new URL('/api/auth/google/callback', originalURL(request)).href;
    assert.equal(result, 'http://api.example.invalid/api/auth/google/callback');
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /app\.set\(["']trust proxy/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'config/passport.js'), 'utf8'), /proxy:\s*true/);
  });
  await probe('F15', 'Google sign-in accepts an existing suspended account and has no state option', async () => {
    let strategy;
    const suspended = { _id: userId, email: 'audit@example.invalid', status: 'suspended', role: 'user' };
    load('config/passport.js', {
      passport: { use(value) { strategy = value; } },
      'passport-google-oauth20': { Strategy: class { constructor(options, verify) { this.options = options; this.verify = verify; } } },
      '../models/User': { findOne: async () => suspended },
    });
    const accepted = await new Promise((resolve, reject) => strategy.verify('dummy-access-token', null, { emails: [{ value: suspended.email }] }, (error, user) => error ? reject(error) : resolve(user)));
    assert.equal(accepted.status, 'suspended');
    assert.equal(strategy.options.state, undefined);
  });
  fs.writeFileSync(path.join(__dirname, 'probe-results.json'), JSON.stringify({ date: '2026-10-26', scope: 'isolated defect reproductions, not end-to-end tests', results }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
