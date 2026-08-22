const mongoose = require("mongoose");
const { isStoredImagePath } = require("../utils/imagePaths");

// Accepts a database image (/api/images/<key>), a legacy file (/uploads/...) or
// the bundled artwork (/Media/...). See utils/imagePaths.js for why all three.
const localImagePath = isStoredImagePath;
const imagePathMessage = "Images must be uploaded through Evently; external image URLs are not allowed";

const lineupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        default: "",
        validate: { validator: localImagePath, message: imagePathMessage }
    }
}, { _id: false });

const statsSchema = new mongoose.Schema({
    interested: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 0
    },
    reviews: {
        type: Number,
        default: 0
    }
}, { _id: false });

/**
 * One organiser-authored row, e.g. { label: "Gate", value: "3 (west side)" }.
 * Literal text - never a lookup into a document. See utils/ticketFields.js.
 */
const ticketFieldSchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40
    },
    value: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    }
}, { _id: false });

/**
 * What this event's ticket says, and what the door sees when it is scanned.
 *
 * showOnTicket / showOnScan hold keys from the catalogue in
 * utils/ticketFields.js; anything not in that catalogue is dropped when the
 * ticket is rendered, so an unrecognised or stale key is inert rather than an
 * error. Empty arrays mean "use the shipped defaults", which keeps every
 * existing event working without a migration.
 */
const ticketConfigSchema = new mongoose.Schema({
    showOnTicket: {
        type: [String],
        default: []
    },
    showOnScan: {
        type: [String],
        default: []
    },
    fields: {
        type: [ticketFieldSchema],
        default: []
    },
    notes: {
        type: String,
        default: "",
        trim: true,
        maxlength: 400
    },
    accent: {
        type: String,
        default: "#8B5CF6",
        trim: true,
        validate: {
            validator: (value) => !value || /^#[0-9a-fA-F]{6}$/.test(value),
            message: "Accent must be a 6 digit hex colour, for example #8B5CF6"
        }
    }
}, { _id: false });


/**
 * One extra question the attendee answers while booking, e.g. a networking
 * event asking each firm to pick its industry.
 *
 * `key` is a slug generated from the label the first time the question is saved
 * and then kept: it is what the answers on already-issued passes point back to,
 * so renaming the label must not change it. See utils/registrationFields.js.
 */
const registrationFieldSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        trim: true,
        maxlength: 32
    },
    label: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40
    },
    type: {
        type: String,
        enum: ["text", "select", "multiselect", "number", "checkbox"],
        default: "text"
    },
    options: {
        type: [String],
        default: []
    },
    required: {
        type: Boolean,
        default: false
    },
    showOnTicket: {
        type: Boolean,
        default: true
    },
    showOnScan: {
        type: Boolean,
        default: true
    },
    helper: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120
    }
}, { _id: false });


const eventSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true
    },

    description: {
        type: String,
        required: true
    },

    about: {
        type: String,
        default: ""
    },

    venue: {
        type: String,
        required: true
    },

    location: {
        type: String,
        default: ""
    },

    category: {
        type: String,
        enum: [
            "networking",
            "club",
            "music",
            "workshop",
            "sports",
            "arts",
            "food",
            "comedy",
            "festival",
            "tech",
            "gaming",
            "other"
        ],
        default: "other",
        lowercase: true,
        trim: true
    },

    date: {
        type: Date,
        required: true
    },

    time: {
        type: String,
        default: ""
    },

    price: {
        type: Number,
        required: true
    },

    agelim: {
        type: String,
        default: "All Ages"
    },

    seats: {
        type: Number,
        default: 0
    },

    banner: {
        type: String,
        default: "",
        trim: true,
        validate: { validator: localImagePath, message: imagePathMessage }
    },

    maploc: {
        type: String,
        default: ""
    },

    gallery: {
        type: [String],
        default: [],
        validate: { validator: (images) => Array.isArray(images) && images.every(localImagePath), message: imagePathMessage }
    },

    lineup: {
        type: [lineupSchema],
        default: []
    },

    stats: {
        type: statsSchema,
        default: () => ({})
    },

    ticketConfig: {
        type: ticketConfigSchema,
        default: () => ({})
    },

    // Extra questions asked at booking time. Separate from ticketConfig because
    // these shape the booking form, not just what gets printed afterwards.
    registrationFields: {
        type: [registrationFieldSchema],
        default: []
    },

    ticketsSold: {
        type: Number,
        default: 0
    },

    organizer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }

,
    status: {
    type: String,
    enum: [
        "pending",
        "approved",
        "rejected"
    ],
    default: "approved"
}},

    {
        timestamps: true
    });

module.exports = mongoose.model("Event", eventSchema);
