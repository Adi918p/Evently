const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-performance-tests-only';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Events');
const Booking = require('../models/Booking');
let repl, server, base, organizer, otherOrganizer, buyer;

before(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(repl.getUri());
    await Promise.all([User, Event, Booking].map(model => model.init()));
    server = require('../server').app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (repl) await repl.stop();
});
beforeEach(async () => {
    await Promise.all([User, Event, Booking].map(model => model.deleteMany({})));
    [organizer, otherOrganizer, buyer] = await User.create([
        { name: 'Organizer', email: 'organizer@example.invalid', role: 'organizer' },
        { name: 'Other organizer', email: 'other@example.invalid', role: 'organizer' },
        { name: 'Buyer', email: 'buyer@example.invalid', role: 'user' },
    ].map(user => ({ ...user, password: 'fixture-only', status: 'active', isEmailVerified: true })));
});
const fixture = (extra = {}) => ({
    title: 'Performance fixture', description: 'Live music fixture', venue: 'Test hall',
    location: 'Ludhiana', category: 'music', organizer: organizer._id,
    date: new Date('2099-01-01'), time: '18:00', price: 100, seats: 50,
    ticketsSold: 2, status: 'approved', banner: '/Media/fixture.webp', ...extra,
});
async function get(url, user) {
    const headers = user ? { authorization: `Bearer ${jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` } : {};
    const response = await fetch(base + url, { headers });
    assert.equal(response.status, 200);
    return response.json();
}

test('card summaries retain listing fields and filters while full endpoints retain event details', async () => {
    const event = await Event.create(fixture({
        about: 'Searchable detailed introduction. '.repeat(400),
        gallery: ['/Media/one.webp', '/Media/two.webp'],
        lineup: [{ name: 'Fixture artist', image: '/Media/artist.webp' }],
        registrationFields: [{ key: 'company', label: 'Company', required: true }],
        ticketConfig: { notes: 'Fixture ticket notes', fields: [{ label: 'Gate', value: 'North' }] },
    }));
    await Event.create(fixture({ title: 'Hidden fixture', status: 'rejected' }));
    await Event.create(fixture({ title: 'Archived fixture', archivedAt: new Date() }));
    const full = await get('/api/events');
    const summary = await get('/api/events?summary=1&q=introduction&city=Ludhiana&category=music&dateFrom=2099-01-01&dateTo=2099-01-01');
    assert.equal(full.length, 1);
    assert.equal(summary.length, 1);
    const cardFields = ['_id', 'title', 'description', 'venue', 'location', 'category', 'date', 'time', 'price', 'seats', 'ticketsSold', 'banner', 'status'];
    assert.deepEqual(summary[0], Object.fromEntries(cardFields.map(key => [key, full[0][key]])));
    assert.ok(Buffer.byteLength(JSON.stringify(summary)) < Buffer.byteLength(JSON.stringify(full)) / 5);
    assert.equal((await get('/api/events?summary=1&city=Elsewhere')).length, 0);
    assert.equal((await get('/api/events?summary=1&category=sports')).length, 0);
    const detail = await get(`/api/events/${event._id}`);
    for (const key of ['about', 'gallery', 'lineup', 'registrationFields', 'ticketConfig']) {
        assert.deepEqual(detail.event[key], full[0][key]);
    }
});

test('card summaries retain default values for older events', async () => {
    const event = fixture();
    for (const key of ['category', 'time', 'ticketsSold', 'banner', 'location', 'seats']) delete event[key];
    await Event.collection.insertOne(event);
    const [full] = await get('/api/events');
    const [summary] = await get('/api/events?summary=1');
    for (const key of Object.keys(summary)) assert.deepEqual(summary[key], full[key]);
    assert.equal(summary.category, 'other');
    assert.equal(summary.ticketsSold, 0);
});

test('dashboard totals include confirmed historical bookings and exclude other organizers and unconfirmed payments', async () => {
    const [active, archived, foreign] = await Event.create([
        fixture(), fixture({ archivedAt: new Date() }), fixture({ organizer: otherOrganizer._id }),
    ]);
    const rows = [
        { event: active._id, tickets: 2, totalPrice: 200 },
        { event: archived._id, tickets: 3, totalPrice: 300 },
        { event: active._id, tickets: 1, totalPrice: 0 },
        { event: active._id, tickets: 10, totalPrice: 1000, status: 'cancelled' },
        { event: active._id, tickets: 8, totalPrice: 800, status: 'pending' },
        { event: foreign._id, tickets: 10, totalPrice: 1000 },
    ];
    await Booking.create(rows.map((row, index) => ({
        user: buyer._id, status: 'confirmed', ticketId: `fixture-${index}`,
        qrCode: 'data:image/png;base64,' + 'a'.repeat(10000),
        eventSnapshot: { title: 'Immutable fixture details', about: 'a'.repeat(10000) }, ...row,
    })));
    // Older documents can rely on the Mongoose one-ticket default.
    await Booking.collection.insertOne({ user: buyer._id, event: active._id, totalPrice: 100, status: 'confirmed', ticketId: 'legacy' });
    assert.deepEqual(await get('/api/events/dashboard/stats', organizer), {
        success: true, totalEvents: 2, totalBookings: 4, ticketsSold: 7, revenue: 600,
    });
    assert.deepEqual(await get('/api/events/dashboard/stats', otherOrganizer), {
        success: true, totalEvents: 1, totalBookings: 1, ticketsSold: 10, revenue: 1000,
    });
});

test('dashboard responds with zero totals when the organizer has no events or bookings', async () => {
    assert.deepEqual(await get('/api/events/dashboard/stats', organizer), {
        success: true, totalEvents: 0, totalBookings: 0, ticketsSold: 0, revenue: 0,
    });
    await Event.create(fixture());
    assert.deepEqual(await get('/api/events/dashboard/stats', organizer), {
        success: true, totalEvents: 1, totalBookings: 0, ticketsSold: 0, revenue: 0,
    });
});
