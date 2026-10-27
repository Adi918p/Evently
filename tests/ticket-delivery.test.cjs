const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTicketDelivery } = require('../services/ticketDelivery');
const { createMailer } = require('../utils/mailer');

const booking = { ticketId: 'TEST-MAIL', tickets: 2, totalPrice: 200, paymentMethod: 'cash' };
const event = { title: 'Fixture <event>' };
const attendee = { name: 'Fixture <attendee>', email: 'attendee@example.invalid' };
const env = { MAIL_FROM: 'Evently <sender@example.invalid>', BREVO_API_KEY: 'fixture-only' };

async function pdfFiles() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'evently-delivery-'));
    const ticket = path.join(dir, 'ticket.pdf');
    const receipt = path.join(dir, 'receipt.pdf');
    return {
        ticket, receipt,
        ticketPdf: async () => { await fs.writeFile(ticket, '%PDF-ticket-fixture'); return ticket; },
        receiptPdf: async () => { await fs.writeFile(receipt, '%PDF-receipt-fixture'); return receipt; },
        cleanup: async () => {
            for (const file of [ticket, receipt]) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
            await fs.rmdir(dir);
        },
    };
}

test('ticket delivery submits both PDFs once, returns message ID and removes only its temporary receipt', async () => {
    const files = await pdfFiles();
    let sends = 0;
    const sendMail = createMailer({ env, fetchImpl: async (url, options) => {
        sends++;
        const payload = JSON.parse(options.body);
        assert.equal(payload.attachment.length, 2);
        assert.deepEqual(payload.attachment.map(item => item.name), ['TEST-MAIL-ticket.pdf', 'TEST-MAIL-receipt.pdf']);
        assert.deepEqual(payload.attachment.map(item => Buffer.from(item.content, 'base64').toString()), ['%PDF-ticket-fixture', '%PDF-receipt-fixture']);
        assert.match(payload.htmlContent, /Fixture &lt;attendee&gt;/);
        assert.match(payload.htmlContent, /Fixture &lt;event&gt;/);
        return { ok: true, json: async () => ({ messageId: '<delivery-fixture@example.invalid>' }) };
    } }).sendMail;
    try {
        const result = await createTicketDelivery({ ...files, sendMail })(booking, event, attendee);
        assert.deepEqual(result, { emailed: true, pdf: true, receiptPdf: true, messageId: '<delivery-fixture@example.invalid>' });
        assert.equal(sends, 1);
        await assert.rejects(fs.stat(files.receipt), { code: 'ENOENT' });
        assert.equal(await fs.readFile(files.ticket, 'utf8'), '%PDF-ticket-fixture');
    } finally { await files.cleanup(); }
});

test('provider rejection remains a failed delivery with a safe code and cleans up its receipt', async () => {
    const files = await pdfFiles();
    const logs = [];
    const sendMail = createMailer({ env, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unrecognised IP address 2001:db8::10 fixture-only' }) }) }).sendMail;
    try {
        const result = await createTicketDelivery({ ...files, sendMail, logger: { error: (...args) => logs.push(args.join(' ')) } })(booking, event, attendee);
        assert.equal(result.emailed, false);
        assert.equal(result.errorCode, 'BREVO_IP_BLOCKED');
        assert.equal(result.messageId, undefined);
        assert.doesNotMatch(JSON.stringify({ result, logs }), /2001:db8|fixture-only|attendee@example/);
        await assert.rejects(fs.stat(files.receipt), { code: 'ENOENT' });
    } finally { await files.cleanup(); }
});

test('ticket PDF failure prevents receipt generation and any email submission', async () => {
    let receiptCalls = 0; let sends = 0;
    const deliver = createTicketDelivery({
        ticketPdf: async () => { throw new Error('render failed'); },
        receiptPdf: async () => { receiptCalls++; },
        sendMail: async () => { sends++; },
        logger: { error() {} },
    });
    const result = await deliver(booking, event, attendee);
    assert.deepEqual(result, { emailed: false, pdf: false, receiptPdf: false, errorCode: 'TICKET_PDF_FAILED' });
    assert.equal(sends, 0); assert.equal(receiptCalls, 0);
});

test('receipt PDF failure never sends a partial ticket-only email', async () => {
    for (const receiptPdf of [async () => { throw new Error('render failed'); }, async () => null]) {
        let sends = 0;
        const deliver = createTicketDelivery({ ticketPdf: async () => 'fixture-ticket.pdf', receiptPdf, sendMail: async () => { sends++; }, logger: { error() {} } });
        const result = await deliver(booking, event, attendee);
        assert.deepEqual(result, { emailed: false, pdf: true, receiptPdf: false, errorCode: 'RECEIPT_PDF_FAILED' });
        assert.equal(sends, 0);
    }
});
