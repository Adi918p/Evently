const mongoose = require("mongoose");

async function connectDB() {
    try {
        await mongoose.connect(
            process.env.MONGO_URI || "mongodb://127.0.0.1:27017/evently"
        );

        console.log("MongoDB Connected");
    } catch (err) {
        console.log(err);
    }
}

module.exports = connectDB;
