const Event = require("../models/Events");
const Booking = require("../models/Booking");
const EventImage = require("../models/EventImage");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
    TICKET_FIELD_KEYS,
    SCAN_FIELD_KEYS,
    resolveExtras
} = require("../utils/ticketFields");
const { sanitizeRegistrationFields } = require("../utils/registrationFields");
const {
    imagePath,
    imageKey,
    isLegacyUpload,
    isStoredImagePath
} = require("../utils/imagePaths");

const allowedImageTypes = new Set(EventImage.IMAGE_CONTENT_TYPES);
const maxImageBytes = 4 * 1024 * 1024;
const maxUploadBytes = 8 * 1024 * 1024;

const validateEventImages = ({ banner = "", gallery = [], lineup = [] }) => {
    if (typeof banner !== "string" || !isStoredImagePath(banner)) return "The banner must be uploaded through Evently";
    if (!Array.isArray(gallery) || gallery.some((image) => typeof image !== "string" || !isStoredImagePath(image))) return "Gallery images must be uploaded through Evently";
    if (!Array.isArray(lineup) || lineup.some((artist) => !artist || typeof artist.name !== "string" || (artist.image && !isStoredImagePath(artist.image)))) return "Lineup images must be uploaded through Evently";
    return "";
};

/**
 * Every image an event document points at that Evently itself owns.
 *
 * Both storages, because an event edited today may still carry paths written
 * before the move to the database. /Media is excluded on purpose: that artwork is
 * committed to the repo and shared between events, so it is never ours to delete.
 */
const collectEventImages = (event) => [
    event?.banner,
    ...(Array.isArray(event?.gallery) ? event.gallery : []),
    ...(Array.isArray(event?.lineup) ? event.lineup.map((artist) => artist?.image) : [])
]
    .map((image) => String(image || ""))
    .filter((image) => imageKey(image) || isLegacyUpload(image));

/**
 * Normalises the organiser's ticket settings before they are stored.
 *
 * Field keys are filtered against the catalogue in utils/ticketFields.js rather
 * than trusted, so a hand-crafted request cannot get an arbitrary document path
 * printed onto a ticket or shown at the door. Extras are literal label/value
 * text and are only trimmed and capped.
 */
