const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let readScannerPayload;
before(async () => {
    ({ readScannerPayload } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/lib/scannerPayload.js'))));
});
const bookingId = '671de8d6dc6e7c70529f1931';
const currentTicket = 'EVT-1234567890ABCDEF12345678';

test('current raw and JSON ticket codes retain identifiers for server verification', () => {
    assert.deepEqual(readScannerPayload(currentTicket), { bookingId: null, ticketId: currentTicket });
    assert.deepEqual(readScannerPayload(JSON.stringify({ bookingId, ticketId: currentTicket })), { bookingId, ticketId: currentTicket });
    assert.deepEqual(readScannerPayload(`  ${currentTicket}\n`), { bookingId: null, ticketId: currentTicket });
});

test('historical timestamp and paid EVLT tickets remain supported in raw and JSON forms', () => {
    for (const ticketId of ['EVT-1793098800000-0', 'EVT-1793098800000-999', 'EVLT-123456ABCDEF']) {
        const expected = { bookingId: null, ticketId };
        assert.deepEqual(readScannerPayload(ticketId), expected);
        assert.deepEqual(readScannerPayload(JSON.stringify({ ticketId, eventId: 'old-event', userId: 'old-user' })), expected);
    }
});

test('plausible prefixed IDs are not restricted to the current generated length', () => {
    for (const ticketId of ['EVT-FUTURE-123', 'EVLT-legacy-01', 'EVT-' + 'A'.repeat(124)]) {
        assert.deepEqual(readScannerPayload(ticketId), { bookingId: null, ticketId });
    }
});

test('a valid booking ID is usable alone and QR event data is not trusted', () => {
    assert.deepEqual(readScannerPayload(JSON.stringify({ bookingId, eventId: 'another-event', ticketId: 123 })), { bookingId, ticketId: null });
    assert.deepEqual(readScannerPayload(JSON.stringify({ bookingId: bookingId.toUpperCase() })), { bookingId: bookingId.toUpperCase(), ticketId: null });
    assert.equal(readScannerPayload(bookingId), null, 'Bare object IDs are not a documented QR format');
});

test('a bad booking ID does not hide a valid legacy ticket ID', () => {
    const ticketId = 'EVLT-123456ABCDEF';
    for (const badBooking of ['not-an-object-id', 'a'.repeat(23), 123, {}, null]) {
        assert.deepEqual(readScannerPayload(JSON.stringify({ bookingId: badBooking, ticketId })), { bookingId: null, ticketId });
    }
});

test('unrelated QR formats and arbitrary text are rejected locally', () => {
    for (const raw of [
        'https://example.invalid/ticket/123', 'upi://pay?pa=fixture@example.invalid',
        'WIFI:T:WPA;S:Fixture;P:fixture;;', 'BEGIN:VCARD\nFN:Fixture\nEND:VCARD',
        'ordinary text', '12345', 'EVT-', 'EVT--123', 'EVT-123-',
        'EVT-123/456', 'EVT-123?url=https://example.invalid',
    ]) assert.equal(readScannerPayload(raw), null, raw);
});

test('malformed JSON and non-string identifier fields cannot become ticket lookups', () => {
    for (const raw of [
        '{"ticketId":"EVT-123"', '{"bookingId":}', '{}', 'null', '[]',
        JSON.stringify({ ticketId: 123 }), JSON.stringify({ ticketId: ['EVT-123'] }),
        JSON.stringify({ bookingId: {}, ticketId: { value: currentTicket } }),
        JSON.stringify({ ticketId: 'https://example.invalid/' }),
    ]) assert.equal(readScannerPayload(raw), null, raw);
    for (const raw of [undefined, null, 123, {}, [], new String(currentTicket)]) {
        assert.equal(readScannerPayload(raw), null);
    }
});

test('oversized QR payloads and identifiers are refused before lookup', () => {
    assert.equal(readScannerPayload('EVT-' + 'A'.repeat(125)), null);
    assert.equal(readScannerPayload(JSON.stringify({ ticketId: 'EVT-' + 'A'.repeat(125) })), null);
    assert.equal(readScannerPayload(JSON.stringify({ bookingId, padding: 'x'.repeat(4096) })), null);
    assert.equal(readScannerPayload(' '.repeat(4096) + currentTicket), null);
});
