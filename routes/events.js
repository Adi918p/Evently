const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const eventController = require("../Controllers/eventController");
const Event = require("../models/Events");

const router = express.Router();

router.get(
    "/my",
    authMiddleware.authM,
    roleMiddleware(
        "organizer",
        "admin"
    ),
    eventController.getMyEvents
);

router.get("/", async (req, res) => {
    try {
        const events = await Event.find({
            status: "approved"
        });

        res.json(events);
    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
});

router.post(
    "/",
    authMiddleware.authM,
    roleMiddleware("organizer", "admin"),
    eventController.createEvent
);

router.get(
    "/dashboard/stats",
    authMiddleware.authM,
    roleMiddleware(
        "organizer",
        "admin"
    ),
    eventController.getDashboardStats
);

router.put(
    "/:id",
    authMiddleware.authM,
    roleMiddleware(
        "organizer",
        "admin"
    ),
    eventController.updateEvent
);

router.delete(
    "/:id",
    authMiddleware.authM,
    roleMiddleware(
        "organizer",
        "admin"
    ),
    eventController.deleteEvent
);

router.get(
    "/:id/bookings",
    authMiddleware.authM,
    roleMiddleware("organizer", "admin"),
    eventController.getEventBookings
);

router.get("/:id", async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({
                message: "Event not found"
            });
        }
        const seatsLeft =
            Math.max(event.seats - event.ticketsSold, 0);

        res.json({
            success: true,
            event,
            seatsLeft
        });
    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }

});



module.exports = router;
