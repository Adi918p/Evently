const mongoose = require("mongoose");
const QRCode = require("qrcode");

const Booking = require('../models/Booking');
const Event = require('../models/Events');
const generateTicketPdf = require("../utils/generateTicketPdf");
const { buildTicketView } = require("../utils/ticketFields");
const { resolveAnswers } = require("../utils/registrationFields");

exports.createBooking = async (req, res) => {

    try {

        const { eventId, tickets } = req.body;
        const ticketCount = Number(tickets);

        /* ---------------- FIND EVENT ---------------- */

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        /* ---------------- VALIDATE TICKETS ---------------- */

        if (
            !Number.isInteger(ticketCount) ||
            ticketCount <= 0 ||
            ticketCount > 10
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket count"
            });
        }

        /* ---------------- AVAILABLE SEATS ---------------- */

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

        /* ---------------- TOTAL PRICE ---------------- */

        const totalPrice =
            event.price * ticketCount;

        /* ---------------- ORGANISER'S OWN QUESTIONS ---------------- */

        // Nothing has been written yet, so this path can still refuse: a missing
        // required answer comes back as a 400 the booking form can show against
        // the field. The paid path cannot do that - see paymentController.
        const { answers, errors } = resolveAnswers(event.registrationFields, req.body.answers);

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: errors[0],
                errors
            });
        }

        /* ---------------- TICKET ID ---------------- */

        const ticketId =
            "EVT-" +
            Date.now() +
            "-" +
            Math.floor(Math.random() * 1000);

        const qrData = JSON.stringify({
            ticketId,
            eventId,
            userId: req.user.id
        });

        const qrCode = await QRCode.toDataURL(qrData);

        /* ---------------- CREATE BOOKING ---------------- */

        const booking =
            await Booking.create({

                user: req.user.id,

                event: eventId,

                tickets: ticketCount,

                totalPrice,

                ticketId,

                qrCode,

                answers,

                status: "confirmed"

            });

        /* ---------------- UPDATE SOLD TICKETS ---------------- */

        const updatedEvent = await Event.findOneAndUpdate(
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

        if (!updatedEvent) {
            await Booking.findByIdAndDelete(booking._id);
            return res.status(409).json({
                success: false,
                message: "Those seats were just taken. Please try again."
            });
        }

        /* ---------------- RESPONSE ---------------- */

        res.status(201).json({

            success: true,

            booking,

            ticketId

        });

    }
    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};


