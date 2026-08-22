const mongoose = require("mongoose");

/**
 * An uploaded event image, bytes and all.
 *
 * These used to be files in Public/uploads. That works on a laptop and fails on
 * the host: Render gives every deploy a fresh filesystem, so each redeploy wiped
 * every banner an organiser had ever uploaded and left the event documents
 * pointing at 404s. The database is the only thing that survives, so the bytes
 * belong here.
 *
 * One document per image rather than a Buffer on the Event itself. A BSON
 * document is capped at 16 MB and an event can carry a banner, eight gallery
 * shots and a lineup photo each - inline, that overflows. It also means loading
 * an event for a listing page does not drag megabytes of image data with it.
 *
 * GridFS would be the answer for large files. At a 4 MB per-image ceiling it is
 * two collections and a chunk-assembly round trip to solve a problem this does
 * not have.
 */

/** Accepted on upload, and the whitelist the serve route is allowed to echo. */
const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** How long an uploaded image survives without an event pointing at it. */
const UNCLAIMED_MS = 24 * 60 * 60 * 1000;

const eventImageSchema = new mongoose.Schema({
    /**
     * The public identifier, 16 random bytes as hex.
     *
     * Deliberately not the _id: an ObjectId is a timestamp plus a counter, so
     * exposing it in a URL would let someone walk the range and pull down
     * banners for events that are still unpublished drafts. The old uuid
     * filenames were unguessable and this keeps that property.
     */
    key: {
        type: String,
        required: true,
        unique: true,
        immutable: true
    },

    /**
     * select: false so the bytes are never fetched by accident. A stray
     * EventImage.find() during a cleanup or a stats query would otherwise pull
     * every image in the database into memory at once.
     */
    data: {
        type: Buffer,
        required: true,
        select: false
    },

    contentType: {
        type: String,
        required: true,
        enum: IMAGE_CONTENT_TYPES
    },

    bytes: {
        type: Number,
        required: true
    },

    /** sha256 of the bytes. Serves as the ETag, and finds duplicates later. */
    hash: {
        type: String,
        required: true,
        index: true
    },

    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    /**
     * Set to a date at upload, cleared to null once an event that references this
     * image is saved. Picking images and then abandoning the form is common, and
     * without this every abandoned draft would leak a few megabytes for ever.
     *
     * Clearing it to null is what makes the image permanent: MongoDB's TTL
     * monitor only expires a document whose indexed field holds a Date, and
     * ignores every other type. So this reads like a no-op and is the whole
     * mechanism - no sweep job, no cron.
     */
    expiresAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

eventImageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EventImage = mongoose.model("EventImage", eventImageSchema);

module.exports = EventImage;
module.exports.IMAGE_CONTENT_TYPES = IMAGE_CONTENT_TYPES;
module.exports.UNCLAIMED_MS = UNCLAIMED_MS;
