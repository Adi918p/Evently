const express = require("express");
const User = require("../models/User");
const hash = require("bcrypt");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const crypto = require("crypto");
const dns = require("dns").promises;
const authMiddleware = require("../middleware/authMiddleware");
const authController = require("../Controllers/authController");
const limits = require('../middleware/limits');
const oauth = require('../utils/oauth');
const { respondError, HttpError } = require('../utils/httpError');
const { escapeHtml } = require('../utils/mailer');
const sendEmail = require("../utils/sendEmail");

const router = express.Router();
router.use((req, res, next) => req.path === '/me' && req.method === 'GET' ? next() : limits.authentication(req, res, next));
const OTP_EXPIRY_MINUTES = 10;
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_STRENGTH_REGEXES = [
    /[a-z]/,
    /[A-Z]/,
    /\d/,
    /[^A-Za-z0-9]/
];

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const createOtpCode = () =>
    crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) =>
    crypto.createHash("sha256").update(String(otp)).digest("hex");

const validatePasswordStrength = (password) => {
    const value = String(password || "");
    const failedRules = [];

    if (Buffer.byteLength(value, "utf8") > 72) failedRules.push("no more than 72 UTF-8 bytes");
    if (value.length < PASSWORD_MIN_LENGTH) {
        failedRules.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
    }

    if (!PASSWORD_STRENGTH_REGEXES[0].test(value)) {
        failedRules.push("a lowercase letter");
    }

    if (!PASSWORD_STRENGTH_REGEXES[1].test(value)) {
        failedRules.push("an uppercase letter");
    }

    if (!PASSWORD_STRENGTH_REGEXES[2].test(value)) {
        failedRules.push("a number");
    }

    if (!PASSWORD_STRENGTH_REGEXES[3].test(value)) {
        failedRules.push("a special character");
    }

    return {
        isValid: failedRules.length === 0,
        message: failedRules.length
            ? `Password must contain ${failedRules.join(", ")}.`
            : ""
    };
};

const isValidEmailDomain = async (email) => {
    const domain = email.split("@")[1];

    if (!domain) {
        return false;
    }

    try {
        const mxRecords = await dns.resolveMx(domain);
        return Array.isArray(mxRecords) && mxRecords.length > 0;
    } catch (err) {
        return false;
    }
};

const sendVerificationOtpEmail = async (email, otpCode, userName) => {
    const html = `
        <h2>Verify your Evently email</h2>
        <p>Hello ${escapeHtml(userName)},</p>
        <p>Your OTP is <strong>${otpCode}</strong>.</p>
        <p>This code will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>
        <p>If you didn't request this, you can ignore this email.</p>
    `;

    await sendEmail(
        email,
        "Evently Email Verification OTP",
        html
    );
};

router.post("/register", limits.email, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const normalizedName = String(name || "").trim();
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        if (normalizedName.length < 2 || normalizedName.length > 80) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 80 characters"
            });
        }

        if (!EMAIL_FORMAT_REGEX.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address"
            });
        }

        const passwordCheck = validatePasswordStrength(password);
        if (!passwordCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: passwordCheck.message
            });
        }

        const validDomain = await isValidEmailDomain(normalizedEmail);
        if (!validDomain) {
            return res.status(400).json({
                success: false,
                message: "Email domain is not valid or cannot receive mail"
            });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered. Please log in instead."
            });
        }

        const otpCode = createOtpCode();
        const otpHash = hashOtp(otpCode);
        const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        const hashedPassword = await hash.hash(password, 10);

        const user = new User({
            name: normalizedName,
            email: normalizedEmail,
            password: hashedPassword,
            isEmailVerified: false,
            emailVerificationOtpHash: otpHash,
            emailVerificationOtpExpiresAt: otpExpiresAt,
            emailVerificationSentAt: new Date(), emailVerificationAttempts: 0
        });

        await user.save();
        try {
            await sendVerificationOtpEmail(normalizedEmail, otpCode, normalizedName);
        } catch (emailError) {
            await User.findByIdAndDelete(user._id);
            throw new Error("We could not send the verification email. Please try again.");
        }

        res.json({
            success: true,
            requiresVerification: true,
            message: "OTP sent. Verify your email to complete signup."
        });
        return;
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered. Please log in instead."
            });
        }
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.post("/check-email", async (req, res) => {
    try {
        const normalizedEmail = normalizeEmail(req.body?.email);

        if (!normalizedEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        if (!EMAIL_FORMAT_REGEX.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address"
            });
        }

        const deliverable = await isValidEmailDomain(normalizedEmail);
        return res.json({ success: true, deliverable, message: deliverable ? 'Email looks deliverable' : 'Email domain cannot receive mail' });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});
