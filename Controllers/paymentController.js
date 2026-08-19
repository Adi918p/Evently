// ==============================
// Imports
// ==============================
const Razorpay = require("razorpay");
const crypto = require("crypto");
const QRCode = require("qrcode");

const Event = require("../models/Events");
const Booking = require("../models/Booking");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const generateTicketPdf = require("../utils/generateTicketPdf");

const getValidTicketCount = (tickets) => {
    const ticketCount = Number(tickets);

    if (!Number.isInteger(ticketCount) || ticketCount <= 0 || ticketCount > 10) {
        return null;
    }

    return ticketCount;
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

        if (generatedSignature !== razorpay_signature) {
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
        // Fetch Event
        // --------------------------
        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        // --------------------------
        // Update Event Stats
        // --------------------------
        const reservedEvent = await Event.findOneAndUpdate(
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

        if (!reservedEvent) {
            return res.status(409).json({
                success: false,
                message: "Event sold out"
            });

        }
        reservationMade = true;
        reservedEventId = eventId;
        reservedTickets = ticketCount;

        // --------------------------
        // Generate Ticket ID
        // --------------------------
        const ticketId =
            "EVLT-" +
            crypto
                .randomBytes(6)
                .toString("hex")
                .toUpperCase();

        // --------------------------
        // Calculate Total Price
        // --------------------------
        const totalPrice = Number(event.price || 0) * ticketCount;

        // --------------------------
        // Create Booking
        // --------------------------
        const booking = await Booking.create({
            user: req.user.id,
            event: eventId,
            tickets: ticketCount,
            totalPrice,
            ticketId,
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            checkedIn: false,
            status: "confirmed"
        });
        const user =
            await User.findById(req.user.id);
        const qrData = JSON.stringify({
            ticketId,
            eventId,
            userId: req.user.id,
            bookingId: booking._id
        });

        const qrCode = await QRCode.toDataURL(qrData);
        booking.qrCode = qrCode;


        // --------------------------
        // Save Event Changes
        // --------------------------
        
        await booking.save();
        reservationMade = false;

        const pdfPath =
            await generateTicketPdf(
                booking,
                event,
                user
            );

        const html = `
            <h1>Booking Confirmed 🎉</h1>

            <p>Hello ${user.name}</p>

            <p>Your booking has been confirmed.</p>

            <p>
                Event:
                ${event.title}
            </p>

            <p>
                Ticket ID:
                ${booking.ticketId}
            </p>
            `;
        try {
            await sendEmail(user.email, "Your Evently Ticket", html, pdfPath);
        } catch (emailError) {
            console.error("Ticket email failed:", emailError.message);
        }

        return res.status(200).json({
            success: true,
            booking
        });
    } catch (err) {
        if (reservationMade && reservedEventId) {
            await Event.findByIdAndUpdate(reservedEventId, {
                $inc: { ticketsSold: -reservedTickets }
            }).catch(() => {});
        }
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
