const mongoose = require('mongoose');

/**
 * One answer to an organiser's extra booking question.
 *
 * The label is stored alongside the key rather than looked up at render time on
 * purpose: an organiser who renames or deletes the question later must not
 * retitle or blank out answers on passes that have already been issued. Both are
 * written from the event's own definition, never from the request body - see
 * utils/registrationFields.js.
 */
const bookingAnswerSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        trim: true,
        maxlength: 32
    },
    label: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40
    },
    value: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160
    },
    // Only set for multi-select answers, where `value` is the joined display
    // form and this keeps the picks separable for later reporting.
    values: {
        type: [String],
        default: undefined
    }
}, { _id: false });

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
        unique: true,
        sparse: true
    },

    orderId: {
        type: String,
        unique: true,
        sparse: true
    },

    qrCode: {
        type: String
    },

    answers: {
        type: [bookingAnswerSchema],
        default: []
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
