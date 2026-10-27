const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-tests-only';
process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture';
process.env.RAZORPAY_KEY_SECRET = 'isolated-payment-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'isolated-webhook-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Events');
const Booking = require('../models/Booking');
const Purchase = require('../models/Purchase');
const EventImage = require('../models/EventImage');
const AuthHandoff = require('../models/AuthHandoff');
const purchases = require('../services/purchases');
let repl, server, base, buyer, organizer, admin, event, orders, payments, refunds, service;
const uid = () => crypto.randomUUID();
const token = user => jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
async function request(method, url, body, user = buyer) {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(user ? { authorization: `Bearer ${token(user)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}
const captured = (purchase, amount = purchase.amount) => {
    const payment = { id: 'pay_' + uid(), order_id: purchase.orderId, amount, currency: 'INR', status: 'captured', amount_refunded: 0 };
    payments.set(payment.id, payment);
    return payment;
};
const verifyBody = (purchase, payment) => ({ eventId: String(purchase.event), tickets: purchase.tickets, razorpay_order_id: purchase.orderId, razorpay_payment_id: payment.id, razorpay_signature: purchases.digest(`${purchase.orderId}|${payment.id}`, process.env.RAZORPAY_KEY_SECRET) });
const input = (overrides = {}) => ({ eventId: String(event._id), tickets: 1, requestKey: uid(), ...overrides });

before(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(repl.getUri());
    await Promise.all([User, Event, Booking, Purchase, EventImage, AuthHandoff].map(model => model.init()));
    const { app } = require('../server');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (repl) await repl.stop();
});
beforeEach(async () => {
    await Promise.all([User, Event, Booking, Purchase, EventImage, AuthHandoff].map(model => model.deleteMany({})));
    [buyer, organizer, admin] = await User.create(['user', 'organizer', 'admin'].map(role => ({ name: role, email: `${role}@example.invalid`, password: 'fixture-only', role, status: 'active', isEmailVerified: true })));
    event = await Event.create({ title: 'Integration event', description: 'Test fixture', venue: 'Hall', location: 'Ludhiana', organizer: organizer._id, date: new Date('2099-01-01'), time: '18:00', price: 100, seats: 10, status: 'approved' });
    orders = new Map(); payments = new Map(); refunds = [];
    const provider = {
        orders: {
            create: async data => { const order = { id: 'order_' + uid(), ...data }; orders.set(order.id, order); return order; },
            all: async ({ receipt }) => ({ items: [...orders.values()].filter(row => row.receipt === receipt) }),
            fetchPayments: async id => ({ items: [...payments.values()].filter(row => row.order_id === id) }),
        },
        payments: {
            fetch: async id => payments.get(id),
            fetchMultipleRefund: async id => ({ items: refunds.filter(row => row.payment_id === id) }),
            refund: async (id, data) => { const refund = { id: 'rfnd_' + uid(), payment_id: id, ...data, status: 'processed' }; refunds.push(refund); payments.get(id).amount_refunded = data.amount; return refund; },
        },
    };
    service = purchases.createPurchaseService(() => provider);
    // Exercise HTTP routes with the real service/database and an isolated provider double.
    for (const name of ['createOrder', 'verify', 'reconcile']) purchases[name] = service[name];
});

test('paid direct booking is rejected; free booking succeeds without a provider order', async () => {
    assert.equal((await request('POST', '/api/bookings', input())).status, 400);
    await Event.updateOne({ _id: event._id }, { price: 0 });
    const data = input();
    const result = await request('POST', '/api/bookings', data);
    assert.equal(result.status, 201); assert.equal(result.body.booking.status, 'confirmed');
    const retry = await request('POST', '/api/bookings', data);
    assert.equal(retry.body.booking._id, result.body.booking._id);
    assert.equal(await Booking.countDocuments(), 1); assert.equal(orders.size, 0);
    assert.equal((await Event.findById(event._id)).ticketsSold, 1);
});
test('signature, account, event, quantity, amount and captured status are enforced', async () => {
    const purchase = await service.createOrder(buyer._id, input());
    const payment = captured(purchase);
    const body = verifyBody(purchase, payment);
    await assert.rejects(service.verify(organizer._id, body), /not found/);
    await assert.rejects(service.verify(buyer._id, { ...body, tickets: 2 }), /do not match/);
    await assert.rejects(service.verify(buyer._id, { ...body, eventId: String(new mongoose.Types.ObjectId()) }), /do not match/);
    await assert.rejects(service.verify(buyer._id, { ...body, razorpay_signature: '0'.repeat(64) }), /verification failed/);
    payment.amount = 1;
    await assert.rejects(service.verify(buyer._id, body), /does not match/);
    payment.amount = purchase.amount; payment.status = 'authorized';
    assert.equal((await service.verify(buyer._id, body)).state, 'pending');
    assert.equal(await Booking.countDocuments(), 0);
    payment.status = 'captured';
    assert.equal((await service.verify(buyer._id, body)).state, 'fulfilled');
    assert.equal((await request('POST', '/api/payments/verify', body, organizer)).status, 404);
});
test('concurrent replay issues exactly one booking and one seat increment', async () => {
    const purchase = await service.createOrder(buyer._id, input()); const payment = captured(purchase);
    await Promise.all(Array.from({ length: 5 }, () => service.fulfill(purchase._id, payment)));
    assert.equal(await Booking.countDocuments(), 1);
    assert.equal((await Event.findById(event._id)).ticketsSold, 1);
});
test('last-seat race fulfills one buyer and refunds the other exactly once', async () => {
    await Event.updateOne({ _id: event._id }, { seats: 1 });
    const a = await service.createOrder(buyer._id, input()); const b = await service.createOrder(organizer._id, input());
    const ap = captured(a); const bp = captured(b);
    const results = await Promise.all([service.fulfill(a._id, ap), service.fulfill(b._id, bp)]);
    assert.deepEqual(results.map(row => row.state).sort(), ['fulfilled', 'refunded']);
    await Promise.all([service.reconcile(await Purchase.findById(a._id)), service.reconcile(await Purchase.findById(b._id))]);
    assert.equal(await Booking.countDocuments(), 1); assert.equal(refunds.length, 1);
    assert.equal((await Event.findById(event._id)).ticketsSold, 1);
});
test('booking insertion failure rolls back reservation and can recover', async () => {
    const purchase = await service.createOrder(buyer._id, input()); const payment = captured(purchase);
    const create = Booking.create;
    Booking.create = async () => { throw new Error('injected insertion failure'); };
    try { await assert.rejects(service.fulfill(purchase._id, payment), /injected/); } finally { Booking.create = create; }
    assert.equal((await Event.findById(event._id)).ticketsSold, 0); assert.equal(await Booking.countDocuments(), 0);
    assert.equal((await service.reconcile(await Purchase.findById(purchase._id))).state, 'fulfilled');
});
test('recovery finds a captured payment after the browser disappears', async () => {
    const purchase = await service.createOrder(buyer._id, input()); captured(purchase);
    assert.equal((await service.reconcile(purchase)).state, 'fulfilled');
});
test('required answers are validated before payment and immutable purchase details survive edits', async () => {
    await Event.updateOne({ _id: event._id }, { registrationFields: [{ key: 'phone', label: 'Phone', required: true, type: 'text' }] });
    await assert.rejects(service.createOrder(buyer._id, input()), /required/);
    const purchase = await service.createOrder(buyer._id, input({ answers: { phone: '12345678' } }));
    await Event.updateOne({ _id: event._id }, { price: 999, title: 'Changed title', registrationFields: [] });
    await service.fulfill(purchase._id, captured(purchase));
    const booking = await Booking.findOne();
    assert.equal(booking.totalPrice, 100); assert.equal(booking.answers[0].value, '12345678'); assert.equal(booking.eventSnapshot.title, 'Integration event');
});
test('lost order persistence is recovered by receipt without creating a second order', async () => {
    const purchase = await service.createOrder(buyer._id, input());
    captured(purchase);
    await Purchase.updateOne({ _id: purchase._id }, { $unset: { orderId: 1 }, $set: { state: 'creating' } });
    assert.equal((await service.reconcile(await Purchase.findById(purchase._id))).state, 'fulfilled');
    assert.equal(orders.size, 1); assert.equal(await Booking.countDocuments(), 1);
});
test('a webhook beating the order-create response cannot regress a fulfilled purchase', async () => {
    const racingService = purchases.createPurchaseService(() => ({ orders: { create: async data => {
        const order = { ...data, id: 'order_' + uid() }; orders.set(order.id, order);
        const purchase = await Purchase.findById(data.receipt);
        captured({ ...purchase.toObject(), orderId: order.id });
        assert.equal((await service.reconcile(purchase)).state, 'fulfilled');
        return order;
    } } }));
    const result = await racingService.createOrder(buyer._id, input());
    assert.equal(result.state, 'fulfilled'); assert.equal(await Booking.countDocuments(), 1);
    // A worker holding a stale pre-order record must not put it back into pending either.
    const stale = await Purchase.findById(result._id); stale.orderId = undefined; stale.state = 'creating';
    assert.equal((await service.reconcile(stale)).state, 'fulfilled');
    assert.equal((await Event.findById(event._id)).ticketsSold, 1);
});
test('status polling and account refresh do not exhaust mutation attempt limits', async () => {
    const purchase = await service.createOrder(buyer._id, input());
    for (let i = 0; i < 45; i++) {
        assert.equal((await request('GET', `/api/payments/purchases/${purchase._id}`)).status, 200);
        assert.equal((await request('GET', '/api/auth/me')).status, 200);
    }
    assert.equal((await request('POST', '/api/payments/create-order', input())).status, 200);
});
test('provider full refunds revoke passes and release seats only once under concurrent replay', async () => {
    const purchase = await service.createOrder(buyer._id, input()); const payment = captured(purchase);
    const fulfilled = await service.fulfill(purchase._id, payment);
    payment.status = 'refunded'; payment.amount_refunded = purchase.amount;
    await Promise.all([service.reconcile(fulfilled), service.reconcile(fulfilled)]);
    assert.equal((await Purchase.findById(purchase._id)).state, 'refunded');
    const booking = await Booking.findOne(); assert.equal(booking.status, 'cancelled');
    assert.equal((await Event.findById(event._id)).ticketsSold, 0);
    assert.equal((await request('POST', '/api/bookings/verify-ticket', { bookingId: String(booking._id), eventId: String(event._id), mode: 'confirm' }, organizer)).body.ok, false);
    assert.equal((await request('GET', `/api/bookings/${booking._id}/ticket`)).status, 409);
});
test('a payment refunded before fulfillment never issues a pass', async () => {
    const purchase = await service.createOrder(buyer._id, input()); const payment = captured(purchase);
    payment.status = 'refunded'; payment.amount_refunded = purchase.amount;
    assert.equal((await service.reconcile(purchase)).state, 'refunded');
    assert.equal(await Booking.countDocuments(), 0); assert.equal((await Event.findById(event._id)).ticketsSold, 0);
});
test('archiving an unsold event removes it from public, organizer and admin event lists', async () => {
    assert.equal((await request('DELETE', `/api/events/${event._id}`, undefined, organizer)).status, 200);
    assert.equal((await request('GET', '/api/events/my', undefined, organizer)).body.events.length, 0);
    assert.equal((await request('GET', '/api/admin/events', undefined, admin)).body.events.length, 0);
    assert.ok((await Event.findById(event._id)).archivedAt);
});
test('rejected, archived and past events cannot be purchased or exposed publicly', async () => {
    for (const change of [{ status: 'rejected' }, { status: 'approved', archivedAt: new Date() }, { archivedAt: null, date: new Date('2000-01-01') }]) {
        await Event.updateOne({ _id: event._id }, change);
        await assert.rejects(service.createOrder(buyer._id, input()));
    }
    await Event.updateOne({ _id: event._id }, { status: 'rejected' });
    assert.equal((await request('GET', `/api/events/${event._id}`)).status, 404);
});
test('current account restrictions override previously-issued JWT roles', async () => {
    await User.updateOne({ _id: admin._id }, { role: 'user' });
    assert.equal((await request('GET', '/api/admin/users', undefined, admin)).status, 403);
    await User.updateOne({ _id: buyer._id }, { status: 'suspended' });
    assert.equal((await request('GET', '/api/bookings/my')).status, 401);
});
test('admission persists and rejects duplicate, pending and foreign-event scans', async () => {
    const purchase = await service.createOrder(buyer._id, input()); await service.fulfill(purchase._id, captured(purchase));
    const booking = await Booking.findOne();
    const scan = { bookingId: String(booking._id), eventId: String(event._id), mode: 'confirm' };
    const results = await Promise.all([request('POST', '/api/bookings/verify-ticket', scan, organizer), request('POST', '/api/bookings/verify-ticket', scan, organizer)]);
    assert.deepEqual(results.map(row => row.body.state).sort(), ['admitted', 'checked-in']);
    assert.equal((await Booking.findById(booking._id)).checkedIn, true);
    await Booking.updateOne({ _id: booking._id }, { status: 'pending', checkedIn: false });
    assert.equal((await request('POST', '/api/bookings/verify-ticket', scan, organizer)).body.ok, false);
    assert.equal((await request('GET', `/api/bookings/${booking._id}/ticket`)).status, 409);
    await Event.updateOne({ _id: event._id }, { organizer: admin._id });
    assert.equal((await request('POST', '/api/bookings/verify-ticket', scan, organizer)).status, 403);
});
test('events with confirmed bookings cannot be deleted and capacity cannot drop below sales', async () => {
    const purchase = await service.createOrder(buyer._id, input({ tickets: 2 })); await service.fulfill(purchase._id, captured(purchase));
    assert.equal((await request('DELETE', `/api/events/${event._id}`, undefined, organizer)).status, 409);
    assert.equal((await request('DELETE', `/api/admin/events/${event._id}`, undefined, admin)).status, 409);
    assert.equal((await request('PUT', `/api/events/${event._id}`, { seats: 1 }, organizer)).status, 400);
    assert.ok(await Event.findById(event._id));
});
test('admin responses exclude hashes and reject invalid roles and admin demotion', async () => {
    assert.equal((await request('PATCH', `/api/admin/users/${buyer._id}/role`, { role: 'root' }, admin)).status, 400);
    const result = await request('PATCH', `/api/admin/users/${buyer._id}/role`, { role: 'organizer' }, admin);
    assert.equal(result.status, 200); assert.equal(result.body.user.password, undefined); assert.equal(result.body.user.emailVerificationOtpHash, undefined);
    assert.equal((await request('PATCH', `/api/admin/users/${admin._id}/role`, { role: 'user' }, admin)).status, 409);
});
test('foreign images cannot be attached; shared images survive one event removing them', async () => {
    const key = 'a'.repeat(32); const image = '/api/images/' + key;
    await EventImage.create({ key, owner: organizer._id, bytes: 8, data: Buffer.from('fixture'), contentType: 'image/png', hash: 'fixture', expiresAt: new Date(Date.now() + 100000) });
    await Event.updateOne({ _id: event._id }, { banner: image });
    const second = await Event.create({ ...event.toObject(), _id: new mongoose.Types.ObjectId(), banner: image });
    const result = await request('PUT', `/api/events/${event._id}`, { banner: '' }, organizer);
    assert.equal(result.status, 200); assert.equal((await EventImage.findOne({ key })).expiresAt, null);
    await Event.updateOne({ _id: second._id }, { organizer: buyer._id, banner: '' });
    await User.updateOne({ _id: buyer._id }, { role: 'organizer' });
    assert.equal((await request('PUT', `/api/events/${second._id}`, { banner: image }, buyer)).status, 403);
});
test('OTP attempts are capped and a consumed code cannot be replayed', async () => {
    const code = '123456';
    await User.updateOne({ _id: buyer._id }, { isEmailVerified: false, emailVerificationOtpHash: crypto.createHash('sha256').update(code).digest('hex'), emailVerificationOtpExpiresAt: new Date(Date.now() + 60_000) });
    for (let i = 0; i < 5; i++) assert.equal((await request('POST', '/api/auth/verify-email-otp', { email: buyer.email, otp: '000000' }, null)).status, 400);
    assert.equal((await request('POST', '/api/auth/verify-email-otp', { email: buyer.email, otp: code }, null)).status, 400);
    assert.equal((await User.findById(buyer._id)).isEmailVerified, false);
    await User.updateOne({ _id: buyer._id }, { emailVerificationAttempts: 0 });
    assert.equal((await request('POST', '/api/auth/verify-email-otp', { email: buyer.email, otp: code }, null)).status, 200);
    const replay = await request('POST', '/api/auth/verify-email-otp', { email: buyer.email, otp: code }, null);
    assert.equal(replay.body.token, undefined);
});
test('recovery worker fulfills a captured purchase and retries failed ticket delivery', async () => {
    const delivery = require('../services/ticketDelivery'); const original = delivery.deliverTicket;
    let attempts = 0;
    delivery.deliverTicket = async () => ({ emailed: ++attempts > 1, pdf: true });
    const workerPath = require.resolve('../services/recovery'); delete require.cache[workerPath];
    try {
        const { tick } = require(workerPath);
        const purchase = await service.createOrder(buyer._id, input()); captured(purchase);
        await tick();
        let booking = await Booking.findOne(); assert.ok(booking); assert.equal(booking.deliveryStatus, 'failed');
        await Booking.updateOne({ _id: booking._id }, { nextDeliveryAt: new Date(0) });
        await tick(); booking = await Booking.findById(booking._id);
        assert.equal(booking.deliveryStatus, 'sent'); assert.equal(booking.deliveryAttempts, 2);
        await tick(); assert.equal(attempts, 2);
    } finally { delivery.deliverTicket = original; delete require.cache[workerPath]; }
});
test('OAuth state is browser-bound, expires and is consumed only once', async () => {
    const oauth = require('../utils/oauth'); let cookie;
    const response = { cookie(name, value) { cookie = `${name}=${value}`; }, clearCookie() {} };
    const value = await oauth.issue(response, 'state');
    await assert.rejects(oauth.consume({ headers: {} }, response, 'state', value), /expired/);
    await assert.rejects(oauth.consume({ headers: { cookie } }, response, 'state', 'wrong'), /expired/);
    await oauth.consume({ headers: { cookie } }, response, 'state', value);
    await assert.rejects(oauth.consume({ headers: { cookie } }, response, 'state', value), /expired/);
});
test('webhook rejects incorrect signatures and processes a valid captured notification idempotently', async () => {
    const purchase = await service.createOrder(buyer._id, input()); const payment = captured(purchase);
    const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } });
    const send = signature => fetch(base + '/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature }, body: payload });
    assert.equal((await send('0'.repeat(64))).status, 400);
    const signature = purchases.digest(payload, process.env.RAZORPAY_WEBHOOK_SECRET);
    assert.equal((await send(signature)).status, 200); assert.equal((await send(signature)).status, 200);
    assert.equal(await Booking.countDocuments(), 1);
});
test('search includes later dates and venue-only city matches; archived rows are excluded', async () => {
    await Event.updateOne({ _id: event._id }, { date: new Date('2099-01-02'), venue: 'Special Venue', location: 'Different city' });
    let result = await request('GET', '/api/events?date=2099-01-01&city=Special');
    assert.equal(result.body.length, 1);
    await Event.updateOne({ _id: event._id }, { archivedAt: new Date() });
    result = await request('GET', '/api/events'); assert.equal(result.body.length, 0);
});
test('SEO returns true unknown-page errors, venue-specific metadata and temporary-error status', async () => {
    const missing = await fetch(base + '/seo/render/not-a-real-page'); assert.equal(missing.status, 404);
    const venue = await fetch(base + '/seo/render/clubs/1'); assert.equal(venue.status, 200); assert.match(await venue.text(), /Luna Club/);
    const find = Event.findOne; Event.findOne = () => ({ lean: async () => { throw new Error('simulated query failure'); } });
    try { assert.equal((await fetch(base + '/seo/render/events/' + event._id)).status, 503); } finally { Event.findOne = find; }
});
