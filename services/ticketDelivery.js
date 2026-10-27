const fs = require('node:fs/promises');
const mailer = require('../utils/mailer');
const generateTicketPdf = require('../utils/generateTicketPdf');
const generateReceiptPdf = require('../utils/generateReceiptPdf');

const MAIL_CODES = new Set(['BREVO_IP_BLOCKED', 'BREVO_AUTH_FAILED', 'BREVO_CREDITS', 'BREVO_RATE_LIMITED', 'BREVO_REJECTED', 'BREVO_TIMEOUT', 'BREVO_TLS_ERROR', 'BREVO_UNREACHABLE', 'BREVO_NOT_CONFIGURED', 'BREVO_SENDER_UNVERIFIED']);

function createTicketDelivery({ sendMail = mailer.sendMail, ticketPdf = generateTicketPdf, receiptPdf = generateReceiptPdf, removeReceipt = file => fs.unlink(file), logger = console } = {}) {
    return async function deliverTicket(booking, event, attendee) {
        const result = { emailed: false, pdf: false, receiptPdf: false };
        const fail = code => {
            result.errorCode = code;
            logger.error('Ticket delivery failed:', code);
            return result;
        };
        if (!booking || !event || !attendee) return fail('BOOKING_DATA_MISSING');
        if (!attendee.email) return fail('MISSING_ATTENDEE_EMAIL');

        let ticketPath;
        let receiptPath;
        try {
            try {
                ticketPath = await ticketPdf(booking, event, attendee);
                if (typeof ticketPath !== 'string' || !ticketPath) throw new Error('Missing ticket PDF');
                result.pdf = true;
            } catch { return fail('TICKET_PDF_FAILED'); }
            try {
                receiptPath = await receiptPdf(booking, event, attendee);
                if (typeof receiptPath !== 'string' || !receiptPath) throw new Error('Missing receipt PDF');
                result.receiptPdf = true;
            } catch { return fail('RECEIPT_PDF_FAILED'); }

            // A successful delivery always includes both documents. PDF failures
            // stay in the queue instead of marking a partial message as sent.
            const html = `
                <h1>Booking confirmed</h1>
                <p>Hello ${mailer.escapeHtml(attendee.name)},</p>
                <p>Your booking is confirmed.</p>
                <p>Event: <strong>${mailer.escapeHtml(event.title)}</strong></p>
                <p>Ticket ID: <strong>${mailer.escapeHtml(booking.ticketId)}</strong></p>
                <p>Tickets: ${mailer.escapeHtml(booking.tickets)}</p>
                <p>Your admission pass and booking receipt are attached as PDFs. Show the pass QR code at the entrance.</p>
            `;
            try {
                const sent = await sendMail({
                    to: attendee.email,
                    subject: 'Your Evently ticket and booking receipt',
                    html,
                    attachments: [
                        { filename: `${booking.ticketId}-ticket.pdf`, path: ticketPath },
                        { filename: `${booking.ticketId}-receipt.pdf`, path: receiptPath },
                    ],
                });
                result.emailed = true;
                if (typeof sent?.id === 'string') result.messageId = sent.id.slice(0, 500);
            } catch (error) { return fail(MAIL_CODES.has(error.code) ? error.code : 'MAIL_DELIVERY_FAILED'); }
            return result;
        } finally {
            // Receipt files are unique per generation, unlike existing ticket files.
            if (receiptPath) await removeReceipt(receiptPath).catch(() => logger.error('Temporary receipt cleanup failed.'));
        }
    };
}

module.exports = { createTicketDelivery, deliverTicket: createTicketDelivery() };
