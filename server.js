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
const app = express();
const passport = require("passport");
const contactRoute = require("./routes/contact");
const adminRoutes = require("./routes/admin");


connectDB();

app.use(passport.initialize());
app.use(express.json({ limit: "12mb" }));

// Keep API failures immediate and actionable while the database is offline.
// Static pages still load so the app can display the recovery message.
app.use("/api", (req, res, next) => {
    if (!isDatabaseReady()) {
        return res.status(503).json({
            success: false,
            message: "Evently is temporarily unavailable. Please start MongoDB and try again."
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
app.use(express.static("Public"));

// app.get("/", (req, res) => {
//     res.sendFile(path.join(__dirname, "Public", "index.html"));
// });

app.get("/profile", authMiddleware.authM, (req, res) => {
    res.json({
        message: "Access granted",
        user: req.user
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
});

