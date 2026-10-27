const path = require('node:path');
const fs = require('node:fs/promises');
const { isLegacyUpload } = require('./imagePaths');

// Called only after all replacement references have been saved successfully.
async function cleanupLegacyFiles({ candidates, publicDir, Event, Booking, Purchase, unlink = fs.unlink }) {
    const root = path.resolve(publicDir, 'uploads') + path.sep;
    let removed = 0;
    for (const imageUrl of candidates) {
        const target = path.resolve(publicDir, String(imageUrl).replace(/^\//, ''));
        if (!isLegacyUpload(imageUrl) || !target.startsWith(root)) throw new Error('Unsafe migration cleanup target');
        const referenced = await Event.exists({ $or: [{ banner: imageUrl }, { gallery: imageUrl }, { 'lineup.image': imageUrl }] });
        const historical = await Booking.exists({ 'eventSnapshot.banner': imageUrl }) || await Purchase.exists({ 'eventSnapshot.banner': imageUrl });
        if (referenced || historical) continue;
        try { await unlink(target); removed++; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return removed;
}
module.exports = { cleanupLegacyFiles };
