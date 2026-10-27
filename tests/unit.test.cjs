const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { amountInPaise, salesCloseAt, assertBookable } = require('../utils/eventPolicy');
const { sanitizeRegistrationFields, resolveAnswers } = require('../utils/registrationFields');
const { matchesImageType } = require('../services/eventImages');
const { cleanupLegacyFiles } = require('../utils/migrationCleanup');
const Event = require('../models/Events');
const Contact = require('../models/Contact');

test('money, capacities and content limits reject malformed direct input', () => {
    assert.equal(amountInPaise(19.99, 3), 5997);
    for (const value of [-1, Infinity, 1.234]) assert.throws(() => amountInPaise(value, 1));
    const fixture = { title: 'Valid', description: 'Valid description', venue: 'Hall', date: '2099-01-01', organizer: '1'.repeat(24), price: 100, seats: 5 };
    for (const change of [{ price: -25 }, { price: 0.001 }, { seats: 2.5 }, { seats: -1 }, { title: 'a'.repeat(121) }, { gallery: Array(13).fill('/Media/test.jpg') }]) assert.ok(new Event({ ...fixture, ...change }).validateSync());
    assert.equal(new Event(fixture).validateSync(), undefined);
    assert.ok(new Contact({ name: 'A', email: 'not-email', subject: 'Hello', message: 'Message' }).validateSync());
    assert.ok(new Contact({ name: 'A', email: 'a@example.invalid', subject: 'Hello', message: 'a'.repeat(5001) }).validateSync());
});
test('booking cutoff uses Indian event start time, with end-of-day fallback', () => {
    assert.equal(salesCloseAt({ date: '2030-01-01', time: '18:30' }).toISOString(), '2030-01-01T13:00:00.000Z');
    assert.equal(salesCloseAt({ date: '2030-01-01' }).toISOString(), '2030-01-01T18:29:59.000Z');
    assert.throws(() => assertBookable({ status: 'approved', date: '2030-01-01', time: '18:30' }, new Date('2030-01-01T13:00:00Z')), /closed/);
});
test('checkout display agrees with the server cutoff across visitor time zones', async () => {
    const { isBookingClosed } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/lib/constants.js')));
    for (const time of ['18:30', '']) {
        const event = { date: '2030-01-01', time };
        const cutoff = salesCloseAt(event).getTime();
        assert.equal(isBookingClosed(event, cutoff - 1), false);
        assert.equal(isBookingClosed(event, cutoff), true);
    }
});
test('duplicate question keys remain unique and within schema length limits', () => {
    const key = 'a'.repeat(32);
    const fields = sanitizeRegistrationFields(Array.from({ length: 8 }, (_, i) => ({ key, label: `Question ${i}` })));
    assert.equal(new Set(fields.map(row => row.key)).size, 8);
    assert.ok(fields.every(row => row.key.length <= 32));
    assert.deepEqual(sanitizeRegistrationFields(fields), fields);
});
test('all registration answer types enforce definitions and required fields', () => {
    const fields = [
        { key: 'text', label: 'Name', type: 'text', required: true },
        { key: 'count', label: 'Count', type: 'number', required: true },
        { key: 'one', label: 'One', type: 'select', options: ['A', 'B'], required: true },
        { key: 'many', label: 'Many', type: 'multiselect', options: ['A', 'B'], required: true },
        { key: 'agree', label: 'Agree', type: 'checkbox', required: true },
    ];
    assert.equal(resolveAnswers(fields, {}).errors.length, 5);
    const valid = resolveAnswers(fields, { text: 'Attendee', count: 2, one: 'a', many: ['B', 'A', 'B'], agree: true });
    assert.equal(valid.errors.length, 0); assert.equal(valid.answers.length, 5);
    assert.ok(resolveAnswers(fields, { count: 'NaN', one: 'unknown' }).errors.length >= 2);
    assert.ok(resolveAnswers([{ key: 'toString', label: 'Literal key', required: true }], {}).errors.length);
});
test('image sniffing rejects a declared MIME type that does not match its bytes', () => {
    const png = Buffer.from([137,80,78,71,13,10,26,10]);
    assert.equal(matchesImageType(png, 'image/png'), true);
    assert.equal(matchesImageType(png, 'image/jpeg'), false);
    assert.equal(matchesImageType(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
});
test('upload batching respects byte and count limits for accepted GIF files', async () => {
    const { partitionUploads } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/lib/uploadBatches.js')));
    const file = { type: 'image/gif', bytes: 3 * 1024 * 1024, data: 'a'.repeat(4 * 1024 * 1024) };
    const batches = partitionUploads([file, file, file, file]);
    assert.equal(batches.length, 2);
    for (const batch of batches) {
        assert.ok(batch.length <= 8); assert.ok(batch.reduce((total, item) => total + item.bytes, 0) <= 8 * 1024 * 1024);
        assert.ok(JSON.stringify({ files: batch.map(({ type, data }) => ({ type, data })) }).length < 12 * 1024 * 1024);
    }
});
test('migration cleanup preserves current and historical references and refuses out-of-root targets', async () => {
    const deleted = [];
    const candidates = ['/uploads/event-current.png', '/uploads/event-history.png', '/uploads/event-unused.png'];
    const Event = { exists: async filter => filter.$or[0].banner.includes('current') };
    const Booking = { exists: async filter => filter['eventSnapshot.banner'].includes('history') };
    const Purchase = { exists: async () => false };
    const options = { candidates, publicDir: path.resolve(__dirname, '../tmp/migration-fixture'), Event, Booking, Purchase, unlink: async target => deleted.push(target) };
    assert.equal(await cleanupLegacyFiles(options), 1); assert.ok(deleted[0].endsWith('event-unused.png'));
    await assert.rejects(cleanupLegacyFiles({ ...options, candidates: ['/uploads/../../outside.txt'] }), /Unsafe/);
    const count = deleted.length;
    await assert.rejects(cleanupLegacyFiles({ ...options, Event: { exists: async () => { throw new Error('database unavailable'); } } }), /database/);
    assert.equal(deleted.length, count);
});
test('upgraded mail transport builds an attachment message without contacting a mail server', async () => {
    const nodemailer = require('nodemailer');
    const { escapeHtml } = require('../utils/mailer');
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const result = await transport.sendMail({ from: 'Evently <sender@example.invalid>', to: 'attendee@example.invalid', subject: 'Ticket fixture', html: `<p>${escapeHtml('<script>unsafe</script>')}</p>`, attachments: [{ filename: 'ticket.pdf', content: Buffer.from('%PDF-test-only') }] });
    const message = result.message.toString();
    assert.match(message, /filename=ticket\.pdf/); assert.doesNotMatch(message, /<script>/);
});
