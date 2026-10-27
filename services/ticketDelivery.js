const { sendMail, escapeHtml } = require("../utils/mailer");
const generateTicketPdf = require("../utils/generateTicketPdf");
const deliverTicket = async (booking, event, attendee) => {
    const result = { emailed: false, pdf: false };

    let pdfPath = null;
    try {
        pdfPath = await generateTicketPdf(booking, event, attendee);
        result.pdf = true;
    } catch (err) {
        console.error(`[booking ${booking.ticketId}] ticket PDF failed:`, err.message);
    }

    if (!attendee.email) {
        console.error(`[booking ${booking.ticketId}] no email address on file, cannot send ticket`);
        return result;
    }

    const html = `
        <h1>Booking confirmed</h1>
        <p>Hello ${escapeHtml(attendee.name)},</p>
        <p>Your booking is confirmed.</p>
        <p>Event: <strong>${escapeHtml(event.title)}</strong></p>
        <p>Ticket ID: <strong>${escapeHtml(booking.ticketId)}</strong></p>
        <p>Tickets: ${escapeHtml(booking.tickets)}</p>
        ${pdfPath
            ? "<p>Your pass is attached as a PDF. Show the QR code at the entrance.</p>"
            : "<p>Show this ticket ID at the entrance. You can also find the QR code under My Bookings.</p>"}
    `;

    try {
        await sendMail({
            to: attendee.email,
            subject: "Your Evently ticket",
            html,
            attachments: pdfPath ? [{ filename: `${booking.ticketId}.pdf`, path: pdfPath }] : [],
        });
        result.emailed = true;
    } catch (err) {
        console.error(`[booking ${booking.ticketId}] ticket email failed:`, err.message);
    }

    return result;
};


module.exports = { deliverTicket };
