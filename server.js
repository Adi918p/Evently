require("dotenv").config()
require("./config/passport");
const express = require("express");
const { connectDB, isDatabaseReady } = require("./config/db");
const user = require("./models/User");
const event = require("./routes/events");
const auth = require("./routes/auth");
const bookingRoutes = require("./routes/Bookingroute");
const paymentRoutes = require("./routes/payments");
const authMiddleware = require("./middleware/authMiddleware");
const PORT = process.env.PORT || 8000;
const path = require("path");
const fs = require("fs");
const app = express();
const passport = require("passport");
const contactRoute = require("./routes/contact");
const adminRoutes = require("./routes/admin");
const imageRoutes = require("./routes/images");


connectDB();

app.use(passport.initialize());
app.use(express.json({ limit: "12mb" }));

// Keep API failures immediate and actionable while the database is offline.
// Static pages still load so the app can display the recovery message.
//
// The message deliberately does not say "start MongoDB". MONGO_URI points at a
// hosted cluster, so that instruction sent people looking for a local service
// that was never running in the first place - and it is copy a visitor can see,
// not a developer note. config/db.js retries on its own, so "try again shortly"
// is both true and the only useful thing to do.
app.use("/api", (req, res, next) => {
    if (!isDatabaseReady()) {
        return res.status(503).json({
            success: false,
            message: "Evently can't reach its database right now. Please try again in a moment."
        });
    }
    next();
});
app.use("/api/auth", auth);
app.use("/api/events", event);
app.use("/api/payments", paymentRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/contact", contactRoute);
app.use("/api/admin", adminRoutes);

// Uploaded event artwork, served out of the database. Public and unauthenticated
// because these are banners on the discover page - see Controllers/imageController.
app.use("/api/images", imageRoutes);

// Was GET /profile. Renamed because /profile is now a page in the single-page
// app, and a route registered here would answer it with JSON before the app
// ever loaded. Nothing calls this - it is a debug echo of the decoded token.
app.get("/api/profile", authMiddleware.authM, (req, res) => {
    res.json({
        message: "Access granted",
        user: req.user
    });
});


/* ==========================================================================
   Static files
   ==========================================================================
   The front end is a Vite build in client/dist. Public/ is no longer served as
   a whole: it still holds the previous hand-written pages, and mounting it
   would let Public/Login.html answer /login.html before the app could - on
   Windows the filesystem is case-insensitive, so even /login.html would match.

   Two folders inside it are still live data, though. Event documents may store
   image paths like /uploads/event-<uuid>.webp - the shape written by builds
   before uploaded images moved into MongoDB - and /Media/... (the club artwork),
   so those two URLs must keep resolving.

   New uploads do not land here at all. They are documents in the eventimages
   collection, served by /api/images/<key>, because this host hands every deploy
   a clean filesystem and anything written to disk at runtime is gone by the next
   one. The mount below stays for the images already on disk.

   tickets/ is deliberately absent. Generated ticket PDFs live there and are
   only ever delivered by email; serving that folder would make every ticket
   readable by anyone who guessed a filename.
   ========================================================================== */

const PUBLIC_DIR = path.join(__dirname, "Public");
const CLIENT_DIST = path.join(__dirname, "client", "dist");
const CLIENT_INDEX = path.join(CLIENT_DIST, "index.html");
const hasClientBuild = fs.existsSync(CLIENT_INDEX);

// Legacy uploaded media, plus the bundled artwork. A year of caching is safe for
// /uploads because filenames carry a uuid, so a replaced image is a new URL.
// /Media is edited by hand occasionally, so it gets a day and revalidates.
app.use("/uploads", express.static(path.join(PUBLIC_DIR, "uploads"), {
    maxAge: "365d",
    immutable: true,
    fallthrough: true
}));
app.use("/Media", express.static(path.join(PUBLIC_DIR, "Media"), {
    maxAge: "1d",
    fallthrough: true
}));

if (hasClientBuild) {
    // Vite fingerprints everything in assets/, so those can never go stale.
    // index.html must not be cached or a deploy would keep serving the old
    // bundle references.
    app.use(express.static(CLIENT_DIST, {
        index: false,
        setHeaders(res, filePath) {
            if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            } else {
                res.setHeader("Cache-Control", "no-cache");
            }
        }
    }));
}

// Unmatched API routes answer in JSON. Without this they would fall through to
// the app shell below and the client would try to parse HTML as a response.
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: `No API route for ${req.method} ${req.originalUrl}`
    });
});

/* SPA fallback.
   Express 5 moved to path-to-regexp v8, where app.get("*") is a syntax error -
   a wildcard has to be named ("/*splat"). A bare app.use avoids the question
   and also lets non-GET methods fall through to the error handler instead of
   being answered with a page. */
app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!hasClientBuild) {
        return res
            .status(503)
            .type("text/plain")
            .send(
                "The front end has not been built yet.\n\n" +
                "Run:  npm run build\n" +
                "or during development:  npm run dev  (Vite on 5173, proxying /api here)\n"
            );
    }
    res.sendFile(CLIENT_INDEX, (err) => {
        if (err) next(err);
    });
});

app.use((err, req, res, next) => {
    if (err?.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "Request is too large" });
    }
    if (err instanceof SyntaxError && req.is("application/json")) {
        return res.status(400).json({ success: false, message: "Invalid JSON payload" });
    }
    return next(err);
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
    if (!hasClientBuild) {
        console.warn(
            "No client build found at client/dist - run `npm run build` " +
            "(or `npm run dev` for the Vite dev server)."
        );
    }
});
