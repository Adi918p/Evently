const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const bookingController = require("../Controllers/bookingController");

router.post('/',auth.authM,bookingController.createBooking);

router.get('/my',auth.authM,bookingController.getMyBookings);

router.post(
    "/verify-ticket",
    auth.authM,
    bookingController.verifyTicket
);

module.exports = router;
