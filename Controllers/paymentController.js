// ==============================
// Imports
// ==============================
const Razorpay = require("razorpay");
const crypto = require("crypto");
const QRCode = require("qrcode");

const mongoose = require("mongoose");

const Event = require("../models/Events");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { sendMail, escapeHtml } = require("../utils/mailer");
const generateTicketPdf = require("../utils/generateTicketPdf");
const { resolveAnswers } = require("../utils/registrationFields");

const getValidTicketCount = (tickets) => {
    const ticketCount = Number(tickets);

    if (!Number.isInteger(ticketCount) || ticketCount <= 0 || ticketCount > 10) {
        return null;
    }

    return ticketCount;
};

/**
 * Constant-time comparison of two hex digests.
 *
 * timingSafeEqual throws on a length mismatch, so the lengths are checked
 * first - that check leaks only the length of the value the caller sent us,
 * which they already know.
 */
const signatureMatches = (expected, received) => {
    const a = Buffer.from(String(expected), "utf8");
    const b = Buffer.from(String(received || ""), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

/**
 * Who the ticket is for.
 *
 * The account row is the better source, but it can be missing: a JWT is valid
 * for seven days, so a token outlives a deleted user (or a reset database) and
 * findById then returns null. That used to throw on `user.name` *after* the
 * payment had been captured and the booking written. The token itself carries
 * the name and email, so it is a perfectly good fallback.
 */
const resolveAttendee = async (tokenPayload) => {
    let account = null;

    try {
        account = await User.findById(tokenPayload.id).select("name email");
    } catch {
        account = null;
    }

    return {
        name: account?.name || tokenPayload.name || "Guest",
        email: account?.email || tokenPayload.email || null,
    };
};

/**
 * Ticket PDF + confirmation email.
 *
 * Deliberately swallows everything. It runs after the booking is committed, so
 * every failure in here is a delivery problem: the customer has paid, the seat
 * is theirs, and the booking is in the database with its ticket id and QR code.
 * Turning that into a 500 tells someone who has been charged that their payment
 * failed, which is the one answer that is never true at this point.
 */
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

// ==============================
// Razorpay Configuration
// ==============================
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ==============================
// Create Razorpay Order
// ==============================
exports.createOrder = async (req, res) => {
    try {
        const { eventId, tickets } = req.body;
        const ticketCount = getValidTicketCount(tickets);

        if (!ticketCount) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket count"
            });
        }

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        const availableSeats = Math.max(
            Number(event.seats || 0) - Number(event.ticketsSold || 0),
            0
        );

        if (ticketCount > availableSeats) {
            return res.status(409).json({
                success: false,
                message: `Only ${availableSeats} seats left`
            });
        }

        const totalPrice = Number(event.price || 0) * ticketCount;

        // The organiser's extra questions are checked here, before the Razorpay
        // sheet opens. This is the last moment a bad answer can be refused: by
        // the time verifyPayment runs the customer has been charged, and a
        // booking must never fail over a dropdown.
        const { errors } = resolveAnswers(event.registrationFields, req.body.answers);

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: errors[0],
                errors
            });
        }

        const options = {
            amount: totalPrice * 100, // Razorpay expects amount in paise
            currency: "INR",
            receipt: `event_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        return res.status(200).json({
            success: true,
            order,
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// ==============================
// Verify Payment & Create Booking
// ==============================
/**
 * Everything before the booking is written may fail loudly. Everything after it
 * must not: once Booking.create resolves the customer has paid and holds a
 * seat, so a later error is a delivery problem to be logged, never a 500 that
 * tells them the payment failed and invites a second attempt.
 */
exports.verifyPayment = async (req, res) => {
    let reservationMade = false;
    let reservedEventId = null;
    let reservedTickets = 0;
    try {
        const {
            eventId,
            tickets,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;
        const ticketCount = getValidTicketCount(tickets);

        if (!ticketCount) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket count"
            });
        }

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Payment details are incomplete"
            });
        }

        if (!mongoose.isValidObjectId(eventId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid event"
            });
        }

        // --------------------------
        // Verify Razorpay Signature
        // --------------------------
        const generatedSignature = crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(
                `${razorpay_order_id}|${razorpay_payment_id}`
            )
            .digest("hex");

        if (!signatureMatches(generatedSignature, razorpay_signature)) {
            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });
        }

        const existingBooking = await Booking.findOne({
            $or: [
                { paymentId: razorpay_payment_id },
                { orderId: razorpay_order_id }
            ]
        });
        if (existingBooking) {
            return res.status(200).json({ success: true, booking: existingBooking });
        }

        // --------------------------
        // Reserve seats
        // --------------------------
        // Conditional $inc, so two buyers racing for the last seat cannot both
        // win: whoever loses the update gets no document back.
        const event = await Event.findOneAndUpdate(
            {
                _id: eventId,
                $expr: {
                    $lte: [
                        { $add: ["$ticketsSold", ticketCount] },
                        "$seats"
                    ]
                }
            },
            { $inc: { ticketsSold: ticketCount } },
            { returnDocument: "after" }
        );

        if (!event) {
            // Either the event is gone or the seats are. Distinguish the two so
            // the buyer gets a message that matches reality.
            const stillExists = await Event.exists({ _id: eventId });
            return res.status(stillExists ? 409 : 404).json({
                success: false,
                message: stillExists ? "Event sold out" : "Event not found"
            });
        }

        reservationMade = true;
        reservedEventId = eventId;
        reservedTickets = ticketCount;

        // --------------------------
        // Build the booking
        // --------------------------
        const ticketId =
            "EVLT-" +
            crypto
                .randomBytes(6)
                .toString("hex")
                .toUpperCase();

        const totalPrice = Number(event.price || 0) * ticketCount;

        // Resolved, never refused. createOrder already rejected a bad set before
        // the customer paid; anything wrong at this point is dropped rather than
        // turned into a failure response for someone who has been charged.
        const { answers } = resolveAnswers(event.registrationFields, req.body.answers);

        // The QR code is generated before the insert so the booking is written
        // complete. Previously it was created, then patched with the QR in a
        // second save - a crash in between left a booking whose ticket could
        // never be scanned.
        const bookingId = new mongoose.Types.ObjectId();
        const qrCode = await QRCode.toDataURL(JSON.stringify({
            ticketId,
            eventId,
            userId: req.user.id,
            bookingId
        }));

        const booking = await Booking.create({
            _id: bookingId,
            user: req.user.id,
            event: eventId,
            tickets: ticketCount,
            totalPrice,
            ticketId,
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            qrCode,
            answers,
            checkedIn: false,
            status: "confirmed"
        });

        // Committed. From here nothing may turn into a failure response.
        reservationMade = false;

        const attendee = await resolveAttendee(req.user);
        const delivery = await deliverTicket(booking, event, attendee);

        return res.status(200).json({
            success: true,
            booking,
            emailed: delivery.emailed
        });
    } catch (err) {
        // Only reached while the seats are reserved and the booking is not yet
        // written, so releasing them is always correct here.
        if (reservationMade && reservedEventId) {
            await Event.findByIdAndUpdate(reservedEventId, {
                $inc: { ticketsSold: -reservedTickets }
            }).catch(() => {});
        }
        console.error("[payments] verify failed:", err);
        return res.status(500).json({
            success: false,
            message: "We could not confirm that payment. If you were charged, contact support with your payment id."
        });
    }
};