exports.getMyBookings = async (req, res) => {

    try {

        const bookings =
            await Booking.find({
                user: req.user.id
            })
                .populate(
                    "event",
                    "title date banner location venue price"
                );

        res.status(200).json({
            success: true,
            bookings
        });

    }
    catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

/* ==========================================================================
   Ticket download
   ========================================================================== */

/** Content-Disposition filenames must not carry quotes, slashes or newlines. */
const downloadName = (event, booking) => {
    const part = (value) =>
        String(value ?? "")
            .replace(/[^A-Za-z0-9 _-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .slice(0, 60);

    const title = part(event?.title) || "event";
    const id = part(booking?.ticketId) || "ticket";
    return `Evently-${title}-${id}.pdf`;
};

/**
 * GET /api/bookings/:id/ticket
 *
 * Streams the pass as an attachment. Three things to know:
 *
 * 1. The PDF is re-rendered on every request rather than served from disk. It is
 *    a ~50ms render, and it means a pass always reflects the current design and
 *    the organiser's current ticketConfig instead of whatever was emailed months
 *    ago. It also means a booking whose file was never written (mail delivery
 *    failed) is still downloadable.
 *
 * 2. tickets/ is deliberately not mounted as a static directory in server.js.
 *    Every byte of a pass leaves through this handler, behind the check below -
 *    a static mount would make any ticket readable by anyone who guessed an id.
 *
 * 3. Who may download: the person who booked, the organiser of that event, or an
 *    admin. Nobody else, because the pass carries the attendee's name and email
 *    and the QR that admits them.
 */
exports.downloadTicket = async (req, res) => {

    try {

        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found"
            });
        }

        const booking = await Booking.findById(id)
            .populate("user", "name email")
            .populate("event");

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found"
            });
        }

        const isOwner = String(booking.user?._id || booking.user) === String(req.user.id);
        const isOrganizer =
            String(booking.event?.organizer || "") === String(req.user.id);

        if (!isOwner && !isOrganizer && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "This ticket is not yours to download"
            });
        }

        if (booking.status === "cancelled") {
            return res.status(409).json({
                success: false,
                message: "This booking was cancelled, so it has no valid pass"
            });
        }

        // The attendee falls back to the requester when the booking's user was
        // deleted, for the same reason the payment path does: a pass with a blank
        // name is better than a failed download.
        const attendee = booking.user || { name: req.user.name, email: req.user.email };

        const filePath = await generateTicketPdf(booking, booking.event, attendee);

        res.download(filePath, downloadName(booking.event, booking), (err) => {
            // Headers are already sent by the time a stream error surfaces, so
            // there is nothing to answer with - just do not crash the process.
            if (err && !res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: "The ticket could not be prepared"
                });
            }
        });

    }
    catch (err) {

        if (res.headersSent) return;

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

/* ==========================================================================
   Door check-in
   ========================================================================== */

/** The subset of a booking the door screen is allowed to see. */
const scanBooking = (booking) => ({
    _id: booking._id,
    ticketId: booking.ticketId,
    tickets: booking.tickets,
    status: booking.status,
    checkedIn: Boolean(booking.checkedIn),
    checkedInAt: booking.checkedInAt || null,
    event: booking.event
        ? { _id: booking.event._id, title: booking.event.title }
        : null,
    user: booking.user
        ? { name: booking.user.name, email: booking.user.email }
        : null
});

/**
 * POST /api/bookings/verify-ticket
 *
 * body: { bookingId?, ticketId?, eventId?, mode?: "preview" | "confirm" }
 *
 * Two-step by design. A scan runs in "preview" mode, which reads the ticket and
 * returns what the door should see without touching it; the operator looks at
 * the name and count, then confirms, which is the only call that checks anyone
 * in. Previously a single scan checked in immediately, so a misread or a
 * curious tap burned a ticket with no way back.
 *
 * mode defaults to "preview": the safe direction to fail, and it means a stray
 * or replayed request cannot admit anyone.
 *
 * A ticket that is missing, cancelled, already used or for the wrong event
 * answers 200 with ok:false rather than a 4xx. That is deliberate - to the door
 * these are all just outcomes of a scan, and the client renders each the same
 * way, with a verdict and a sound. Only a genuine authorisation failure is an
 * error status.
 */
exports.verifyTicket = async (req, res) => {

    if (
        req.user.role !== "admin" &&
        req.user.role !== "organizer"
    ) {

        return res.status(403).json({
            success: false,
            message: "Unauthorized"
        });

    }

    try {

        const { bookingId, ticketId, eventId } = req.body;
        const mode = req.body.mode === "confirm" ? "confirm" : "preview";

        const verdict = (state, message, booking = null, extra = {}) => {
            const payload = {
                success: true,
                mode,
                ok: state === "valid" || state === "admitted",
                state,
                message,
                ...extra
            };

            if (booking) {
                payload.booking = scanBooking(booking);
                payload.display = buildTicketView({
                    booking,
                    event: booking.event,
                    attendee: booking.user,
                    where: "scan"
                }).fields;
            }

            return res.status(200).json(payload);
        };

        /* ---------------- LOOK UP ---------------- */

        let query = null;
        if (bookingId && mongoose.isValidObjectId(bookingId)) {
            query = { _id: bookingId };
        } else if (ticketId && String(ticketId).trim()) {
            // Accepting the human-readable id too means a phone with a cracked
            // camera can still be admitted by typing what is printed on the pass.
            query = { ticketId: String(ticketId).trim() };
        }

        if (!query) {
            return verdict("not-found", "That code is not an Evently ticket.");
        }

        const booking = await Booking.findOne(query)
            .populate("user", "name email")
            .populate("event");

        if (!booking) {
            return verdict("not-found", "No ticket matches that code.");
        }

        /* ---------------- AUTHORISE ---------------- */

        // The missing half of the old check: being an organiser was enough to
        // check in a ticket for somebody else's event, and to read the attendee's
        // name and email off it.
        const ownsEvent = String(booking.event?.organizer || "") === String(req.user.id);

        if (req.user.role !== "admin" && !ownsEvent) {
            return res.status(403).json({
                success: false,
                message: "This ticket belongs to another organiser's event"
            });
        }

        // Scanning at the wrong door: they may legitimately hold this ticket's
        // event, so this is a scan outcome, not an authorisation failure.
        if (
            eventId &&
            mongoose.isValidObjectId(eventId) &&
            String(booking.event?._id) !== String(eventId)
        ) {
            return verdict(
                "wrong-event",
                `This pass is for "${booking.event?.title || "another event"}".`,
                booking
            );
        }

        /* ---------------- STATE ---------------- */

        if (booking.status === "cancelled") {
            return verdict("cancelled", "This booking was cancelled.", booking);
        }

        if (booking.checkedIn) {
            return verdict("checked-in", "Already checked in.", booking);
        }

        if (mode === "preview") {
            return verdict(
                "valid",
                `Valid pass for ${booking.tickets || 1} ${(booking.tickets || 1) === 1 ? "guest" : "guests"}.`,
                booking
            );
        }

        /* ---------------- CONFIRM ---------------- */

        // Conditional update, not read-then-save: two doors scanning the same
        // pass at the same moment must not both admit it.
        const admitted = await Booking.findOneAndUpdate(
            {
                _id: booking._id,
                checkedIn: { $ne: true },
                status: { $ne: "cancelled" }
            },
            { $set: { checkedIn: true, checkedInAt: new Date() } },
            { returnDocument: "after" }
        )
            .populate("user", "name email")
            .populate("event");

        if (!admitted) {
            const current = await Booking.findById(booking._id)
                .populate("user", "name email")
                .populate("event");
            return verdict(
                "checked-in",
                "Already checked in - someone just scanned this pass.",
                current || booking
            );
        }

        return verdict("admitted", "Checked in. Let them through.", admitted);

    }
    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};
