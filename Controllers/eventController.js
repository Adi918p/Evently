const Event = require("../models/Events");
const Booking = require("../models/Booking");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const eventUploadDir = path.join(__dirname, "..", "Public", "uploads");
const allowedImageTypes = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"]
]);
const maxImageBytes = 4 * 1024 * 1024;
const maxUploadBytes = 8 * 1024 * 1024;
const validStoredImagePath = (value) => !value || /^\/(?:uploads\/event-[a-z0-9-]+\.(?:jpg|jpeg|png|webp|gif)|Media\/[^?#\s]+)$/i.test(String(value));

const validateEventImages = ({ banner = "", gallery = [], lineup = [] }) => {
    if (typeof banner !== "string" || !validStoredImagePath(banner)) return "The banner must be uploaded through Evently";
    if (!Array.isArray(gallery) || gallery.some((image) => typeof image !== "string" || !validStoredImagePath(image))) return "Gallery images must be uploaded through Evently";
    if (!Array.isArray(lineup) || lineup.some((artist) => !artist || typeof artist.name !== "string" || (artist.image && !validStoredImagePath(artist.image)))) return "Lineup images must be uploaded through Evently";
    return "";
};

const collectEventImages = (event) => [
    event?.banner,
    ...(Array.isArray(event?.gallery) ? event.gallery : []),
    ...(Array.isArray(event?.lineup) ? event.lineup.map((artist) => artist?.image) : [])
].filter((image) => /^\/uploads\/event-[a-z0-9-]+\.(?:jpg|jpeg|png|webp|gif)$/i.test(String(image || "")));

const removeUnusedEventImages = async (before, after) => {
    const retained = new Set(collectEventImages(after));
    await Promise.all(collectEventImages(before).filter((image) => !retained.has(image)).map((image) =>
        fs.promises.unlink(path.join(__dirname, "..", "Public", image.replace(/^\//, ""))).catch(() => {})
    ));
};

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
            const mimeType = String(file?.type || "").toLowerCase();
            const extension = allowedImageTypes.get(mimeType);
            const match = String(file?.data || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);

            if (!extension || !match) {
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

            preparedFiles.push({ extension, imageBuffer });
    }

    const savedFiles = [];

    try {
        await fs.promises.mkdir(eventUploadDir, { recursive: true });

        for (const file of preparedFiles) {

            const fileName = `event-${crypto.randomUUID()}${file.extension}`;
            const filePath = path.join(eventUploadDir, fileName);
            await fs.promises.writeFile(filePath, file.imageBuffer, { flag: "wx" });
            savedFiles.push(`/uploads/${fileName}`);
        }

        return res.status(201).json({ success: true, files: savedFiles });
    } catch (err) {
        await Promise.all(savedFiles.map((fileUrl) =>
            fs.promises.unlink(path.join(__dirname, "..", "Public", fileUrl.replace(/^\//, ""))).catch(() => {})
        ));
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

            // New organizer listings are discoverable immediately; admins can still
            // change the status from the event queue when moderation is needed.
            status: "approved",

            organizer: req.user.id

        });

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
