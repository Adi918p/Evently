const mongoose = require("mongoose");

const localImagePath = (value) => !value || /^\/(?:uploads\/event-[a-z0-9-]+\.(?:jpg|jpeg|png|webp|gif)|Media\/[^?#\s]+)$/i.test(String(value));
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
