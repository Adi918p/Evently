const express = require("express");
const imageController = require("../Controllers/imageController");

const router = express.Router();

// No auth middleware, by design - see Controllers/imageController.js.
router.get("/:key", imageController.serveImage);

module.exports = router;