const sanitizeTicketConfig = (input) => {
    if (!input || typeof input !== "object") return null;

    const pickKeys = (value, allowed) =>
        Array.isArray(value)
            ? [...new Set(value.map(String).filter((key) => allowed.includes(key)))]
            : [];

    const config = {
        showOnTicket: pickKeys(input.showOnTicket, TICKET_FIELD_KEYS),
        showOnScan: pickKeys(input.showOnScan, SCAN_FIELD_KEYS),
        fields: resolveExtras(input.fields),
        notes: String(input.notes ?? "").trim().slice(0, 400)
    };

    const accent = String(input.accent ?? "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(accent)) config.accent = accent;

    return config;
};


/**
 * Marks the images a saved event points at as permanent.
 *
 * Uploads arrive with an expiry so an abandoned form does not leak megabytes
 * (see models/EventImage.js). Saving an event that references one is the moment
 * it becomes real, so this is called after every successful create and update.
 *
 * Never throws: the event is already written by the time this runs, and failing
 * the response would tell an organiser their event was not created when it was.
 * The cost of a miss is one image expiring in 24 hours, which is recoverable by
 * re-uploading, unlike a phantom failure.
 */
const retainEventImages = async (event) => {
    const keys = collectEventImages(event).map(imageKey).filter(Boolean);
    if (!keys.length) return;

    await EventImage.updateMany(
        { key: { $in: keys } },
        { $set: { expiresAt: null } }
    ).catch(() => {});
};

/** Deletes the images an edit or a delete left unreferenced, in either storage. */
const removeUnusedEventImages = async (before, after) => {
    const retained = new Set(collectEventImages(after));
    const dropped = collectEventImages(before).filter((image) => !retained.has(image));
    if (!dropped.length) return;

    const keys = dropped.map(imageKey).filter(Boolean);
    const files = dropped.filter(isLegacyUpload);

    await Promise.all([
        keys.length
            ? EventImage.deleteMany({ key: { $in: keys } }).catch(() => {})
            : Promise.resolve(),
        ...files.map((image) =>
            fs.promises.unlink(path.join(__dirname, "..", "Public", image.replace(/^\//, ""))).catch(() => {})
        )
    ]);
};

/**
 * POST /api/events/uploads
 *
 * Takes base64 data URLs in the JSON body - there is no multipart handler - and
 * writes the bytes into MongoDB, returning the app-relative paths to store on the
 * event. Previously these became files under Public/uploads, which meant every
 * redeploy of a host with an ephemeral filesystem silently deleted every banner
 * an organiser had uploaded.
 *
 * Validation runs over the whole batch before a single document is written, so a
 * request with one oversized image does not half-succeed.
 */
exports.uploadImages = async (req, res) => {
    const files = Array.isArray(req.body?.files) ? req.body.files : [];

    if (!files.length) {
        return res.status(400).json({ success: false, message: "Choose at least one image to upload" });
    }

    if (files.length > 8) {
        return res.status(400).json({ success: false, message: "You can upload up to 8 images at a time" });
    }

    const preparedFiles = [];
    let totalBytes = 0;
    for (const file of files) {
            const contentType = String(file?.type || "").toLowerCase();
            const match = String(file?.data || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);

            if (!allowedImageTypes.has(contentType) || !match) {
                return res.status(400).json({ success: false, message: "Only JPG, PNG, WEBP, and GIF images are supported" });
            }

            const imageBuffer = Buffer.from(match[2], "base64");
            if (!imageBuffer.length || imageBuffer.length > maxImageBytes) {
                return res.status(400).json({ success: false, message: "Each image must be smaller than 4 MB" });
            }

            totalBytes += imageBuffer.length;
            if (totalBytes > maxUploadBytes) {
                return res.status(400).json({ success: false, message: "Keep the total upload size below 8 MB" });
            }

            preparedFiles.push({ contentType, imageBuffer });
    }

    const savedKeys = [];

    try {
        const expiresAt = new Date(Date.now() + EventImage.UNCLAIMED_MS);

        for (const file of preparedFiles) {
            const image = await EventImage.create({
                key: crypto.randomBytes(16).toString("hex"),
                data: file.imageBuffer,
                contentType: file.contentType,
                bytes: file.imageBuffer.length,
                hash: crypto.createHash("sha256").update(file.imageBuffer).digest("hex"),
                owner: req.user.id,
                expiresAt
            });
            savedKeys.push(image.key);
        }

        return res.status(201).json({ success: true, files: savedKeys.map(imagePath) });
    } catch (err) {
        // A partial batch would leave the client holding fewer paths than files it
        // sent, which it treats as an error anyway - so clear up rather than keep
        // orphans alive for the full 24 hours.
        if (savedKeys.length) {
            await EventImage.deleteMany({ key: { $in: savedKeys } }).catch(() => {});
        }
        return res.status(500).json({ success: false, message: "Images could not be uploaded" });
    }
};

exports.createEvent = async (req, res) => {

    try {

        const {
            title,
            description,
            about,
            venue,
            location,
            category,
            date,
            time,
            price,
            agelim,
            seats,
            banner,
            maploc,
            gallery,
            lineup,
            stats
        } = req.body;

        const imageError = validateEventImages({ banner: banner || "", gallery: gallery || [], lineup: lineup || [] });
        if (imageError) return res.status(400).json({ success: false, message: imageError });

        const ticketConfig = sanitizeTicketConfig(req.body.ticketConfig);
        const registrationFields = sanitizeRegistrationFields(req.body.registrationFields);

        const event = await Event.create({

            title,
            description,
            about,
            venue,
            location,
            category: String(category || "other").trim().toLowerCase(),
            date,
            time,
            price,
            agelim,
            seats,
            banner,
            maploc,
            gallery,
            lineup,
            stats,
            ...(ticketConfig ? { ticketConfig } : {}),
            registrationFields,

            // New organizer listings are discoverable immediately; admins can still
            // change the status from the event queue when moderation is needed.
            status: "approved",

            organizer: req.user.id

        });

        // The images are referenced by a saved event now, so they stop being
        // scratch uploads with an expiry on them.
        await retainEventImages(event);

        res.status(201).json({
            success: true,
            event
        });

    }
    catch (err) {

        res.status(err.name === "ValidationError" ? 400 : 500).json({
            success: false,
            message: err.message
        });

    }

};

exports.getMyEvents = async (req, res) => {

    try {

        const events = await Event.find({
            organizer: req.user.id
        });

        res.status(200).json({
            success: true,
            count: events.length,
            events
        });

    }
    catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

exports.getDashboardStats = async (req, res) => {

    try {

        const events =
            await Event.find({
                organizer: req.user.id
            });

        const eventIds =
            events.map(
                e => e._id
            );

        const bookings =
            await Booking.find({
                event: { $in: eventIds },
                status: "confirmed"
            });

        const revenue =
            bookings.reduce(
                (sum, b) =>
                    sum + b.totalPrice,
                0
            );

        const ticketsSold =
            bookings.reduce(
                (sum, b) =>
                    sum + b.tickets,
                0
            );

        res.status(200).json({

            success: true,

            totalEvents:
                events.length,

            totalBookings:
                bookings.length,

            ticketsSold,

            revenue

        });

    }
    catch (err) {

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

};

exports.updateEvent = async (req, res) => {

    try {

        const event =
            await Event.findById(
                req.params.id
            );

        if (!event) {

            return res.status(404).json({
                success: false,
                message: "Event not found"
            });

        }

        if (

            req.user.role !== "admin"

            &&

            event.organizer.toString()
            !==
            req.user.id

        ) {

            return res.status(403).json({
                success: false,
                message: "Access denied"
            });

        }

        const editableFields = [
            "title", "description", "about", "venue", "location", "category", "date",
            "time", "price", "agelim", "seats", "banner", "maploc", "gallery", "lineup"
        ];
        const changes = Object.fromEntries(
            editableFields
                .filter(field => Object.prototype.hasOwnProperty.call(req.body, field))
                .map(field => [field, req.body[field]])
        );
        if (Object.prototype.hasOwnProperty.call(changes, "category")) {
            changes.category = String(changes.category || "other").trim().toLowerCase();
        }

        // Replaced wholesale rather than merged: the editor always submits the
        // complete config, so a merge would make removing a field impossible.
        if (Object.prototype.hasOwnProperty.call(req.body, "ticketConfig")) {
            const ticketConfig = sanitizeTicketConfig(req.body.ticketConfig);
            if (ticketConfig) changes.ticketConfig = ticketConfig;
        }

        // Same wholesale rule. An empty array is a legitimate submission - it
        // means the organiser deleted every extra question - so this is keyed on
        // the property being present, not on it being non-empty. Answers already
        // given keep their own copy of the label, so removing a question here
        // never blanks a row on a pass that has already been issued.
        if (Object.prototype.hasOwnProperty.call(req.body, "registrationFields")) {
            changes.registrationFields = sanitizeRegistrationFields(req.body.registrationFields);
        }


        const imageError = validateEventImages({
            banner: Object.prototype.hasOwnProperty.call(changes, "banner") ? changes.banner : "",
            gallery: Object.prototype.hasOwnProperty.call(changes, "gallery") ? changes.gallery : [],
            lineup: Object.prototype.hasOwnProperty.call(changes, "lineup") ? changes.lineup : []
        });
        if (imageError) return res.status(400).json({ success: false, message: imageError });

        if (req.user.role === "admin" && ["pending", "approved", "rejected"].includes(req.body.status)) {
            changes.status = req.body.status;
        }

        const nextSeats = Number(changes.seats ?? event.seats);
        if (!Number.isFinite(nextSeats) || nextSeats < Number(event.ticketsSold || 0)) {
            return res.status(400).json({
                success: false,
                message: "Seats cannot be lower than tickets already sold"
            });
        }

        const updatedEvent = await Event.findByIdAndUpdate(
            req.params.id,
            changes,
            { new: true, runValidators: true }
        );

        await retainEventImages(updatedEvent);
        await removeUnusedEventImages(event, updatedEvent);

        res.status(200).json({

            success: true,
            event: updatedEvent

        });

    }
    catch (err) {

        res.status(err.name === "ValidationError" || err.name === "CastError" ? 400 : 500).json({

            success: false,
            message: err.message

        });

    }

};

exports.deleteEvent = async(req,res)=>{

    try{

        const event =
            await Event.findById(
                req.params.id
            );

        if(!event){

            return res.status(404).json({

                success:false,
                message:"Event not found"

            });

        }

        if(

            req.user.role !== "admin"

            &&

            event.organizer.toString()
            !==
            req.user.id

        ){

            return res.status(403).json({

                success:false,
                message:"Access denied"

            });

        }

        await Event.findByIdAndDelete(
            req.params.id
        );

        await removeUnusedEventImages(event, null);

        res.status(200).json({

            success:true,
            message:"Event deleted"

        });

    }
    catch(err){

        res.status(500).json({

            success:false,
            message:err.message

        });

    }

};
exports.getEventBookings = async (req, res) => {

    try {

        const eventId = req.params.id;

        // ✅ Populate organizer or any refs if needed
        const event = await Event.findById(eventId)
            .populate("organizer", "name email");

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        // ownership check
        if (
            req.user.role !== "admin" &&
            event.organizer._id.toString() !== req.user.id
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // ✅ Populate user details in bookings
        const bookings = await Booking.find({
            event: eventId
        }).populate("user", "name email")
        .populate("event", "title location date price")

        res.status(200).json({
            success: true,
            event: {
                title: event.title,
                location: event.location,
                date: event.date,
                price: event.price,
                organizer: event.organizer
            },
            bookings
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};
