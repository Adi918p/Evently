const { HttpError } = require('./httpError');
const visibleStatuses = ['approved', 'pending'];
function salesCloseAt(event) {
    const date = new Date(event.date);
    if (Number.isNaN(date.getTime())) return new Date(0);
    const day = date.toISOString().slice(0, 10);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time || '') ? `${event.time}:00` : '23:59:59';
    // Evently currently lists Indian events; date-only records use the local end of day.
    return new Date(`${day}T${time}+05:30`);
}
function assertBookable(event, now = new Date()) {
    if (!event || event.archivedAt || !visibleStatuses.includes(event.status)) throw new HttpError(404, 'This event is not available for booking.');
    if (salesCloseAt(event) <= now) throw new HttpError(409, 'Booking for this event has closed.');
}
function amountInPaise(price, tickets) {
    const paise = Number(price) * 100;
    if (!Number.isFinite(paise) || paise < 0 || Math.abs(paise - Math.round(paise)) > 0.000001 || !Number.isSafeInteger(Math.round(paise) * tickets)) {
        throw new HttpError(400, 'Price must be nonnegative and have at most two decimal places.');
    }
    return Math.round(paise) * tickets;
}
function ticketCount(value) {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 10) throw new HttpError(400, 'Choose between 1 and 10 tickets.');
    return count;
}
function snapshot(event) {
    const value = event.toObject ? event.toObject() : event;
    return Object.fromEntries(['_id', 'title', 'date', 'time', 'banner', 'location', 'venue', 'price', 'organizer', 'ticketConfig', 'registrationFields', 'agelim'].map(key => [key, value[key]]));
}
module.exports = { visibleStatuses, salesCloseAt, assertBookable, amountInPaise, ticketCount, snapshot };
