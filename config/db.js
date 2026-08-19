const mongoose = require("mongoose");

// Fail fast when MongoDB is offline. Mongoose's default buffering turns a
// connection outage into a confusing ten-second `findOne()` timeout.
mongoose.set("bufferCommands", false);

let databaseReady = false;
let connecting = false;

mongoose.connection.on("connected", () => {
    databaseReady = true;
    console.log("MongoDB connected");
});

mongoose.connection.on("disconnected", () => {
    databaseReady = false;
    console.error("MongoDB disconnected");
    if (!connecting) setTimeout(connectDB, 10000);
});

mongoose.connection.on("error", (error) => {
    databaseReady = false;
    console.error("MongoDB error:", error.message);
});

async function connectDB() {
    if (connecting || isDatabaseReady()) return isDatabaseReady();
    if (!process.env.MONGO_URI) {
        console.error("MongoDB unavailable: MONGO_URI is not configured");
        return false;
    }

    connecting = true;
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        databaseReady = true;
        connecting = false;
        return true;
    } catch (error) {
        databaseReady = false;
        connecting = false;
        console.error("MongoDB unavailable:", error.message);
        setTimeout(connectDB, 10000);
        return false;
    }
}

function isDatabaseReady() {
    return databaseReady && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDatabaseReady };
