const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'event-access-fixtures-only';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Events');
const Booking = require('../models/Booking');
const Purchase = require('../models/Purchase');
let repl, server, base, owner, other, buyer, admin, owned, foreign, archived, pass;
const generated = new Set();
const token = user => jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
async function request(method, route, user, body) {
    const response = await fetch(base + route, {
        method, headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${token(user)}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const type = response.headers.get('content-type');
    return { status: response.status, body: type?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()), type };
}
const fixture = (organizer, extra = {}) => ({
    title: 'Access fixture', description: 'Isolated access test', venue: 'Fixture hall', location: 'Ludhiana',
    date: '2099-01-01', time: '18:00', price: 0, seats: 20, organizer: organizer._id, status: 'approved', ...extra,
});
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
    [owner, other, buyer, admin] = await User.create(['organizer', 'organizer', 'user', 'admin'].map((role, i) => ({
        name: `Access ${i}`, email: `access-${i}@example.invalid`, role, password: 'fixture-only', status: 'active', isEmailVerified: true,
    })));
    [owned, foreign, archived] = await Event.create([
        fixture(owner, { title: 'Owned event' }), fixture(other, { title: 'Other event', status: 'rejected' }),
        fixture(owner, { title: 'Archived event', archivedAt: new Date() }),
    ]);
    pass = await Booking.create({
        user: buyer._id, event: owned._id, tickets: 2, totalPrice: 200, status: 'confirmed',
        ticketId: 'EVT-' + crypto.randomBytes(12).toString('hex').toUpperCase(),
        purchase: new mongoose.Types.ObjectId(), deliveryStatus: 'failed',
    });
    generated.add(path.resolve(__dirname, '../tickets', `${pass.ticketId}.pdf`));
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (repl) await repl.stop();
    await Promise.all([...generated].map(file => fs.unlink(file).catch(() => {})));
});

test('organizer event selectors are scoped; administrators can select every nonarchived event, including rejected listings', async () => {
    const ownList = await request('GET', '/api/events/my', owner);
    assert.equal(ownList.status, 200);
    assert.deepEqual(ownList.body.events.map(event => event._id), [String(owned._id)]);
    const otherList = await request('GET', '/api/events/my', other);
    assert.deepEqual(otherList.body.events.map(event => event._id), [String(foreign._id)]);
    const adminList = await request('GET', '/api/events/my', admin);
    assert.equal(adminList.status, 200);
    assert.deepEqual(adminList.body.events.map(event => event._id).sort(), [String(owned._id), String(foreign._id)].sort());
});

test('organizer totals remain scoped while administrator totals cover all organizers and historical events', async () => {
    await Booking.create({ user: buyer._id, event: foreign._id, tickets: 3, totalPrice: 300, status: 'confirmed', ticketId: 'foreign' });
    await Booking.create({ user: buyer._id, event: archived._id, tickets: 1, totalPrice: 100, status: 'confirmed', ticketId: 'archived' });
    const own = await request('GET', '/api/events/dashboard/stats', owner);
    assert.deepEqual(own.body, { success: true, totalEvents: 2, totalBookings: 2, ticketsSold: 3, revenue: 300 });
    const all = await request('GET', '/api/events/dashboard/stats', admin);
    assert.deepEqual(all.body, { success: true, totalEvents: 3, totalBookings: 3, ticketsSold: 6, revenue: 600 });
});

test('event management and guest lists reject other organizers, ordinary users and anonymous requests', async () => {
    for (const suffix of ['manage', 'bookings']) {
        assert.equal((await request('GET', `/api/events/${owned._id}/${suffix}`, owner)).status, 200);
        assert.equal((await request('GET', `/api/events/${owned._id}/${suffix}`, admin)).status, 200);
        for (const [actor, expected] of [[other, 403], [buyer, 403], [null, 401]]) {
            const denied = await request('GET', `/api/events/${owned._id}/${suffix}`, actor);
            assert.equal(denied.status, expected);
            assert.equal(denied.body.bookings, undefined);
            assert.equal(denied.body.event, undefined);
        }
    }
    for (const route of ['/api/events/my', '/api/events/dashboard/stats', '/api/admin/events']) {
        assert.equal((await request('GET', route, buyer)).status, 403);
        assert.equal((await request('GET', route, null)).status, 401);
    }
    assert.equal((await request('GET', '/api/admin/events', owner)).status, 403);
});

