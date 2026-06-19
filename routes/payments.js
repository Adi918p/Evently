const express = require("express");

const router = express.Router();

const authMiddleware =
    require("../middleware/authMiddleware");

const Payment = require("../Controllers/paymentController");

router.post(
    "/create-order",
    authMiddleware.authM,
    Payment.createOrder
);

router.post(
    "/verify",
    authMiddleware.authM,
    Payment.verifyPayment
);

module.exports = router;
