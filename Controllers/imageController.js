const EventImage = require("../models/EventImage");

const ALLOWED_TYPES = new Set(EventImage.IMAGE_CONTENT_TYPES);

/**
 * True when the client already holds this exact version.
 *
 * Compared by hand rather than with `req.fresh`, which is the obvious choice and
 * silently does nothing for a large class of clients. `req.fresh` defers to the
 * `fresh` module, which refuses to report a match when the request carries
 * `Cache-Control: no-cache` - and the fetch spec makes every conditional request
 * carry it, because an `If-None-Match` header forces the cache mode to
 * "no-store", which in turn appends `Pragma: no-cache` and
 * `Cache-Control: no-cache`. Measured against one handler: node's `fetch` gets
 * 200 and the whole body, `node:http` gets 304.
 *
 * Bailing out on `no-cache` is the right default for a resource in general,
 * because it asks for revalidation against the origin rather than a cache. This
 * is the origin, and the key is the identity of the bytes - a replaced image is
 * a different key - so a matching ETag cannot be stale and there is nothing for
 * the revalidation to protect against.
 *
 * Weak validators are accepted: a 304 only needs the weak comparison
 * (RFC 9110 8.8.3.2), and `*` matches any representation that exists.
 */
const clientHasCurrent = (req, etag) => {
    const header = req.headers["if-none-match"];
    if (!header) return false;
    return header.split(",").some((candidate) => {
        const value = candidate.trim().replace(/^W\//, "");
        return value === "*" || value === etag;
    });
};

const notFound = (res) =>
    res
        // Reset explicitly: an image content type may already be on the response
        // by the time the second read comes back empty, and res.json will not
        // overwrite a Content-Type that is already set.
        .type("application/json")
        .status(404)
        .json({ success: false, message: "Image not found" });

/**
 * GET /api/images/:key
 *
 * Public and unauthenticated, because these are event banners on the discover
 * page and an <img> tag cannot carry a bearer token. That is not a downgrade -
 * the files this replaces were served by express.static with no check at all -
 * and the key is 16 random bytes, so a URL is only reachable if the organiser
 * published it.
 *
 * Cached hard and for a year. Every upload mints a new key, so a replaced image
 * is a different URL and a stale cache entry is impossible.
 */
exports.serveImage = async (req, res) => {
    try {
        const key = String(req.params.key || "");

        // Cheap shape check before touching the database, so a scan for
        // /api/images/../../etc/passwd costs nothing.
        if (!/^[a-f0-9]{32}$/i.test(key)) return notFound(res);

        // Metadata only. `data` is select:false, so this read is a few hundred
        // bytes - a returning visitor's 304 must not cost a megabyte of transfer
        // out of the database.
        const meta = await EventImage.findOne({ key }).select("hash contentType bytes");
        if (!meta) return notFound(res);

        const etag = `"${meta.hash}"`;

        res.set({
            "Content-Type": ALLOWED_TYPES.has(meta.contentType)
                ? meta.contentType
                : "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
            // Belt and braces with the enum on the model: if a byte pattern ever
            // disagrees with the recorded type, the browser must not sniff its way
            // to executing it as HTML.
            "X-Content-Type-Options": "nosniff",
            ETag: etag
        });

        if (clientHasCurrent(req, etag)) return res.status(304).end();

        const image = await EventImage.findOne({ key }).select("+data");

        // Only reachable if the TTL monitor reaped the document between the two
        // reads, which is a legitimate 404 rather than an error.
        if (!image?.data) return notFound(res);

        return res.send(image.data);
    } catch (err) {
        if (res.headersSent) return undefined;
        return res
            .type("application/json")
            .status(500)
            .json({ success: false, message: "The image could not be loaded" });
    }
};