test('event changes preserve ownership, reject foreign organizers and allow administrators across events', async () => {
    assert.equal((await request('PUT', `/api/events/${owned._id}`, other, { title: 'Unauthorized change' })).status, 403);
    assert.equal((await request('DELETE', `/api/events/${owned._id}`, other)).status, 403);
    assert.equal((await Event.findById(owned._id)).title, owned.title);
    const edited = await request('PUT', `/api/events/${owned._id}`, owner, { title: 'Owner edit', organizer: String(other._id), status: 'rejected' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.event.organizer, String(owner._id));
    assert.equal(edited.body.event.status, 'approved');
    assert.equal((await request('PUT', `/api/events/${foreign._id}`, admin, { title: 'Admin edit', status: 'approved' })).status, 200);
    assert.equal((await request('DELETE', `/api/events/${foreign._id}`, admin)).status, 200);
    assert.ok((await Event.findById(foreign._id)).archivedAt);
    assert.equal((await request('DELETE', `/api/events/${owned._id}`, admin)).status, 409, 'confirmed booking protection still applies to admins');
});

test('admission rejects foreign organizers without exposing the attendee and permits owner or administrator', async () => {
    for (const actor of [other, buyer]) {
        const denied = await request('POST', '/api/bookings/verify-ticket', actor, { bookingId: String(pass._id), eventId: String(owned._id), mode: 'confirm' });
        assert.equal(denied.status, 403);
        assert.equal(denied.body.booking, undefined);
        assert.equal((await Booking.findById(pass._id)).checkedIn, false);
    }
    const preview = await request('POST', '/api/bookings/verify-ticket', owner, { bookingId: String(pass._id), mode: 'preview' });
    assert.equal(preview.body.state, 'valid');
    const admitted = await request('POST', '/api/bookings/verify-ticket', admin, { bookingId: String(pass._id), mode: 'confirm' });
    assert.equal(admitted.body.state, 'admitted');
    assert.equal((await Booking.findById(pass._id)).checkedIn, true);
});

test('ticket and receipt downloads allow buyer, owning organizer and admin while rejecting another organizer', async () => {
    for (const suffix of ['ticket', 'receipt']) {
        assert.equal((await request('GET', `/api/bookings/${pass._id}/${suffix}`, other)).status, 403);
        for (const actor of [buyer, owner, admin]) {
            const response = await request('GET', `/api/bookings/${pass._id}/${suffix}`, actor);
            assert.equal(response.status, 200);
            assert.match(response.type, /application\/pdf/);
            assert.equal(response.body.subarray(0, 4).toString(), '%PDF');
        }
    }
});

test('a former organizer loses attendee document and email-management access immediately after demotion', async () => {
    await User.updateOne({ _id: owner._id }, { role: 'user' });
    // owner still carries an organizer role in this token; the database is authoritative.
    for (const suffix of ['ticket', 'receipt']) {
        assert.equal((await request('GET', `/api/bookings/${pass._id}/${suffix}`, owner)).status, 403);
    }
    assert.equal((await request('POST', `/api/bookings/${pass._id}/email/retry`, owner, {})).status, 403);
    assert.equal((await Booking.findById(pass._id)).deliveryStatus, 'failed');
    assert.equal((await request('GET', `/api/events/${owned._id}/manage`, owner)).status, 403);
});

test('ticket email management is restricted to the buyer, current owning organizer or admin', async () => {
    assert.equal((await request('POST', `/api/bookings/${pass._id}/email/retry`, other, {})).status, 403);
    for (const actor of [buyer, owner, admin]) {
        await Booking.updateOne({ _id: pass._id }, { deliveryStatus: 'failed' });
        assert.equal((await request('POST', `/api/bookings/${pass._id}/email/retry`, actor, {})).status, 200);
        assert.equal((await Booking.findById(pass._id)).deliveryStatus, 'pending');
    }
});

test('an orphaned event does not expose its guest list to another organizer and remains manageable by admin', async () => {
    await User.deleteOne({ _id: owner._id });
    assert.equal((await request('GET', `/api/events/${owned._id}/bookings`, other)).status, 403);
    const allowed = await request('GET', `/api/events/${owned._id}/bookings`, admin);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.bookings.length, 1);
});
