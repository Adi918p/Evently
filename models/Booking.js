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
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', unique: true, sparse: true },
    paymentMethod: { type: String, enum: ['cash', 'online', 'free'], immutable: true },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true, required() { return this.paymentMethod === 'cash'; } },
    collectedAt: { type: Date, immutable: true, required() { return this.paymentMethod === 'cash'; } },
    cashRequestKey: { type: String, maxlength: 100, immutable: true, required() { return this.paymentMethod === 'cash'; } },
    eventSnapshot: mongoose.Schema.Types.Mixed,
    attendeeSnapshot: mongoose.Schema.Types.Mixed,
    deliveryStatus: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    deliveryErrorCode: String,
    deliveryMessageId: String,
    deliveryAttempts: { type: Number, default: 0 },
    deliveryLeaseUntil: Date,
    nextDeliveryAt: { type: Date, default: Date.now },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // Walk-in cash attendees do not need an Evently account. Their contact
        // details belong to attendeeSnapshot; the collecting operator is separate.
        required() { return this.paymentMethod !== 'cash'; }
    },

    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },

    tickets: {
        type: Number,
        default: 1, min: 1, max: 10, validate: Number.isInteger
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

bookingSchema.index({ collectedBy: 1, cashRequestKey: 1 }, {
    unique: true,
    partialFilterExpression: { paymentMethod: 'cash' }
});

module.exports = mongoose.model('Booking', bookingSchema);
