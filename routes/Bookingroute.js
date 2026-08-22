const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const bookingController = require("../Controllers/bookingController");

router.post('/',auth.authM,bookingController.createBooking);

router.get('/my',auth.authM,bookingController.getMyBookings);

// Passes are served from here and nowhere else: tickets/ is intentionally absent
// from the static mounts in server.js so every download passes the ownership
// check in downloadTicket.
router.get(
    "/:id/ticket",
    auth.authM,
    bookingController.downloadTicket
);

router.post(
    "/verify-ticket",
    auth.authM,
    bookingController.verifyTicket
);

module.exports = router;
