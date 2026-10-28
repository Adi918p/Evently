const mongoose = require("mongoose");
const fs = require('node:fs');

const Booking = require('../models/Booking');
const Event = require('../models/Events');
const Purchase = require('../models/Purchase');
const generateTicketPdf = require("../utils/generateTicketPdf");
const { buildTicketView } = require("../utils/ticketFields");

const purchases = require('../services/purchases');
const cashBookings = require('../services/cashBookings');
const { respondError, HttpError } = require('../utils/httpError');
exports.createBooking = async (req, res) => {
    try {
        const purchase = await purchases.prepare(req.user.id, req.body, true);
        const completed = await purchases.fulfill(purchase._id);
        if (completed.state === 'failed') throw new HttpError(409, completed.reason);
        return res.status(201).json(await purchases.present(completed));
    } catch (error) { return respondError(res, error); }
};

exports.createCashBooking = async (req, res) => {
    try {
        const { booking, replayed } = await cashBookings.createCashBooking(req.user, req.body);
        const value = booking.toObject();
        delete value.cashRequestKey;
        return res.status(replayed ? 200 : 201).json({ success: true, booking: value, emailed: booking.deliveryStatus === 'sent' });
    } catch (error) { return respondError(res, error); }
};

exports.getMyBookings = async (req, res) => {

    try {

        const bookings =
            await Booking.find({
                user: req.user.id
            })
                .populate(
                    "event",
                    "title date time banner location venue price organizer archivedAt"
                );

        res.status(200).json({
            success: true,
            purchases: await Purchase.find({ user: req.user.id, state: { $ne: 'fulfilled' } }).select('state reason eventSnapshot.title createdAt').sort({ createdAt: -1 }).limit(20),
            bookings: bookings.map(row => { const value = row.toObject(); return { ...value, event: value.eventSnapshot || value.event }; })
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
 *    the purchased event snapshot rather than later edits made months
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
const downloadBookingDocument = (render, suffix = '', removeAfterDownload = false) => async (req, res) => {

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
            req.user.role === "organizer" && String(booking.event?.organizer || "") === String(req.user.id);

        if (!isOwner && !isOrganizer && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "This ticket is not yours to download"
            });
        }

        if (booking.status !== "confirmed") {
            return res.status(409).json({
                success: false,
                message: "Only a confirmed booking has a valid pass"
            });
        }

        // The attendee falls back to the requester when the booking's user was
        // deleted, for the same reason the payment path does: a pass with a blank
        // name is better than a failed download.
        const attendee = booking.user || { name: req.user.name, email: req.user.email };

        const filePath = await render(booking, booking.eventSnapshot || booking.event, booking.attendeeSnapshot || attendee);

        res.download(filePath, downloadName(booking.event, booking).replace(/\.pdf$/, `${suffix}.pdf`), (err) => {
            if (removeAfterDownload) fs.promises.unlink(filePath).catch(() => {});
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

exports.downloadTicket = downloadBookingDocument(generateTicketPdf);
exports.downloadReceipt = downloadBookingDocument((...args) => require('../utils/generateReceiptPdf')(...args), '-receipt', true);

exports.retryTicketEmail = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Booking not found.');
        const booking = await Booking.findById(req.params.id).populate('event', 'organizer');
        if (!booking) throw new HttpError(404, 'Booking not found.');
        const isOwner = String(booking.user || '') === req.user.id;
        const isOrganizer = req.user.role === 'organizer' && String(booking.event?.organizer || '') === req.user.id;
        if (!isOwner && !isOrganizer && req.user.role !== 'admin') throw new HttpError(403, 'This booking is not yours to manage.');
        if (booking.status !== 'confirmed') throw new HttpError(409, 'Only confirmed bookings can receive ticket email.');
        if (!booking.purchase && booking.paymentMethod !== 'cash') throw new HttpError(409, 'This older booking needs support review before email can be retried.');
        const queued = await Booking.findOneAndUpdate({
            _id: booking._id, status: 'confirmed', deliveryStatus: 'failed',
            $or: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { $lt: new Date() } }]
        }, {
            $set: { deliveryStatus: 'pending', deliveryAttempts: 0, nextDeliveryAt: new Date() },
            $unset: { deliveryErrorCode: 1 }
        }, { returnDocument: 'after' });
        if (!queued) throw new HttpError(409, 'Email is already sent, queued or being processed.');
        return res.json({ success: true, deliveryStatus: queued.deliveryStatus, message: 'Ticket email has been queued for another attempt.' });
    } catch (error) { return respondError(res, error); }
};

/* ==========================================================================
   Door check-in
   ========================================================================== */

/** The subset of a booking the door screen is allowed to see. */
const scanBooking = (booking) => {
    const attendee = booking.attendeeSnapshot || booking.user;
    return ({
    _id: booking._id,
    ticketId: booking.ticketId,
    tickets: booking.tickets,
    status: booking.status,
    checkedIn: Boolean(booking.checkedIn),
    checkedInAt: booking.checkedInAt || null,
    event: booking.event
        ? { _id: booking.event._id, title: booking.event.title }
        : null,
    paymentMethod: booking.paymentMethod,
    user: attendee
        ? { name: attendee.name, email: attendee.email, phone: attendee.phone }
        : null
    });
};

/**
 * POST /api/bookings/verify-ticket
 *
 * body: { bookingId?, ticketId?, eventId?, mode?: "preview" | "confirm" }
 *
 * Preview reads the ticket without changing admission. The scanner and roster
 * explicitly send "confirm" and show success only after admission is saved.
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
        if (eventId && !mongoose.isValidObjectId(eventId)) return res.status(400).json({ success: false, message: 'Invalid event.' });
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
                    event: booking.eventSnapshot || booking.event,
                    attendee: booking.attendeeSnapshot || booking.user,
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

        if (!booking.event || booking.event.archivedAt || booking.event.status === "rejected") return verdict("unavailable", "This event is not accepting admissions.");

        if (booking.status !== "confirmed") {
            return verdict(booking.status, "This booking is not confirmed.", booking);
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
                status: "confirmed"
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
            if (!current) return verdict("not-found", "No ticket matches that code.");
            if (current.status !== "confirmed") return verdict(current.status, "This booking is not confirmed.", current);
            if (!current.checkedIn) return verdict("unavailable", "This pass changed while being checked. Please scan it again.", current);
            return verdict(
                "checked-in",
                "Already checked in - someone just scanned this pass.",
                current
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
