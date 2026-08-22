const mongoose = require("mongoose");

// Fail fast when MongoDB is offline. Mongoose's default buffering turns a
// connection outage into a confusing ten-second `findOne()` timeout.
mongoose.set("bufferCommands", false);

let connecting = false;
let retryTimer = null;

/**
 * Readiness is read straight off `mongoose.connection.readyState` rather than a
 * boolean kept alongside it.
 *
 * The boolean is what wedged this before. `error` and `disconnected` are separate
 * events, and the driver emits `error` for things it then recovers from on its
 * own - a replica-set election, a DNS hiccup, a laptop waking up. The old code
 * cleared its flag on `error` but only scheduled a reconnect on `disconnected`,
 * so an error with no disconnect after it left the flag false forever: the
 * database was reachable, the driver was connected, and every /api request
 * answered 503 until someone restarted the process.
 *
 * readyState cannot drift like that, because the driver owns it.
 */
function isDatabaseReady() {
    return mongoose.connection.readyState === 1;
}

/**
 * Queues one reconnect attempt. Idempotent - several events can fire for a single
 * outage, and each must not start its own timer.
 */
function scheduleRetry(delayMs = 5000) {
    if (retryTimer || connecting || isDatabaseReady()) return;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        connectDB();
    }, delayMs);
    // The HTTP server keeps the process alive on its own, so this timer never
    // needs to. Without unref a one-shot script that requires this module hangs
    // at the end of its work waiting on a reconnect nobody asked for.
    retryTimer.unref?.();
}

mongoose.connection.on("connected", () => {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    console.log("MongoDB connected");
});

mongoose.connection.on("disconnected", () => {
    console.error("MongoDB disconnected");
    scheduleRetry();
});

mongoose.connection.on("error", (error) => {
    console.error("MongoDB error:", error.message);
    scheduleRetry();
});

async function connectDB() {
    if (connecting) return isDatabaseReady();
    if (isDatabaseReady()) return true;

    if (!process.env.MONGO_URI) {
        // No retry: a missing environment variable will not fix itself, and
        // retrying every five seconds forever just fills the log.
        console.error("MongoDB unavailable: MONGO_URI is not configured");
        return false;
    }

    connecting = true;
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        connecting = false;
        return true;
    } catch (error) {
        // Cleared before scheduling, because scheduleRetry declines to queue
        // anything while a connection is believed to be in flight.
        connecting = false;
        console.error("MongoDB unavailable:", error.message);
        scheduleRetry();
        return false;
    }
}

module.exports = { connectDB, isDatabaseReady };
