const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },

    tickets: {
        type: Number,
        default: 1
    },

    totalPrice: {
        type: Number,
        required: true
    },

    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'confirmed'
    },

    ticketId: {
        type: String,
        unique: true
    },

    paymentId: {
        type: String,
        default: ""
    },

    orderId: {
        type: String,
        default: ""
    },

    qrCode: {
        type: String
    },

    checkedIn: {
        type: Boolean,
        default: false
    },

    checkedInAt: {
        type: Date,
        default: null
    },


    bookedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Booking', bookingSchema);
