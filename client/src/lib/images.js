/**
 * Client-side image preparation for event uploads.
 *
 * The server has no multipart handler: POST /api/events/uploads takes
 * { files: [{ type, data }] } where `data` is a base64 data URL, and it enforces
 *   - only image/jpeg, image/png, image/webp, image/gif
 *   - each decoded image under 4 MB
 *   - 8 MB total per request, 8 files per request
 * while express.json caps the whole body at 12 MB. A phone camera JPEG is
 * routinely 6-9 MB, so uploading originals would fail for most real photos.
 *
 * So every raster is re-encoded through a canvas at a sane display size before
 * it leaves the browser. That also means the bytes actually stored are the bytes
 * the page needs, which is the difference between a 400 KB banner and a 9 MB one
 * (image-optimization).
 *
 * GIFs are the exception: a canvas keeps only the first frame, so an animated
 * GIF would silently become a still. They are passed through untouched and
 * rejected outright if they are over the server's limit.
 */

import { events as eventsApi } from "./api";

/** Long-edge ceiling. Banners render at most ~1600px wide on a 2x display. */
const MAX_EDGE = 1920;

/** Comfortably inside the server's 4 MB per-image rule. */
const TARGET_BYTES = 2.6 * 1024 * 1024;

/** The server's own allow-list. Anything else is refused before upload. */
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/gif";

/** Server-side per-image cap, used for the GIF passthrough check. */
const SERVER_MAX_BYTES = 4 * 1024 * 1024;

/** Upload in small batches so one oversized set cannot trip the 8 MB rule. */
const BATCH_SIZE = 4;

/* ==========================================================================
   Encoding support
   ========================================================================== */

let webpSupport = null;

/**
 * Encoding WebP is not the same as decoding it - some older Safari builds can
 * display WebP but produce a PNG from toDataURL. Probe once, cache the answer.
 */
function canEncodeWebp() {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

/* ==========================================================================
   Helpers
   ========================================================================== */

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** Decoded byte length of a base64 data URL, which is what the server measures. */
export function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(Math.floor((base64.length * 3) / 4) - padding, 0);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file is not a readable image"));
    image.src = src;
  });
}

/* ==========================================================================
   Downscale + re-encode
   ========================================================================== */

/**
 * Returns { type, data } ready for the API, or throws with a message meant to
 * be shown to the user as-is.
 */
export async function prepareImage(file) {
  const type = String(file?.type || "").toLowerCase();

  if (!ACCEPTED.has(type)) {
    throw new Error(
      `${file?.name || "That file"} is not a JPG, PNG, WEBP or GIF.`
    );
  }

  const original = await readAsDataUrl(file);

  // Animated GIFs cannot survive a canvas round-trip, so they go as they are.
  if (type === "image/gif") {
    if (dataUrlBytes(original) > SERVER_MAX_BYTES) {
      throw new Error(
        `${file.name} is ${formatBytes(file.size)}. GIFs can't be compressed here — pick one under 4 MB.`
      );
    }
    return { type, data: original, name: file.name, bytes: dataUrlBytes(original) };
  }

  const image = await loadImage(original);
  const { width: sourceWidth, height: sourceHeight } = image;

  if (!sourceWidth || !sourceHeight) {
    throw new Error(`${file.name} has no readable dimensions.`);
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(Math.round(sourceWidth * scale), 1);
  const height = Math.max(Math.round(sourceHeight * scale), 1);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser blocked image processing.");

  const outputType = canEncodeWebp() ? "image/webp" : "image/jpeg";

  // JPEG has no alpha channel, so transparency would come out black. Paint a
  // white plate underneath first when falling back.
  if (outputType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  // Step the quality down only as far as the size demands.
  let quality = 0.86;
  let data = canvas.toDataURL(outputType, quality);
  while (dataUrlBytes(data) > TARGET_BYTES && quality > 0.4) {
    quality -= 0.12;
    data = canvas.toDataURL(outputType, quality);
  }

  const bytes = dataUrlBytes(data);
  if (bytes > SERVER_MAX_BYTES) {
    throw new Error(
      `${file.name} is still ${formatBytes(bytes)} after compression. Try a smaller image.`
    );
  }

  // A canvas re-encode can be larger than a well-optimised original. If it is,
  // and the original already fits, keep the original.
  const originalBytes = dataUrlBytes(original);
  if (originalBytes <= bytes && originalBytes <= TARGET_BYTES) {
    return { type, data: original, name: file.name, bytes: originalBytes };
  }

  return { type: outputType, data, name: file.name, bytes };
}

/* ==========================================================================
   Upload
   ========================================================================== */

/**
 * Prepares and uploads files, resolving to the app-relative paths the API
 * returns (["/api/images/<key>", ...]) in the same order as the input.
 *
 * `onProgress({ done, total })` fires per batch so the caller can show real
 * progress rather than an indeterminate spinner.
 */
export async function uploadImages(fileList, { onProgress } = {}) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];

  const prepared = [];
  for (const file of files) {
    // Sequential on purpose: decoding several large images at once is what
    // makes low-end phones drop the tab (main-thread-budget).
    prepared.push(await prepareImage(file));
    onProgress?.({ phase: "processing", done: prepared.length, total: files.length });
  }

  const paths = [];
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const batch = prepared.slice(i, i + BATCH_SIZE);
    const response = await eventsApi.uploadImages({
      files: batch.map(({ type, data }) => ({ type, data })),
    });
    const returned = Array.isArray(response?.files) ? response.files : [];
    if (returned.length !== batch.length) {
      throw new Error("The server did not return every uploaded image.");
    }
    paths.push(...returned);
    onProgress?.({ phase: "uploading", done: paths.length, total: prepared.length });
  }

  return paths;
}

/**
 * Mirror of isStoredImagePath in utils/imagePaths.js, so a value typed or pasted
 * from elsewhere is caught before submit rather than by the model's validator.
 *
 * Three shapes pass: /api/images/<key> (what an upload returns now, bytes stored
 * in the database), /uploads/... (files written by older builds, still served) and
 * /Media/... (bundled artwork). Keep this in step with the server copy.
 */
export const isStoredImagePath = (value) =>
  !value ||
  /^\/(?:api\/images\/[a-f0-9]{32}|uploads\/event-[a-z0-9-]+\.(?:jpg|jpeg|png|webp|gif)|Media\/[^?#\s]+)$/i.test(
    String(value)
  );
