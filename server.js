require("dotenv").config()
require("./config/passport");
const express = require("express");
const db = require("./config/db");
const user = require("./models/User");
const event = require("./routes/events");
const auth = require("./routes/auth");
const bookingRoutes = require("./routes/Bookingroute");
const paymentRoutes = require("./routes/payments");
const authMiddleware = require("./middleware/authMiddleware");
const PORT = process.env.PORT || 8080;
const path = require("path");
const app = express();
const passport = require("passport");
const contactRoute = require("./routes/contact");
const adminRoutes = require("./routes/admin");


db();

app.use(passport.initialize());
app.use(express.json());
app.use("/api/auth", auth);
app.use("/api/events", event);
app.use("/api/payments", paymentRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/contact", contactRoute);
app.use("/api/admin", adminRoutes);
app.use(express.static("public"));


app.get("/profile", authMiddleware.authM, (req, res) => {
    res.json({
        message: "Access granted",
        user: req.user
    });
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});

