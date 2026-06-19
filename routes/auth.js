const express = require("express");
const User = require("../models/User");
const hash = require("bcrypt");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const crypto = require("crypto");
const dns = require("dns").promises;
const authMiddleware = require("../middleware/authMiddleware");
const authController = require("../Controllers/authController");
const sendEmail = require("../utils/sendEmail");

const router = express.Router();
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
    Math.floor(100000 + Math.random() * 900000).toString();

const hashOtp = (otp) =>
    crypto.createHash("sha256").update(String(otp)).digest("hex");

const validatePasswordStrength = (password) => {
    const value = String(password || "");
    const failedRules = [];

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
        <p>Hello ${userName},</p>
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

router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
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
            name,
            email: normalizedEmail,
            password: hashedPassword,
            isEmailVerified: false,
            emailVerificationOtpHash: otpHash,
            emailVerificationOtpExpiresAt: otpExpiresAt
        });

        await user.save();
        await sendVerificationOtpEmail(normalizedEmail, otpCode, name);

        res.json({
            success: true,
            requiresVerification: true,
            message: "OTP sent. Verify your email to complete signup."
        });
        return;
    } catch (err) {
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

        const existingUser = await User.findOne({ email: normalizedEmail });
        const deliverable = await isValidEmailDomain(normalizedEmail);

        return res.json({
            success: true,
            registered: Boolean(existingUser),
            deliverable,
            message: existingUser
                ? "Email is already registered"
                : (deliverable ? "Email looks deliverable" : "Email domain cannot receive mail")
        });
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

        if (!normalizedEmail || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required"
            });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (user.isEmailVerified !== false) {
            return res.json({
                success: true,
                message: "Email already verified"
            });
        }

        if (
            !user.emailVerificationOtpHash ||
            !user.emailVerificationOtpExpiresAt ||
            user.emailVerificationOtpExpiresAt < new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "OTP expired. Request a new OTP."
            });
        }

        if (hashOtp(otp) !== user.emailVerificationOtpHash) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });
        }

        user.isEmailVerified = true;
        user.emailVerificationOtpHash = null;
        user.emailVerificationOtpExpiresAt = null;
        user.emailVerifiedAt = new Date();
        await user.save();

        return res.json({
            success: true,
            message: "Email verified successfully"
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.post("/resend-email-otp", async (req, res) => {
    try {
        const normalizedEmail = normalizeEmail(req.body?.email);

        if (!normalizedEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (user.isEmailVerified !== false) {
            return res.status(400).json({
                success: false,
                message: "Email is already verified"
            });
        }

        const otpCode = createOtpCode();
        user.emailVerificationOtpHash = hashOtp(otpCode);
        user.emailVerificationOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        await user.save();

        await sendVerificationOtpEmail(normalizedEmail, otpCode, user.name);

        return res.json({
            success: true,
            message: "OTP resent successfully"
        });
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
                message: "User not Found"
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
        const match = await hash.compare(password, user.password)
        if (!match) {
            return res.status(401).json({
                success: false,
                message: "Invalid Password"
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




// GOOGLE
router.get("/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get("/google/callback",
    passport.authenticate("google", { session: false }),
    (req, res) => {

        const token = jwt.sign(
            {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.redirect(
            `${process.env.FRONTEND_URL}/login.html?token=${token}`
        );
    }
);




module.exports = router;    
