const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'cash-booking-tests-only';
process.env.RAZORPAY_KEY_ID = 'rzp_test_cash_fixture';
process.env.RAZORPAY_KEY_SECRET = 'cash-fixture-payment-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Events');
const Booking = require('../models/Booking');
const Purchase = require('../models/Purchase');
const { createCashBooking, assertCashBookable } = require('../services/cashBookings');
const { assertBookable } = require('../utils/eventPolicy');
let repl, server, base, organizer, other, buyer, admin, event;
const files = new Set();
const actor = user => ({ id: String(user._id), role: user.role });
const payload = (overrides = {}) => ({
    eventId: String(event._id), name: 'Walk-in Guest', phone: '+91 90000 00000',
    email: 'guest@example.invalid', tickets: 2, expectedAmount: 25100,
    requestKey: crypto.randomUUID(), cashReceived: true, ...overrides,
});
async function request(method, route, body, user = organizer) {
    const response = await fetch(base + route, {
        method, headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
}
before(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(repl.getUri());
    await Promise.all([User, Event, Booking, Purchase].map(model => model.init()));
    server = require('../server').app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
    require('../middleware/limits').email.resetKey('127.0.0.1');
    await Promise.all([User, Event, Booking, Purchase].map(model => model.deleteMany({})));
    [organizer, other, buyer, admin] = await User.create(['organizer', 'organizer', 'user', 'admin'].map((role, i) => ({
        name: `Fixture ${i}`, email: `cash-${i}@example.invalid`, password: 'fixture-only', role, status: 'active', isEmailVerified: true,
    })));
    event = await Event.create({ title: 'Cash fixture', description: 'Test event', venue: 'Test hall', location: 'Ludhiana', date: '2099-01-01', time: '18:00', price: 125.50, seats: 50, organizer: organizer._id, status: 'approved' });
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (repl) await repl.stop();
    await Promise.all([...files].map(file => fs.unlink(file).catch(() => {})));
});

test('cash registration creates a guest pass, server-priced receipt data and queued email without an account or provider purchase', async () => {
    const input = payload({ email: buyer.email, totalPrice: 1, user: String(buyer._id), paymentId: 'untrusted', deliveryStatus: 'sent' });
    const response = await request('POST', '/api/bookings/cash', input);
    assert.equal(response.status, 201);
    const booking = await Booking.findById(response.body.booking._id);
    assert.equal(booking.user, undefined);
    assert.equal(booking.paymentId, undefined);
    assert.equal(booking.purchase, undefined);
    assert.equal(booking.totalPrice, 251);
    assert.equal(booking.paymentMethod, 'cash');
    assert.equal(String(booking.collectedBy), String(organizer._id));
    assert.ok(booking.collectedAt);
    assert.deepEqual(booking.attendeeSnapshot, { name: input.name, phone: '+919000000000', email: buyer.email });
    assert.equal(booking.eventSnapshot.title, event.title);
    assert.equal(booking.deliveryStatus, 'pending');
    assert.equal(response.body.emailed, false);
    assert.match(booking.qrCode, /^data:image\/png;base64,/);
    assert.equal(await User.countDocuments(), 4);
    assert.equal(await Purchase.countDocuments(), 0);
    assert.equal((await Event.findById(event._id)).ticketsSold, 2);
    const publicBypass = await request('POST', '/api/bookings', payload({ paymentMethod: 'cash' }), buyer);
    assert.equal(publicBypass.status, 400);
    assert.equal(await Booking.countDocuments(), 1);
});

test('cash booking requires a current active organizer owning the event, or an administrator', async () => {
    assert.equal((await request('POST', '/api/bookings/cash', payload(), null)).status, 401);
    assert.equal((await request('POST', '/api/bookings/cash', payload(), buyer)).status, 403);
    assert.equal((await request('POST', '/api/bookings/cash', payload(), other)).status, 403);
    await User.updateOne({ _id: organizer._id }, { status: 'suspended' });
    assert.equal((await request('POST', '/api/bookings/cash', payload())).status, 401);
    assert.equal(await Booking.countDocuments(), 0);
    const response = await request('POST', '/api/bookings/cash', payload(), admin);
    assert.equal(response.status, 201);
    assert.equal(response.body.booking.collectedBy, String(admin._id));
});

test('cash inputs, displayed amount, 10-ticket limit and event questions are validated before seat allocation', async () => {
    const invalid = [
        { tickets: 0 }, { tickets: 11 }, { tickets: 1.5 }, { tickets: true },
        { name: '' }, { name: 'A\nB' }, { name: 'a'.repeat(121) },
        { phone: 'not-a-phone' }, { email: 'invalid' }, { email: 'guest\u0000@example.invalid' }, { cashReceived: false },
        { expectedAmount: '25100' }, { requestKey: '' },
    ];
    for (const input of invalid) assert.equal((await request('POST', '/api/bookings/cash', payload(input))).status, 400);
    assert.equal((await request('POST', '/api/bookings/cash', payload({ expectedAmount: 100 }))).status, 409);
    await Event.updateOne({ _id: event._id }, { registrationFields: [{ key: 'company', label: 'Company', type: 'text', required: true }] });
    assert.equal((await request('POST', '/api/bookings/cash', payload())).status, 400);
    assert.equal(await Booking.countDocuments(), 0);
    assert.equal((await Event.findById(event._id)).ticketsSold, 0);
    const valid = await request('POST', '/api/bookings/cash', payload({ tickets: 10, expectedAmount: 125500, answers: { company: 'Example Co' } }));
    assert.equal(valid.status, 201);
    assert.equal(valid.body.booking.tickets, 10);
    assert.equal(valid.body.booking.answers[0].value, 'Example Co');
});

test('concurrent cash retries issue one booking and reject changed details even after the event price changes', async () => {
    await Event.updateOne({ _id: event._id }, { registrationFields: [{ key: 'company', label: 'Company', type: 'text', required: true }] });
    const input = payload({ answers: { company: 'Original' } });
    const responses = await Promise.all([request('POST', '/api/bookings/cash', input), request('POST', '/api/bookings/cash', input)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
    assert.equal(responses[0].body.booking._id, responses[1].body.booking._id);
    assert.equal(await Booking.countDocuments(), 1);
    assert.equal((await Event.findById(event._id)).ticketsSold, 2);
    for (const change of [{ name: 'Other' }, { tickets: 3 }, { expectedAmount: 200 }, { answers: { company: 'Changed' } }]) {
        assert.equal((await request('POST', '/api/bookings/cash', { ...input, ...change })).status, 409);
    }
    await Event.updateOne({ _id: event._id }, { price: 200, registrationFields: [] });
    const replay = await request('POST', '/api/bookings/cash', input);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.booking.totalPrice, 251);
    const changedPrice = await request('POST', '/api/bookings/cash', { ...input, requestKey: crypto.randomUUID() });
    assert.equal(changedPrice.status, 409);
    assert.equal(await Booking.countDocuments(), 1);
});

test('last-seat cash races cannot oversell and a failed booking write rolls back its seat allocation', async () => {
    await Event.updateOne({ _id: event._id }, { seats: 2 });
    const responses = await Promise.all([request('POST', '/api/bookings/cash', payload()), request('POST', '/api/bookings/cash', payload())]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    assert.equal(await Booking.countDocuments(), 1);
    assert.equal((await Event.findById(event._id)).ticketsSold, 2);
    await Booking.deleteMany({});
    await Event.updateOne({ _id: event._id }, { ticketsSold: 0 });
    const original = Booking.create;
    Booking.create = async () => { throw new Error('Injected booking write failure'); };
    try { await assert.rejects(createCashBooking(actor(organizer), payload()), /Injected booking write failure/); }
    finally { Booking.create = original; }
    assert.equal(await Booking.countDocuments(), 0);
    assert.equal((await Event.findById(event._id)).ticketsSold, 0);
});

test('cash sales stay open through the Indian event day while past, hidden and unapproved events reject sales', async () => {
    const fixture = { date: '2030-04-10', time: '18:00', status: 'approved', archivedAt: null };
    assert.throws(() => assertBookable(fixture, new Date('2030-04-10T20:00:00+05:30')), /closed/);
    assert.doesNotThrow(() => assertCashBookable(fixture, new Date('2030-04-10T23:59:59.999+05:30')));
    assert.throws(() => assertCashBookable(fixture, new Date('2030-04-11T00:00:00+05:30')), /closed/);
    for (const changes of [{ status: 'pending' }, { status: 'rejected' }, { status: 'approved', archivedAt: new Date() }, { archivedAt: null, date: '2000-01-01' }]) {
        await Event.updateOne({ _id: event._id }, changes);
        assert.equal((await request('POST', '/api/bookings/cash', payload())).status, 409);
    }
    assert.equal(await Booking.countDocuments(), 0);
});

test('guest passes preserve attendee details for scanner and authorized ticket/receipt downloads', async () => {
    const { body } = await request('POST', '/api/bookings/cash', payload());
    const booking = body.booking;
    files.add(path.resolve(__dirname, '../tickets', `${booking.ticketId}.pdf`));
    const scan = await request('POST', '/api/bookings/verify-ticket', { bookingId: booking._id, eventId: String(event._id), mode: 'confirm' });
    assert.equal(scan.body.state, 'admitted');
    assert.equal(scan.body.booking.user.name, 'Walk-in Guest');
    assert.equal(scan.body.booking.user.phone, '+919000000000');
    assert.ok(scan.body.display.some(field => field.value === 'Walk-in Guest'));
    const duplicate = await request('POST', '/api/bookings/verify-ticket', { bookingId: booking._id, mode: 'confirm' });
    assert.equal(duplicate.body.state, 'checked-in');
    assert.equal(duplicate.body.booking.user.name, 'Walk-in Guest');
    for (const kind of ['ticket', 'receipt']) {
        assert.equal((await request('GET', `/api/bookings/${booking._id}/${kind}`, undefined, buyer)).status, 403);
        assert.equal((await request('GET', `/api/bookings/${booking._id}/${kind}`, undefined, other)).status, 403);
        const response = await fetch(`${base}/api/bookings/${booking._id}/${kind}`, { headers: { authorization: `Bearer ${jwt.sign({ id: String(organizer._id) }, process.env.JWT_SECRET)}` } });
        assert.equal(response.status, 200);
        assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    }
    await Booking.updateOne({ _id: booking._id }, { status: 'cancelled' });
    assert.equal((await request('GET', `/api/bookings/${booking._id}/receipt`)).status, 409);
});

test('manual email retry checks ownership and confirmation, and refuses sent, pending or actively leased deliveries', async () => {
    const { body } = await request('POST', '/api/bookings/cash', payload());
    const id = body.booking._id;
    const route = `/api/bookings/${id}/email/retry`;
    await Booking.updateOne({ _id: id }, { deliveryStatus: 'failed', deliveryAttempts: 5, deliveryErrorCode: 'BREVO_IP_BLOCKED' });
    assert.equal((await request('POST', route, {}, buyer)).status, 403);
    assert.equal((await request('POST', route, {}, other)).status, 403);
    await Booking.updateOne({ _id: id }, { deliveryLeaseUntil: new Date(Date.now() + 60000) });
    assert.equal((await request('POST', route, {})).status, 409);
    await Booking.updateOne({ _id: id }, { $set: { deliveryStatus: 'sent' }, $unset: { deliveryLeaseUntil: 1 } });
    assert.equal((await request('POST', route, {})).status, 409);
    await Booking.updateOne({ _id: id }, { deliveryStatus: 'pending' });
    assert.equal((await request('POST', route, {})).status, 409);
    await Booking.updateOne({ _id: id }, { deliveryStatus: 'failed', status: 'cancelled' });
    assert.equal((await request('POST', route, {})).status, 409);
    // The ownership branch also supports a booking already linked to an account.
    await Booking.updateOne({ _id: id }, { status: 'confirmed', user: buyer._id });
    assert.equal((await request('POST', route, {}, buyer)).status, 200);
    const queued = await Booking.findById(id);
    assert.equal(queued.deliveryStatus, 'pending');
    assert.equal(queued.deliveryAttempts, 0);
    assert.equal(queued.deliveryErrorCode, undefined);
    assert.ok(queued.nextDeliveryAt <= new Date());
    assert.equal((await request('POST', route, {}, buyer)).status, 409);
});

test('manual email retry refuses legacy bookings that the delivery worker cannot process', async () => {
    const legacy = await Booking.create({ user: buyer._id, event: event._id, tickets: 1, totalPrice: 125.5, ticketId: 'LEGACY-RETRY', deliveryStatus: 'failed' });
    assert.equal((await request('POST', `/api/bookings/${legacy._id}/email/retry`, {}, buyer)).status, 409);
    assert.equal((await Booking.findById(legacy._id)).deliveryStatus, 'failed');
});

test('cash guest email is retried by the worker with safe failure and provider message bookkeeping', async () => {
    const { body } = await request('POST', '/api/bookings/cash', payload());
    const delivery = require('../services/ticketDelivery');
    const original = delivery.deliverTicket;
    const workerPath = require.resolve('../services/recovery');
    let calls = 0;
    delivery.deliverTicket = async (booking, snapshot, attendee) => {
        assert.equal(booking.user, undefined);
        assert.equal(snapshot.title, 'Cash fixture');
        assert.equal(attendee.email, 'guest@example.invalid');
        calls++;
        return calls === 1 ? { emailed: false, errorCode: 'BREVO_IP_BLOCKED' } : { emailed: true, messageId: 'fixture-message-id' };
    };
    delete require.cache[workerPath];
    try {
        const { tick } = require('../services/recovery');
        await tick();
        let booking = await Booking.findById(body.booking._id);
        assert.equal(booking.deliveryStatus, 'failed');
        assert.equal(booking.deliveryErrorCode, 'BREVO_IP_BLOCKED');
        assert.equal(booking.deliveryLeaseUntil, undefined);
        await Booking.updateOne({ _id: booking._id }, { nextDeliveryAt: new Date(0) });
        await tick();
        booking = await Booking.findById(booking._id);
        assert.equal(booking.deliveryStatus, 'sent');
        assert.equal(booking.deliveryErrorCode, undefined);
        assert.equal(booking.deliveryMessageId, 'fixture-message-id');
        assert.equal(booking.deliveryAttempts, 2);
        await tick();
        assert.equal(calls, 2);
    } finally { delivery.deliverTicket = original; delete require.cache[workerPath]; }
});
