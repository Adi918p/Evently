const PDFDocument = require('pdfkit');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { winAnsi } = require('./generateTicketPdf');

const ticketsDir = path.resolve(__dirname, '../tickets');
const text = (value, fallback = '-', max = 300) => winAnsi(value).slice(0, max) || fallback;
const money = amount => `INR ${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = value => {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Not recorded' : parsed.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
    });
};

/** A booking receipt, not a tax invoice. Amounts come from the saved booking. */
function generateReceiptPdf(booking, event, attendee) {
    const quantity = Number(booking?.tickets);
    const total = Number(booking?.totalPrice);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !Number.isFinite(total) || total < 0 || !Number.isSafeInteger(Math.round(total * 100))) {
        return Promise.reject(new Error('A valid booking quantity and total are required for a receipt.'));
    }
    // Prefer the immutable snapshots even if a caller passes today's event/user.
    event = booking.eventSnapshot || event || {};
    attendee = booking.attendeeSnapshot || attendee || {};
    const reference = text(booking.ticketId || booking._id, 'Booking receipt', 100);
    const fileId = String(booking.ticketId || booking._id || 'booking').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'booking';
    const filePath = path.join(ticketsDir, `${fileId}-receipt-${crypto.randomUUID()}.pdf`);
    const cash = booking.paymentMethod === 'cash';
    const method = cash ? 'Cash' : total === 0 ? 'Free registration' : booking.paymentId ? 'Online payment' : 'Not recorded';
    const status = booking.status === 'confirmed' ? (cash ? 'Cash recorded' : total === 0 ? 'Registration confirmed' : 'Payment confirmed') : text(booking.status, 'Status not recorded');

    return new Promise((resolve, reject) => {
        fs.mkdirSync(ticketsDir, { recursive: true });
        const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
            Title: `Evently booking receipt - ${reference}`, Author: 'Evently', Subject: 'Booking receipt'
        } });
        const stream = fs.createWriteStream(filePath, { flags: 'wx' });
        let settled = false;
        const finish = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) {
                stream.once('close', () => fs.unlink(filePath, () => {}));
                stream.destroy();
                doc.destroy();
                reject(error);
            } else resolve(filePath);
        };
        const timer = setTimeout(() => finish(new Error('Receipt PDF render timed out.')), 15000);
        stream.once('error', finish);
        stream.once('finish', () => finish());
        doc.once('error', finish);
        doc.pipe(stream);

        try {
            const left = 48, right = 547, width = right - left;
            const ink = '#192235', muted = '#576174', line = '#DCE1EA', accent = '#5B3DB0';
            const write = (value, x, y, w, size = 10, bold = false, height = 40, align = 'left') => {
                doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
                while (size > 7 && doc.heightOfString(value, { width: w, lineGap: 2 }) > height) {
                    size -= 0.5;
                    doc.fontSize(size);
                }
                doc.fillColor(ink)
                    .text(value, x, y, { width: w, height, ellipsis: true, lineGap: 2, align });
            };
            const label = (value, x, y, w = width) => {
                doc.font('Helvetica-Bold').fontSize(8).fillColor(muted)
                    .text(value, x, y, { width: w, height: 12, characterSpacing: 0.8 });
            };
            const rule = y => doc.moveTo(left, y).lineTo(right, y).strokeColor(line).lineWidth(0.7).stroke();
            const amount = (value, x, y, w, preferredSize = 10, bold = false) => {
                const formatted = money(value);
                doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
                let size = preferredSize;
                while (size > 7 && doc.fontSize(size).widthOfString(formatted) > w) size -= 0.5;
                write(formatted, x, y, w, size, bold, 26, 'right');
            };

            doc.rect(0, 0, 595.28, 8).fill(accent);
            doc.font('Helvetica-Bold').fontSize(22).fillColor(accent).text('EVENTLY', left, 42, { width });
            write('Booking receipt', left, 77, width, 26, true, 36);
            write(status, left, 117, width, 10, false, 18);
            rule(145);

            label('ATTENDEE', left, 165, 242);
            write(text(attendee.name, 'Name not recorded', 120), left, 184, 242, 12, true, 36);
            write(text(attendee.email, 'Email not recorded', 254), left, 226, 242, 9, false, 56);
            write(text(attendee.phone, 'Phone not recorded', 40), left, 286, 242, 10, false, 18);

            label('RECEIPT REFERENCE', 316, 165, 231);
            write(reference, 316, 184, 231, 10, true, 45);
            label('BOOKED ON', 316, 241, 231);
            write(date(booking.bookedAt || booking.createdAt), 316, 260, 231, 10, false, 20);
            rule(321);

            label('EVENT', left, 340);
            write(text(event.title, 'Event', 200), left, 358, width, 13, true, 38);
            write(`${date(event.date)}${event.time ? ` | ${text(event.time, '', 20)} IST` : ''}`, left, 405, width, 10, false, 18);
            write(text(event.venue || event.location, 'Venue not recorded', 300), left, 429, width, 10, false, 40);

            doc.rect(left, 489, width, 28).fill('#F1EDF9');
            label('DESCRIPTION', left + 12, 498, 190);
            label('QTY', 285, 498, 35);
            label('UNIT PRICE', 337, 498, 90);
            label('AMOUNT', 455, 498, 80);
            write('Admission tickets', left + 12, 534, 210, 11, false, 22);
            write(String(quantity), 285, 534, 35, 11, false, 22);
            amount(total / quantity, 315, 534, 110, 9);
            amount(total, 435, 534, 100, 9);
            rule(570);
            label('TOTAL PAID', 300, 590, 100);
            amount(total, 403, 585, 132, 17, true);

            label('PAYMENT METHOD', left, 641);
            write(method, left, 659, width, 11, false, 22);
            const providerReference = booking.paymentId || booking.orderId;
            if (providerReference) {
                write(`Payment reference: ${text(providerReference, '-', 120)}`, left, 691, width, 9, false, 32);
            }
            rule(742);
            doc.font('Helvetica').fontSize(8).fillColor(muted)
                .text('Keep this receipt for your records. Use the separate QR ticket for entry.', left, 759, { width, height: 24 })
                .text('Booking receipt | All amounts in INR | 1 of 1', left, 790, { width, height: 15 });
            doc.end();
        } catch (error) { finish(error); }
    });
}

module.exports = generateReceiptPdf;
