const mongoose = require('mongoose');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Razorpay = require('razorpay');
const Event = require('../models/Events');
const Booking = require('../models/Booking');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { resolveAnswers } = require('../utils/registrationFields');
const { HttpError } = require('../utils/httpError');
const { assertBookable, amountInPaise, ticketCount, snapshot } = require('../utils/eventPolicy');

let client;
const provider = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new HttpError(503, 'Payments are not configured.');
    return client ||= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};
const mode = () => process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live' : 'test';
const signatureMatches = (expected, received) => {
    if (typeof received !== 'string' || !/^[a-f0-9]{64}$/i.test(received)) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
};
const digest = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest('hex');

// The provider is injectable for isolated integration tests; production always uses Razorpay.
function createPurchaseService(getProvider = provider) {
    async function prepare(userId, body, free = false) {
        if (!mongoose.isValidObjectId(body.eventId)) throw new HttpError(400, 'Invalid event.');
        const tickets = ticketCount(body.tickets);
        const requestKey = String(body.requestKey || '');
        if (!/^[\w-]{16,100}$/.test(requestKey)) throw new HttpError(400, 'A checkout request key is required.');
        const existing = await Purchase.findOne({ user: userId, requestKey });
        if (existing) {
            if (String(existing.event) !== body.eventId || existing.tickets !== tickets || (existing.mode === 'free') !== free) throw new HttpError(409, 'This checkout key belongs to a different purchase.');
            return existing;
        }
        const event = await Event.findById(body.eventId);
        assertBookable(event);
        const amount = amountInPaise(event.price, tickets);
        if (free && amount !== 0) throw new HttpError(400, 'Paid events require payment verification.');
        if (!free && amount < 100) throw new HttpError(400, amount === 0 ? 'Use free registration for this event.' : 'Paid bookings must total at least Rs 1.');
        if (event.ticketsSold + tickets > event.seats) throw new HttpError(409, 'Not enough seats remain.');
        const { answers, errors } = resolveAnswers(event.registrationFields, body.answers);
        if (errors.length) throw new HttpError(400, errors[0]);
        try {
            return await Purchase.create({ user: userId, event: event._id, tickets, requestKey, amount, mode: free ? 'free' : mode(), answers, eventSnapshot: snapshot(event) });
        } catch (err) {
            if (err.code !== 11000) throw err;
            return prepare(userId, body, free);
        }
    }

    async function createOrder(userId, body) {
        const purchase = await prepare(userId, body);
        if (purchase.mode !== mode()) throw new HttpError(409, 'Start a new checkout for the current payment environment.');
        if (purchase.orderId || purchase.state === 'fulfilled') return purchase;
        // One caller owns order creation. A timeout is recovered by receipt/webhook, never by blindly creating another order.
        const claimed = await Purchase.findOneAndUpdate({ _id: purchase._id, state: 'creating', reason: { $exists: false } }, { $set: { reason: 'Preparing payment order' } }, { new: true });
        if (!claimed) throw new HttpError(409, 'This checkout is still being prepared. Check its status before starting another.');
        const order = await getProvider().orders.create({ amount: purchase.amount, currency: purchase.currency, receipt: String(purchase._id), notes: { purchaseId: String(purchase._id) } });
        if (Number(order.amount) !== purchase.amount || order.currency !== purchase.currency) throw new HttpError(502, 'Payment order did not match the purchase.');
        // A webhook may already have recovered and fulfilled this order while create() was in flight.
        return await Purchase.findOneAndUpdate({ _id: purchase._id, state: 'creating', orderId: { $exists: false } }, { $set: { orderId: order.id, state: 'pending' }, $unset: { reason: 1 } }, { returnDocument: 'after' }) || Purchase.findById(purchase._id);
    }

    async function fulfill(purchaseId, payment = null) {
        // All durable seat, booking, and purchase changes commit together. No unsafe standalone-Mongo fallback.
        await mongoose.connection.transaction(async session => {
            const purchase = await Purchase.findById(purchaseId).session(session);
            if (!purchase || ['fulfilled', 'refunded', 'refund_pending', 'failed'].includes(purchase.state)) return;
            if (purchase.mode !== 'free') {
                if (!payment || payment.status !== 'captured' || payment.order_id !== purchase.orderId || Number(payment.amount) !== purchase.amount || payment.currency !== purchase.currency || Number(payment.amount_refunded || 0) !== 0) throw new HttpError(400, 'Payment does not match this purchase.');
                purchase.paymentId = payment.id;
            }
            const event = await Event.findById(purchase.event).session(session);
            const account = await User.findById(purchase.user).session(session);
            let unavailable = '';
            try { assertBookable(event); } catch (err) { unavailable = err.message; }
            if (!account || account.status !== 'active' || !account.isEmailVerified) unavailable = 'The account is not eligible for booking.';
            if (purchase.mode === 'free' && event && Number(event.price) !== 0) unavailable = 'This event is no longer free. Start a new checkout.';
            if (!unavailable && event.ticketsSold + purchase.tickets > event.seats) unavailable = 'The remaining seats were purchased before this payment completed.';
            if (unavailable) {
                purchase.state = purchase.mode === 'free' ? 'failed' : 'refund_pending';
                purchase.reason = unavailable;
                await purchase.save({ session });
                return;
            }
            const reserved = await Event.updateOne({ _id: event._id, $expr: { $lte: [{ $add: ['$ticketsSold', purchase.tickets] }, '$seats'] } }, { $inc: { ticketsSold: purchase.tickets } }, { session });
            if (reserved.modifiedCount !== 1) throw new Error('Seat reservation changed; retry transaction.');
            const id = new mongoose.Types.ObjectId();
            const ticketId = `EVT-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
            const qrCode = await QRCode.toDataURL(JSON.stringify({ bookingId: String(id), ticketId }));
            await Booking.create([{
                _id: id, user: purchase.user, event: purchase.event, purchase: purchase._id,
                eventSnapshot: purchase.eventSnapshot, attendeeSnapshot: { name: account.name, email: account.email },
                tickets: purchase.tickets, totalPrice: purchase.amount / 100, answers: purchase.answers,
                status: 'confirmed', ticketId, qrCode,
                ...(payment ? { paymentId: payment.id, orderId: purchase.orderId } : {}),
            }], { session });
            purchase.booking = id;
            purchase.state = 'fulfilled';
            purchase.reason = undefined;
            await purchase.save({ session });
        });
        const purchase = await Purchase.findById(purchaseId);
        if (purchase.state === 'refund_pending') await refund(purchase);
        return Purchase.findById(purchaseId);
    }

    async function refund(purchase) {
        const lock = await Purchase.findOneAndUpdate({ _id: purchase._id, state: 'refund_pending', $or: [{ refundLeaseUntil: null }, { refundLeaseUntil: { $lt: new Date() } }] }, { $set: { refundLeaseUntil: new Date(Date.now() + 5 * 60_000) } }, { new: true });
        if (!lock) return;
        try {
            const payment = await getProvider().payments.fetch(lock.paymentId);
            const refunds = await getProvider().payments.fetchMultipleRefund(lock.paymentId, { count: 100 });
            let record = refunds.items?.find(item => item.receipt === String(lock._id) || item.notes?.purchaseId === String(lock._id));
            if (!record && Number(payment.amount_refunded || 0) >= lock.amount) {
                await Purchase.updateOne({ _id: lock._id }, { $set: { state: 'refunded' } });
                return;
            }
            // A known failed refund needs operator attention; do not create duplicate refunds on every retry.
            if (record?.status === 'failed') return;
            if (!record) record = await getProvider().payments.refund(lock.paymentId, { amount: lock.amount, receipt: String(lock._id), notes: { purchaseId: String(lock._id) } });
            await Purchase.updateOne({ _id: lock._id }, { $set: { refundId: record.id, state: record.status === 'processed' ? 'refunded' : 'refund_pending' } });
        } catch (err) { console.error('Refund retry needed:', String(lock._id), err.message); }
        finally { await Purchase.updateOne({ _id: lock._id }, { $unset: { refundLeaseUntil: 1 }, $set: { nextCheckAt: new Date(Date.now() + 60_000) } }); }
    }

    async function verify(userId, body) {
        const purchase = await Purchase.findOne({ orderId: body.razorpay_order_id, user: userId });
        if (!purchase) throw new HttpError(404, 'Purchase not found.');
        if (purchase.mode !== mode()) throw new HttpError(409, 'This purchase belongs to another payment environment.');
        if ((body.eventId && String(purchase.event) !== body.eventId) || (body.tickets !== undefined && Number(body.tickets) !== purchase.tickets)) throw new HttpError(400, 'Purchase details do not match.');
        if (!signatureMatches(digest(`${purchase.orderId}|${body.razorpay_payment_id}`, process.env.RAZORPAY_KEY_SECRET), body.razorpay_signature)) throw new HttpError(400, 'Payment verification failed.');
        const payment = await getProvider().payments.fetch(body.razorpay_payment_id);
        if (payment.order_id !== purchase.orderId || Number(payment.amount) !== purchase.amount || payment.currency !== purchase.currency) throw new HttpError(400, 'Payment does not match this purchase.');
        if (Number(payment.amount_refunded || 0) >= purchase.amount) return recordFullRefund(purchase, payment);
        if (payment.status !== 'captured') return purchase;
        return fulfill(purchase._id, payment);
    }

    // A refund made in the provider dashboard must also revoke an issued pass.
    // Both webhook replay and a simultaneous check-in are serialized by this transaction.
    async function recordFullRefund(purchase, payment) {
        if (payment.order_id !== purchase.orderId || Number(payment.amount) !== purchase.amount || payment.currency !== purchase.currency || Number(payment.amount_refunded || 0) < purchase.amount) throw new HttpError(400, 'Refund does not match this purchase.');
        await mongoose.connection.transaction(async session => {
            const current = await Purchase.findById(purchase._id).session(session);
            if (!current || current.state === 'refunded') return;
            const booking = current.booking && await Booking.findOneAndUpdate({ _id: current.booking, status: 'confirmed' }, { $set: { status: 'cancelled' } }, { session, returnDocument: 'after' });
            if (booking) await Event.updateOne({ _id: current.event }, { $inc: { ticketsSold: -current.tickets } }, { session });
            current.state = 'refunded';
            current.paymentId = payment.id;
            current.reason = 'The payment was fully refunded. Any issued pass has been cancelled.';
            await current.save({ session });
        });
        return Purchase.findById(purchase._id);
    }

    async function reconcile(purchase) {
        if (purchase.mode === 'free') return fulfill(purchase._id);
        if (purchase.mode !== mode()) return purchase;
        if (purchase.state === 'refund_pending') { await refund(purchase); return Purchase.findById(purchase._id); }
        if (['refunded', 'failed'].includes(purchase.state)) return purchase;
        if (purchase.state === 'fulfilled') {
            const payment = await getProvider().payments.fetch(purchase.paymentId);
            return Number(payment.amount_refunded || 0) >= purchase.amount ? recordFullRefund(purchase, payment) : purchase;
        }
        if (!purchase.orderId) {
            const orders = await getProvider().orders.all({ receipt: String(purchase._id), count: 100 });
            const order = orders.items?.find(item => item.receipt === String(purchase._id) && Number(item.amount) === purchase.amount && item.currency === purchase.currency);
            if (!order) return purchase;
            purchase = await Purchase.findOneAndUpdate({ _id: purchase._id, state: 'creating', orderId: { $exists: false } }, { $set: { orderId: order.id, state: 'pending' }, $unset: { reason: 1 } }, { returnDocument: 'after' }) || await Purchase.findById(purchase._id);
        }
        const payments = await getProvider().orders.fetchPayments(purchase.orderId);
        const refunded = payments.items?.find(item => Number(item.amount_refunded || 0) >= purchase.amount);
        if (refunded) return recordFullRefund(purchase, refunded);
        const payment = payments.items?.find(item => item.status === 'captured');
        return payment ? fulfill(purchase._id, payment) : purchase;
    }

    async function present(purchase) {
        const booking = purchase.booking ? await Booking.findById(purchase.booking) : null;
        return { success: true, purchaseId: purchase._id, state: purchase.state, message: purchase.reason, booking, emailed: booking?.deliveryStatus === 'sent', order: purchase.orderId ? { id: purchase.orderId, amount: purchase.amount, currency: purchase.currency } : null, keyId: purchase.mode === 'free' ? undefined : process.env.RAZORPAY_KEY_ID };
    }
    return { prepare, createOrder, fulfill, verify, reconcile, present, refund };
}
module.exports = { ...createPurchaseService(), createPurchaseService, signatureMatches, digest, mode };
