const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        unique: true,
        required: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        default: ""
    },
    role: {
        type: String,
        enum: ["user", "organizer", "admin"],
        default: "user"
    },
    status: {
        type: String,
        enum: ["active", "suspended","banned"],
        default: "active"
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationOtpHash: {
        type: String,
        default: null
    },
    emailVerificationOtpExpiresAt: {
        type: Date,
        default: null
    },
    emailVerifiedAt: {
        type: Date,
        default: null
    }},{
        timestamps:true
    });

module.exports = mongoose.model("User", userSchema);
