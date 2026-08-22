#!/usr/bin/env node
/**
 * Moves event images that are still files under Public/uploads into MongoDB.
 *
 * Uploads have stored their bytes in the database since the eventimages
 * collection was added, but events created before that still point at
 * /uploads/event-<uuid>.<ext>. Those paths keep working - server.js still mounts
 * the folder - so this is a tidy-up, not a prerequisite. Run it once and the
 * artwork survives the next deploy to a host with an ephemeral filesystem.
 *
 *   node scripts/migrateEventImages.js              # report only, writes nothing
 *   node scripts/migrateEventImages.js --commit     # do it
 *   node scripts/migrateEventImages.js --commit --delete-files
 *
 * Without --delete-files the originals stay on disk. That is the safe default:
 * if something is wrong with the migrated copy the old path is one database edit
 * away from working again.
 *
 * Safe to run twice. A path that is already /api/images/... is skipped, and a
 * file that has already been imported is matched by its sha256 rather than
 * stored a second time.
 */

require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Event = require("../models/Events");
const EventImage = require("../models/EventImage");
const { imagePath, isLegacyUpload } = require("../utils/imagePaths");

const commit = process.argv.includes("--commit");
const deleteFiles = process.argv.includes("--delete-files");

const PUBLIC_DIR = path.join(__dirname, "..", "Public");

const CONTENT_TYPES = new Map([
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".webp", "image/webp"],
    [".gif", "image/gif"]
]);

const stats = { events: 0, images: 0, reused: 0, missing: 0, removed: 0, failed: 0 };

/** Imports one file, or returns the path of an identical one already imported. */
async function importFile(imageUrl, owner) {
    const filePath = path.join(PUBLIC_DIR, imageUrl.replace(/^\//, ""));

    let data;
    try {
        data = await fs.promises.readFile(filePath);
    } catch {
        // The event points at a file that is already gone - almost certainly a
        // previous deploy having wiped it, which is the whole reason for this move.
        stats.missing += 1;
        console.log(`  ! missing on disk, left as-is: ${imageUrl}`);
        return null;
    }

    const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase());
    if (!contentType) {
        stats.failed += 1;
        console.log(`  ! unknown image type, left as-is: ${imageUrl}`);
        return null;
    }

    const hash = crypto.createHash("sha256").update(data).digest("hex");

    // Re-running the script, or two events sharing one re-uploaded file, must not
    // store the same bytes twice. Only permanent images count as a match: an
    // unclaimed upload still has an expiry on it and could vanish.
    const existing = await EventImage.findOne({ hash, expiresAt: null }).select("key");
    if (existing) {
        stats.reused += 1;
        return imagePath(existing.key);
    }

    if (!commit) {
        stats.images += 1;
        return "/api/images/<new>";
    }

    const created = await EventImage.create({
        key: crypto.randomBytes(16).toString("hex"),
        data,
        contentType,
        bytes: data.length,
        hash,
        owner,
        // Permanent immediately: it is already referenced by a saved event.
        expiresAt: null
    });

    stats.images += 1;

    if (deleteFiles) {
        await fs.promises.unlink(filePath).catch(() => {});
        stats.removed += 1;
    }

    return imagePath(created.key);
}

async function main() {
    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is not set. Check your .env.");
        process.exitCode = 1;
        return;
    }

    // Connected directly rather than through config/db.js: that module installs a
    // reconnect-on-disconnect handler, which would keep this process alive.
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log(commit ? "Migrating.\n" : "Dry run - nothing will be written. Add --commit to apply.\n");

    const events = await Event.find({
        $or: [
            { banner: /^\/uploads\// },
            { gallery: /^\/uploads\// },
            { "lineup.image": /^\/uploads\// }
        ]
    });

    for (const event of events) {
        const touched = [];

        if (isLegacyUpload(event.banner)) {
            const next = await importFile(event.banner, event.organizer);
            if (next) {
                touched.push(`banner ${event.banner} -> ${next}`);
                event.banner = next;
            }
        }

        for (let i = 0; i < (event.gallery?.length || 0); i += 1) {
            if (!isLegacyUpload(event.gallery[i])) continue;
            const next = await importFile(event.gallery[i], event.organizer);
            if (next) {
                touched.push(`gallery[${i}] ${event.gallery[i]} -> ${next}`);
                event.gallery[i] = next;
            }
        }

        for (let i = 0; i < (event.lineup?.length || 0); i += 1) {
            if (!isLegacyUpload(event.lineup[i]?.image)) continue;
            const next = await importFile(event.lineup[i].image, event.organizer);
            if (next) {
                touched.push(`lineup[${i}] ${event.lineup[i].image} -> ${next}`);
                event.lineup[i].image = next;
            }
        }

        if (!touched.length) continue;

        stats.events += 1;
        console.log(`${event.title || event._id}`);
        touched.forEach((line) => console.log(`  ${line}`));

        if (commit) {
            // The image paths are the only change, so validators run against a
            // document that is otherwise untouched.
            await event.save();
        }
    }

    console.log("");
    console.log(`events touched : ${stats.events}`);
    console.log(`images stored  : ${stats.images}`);
    console.log(`already stored : ${stats.reused}`);
    console.log(`missing files  : ${stats.missing}`);
    console.log(`files deleted  : ${stats.removed}`);
    console.log(`failed         : ${stats.failed}`);

    if (!commit && (stats.events || stats.images)) {
        console.log("\nNothing was written. Re-run with --commit to apply.");
    }
}

main()
    .catch((err) => {
        console.error("\nMigration failed:", err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect().catch(() => {});
    });
