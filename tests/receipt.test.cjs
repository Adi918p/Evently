const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const generateReceiptPdf = require('../utils/generateReceiptPdf');

// Inspect PDFKit's actual text operators, independently of the renderer's helpers.
function pdfText(bytes) {
    const source = bytes.toString('latin1');
    const texts = [];
    for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        let content;
        try { content = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
        for (const part of content.matchAll(/<([a-f0-9]+)>/gi)) texts.push(Buffer.from(part[1], 'hex').toString('latin1'));
    }
    return texts.join('');
}
const booking = {
    ticketId: 'EVT-RECEIPT-TEST', status: 'confirmed', tickets: 3, totalPrice: 750,
    paymentMethod: 'cash', bookedAt: '2026-10-27T05:00:00Z',
    eventSnapshot: { title: 'Snapshot event', date: '2099-01-01', time: '18:00', venue: 'Original hall', price: 250 },
    attendeeSnapshot: { name: 'Cash Guest', email: 'guest@example.invalid', phone: '+91 90000 00000' }
};

test('receipt contains saved attendee, quantity, immutable totals and cash method in a one-page PDF', async () => {
    const file = await generateReceiptPdf(booking, { title: 'Edited event', price: 999 }, { name: 'Different attendee' });
    try {
        const bytes = await fs.readFile(file), text = pdfText(bytes);
        assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
        assert.match(text, /Snapshot event/);
        assert.match(text, /Cash Guest/);
        assert.match(text, /guest@example.invalid/);
        assert.match(text, /\+91 90000 00000/);
        assert.match(text, /INR 250\.00/);
        assert.match(text, /INR 750\.00/);
        assert.match(text, /Cash recorded/);
        assert.doesNotMatch(text, /Edited event|Different attendee|GST|Tax invoice/i);
        assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
    } finally { await fs.unlink(file); }
});

test('digital receipt has provider reference and concurrent requests have distinct safe files', async () => {
    const digital = { ...booking, ticketId: '../../EVT-reference', paymentMethod: 'online', paymentId: 'pay_receipt_fixture' };
    const files = await Promise.all([generateReceiptPdf(digital), generateReceiptPdf(digital)]);
    try {
        assert.notEqual(files[0], files[1]);
        for (const file of files) {
            assert.equal(path.dirname(file), path.resolve(__dirname, '../tickets'));
            const text = pdfText(await fs.readFile(file));
            assert.match(text, /Online payment/);
            assert.match(text, /Payment confirmed/);
            assert.match(text, /pay_receipt_fixture/);
        }
    } finally { await Promise.all(files.map(file => fs.unlink(file))); }
});

test('free receipt is labelled free and invalid financial data cannot produce a receipt', async () => {
    const file = await generateReceiptPdf({ ...booking, totalPrice: 0, paymentMethod: 'free' });
    try { assert.match(pdfText(await fs.readFile(file)), /Free registration/); }
    finally { await fs.unlink(file); }
    await assert.rejects(generateReceiptPdf({ ...booking, tickets: 0 }), /quantity and total/);
    await assert.rejects(generateReceiptPdf({ ...booking, totalPrice: Number.NaN }), /quantity and total/);
    await assert.rejects(generateReceiptPdf({ ...booking, totalPrice: Number.MAX_VALUE }), /quantity and total/);
});

test('maximum event price and long attendee/event values stay on one page without losing amounts', async () => {
    const name = 'A customer with a long family name who needs the complete attendee details on the booking receipt';
    const title = 'A full length event title with additional information for attendees whose receipt must remain readable and include the entire event name supplied by their organizer';
    const file = await generateReceiptPdf({ ...booking, tickets: 10, totalPrice: 100000000,
        attendeeSnapshot: { ...booking.attendeeSnapshot, name },
        eventSnapshot: { ...booking.eventSnapshot, title }
    });
    try {
        const bytes = await fs.readFile(file), text = pdfText(bytes);
        assert.ok(text.includes(name));
        assert.ok(text.includes(title));
        assert.match(text, /INR 1,00,00,000\.00/);
        assert.match(text, /INR 10,00,00,000\.00/);
        assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
    } finally { await fs.unlink(file); }
});
