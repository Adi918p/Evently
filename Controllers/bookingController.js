const Booking = require('../models/Booking');
const Event = require('../models/Events');
const QRCode = require("qrcode");

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
            { new: true }
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

        const { bookingId } = req.body;

        const booking =
            await Booking.findById(bookingId)
            .populate("user", "name email")
            .populate("event", "title date location");

        if (!booking) {

            return res.status(404).json({
                success: false,
                message: "Ticket not found"
            });

        }

        if (booking.checkedIn) {

            return res.status(400).json({
                success: false,
                message: "Already checked in"
            });

        }

        booking.checkedIn = true;
        booking.checkedInAt = new Date();

        await booking.save();

        res.status(200).json({

            success: true,

            message: "Check-in successful",

            booking

        });

    }
    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};
