const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const eventController = require("../Controllers/eventController");
const Event = require("../models/Events");

const router = express.Router();
const eventCategories = new Set([
    "networking", "club", "music", "workshop", "sports", "arts",
    "food", "comedy", "festival", "tech", "gaming", "other"
]);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseDate = (value, endOfDay = false) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
    const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    return Number.isNaN(date.getTime()) ? null : date;
};

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
        const { q = "", city = "", location = "", category = "", type = "", date = "", dateFrom = "", dateTo = "" } = req.query;
        // Older organizer records may still be pending from the previous workflow.
        // Keep them discoverable so existing events do not disappear after creation.
        const filter = { status: { $in: ["approved", "pending"] } };
        const search = String(q).trim();
        const citySearch = String(city || location).trim();
        const selectedCategory = String(category || type).trim().toLowerCase();
        const startDate = parseDate(dateFrom || date);
        const endDate = parseDate(dateTo || date, true);

        if (search) {
            const pattern = new RegExp(escapeRegex(search), "i");
            filter.$or = [
                { title: pattern },
                { description: pattern },
                { about: pattern },
                { venue: pattern },
                { location: pattern },
                { category: pattern }
            ];
        }
        if (citySearch) filter.location = new RegExp(escapeRegex(citySearch), "i");
        if (eventCategories.has(selectedCategory)) {
            if (selectedCategory === "other") {
                filter.$and = [{ $or: [{ category: "other" }, { category: { $exists: false } }, { category: null }] }];
            } else {
                filter.category = selectedCategory;
            }
        }
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = startDate;
            if (endDate) filter.date.$lte = endDate;
        }

        const events = await Event.find(filter).sort({ date: 1, createdAt: -1 });

        res.json(events);
    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
});

router.post(
    "/uploads",
    authMiddleware.authM,
    roleMiddleware("organizer", "admin"),
    eventController.uploadImages
);

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
        if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid event id"
            });
        }
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({
                message: "Event not found"
            });
        }
        const seatsLeft = Math.max(
            Number(event.seats || 0) - Number(event.ticketsSold || 0),
            0
        );

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