router.post("/verify-email-otp", async (req, res) => {
    try {
        const { email, otp } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail || !/^\d{6}$/.test(String(otp))) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required"
            });
        }

        const attempt = await User.findOneAndUpdate({ email: normalizedEmail, isEmailVerified: false, emailVerificationOtpExpiresAt: { $gt: new Date() }, $or: [{ emailVerificationAttempts: { $lt: 5 } }, { emailVerificationAttempts: { $exists: false } }] }, { $inc: { emailVerificationAttempts: 1 } }, { new: true });
        if (!attempt || hashOtp(otp) !== attempt.emailVerificationOtpHash) return res.status(400).json({ success: false, message: 'Invalid or expired OTP. After five attempts, request a new code.' });
        const updated = await User.updateOne({ _id: attempt._id, emailVerificationOtpHash: attempt.emailVerificationOtpHash, isEmailVerified: false }, { $set: { isEmailVerified: true, emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null, emailVerifiedAt: new Date() } });
        if (updated.modifiedCount !== 1) return res.status(400).json({ success: false, message: 'This code has already been used or replaced.' });
        return res.json({ success: true, message: 'Email verified successfully' });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.post("/resend-email-otp", limits.email, async (req, res) => {
    try {
        const normalizedEmail = normalizeEmail(req.body?.email);

        if (!normalizedEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const otpCode = createOtpCode();
        const user = await User.findOneAndUpdate({ email: normalizedEmail, isEmailVerified: false, $or: [{ emailVerificationSentAt: { $lte: new Date(Date.now() - 60_000) } }, { emailVerificationSentAt: null }] }, { $set: { emailVerificationOtpHash: hashOtp(otpCode), emailVerificationOtpExpiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000), emailVerificationAttempts: 0, emailVerificationSentAt: new Date() } }, { new: true });
        if (user) await sendVerificationOtpEmail(normalizedEmail, otpCode, user.name);
        return res.json({ success: true, message: 'If the account needs verification and its cooldown has elapsed, a new code has been sent.' });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        if (!EMAIL_FORMAT_REGEX.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address"
            });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Email or password is incorrect"
            });
        }

        if (user.isEmailVerified === false) {
            return res.status(403).json({
                success: false,
                message: "Verify your email first"
            });
        }

        if (user.status === "suspended") {
            return res.status(403).json({
                success: false,
                message: "Account suspended"
            });
        }

        if (user.status === "banned") {
            return res.status(403).json({
                success: false,
                message: "Account banned"
            });
        }
        const match = typeof password === "string" && Buffer.byteLength(password, "utf8") <= 72 && await hash.compare(password, user.password)
        if (!match) {
            return res.status(401).json({
                success: false,
                message: "Email or password is incorrect"
            });
        }
        const token = jwt.sign(
            {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        return res.json({
            success: true,
            message: "Login successful",
            token
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
})

router.get(
    "/me",
    authMiddleware.authM,
    authController.getMe
);




// OAuth state is a one-time database record bound to this browser's HttpOnly cookie.
router.get('/google', async (req, res, next) => {
    try {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new HttpError(503, 'Google sign-in is not configured.');
        const state = await oauth.issue(res, 'state');
        passport.authenticate('google', { scope: ['profile', 'email'], state, session: false })(req, res, next);
    } catch (err) { respondError(res, err); }
});
router.get('/google/callback', async (req, res, next) => {
    try { await oauth.consume(req, res, 'state', String(req.query.state || '')); }
    catch (err) { return respondError(res, err); }
    passport.authenticate('google', { session: false }, async (err, user) => {
        if (err || !user || user.status !== 'active') return res.redirect(new URL('/login?oauth=failed', process.env.FRONTEND_URL).href);
        try {
            await oauth.issue(res, 'handoff', user._id);
            res.redirect(new URL('/login?oauth=complete', process.env.FRONTEND_URL).href);
        } catch (error) { respondError(res, error); }
    })(req, res, next);
});
router.post('/google/exchange', async (req, res) => {
    try {
        const handoff = await oauth.consume(req, res, 'handoff');
        const user = await User.findById(handoff.user);
        if (!user || user.status !== 'active' || !user.isEmailVerified) throw new HttpError(403, 'This account cannot sign in.');
        const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.set('Cache-Control', 'no-store').json({ success: true, token });
    } catch (err) { respondError(res, err); }
});
module.exports = router;
