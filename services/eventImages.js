const EventImage = require('../models/EventImage');
const Event = require('../models/Events');
const Booking = require('../models/Booking');
const Purchase = require('../models/Purchase');
const ExperienceSection = require('../models/ExperienceSection');
const { imageKey, isLegacyUpload } = require('../utils/imagePaths');
const { HttpError } = require('../utils/httpError');
const paths = event => [event?.banner, ...(event?.gallery || []), ...(event?.lineup || []).map(row => row.image)].filter(Boolean);
async function syncImages(before, after, actor, session) {
    const oldPaths = new Set(paths(before));
    const newPaths = new Set(paths(after));
    for (const value of newPaths) {
        if (isLegacyUpload(value) && !oldPaths.has(value)) throw new HttpError(400, 'Upload this image before adding it to an event.');
        const key = imageKey(value);
        if (!key) continue;
        const image = await EventImage.findOne({ key }).session(session);
        if (!image) throw new HttpError(400, 'An uploaded image has expired or no longer exists. Upload it again.');
        if (!oldPaths.has(value) && String(image.owner) !== String(actor.id) && actor.role !== 'admin') throw new HttpError(403, 'You can only attach images you uploaded.');
        await EventImage.updateOne({ _id: image._id }, { $set: { expiresAt: null }, $inc: { referenceVersion: 1 } }, { session });
    }
    for (const value of oldPaths) {
        if (newPaths.has(value) || !imageKey(value)) continue;
        const referenced = await Event.exists({ $or: [{ banner: value }, { gallery: value }, { 'lineup.image': value }] }).session(session)
            || await Booking.exists({ 'eventSnapshot.banner': value }).session(session)
            || await Purchase.exists({ 'eventSnapshot.banner': value }).session(session)
            || await ExperienceSection.exists({ 'images.url': value }).session(session);
        await EventImage.updateOne({ key: imageKey(value) }, { $set: { expiresAt: referenced ? null : new Date(Date.now() + EventImage.UNCLAIMED_MS) }, $inc: { referenceVersion: 1 } }, { session });
    }
}
function matchesImageType(buffer, type) {
    if (type === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (type === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
    if (type === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    return false;
}
module.exports = { syncImages, matchesImageType, paths };
