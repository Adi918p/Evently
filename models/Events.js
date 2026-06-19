const mongoose = require("mongoose");


const lineupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
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
        default: ""
    },

    maploc: {
        type: String,
        default: ""
    },

    gallery: {
        type: [String],
        default: []
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
    default: "pending"
}},

    {
        timestamps: true
    });

module.exports = mongoose.model("Event", eventSchema);