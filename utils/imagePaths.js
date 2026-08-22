/**
 * Where an event image may live, and how to recognise each place.
 *
 * Three shapes are legitimate, and all three have to keep validating:
 *
 *  - `/api/images/<32 hex>` - the bytes are a document in MongoDB
 *    (models/EventImage.js). Every new upload produces this.
 *
 *  - `/uploads/event-<uuid>.<ext>` - written to Public/uploads by an older build.
 *    server.js still mounts that folder, so events created before the move to the
 *    database keep their artwork. This is what makes the change deployable
 *    without a migration: nothing breaks if the migration is never run.
 *
 *  - `/Media/...` - the hand-curated club artwork committed to the repo.
 *
 * Anything else is refused. An event page must not hotlink to somewhere the
 * organiser does not control, and an unchecked value reaching an `img src` is how
 * a `javascript:` or `data:` payload gets executed.
 *
 * client/src/lib/images.js carries a mirror of `isStoredImagePath` so the form can
 * refuse a pasted URL before submitting. Keep the two in step.
 */

/** Capturing, because callers need the key to find or delete the document. */
const DATABASE_IMAGE = /^\/api\/images\/([a-f0-9]{32})$/i;

const LEGACY_UPLOAD = /^\/uploads\/event-[a-z0-9-]+\.(?:jpg|jpeg|png|webp|gif)$/i;

// Case-insensitive on purpose: the validator this replaced was, so a stored
// "/media/..." would start failing validation on the next edit if this narrowed.
const CURATED_MEDIA = /^\/Media\/[^?#\s]+$/i;

/** The public URL for a stored image. The only place this shape is built. */
const imagePath = (key) => `/api/images/${key}`;

/** The document key behind a path, or null if it is not a database image. */
const imageKey = (value) => String(value ?? "").match(DATABASE_IMAGE)?.[1] || null;

const isLegacyUpload = (value) => LEGACY_UPLOAD.test(String(value ?? ""));

/**
 * True for an empty value too - an event with no banner is valid, and the schema
 * defaults these fields to "".
 */
const isStoredImagePath = (value) => {
    const text = String(value ?? "");
    if (!text) return true;
    return DATABASE_IMAGE.test(text) || LEGACY_UPLOAD.test(text) || CURATED_MEDIA.test(text);
};

module.exports = {
    DATABASE_IMAGE,
    LEGACY_UPLOAD,
    imagePath,
    imageKey,
    isLegacyUpload,
    isStoredImagePath
};
