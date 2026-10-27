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
            const booking = await Booking.findOneAndUpdate({ purchase: { $exists: true }, status: 'confirmed', deliveryStatus: { $ne: 'sent' }, deliveryAttempts: { $lt: 5 }, nextDeliveryAt: { $lte: new Date() }, $or: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { $lt: new Date() } }] }, { $set: { deliveryLeaseUntil: new Date(Date.now() + 5 * 60_000) }, $inc: { deliveryAttempts: 1 } }, { new: true });
            if (!booking) break;
            try {
                const event = booking.eventSnapshot || await Event.findById(booking.event);
                const attendee = booking.attendeeSnapshot || await User.findById(booking.user);
                const result = await deliverTicket(booking, event, attendee);
                await Booking.updateOne({ _id: booking._id }, { $set: { deliveryStatus: result.emailed ? 'sent' : 'failed', nextDeliveryAt: new Date(Date.now() + 60_000 * 2 ** booking.deliveryAttempts) }, $unset: { deliveryLeaseUntil: 1 } });
            } catch (err) { console.error('Ticket delivery pending:', String(booking._id), err.message); }
        }
    } finally { running = false; }
}
function startRecovery() {
    const timer = setInterval(() => tick().catch(err => console.error('Recovery worker:', err.message)), 30_000);
    timer.unref();
    return timer;
}
module.exports = { tick, startRecovery };
