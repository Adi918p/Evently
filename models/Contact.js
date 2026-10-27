const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true, trim: true, maxlength: 80
    },

    email: {
        type: String,
        required: true, trim: true, maxlength: 254, lowercase: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },

    subject: {
        type: String,
        required: true, trim: true, maxlength: 120
    },

    message: {
        type: String,
        required: true, trim: true, maxlength: 5000
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Contact", contactSchema);