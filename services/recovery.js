const Purchase = require('../models/Purchase');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Event = require('../models/Events');
const purchases = require('./purchases');
const { deliverTicket } = require('./ticketDelivery');
const { isDatabaseReady } = require('../config/db');
let running = false;
async function tick() {
    if (running || !isDatabaseReady()) return;
    running = true;
    try {
        const queue = await Purchase.find({ state: { $in: ['creating', 'pending', 'refund_pending'] }, nextCheckAt: { $lte: new Date() }, mode: { $in: ['free', purchases.mode()] } }).sort({ nextCheckAt: 1 }).limit(20);
        for (const purchase of queue) {
            await Purchase.updateOne({ _id: purchase._id }, { $set: { nextCheckAt: new Date(Date.now() + 5 * 60_000) } });
            try { await purchases.reconcile(purchase); } catch (err) { console.error('Purchase recovery pending:', String(purchase._id), err.message); }
        }
        for (let i = 0; i < 10; i++) {
            const leaseUntil = new Date(Date.now() + 5 * 60_000);
            const booking = await Booking.findOneAndUpdate({
                status: 'confirmed', deliveryStatus: { $ne: 'sent' },
                deliveryAttempts: { $lt: 5 }, nextDeliveryAt: { $lte: new Date() },
                $and: [
                    { $or: [{ purchase: { $exists: true } }, { paymentMethod: 'cash' }] },
                    { $or: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { $lt: new Date() } }] },
                ],
            }, { $set: { deliveryLeaseUntil: leaseUntil }, $inc: { deliveryAttempts: 1 } }, { returnDocument: 'after' });
            if (!booking) break;
            let result;
            try {
                const event = booking.eventSnapshot || await Event.findById(booking.event);
                const attendee = booking.attendeeSnapshot || (booking.user ? await User.findById(booking.user) : null);
                result = await deliverTicket(booking, event, attendee);
            } catch { result = { emailed: false, errorCode: 'TICKET_DELIVERY_FAILED' }; }
            const update = {
                $set: { deliveryStatus: result.emailed ? 'sent' : 'failed', nextDeliveryAt: new Date(Date.now() + 60_000 * 2 ** booking.deliveryAttempts) },
                $unset: { deliveryLeaseUntil: 1 },
            };
            if (result.emailed) {
                update.$unset.deliveryErrorCode = 1;
                if (typeof result.messageId === 'string') update.$set.deliveryMessageId = result.messageId.slice(0, 500);
                else update.$unset.deliveryMessageId = 1;
            } else {
                update.$set.deliveryErrorCode = /^[A-Z0-9_]{1,64}$/.test(String(result.errorCode || '')) ? result.errorCode : 'TICKET_DELIVERY_FAILED';
                update.$unset.deliveryMessageId = 1;
            }
            try {
                // A delayed worker must not overwrite a newer delivery lease.
                await Booking.updateOne({ _id: booking._id, deliveryLeaseUntil: leaseUntil }, update);
            } catch { console.error('Ticket delivery state could not be saved; its lease will expire:', String(booking._id)); }
        }
    } finally { running = false; }
}
function startRecovery() {
    const timer = setInterval(() => tick().catch(err => console.error('Recovery worker:', err.message)), 30_000);
    timer.unref();
    return timer;
}
module.exports = { tick, startRecovery };
