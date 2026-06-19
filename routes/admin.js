const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {roleMiddleware,requireAdmin} =
require("../middleware/roleMiddleware");

const adminController =
require("../Controllers/adminController");


router.use(authMiddleware.authM);
router.use(authMiddleware.requireAuth);
router.use(requireAdmin); 

router.get(
    "/dashboard",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.getDashboardStats
);

router.get(
    "/events",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.getAllEvents
);

router.delete(
    "/events/:id",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.deleteEvent
);

router.get(
    "/messages",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.getAllMessages
);

router.delete(
    "/messages/:id",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.deleteMessage
);

router.get(
    "/users",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.getAllUsers
);

router.patch(
    "/users/:id/role",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.updateUserRole
);

router.patch(
    "/users/:id/status",
    authMiddleware.authM,
    roleMiddleware("admin"),
    adminController.updateUserStatus
);

router.get(
    "/stats",
    authMiddleware.authM,
    authMiddleware.requireAuth,
    requireAdmin,
    adminController.getStats
);

router.patch(
    "/events/:id/approve",
    adminController.approveEvent
);

router.patch(
    "/events/:id/reject",
    adminController.rejectEvent
);

router.get(
    "/events/pending",
    adminController.getPendingEvents
);
module.exports = router;