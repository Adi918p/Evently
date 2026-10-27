const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) passport.use(
    new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: new URL("/api/auth/google/callback", process.env.FRONTEND_URL || "http://localhost:5173").href
    },
    async (accessToken, refreshToken, profile, done) => {

        try {

            const email = String(profile.emails?.[0]?.value || '').toLowerCase();
            if (!email || !(profile._json?.email_verified === true || profile._json?.verified_email === true || profile.emails?.[0]?.verified === true)) return done(null, false);
            let user = await User.findOne({ email });
            if (user && user.status !== 'active') return done(null, false);

            if (!user) {
                user = await User.create({
                name: profile.displayName,
                email,
                avatar: profile.photos?.[0]?.value,
                password: "google_oauth",
                isEmailVerified: true,
                emailVerifiedAt: new Date()
});
            }

            if (!user.isEmailVerified) { user.isEmailVerified = true; user.emailVerifiedAt = new Date(); user.emailVerificationOtpHash = null; user.emailVerificationOtpExpiresAt = null; await user.save(); }
            return done(null, user);

        } catch (err) {
            return done(err, null);
        }
    })
);