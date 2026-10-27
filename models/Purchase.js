const mongoose = require('mongoose');
const purchaseSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, immutable: true },
    requestKey: { type: String, required: true, maxlength: 100, immutable: true },
    tickets: { type: Number, required: true, min: 1, max: 10, immutable: true },
    amount: { type: Number, required: true, min: 0, immutable: true },
    currency: { type: String, default: 'INR', immutable: true },
    mode: { type: String, enum: ['test', 'live', 'free'], required: true, immutable: true },
    answers: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
    eventSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    orderId: { type: String, unique: true, sparse: true },
    paymentId: { type: String, unique: true, sparse: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    state: { type: String, enum: ['creating', 'pending', 'fulfilled', 'refund_pending', 'refunded', 'failed'], default: 'creating' },
    reason: String,
    refundId: String,
    refundLeaseUntil: Date,
    nextCheckAt: { type: Date, default: Date.now },
}, { timestamps: true });
purchaseSchema.index({ user: 1, requestKey: 1 }, { unique: true });
purchaseSchema.index({ state: 1, nextCheckAt: 1 });
module.exports = mongoose.model('Purchase', purchaseSchema);
