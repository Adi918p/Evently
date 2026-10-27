const express = require("express");
const router = express.Router();

const Contact = require("../models/Contact");

router.post("/", async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        const newMessage = await Contact.create({
            name,
            email,
            subject,
            message
        });

        res.json({
            success: true,
            id: newMessage._id
        });

    } catch (err) {
        console.error(err);

        res.status(err.name === "ValidationError" ? 400 : 500).json({
            success: false,
            message: err.name === "ValidationError" ? "Enter a valid name, email, subject and message within the length limits." : "Server Error"
        });
    }
});

module.exports = router;