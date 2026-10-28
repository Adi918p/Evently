const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'experience-tests-only';
process.env.RAZORPAY_KEY_ID = 'rzp_test_experience_fixture';
process.env.RAZORPAY_KEY_SECRET = 'experience-fixture-secret';
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
const ExperienceSection = require('../models/ExperienceSection');
const models = [User, Event, Booking, Purchase, EventImage, ExperienceSection];
let repl, server, base, admin, organizer, user;
const token = actor => jwt.sign({ id: String(actor._id), role: 'admin' }, process.env.JWT_SECRET);
async function request(method, route, body, actor = admin) {
    const response = await fetch(base + route, {
        method, headers: { 'Content-Type': 'application/json', ...(actor ? { authorization: `Bearer ${token(actor)}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
}
const route = id => `/api/admin/experience${id ? `/${id}` : ''}`;
const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=';
async function image() {
    const response = await request('POST', '/api/events/uploads', { files: [{ type: 'image/png', data: imageData }] });
    assert.equal(response.status, 201);
    return { url: response.body.files[0], alt: 'Guests at the fixture event' };
}
const imageDocument = photo => EventImage.findOne({ key: photo.url.split('/').pop() });
async function create(overrides = {}) {
    const result = await request('POST', route(), { title: 'Fixture recap', ...overrides });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.section;
}
before(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(repl.getUri());
    await Promise.all(models.map(model => model.init()));
    server = require('../server').app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
    await Promise.all(models.map(model => model.deleteMany({})));
    require('../middleware/limits').upload.resetKey('127.0.0.1');
    [admin, organizer, user] = await User.create(['admin', 'organizer', 'user'].map(role => ({
        name: role, email: `experience-${role}@example.invalid`, password: 'fixture-only', role, status: 'active', isEmailVerified: true,
    })));
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (repl) await repl.stop();
});

test('experience starts empty and administration checks the current account role on every route', async () => {
    const empty = await request('GET', '/api/experience', undefined, null);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.sections, []);
    assert.equal(empty.headers.get('cache-control'), 'no-store');
    const id = new mongoose.Types.ObjectId().toString();
    for (const actor of [null, organizer, user]) {
        for (const [method, path, body] of [['GET', route()], ['POST', route(), { title: 'Blocked' }], ['PUT', route(id), { title: 'Blocked' }], ['DELETE', route(id)]]) {
            assert.equal((await request(method, path, body, actor)).status, actor ? 403 : 401);
        }
    }
    assert.equal(await ExperienceSection.countDocuments(), 0);
    await User.updateOne({ _id: admin._id }, { status: 'suspended' });
    assert.equal((await request('GET', route())).status, 401);
    await User.updateOne({ _id: admin._id }, { status: 'active', role: 'organizer' });
    assert.equal((await request('POST', route(), { title: 'Former administrator' })).status, 403);
});

test('draft, publish, ordered public gallery, edit, unpublish and delete form a complete section lifecycle', async () => {
    const draft = await create({ title: '  Draft title  ', description: '  Event memories  ' });
    assert.equal(draft.title, 'Draft title');
    assert.equal(draft.description, 'Event memories');
    assert.equal(draft.published, false);
    assert.equal((await request('GET', '/api/experience')).body.sections.length, 0);
    assert.equal((await request('PUT', route(draft._id), { published: true })).status, 400);
    const photo = await image();
    const published = await request('PUT', route(draft._id), { images: [photo], published: true, order: 20 });
    assert.equal(published.status, 200);
    assert.equal(published.body.section.title, 'Draft title');
    assert.equal((await imageDocument(photo)).expiresAt, null);
    const first = await create({ title: 'First', images: [photo], order: 1, published: true });
    await create({ title: 'Private draft', images: [photo], order: 0 });
    const list = await request('GET', '/api/experience', undefined, null);
    assert.deepEqual(list.body.sections.map(section => section._id), [first._id, draft._id]);
    assert.deepEqual(list.body.sections[0].images, [photo]);
    assert.equal(list.body.sections[0].__v, undefined);
    assert.equal((await request('GET', route())).body.sections.length, 3);
    assert.equal((await request('PUT', route(first._id), { published: false })).status, 200);
    assert.deepEqual((await request('GET', '/api/experience')).body.sections.map(section => section._id), [draft._id]);
    assert.equal((await request('DELETE', route(draft._id))).status, 200);
    assert.equal((await request('GET', '/api/experience')).body.sections.length, 0);
});

test('section inputs are bounded and typed before a database write; invalid or absent ids have distinct errors', async () => {
    const fakePhoto = { url: `/api/images/${'a'.repeat(32)}`, alt: '' };
    const invalid = [
        {}, { title: '' }, { title: ' ' }, { title: false }, { title: 'x'.repeat(121) },
        { description: {} }, { description: 'x'.repeat(2001) }, { published: 'true' },
        { order: true }, { order: '1' }, { order: -1 }, { order: 1.5 }, { order: 10000 },
        { images: null }, { images: {} }, { images: ['image'] }, { images: [null] },
        { images: [{ url: 'https://example.invalid/image.png' }] }, { images: [{ url: '/Media/example.png' }] },
        { images: [{ url: fakePhoto.url, alt: false }] }, { images: [{ url: fakePhoto.url, alt: 'x'.repeat(161) }] },
        { images: [fakePhoto, fakePhoto] }, { images: Array.from({ length: 13 }, (_, index) => ({ url: `/api/images/${index.toString(16).padStart(32, '0')}` })) },
        { published: true, images: [] },
    ];
    for (const fields of invalid) {
        const body = Object.keys(fields).length ? { title: 'Fixture', ...fields } : fields;
        assert.equal((await request('POST', route(), body)).status, 400, JSON.stringify(fields));
    }
    assert.equal(await ExperienceSection.countDocuments(), 0);
    for (const method of ['PUT', 'DELETE']) {
        assert.equal((await request(method, route('not-an-id'), { title: 'Fixture' })).status, 400);
        assert.equal((await request(method, route(new mongoose.Types.ObjectId()), { title: 'Fixture' })).status, 404);
    }
});

test('missing image references roll back section creation and edits without changing existing images', async () => {
    const photo = await image();
    const missing = { url: `/api/images/${crypto.randomBytes(16).toString('hex')}`, alt: '' };
    assert.equal((await request('POST', route(), { title: 'No record', images: [photo, missing] })).status, 400);
    assert.equal(await ExperienceSection.countDocuments(), 0);
    assert.ok((await imageDocument(photo)).expiresAt instanceof Date);
    const section = await create({ images: [photo], published: true });
    assert.equal((await request('PUT', route(section._id), { title: 'Must roll back', images: [missing] })).status, 400);
    const unchanged = await ExperienceSection.findById(section._id);
    assert.equal(unchanged.title, section.title);
    assert.equal(unchanged.images[0].url, photo.url);
    assert.equal((await imageDocument(photo)).expiresAt, null);
});

test('shared section images remain retained until the last reference is removed, including drafts', async () => {
    const photo = await image();
    const first = await create({ images: [photo], published: true });
    const second = await create({ images: [photo] });
    assert.equal((await request('DELETE', route(first._id))).status, 200);
    assert.equal((await imageDocument(photo)).expiresAt, null);
    assert.equal((await request('PUT', route(second._id), { images: [] })).status, 200);
    const released = await imageDocument(photo);
    assert.ok(released.expiresAt.getTime() > Date.now() + 23 * 60 * 60 * 1000);
    assert.equal(released.bytes > 0, true);
    assert.equal((await request('PUT', route(second._id), { images: [photo] })).status, 200);
    assert.equal((await imageDocument(photo)).expiresAt, null);
});

test('event, booking and purchase references survive section deletion; event edits retain experience images', async () => {
    const photos = await Promise.all([image(), image(), image()]);
    const section = await create({ images: photos });
    const event = await Event.create({ title: 'Event fixture', description: 'Fixture', venue: 'Hall', location: 'Ludhiana', organizer: organizer._id, date: '2099-01-01', price: 0, seats: 5, status: 'approved', banner: photos[0].url });
    // Historical snapshots are intentionally minimal fixtures; no purchase or mail is initiated.
    await Booking.collection.insertOne({ eventSnapshot: { banner: photos[1].url } });
    await Purchase.collection.insertOne({ eventSnapshot: { banner: photos[2].url } });
    assert.equal((await request('DELETE', route(section._id))).status, 200);
    for (const photo of photos) assert.equal((await imageDocument(photo)).expiresAt, null);
    await create({ images: [photos[0]] });
    const updated = await request('PUT', `/api/events/${event._id}`, { banner: '' }, organizer);
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal((await imageDocument(photos[0])).expiresAt, null);
});

test('concurrent detach and attach retain the final shared image reference', async () => {
    const photo = await image();
    const oldSection = await create({ images: [photo] });
    const newSection = await create();
    const results = await Promise.all([
        request('DELETE', route(oldSection._id)),
        request('PUT', route(newSection._id), { images: [photo], published: true }),
    ]);
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    assert.equal(await ExperienceSection.countDocuments({ 'images.url': photo.url }), 1);
    assert.equal((await imageDocument(photo)).expiresAt, null);
});

test('simultaneous partial edits retry against the latest section instead of losing independent fields', async () => {
    const section = await create({ title: 'Original title', order: 0 });
    const save = ExperienceSection.prototype.save;
    let arrivals = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const fallback = setTimeout(release, 2000);
    ExperienceSection.prototype.save = async function (...args) {
        if (String(this._id) === section._id && !this.isNew && arrivals < 2) {
            arrivals += 1;
            if (arrivals === 2) release();
            await gate;
        }
        return save.apply(this, args);
    };
    try {
        const results = await Promise.all([
            request('PUT', route(section._id), { title: 'Updated title' }),
            request('PUT', route(section._id), { order: 7 }),
        ]);
        assert.deepEqual(results.map(result => result.status), [200, 200]);
        assert.equal(arrivals, 2);
    } finally {
        release();
        clearTimeout(fallback);
        ExperienceSection.prototype.save = save;
    }
    const saved = await ExperienceSection.findById(section._id);
    assert.equal(saved.title, 'Updated title');
    assert.equal(saved.order, 7);
});

test('a metadata edit that read before a concurrent delete cannot resurrect the deleted section or retain its image', async () => {
    const photo = await image();
    const section = await create({ images: [photo], published: true });
    const save = ExperienceSection.prototype.save;
    let release, reached;
    const gate = new Promise(resolve => { release = resolve; });
    const reading = new Promise(resolve => { reached = resolve; });
    const fallback = setTimeout(() => { release(); reached(); }, 2000);
    let held = false;
    ExperienceSection.prototype.save = async function (...args) {
        if (String(this._id) === section._id && !this.isNew && !held) {
            held = true;
            reached();
            await gate;
        }
        return save.apply(this, args);
    };
    const editing = request('PUT', route(section._id), { description: 'Started before deletion' });
    try {
        await reading;
        assert.equal(held, true);
        assert.equal((await request('DELETE', route(section._id))).status, 200);
        release();
        assert.equal((await editing).status, 404);
    } finally {
        release();
        clearTimeout(fallback);
        await editing;
        ExperienceSection.prototype.save = save;
    }
    assert.equal(await ExperienceSection.countDocuments({ _id: section._id }), 0);
    assert.ok((await imageDocument(photo)).expiresAt instanceof Date);
    assert.deepEqual((await request('GET', '/api/experience')).body.sections, []);
});

test('failed image retention aborts section deletion and preserves the published gallery', async () => {
    const photo = await image();
    const section = await create({ images: [photo], published: true });
    const update = EventImage.updateOne;
    EventImage.updateOne = () => { throw new Error('Injected retention write failure'); };
    try {
        assert.equal((await request('DELETE', route(section._id))).status, 503);
    } finally { EventImage.updateOne = update; }
    assert.equal(await ExperienceSection.countDocuments({ _id: section._id }), 1);
    assert.equal((await imageDocument(photo)).expiresAt, null);
    assert.equal((await request('GET', '/api/experience')).body.sections[0]._id, section._id);
});
