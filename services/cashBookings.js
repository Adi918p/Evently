const mongoose = require('mongoose');
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const Booking = require('../models/Booking');
const Event = require('../models/Events');
const User = require('../models/User');
const { amountInPaise, ticketCount, snapshot } = require('../utils/eventPolicy');
const { resolveAnswers } = require('../utils/registrationFields');
const { HttpError } = require('../utils/httpError');

function attendeeDetails(body) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(body.name)) {
        throw new HttpError(400, 'Enter the attendee\'s name (up to 120 characters).');
    }
    if (typeof body.email !== 'string' || body.email.trim().length > 254 || /[\u0000-\u001f\u007f]/.test(body.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        throw new HttpError(400, 'Enter a valid attendee email address.');
    }
    if (typeof body.phone !== 'string' || body.phone.length > 40) throw new HttpError(400, 'Enter a valid attendee phone number.');
    const phone = body.phone.replace(/[\s().-]/g, '');
    if (!/^\+?\d{7,15}$/.test(phone)) throw new HttpError(400, 'Enter a phone number containing 7 to 15 digits.');
    return { name: body.name.trim(), email: body.email.trim().toLowerCase(), phone };
}

function assertCashBookable(event, now = new Date()) {
    if (!event || event.archivedAt || event.status !== 'approved') throw new HttpError(409, 'Cash registration is available only for approved, active events.');
    const date = new Date(event.date);
    const closesAt = Number.isNaN(date.getTime()) ? new Date(0) : new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999+05:30`);
    // The door may sell cash tickets after the online sales cutoff at event start.
    if (now > closesAt) throw new HttpError(409, 'Cash registration for this event has closed.');
}

function assertSameRequest(existing, input, attendee) {
    const { answers, errors } = resolveAnswers(existing.eventSnapshot?.registrationFields, input.answers);
    if (String(existing.event) !== String(input.eventId) || existing.tickets !== Number(input.tickets)
        || Math.round(existing.totalPrice * 100) !== input.expectedAmount
        || ['name', 'email', 'phone'].some(key => existing.attendeeSnapshot?.[key] !== attendee[key])
        || errors.length || JSON.stringify(existing.answers.map(answer => answer.toObject ? answer.toObject() : answer)) !== JSON.stringify(answers)) {
        throw new HttpError(409, 'This request key already belongs to a different cash booking.');
    }
}

async function createCashBooking(actor, input) {
    if (!['organizer', 'admin'].includes(actor?.role)) throw new HttpError(403, 'Only the event organizer can register a cash booking.');
    if (!mongoose.isValidObjectId(input.eventId)) throw new HttpError(400, 'Invalid event.');
    if (input.cashReceived !== true) throw new HttpError(400, 'Confirm that the full cash amount has been received.');
    if (!['number', 'string'].includes(typeof input.tickets) || (typeof input.tickets === 'string' && !/^\d+$/.test(input.tickets))) throw new HttpError(400, 'Choose between 1 and 10 tickets.');
    const tickets = ticketCount(input.tickets);
    if (!Number.isSafeInteger(input.expectedAmount) || input.expectedAmount < 0) throw new HttpError(400, 'Confirm the displayed cash total before registering.');
    const attendee = attendeeDetails(input);
    if (typeof input.requestKey !== 'string' || !/^[\w-]{16,100}$/.test(input.requestKey)) throw new HttpError(400, 'A cash booking request key is required.');

    // A duplicate key can occur when requests for different event documents race.
    // Re-enter with a fresh transaction so the winning request is compared safely.
    for (let attempt = 0; attempt < 3; attempt++) {
        let result;
        try {
            await mongoose.connection.transaction(async session => {
                const account = await User.findById(actor.id).session(session);
                if (!account || !account.isEmailVerified || account.status !== 'active' || !['organizer', 'admin'].includes(account.role)) throw new HttpError(403, 'This account cannot register cash bookings.');
                const event = await Event.findById(input.eventId).session(session);
                if (!event) throw new HttpError(404, 'Event not found.');
                if (account.role !== 'admin' && String(event.organizer) !== String(account._id)) throw new HttpError(403, 'This event belongs to another organizer.');
                const existing = await Booking.findOne({ collectedBy: account._id, cashRequestKey: input.requestKey, paymentMethod: 'cash' }).session(session);
                if (existing) {
                    assertSameRequest(existing, input, attendee);
                    result = { booking: existing, replayed: true };
                    return;
                }
                assertCashBookable(event);
                const { answers, errors } = resolveAnswers(event.registrationFields, input.answers);
                if (errors.length) throw new HttpError(400, errors[0]);
                const amount = amountInPaise(event.price, tickets);
                if (input.expectedAmount !== amount) throw new HttpError(409, 'The ticket price has changed. Refresh the event and confirm the updated cash total.');
                if (event.ticketsSold + tickets > event.seats) throw new HttpError(409, 'Not enough seats remain. This booking was not saved; return any cash already collected.');
                const reserved = await Event.updateOne({ _id: event._id, status: 'approved', archivedAt: null, $expr: { $lte: [{ $add: ['$ticketsSold', tickets] }, '$seats'] } }, { $inc: { ticketsSold: tickets } }, { session });
                if (reserved.modifiedCount !== 1) throw new HttpError(409, 'The remaining seats have changed. This booking was not saved; return any cash already collected.');
                const id = new mongoose.Types.ObjectId();
                const ticketId = `EVT-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
                const qrCode = await QRCode.toDataURL(JSON.stringify({ bookingId: String(id), ticketId }));
                const [booking] = await Booking.create([{
                    _id: id, event: event._id, paymentMethod: 'cash',
                    collectedBy: account._id, collectedAt: new Date(), cashRequestKey: input.requestKey,
                    eventSnapshot: snapshot(event), attendeeSnapshot: attendee,
                    tickets, totalPrice: amount / 100, answers, status: 'confirmed', ticketId, qrCode,
                    deliveryStatus: 'pending', nextDeliveryAt: new Date()
                }], { session });
                result = { booking, replayed: false };
            });
            return result;
        } catch (error) {
            if (error.code !== 11000 || attempt === 2) throw error;
        }
    }
}

module.exports = { createCashBooking, assertCashBookable };
