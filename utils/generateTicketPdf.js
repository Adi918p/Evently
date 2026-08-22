const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { buildTicketView } = require("./ticketFields");

/**
 * Renders a booking to a one-page PDF pass and resolves with its path.
 *
 * Two rules shape everything below.
 *
 * 1. It must never throw. This runs after a payment is captured and the booking
 *    is written, so a missing field is a cosmetic problem, not a reason to tell
 *    someone who has paid that their purchase failed. Every value is read
 *    defensively and the whole render is wrapped.
 *
 * 2. What it prints is the organiser's decision. The field list, the extra rows,
 *    the door notes and the accent colour all come from Event.ticketConfig via
 *    utils/ticketFields.js, which is the same source the door scanner reads - so
 *    the pass and the scan screen can never disagree.
 *
 * The card is measured before it is drawn and then centred, because the field
 * list is organiser-configured and therefore variable: a fixed-height card left
 * a large empty gap above the stub whenever fewer rows were chosen.
 *
 * Fonts: pdfkit's built-in Helvetica and Courier, which are WinAnsi-encoded.
 * That is not a style choice - embedding a font file would mean shipping one in
 * the repo, and the standard fonts need no asset and no fallback. The cost is
 * that characters outside WinAnsi have no glyph, which is why every string goes
 * through winAnsi() below.
 */

const ticketsDir = path.join(__dirname, "../tickets");

if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
}

/** A render that never finishes must not hold the HTTP response open. */
const RENDER_TIMEOUT_MS = 15000;

/* ==========================================================================
   Text safety
   ========================================================================== */

/**
 * The extra printable characters WinAnsi has above Latin-1: the curly quotes,
 * dashes, ellipsis, bullet and euro that word processors emit constantly.
 */
const WIN_ANSI_EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/**
 * Drops anything the built-in fonts cannot draw.
 *
 * Measured, not assumed: doc.widthOfString("₹") is 0.00 in Helvetica, so the
 * rupee sign was silently rendering as nothing on every ticket this app has
 * produced - "1200" with no currency at all. It is rewritten to "Rs ". Anything
 * else unrepresentable (Devanagari, emoji) is dropped rather than left to paint
 * as a blank; supporting those means embedding a Unicode font.
 */
const winAnsi = (input) => {
    const allowed = new RegExp(`[^\\x20-\\x7E\\xA0-\\xFF${WIN_ANSI_EXTRAS}]`, "g");
    return String(input ?? "")
        .replace(/[₹₨]\s*/g, "Rs ")
        // Whitespace is collapsed before the strip, not after: newlines and tabs
        // are themselves outside the allowed range, so stripping first would turn
        // "Gate 3\nWest side" into "Gate 3West side".
        .replace(/\s+/g, " ")
        .replace(allowed, "")
        // A dropped character leaves the spaces that surrounded it behind.
        .replace(/ {2,}/g, " ")
        .trim();
};

/** Sanitised text with a fallback for when nothing printable survives. */
const text = (value, fallback = "") => {
    const clean = winAnsi(value);
    return clean.length > 0 ? clean : fallback;
};

const formatDay = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
};

/* ==========================================================================
   Colour
   ========================================================================== */

const HEX = /^#?([0-9a-f]{6})$/i;

const toRgb = (hex, fallback = [139, 92, 246]) => {
    const match = HEX.exec(String(hex || "").trim());
    if (!match) return fallback;
    const int = parseInt(match[1], 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

const toHex = ([r, g, b]) =>
    `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;

/** Mixes toward white, for the second stop of the header gradient. */
const lighten = (hex, amount) => {
    const [r, g, b] = toRgb(hex);
    return toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
};

/** Mixes toward black, for the first stop and for tinted hairlines. */
const darken = (hex, amount) => {
    const [r, g, b] = toRgb(hex);
    return toHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)]);
};

const PAGE_BG = "#07070F";
const CARD_TOP = "#1B1B30";
const CARD_BOTTOM = "#0B0B16";
const STUB_BG = "#06060D";
const INK = "#FFFFFF";
const INK_MUTED = "#A9B0C0";
const INK_FAINT = "#767E90";

/* ==========================================================================
   Geometry
   ========================================================================== */

const PAGE_W = 595.28;
const PAGE_H = 841.89;

const CARD_X = 50;
const CARD_W = PAGE_W - CARD_X * 2;
const CARD_R = 20;

const PAD = 34;
const CONTENT_X = CARD_X + PAD;
const CONTENT_W = CARD_W - PAD * 2;

const BAND_H = 96;
const STUB_H = 170;
const NOTCH_R = 11;

const COL_GAP = 26;
const COL_W = (CONTENT_W - COL_GAP) / 2;
const ROW_H = 44;

const TITLE_TOP = 30;   // band bottom -> title
const RULE_ABOVE = 20;  // last text -> accent rule
const RULE_BELOW = 24;  // accent rule -> first field row
const GRID_TAIL = 20;   // last row -> perforation

const MIN_CARD_H = 430;
const MAX_CARD_H = PAGE_H - 80;

/** Ceiling on printed rows so a talkative organiser cannot overflow the page. */
const MAX_FIELD_ROWS = 6;
const MAX_EXTRAS = 4;

/* ==========================================================================
   Inputs
   ========================================================================== */

/**
 * Filenames come from a ticket id, so anything path-like has to come out.
 *
 * The dot is dropped along with the separators. Ticket ids never contain one,
 * and keeping it let "../../etc/passwd" through as "........etcpasswd" - still
 * inside tickets/, but there is no reason to carry the ambiguity.
 */
const safeFileName = (ticketId) => {
    const cleaned = String(ticketId || "").replace(/[^A-Za-z0-9_-]/g, "");
    return cleaned.length > 0 ? cleaned.slice(0, 80) : `ticket-${Date.now()}`;
};

/** Data-URL -> Buffer, or null if the QR is missing or malformed. */
const decodeQr = (qrCode) => {
    const payload = String(qrCode || "").split(",")[1];
    if (!payload) return null;
    try {
        const buffer = Buffer.from(payload, "base64");
        return buffer.length > 0 ? buffer : null;
    } catch {
        return null;
    }
};

/* ==========================================================================
   Render
   ========================================================================== */

const generateTicketPdf = (booking, event, user) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(ticketsDir, `${safeFileName(booking?.ticketId)}.pdf`);

        const doc = new PDFDocument({
            size: [PAGE_W, PAGE_H],
            margin: 0,
            info: {
                Title: `Evently pass - ${text(event?.title, "event")}`,
                Author: "Evently",
                Subject: text(booking?.ticketId, "Event ticket")
            }
        });

        const stream = fs.createWriteStream(filePath);
        let settled = false;

        const finish = (err, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (err) {
                stream.destroy();
                return reject(err);
            }
            resolve(value);
        };

        const timer = setTimeout(
            () => finish(new Error(`Ticket PDF render timed out after ${RENDER_TIMEOUT_MS}ms`)),
            RENDER_TIMEOUT_MS
        );

        stream.on("error", (err) => finish(err));
        stream.on("finish", () => finish(null, filePath));
        doc.on("error", (err) => finish(err));
        doc.pipe(stream);

        try {
            const view = buildTicketView({
                booking,
                event,
                attendee: user,
                where: "ticket"
            });

            const accent = view.accent;
            const accentLight = lighten(accent, 0.42);
            const accentDeep = darken(accent, 0.55);

            const fields = view.fields.slice(0, MAX_FIELD_ROWS * 2);
            const extras = view.extras.slice(0, MAX_EXTRAS);
            const shown = new Set(fields.map((field) => field.key));

            /* ================= content ================= */

            const title = text(event?.title, "Evently event");
            const titleSize = title.length > 46 ? 20 : title.length > 30 ? 23 : 26;

            // The strap line carries only what the grid does not, so the pass
            // never prints the same date or venue twice. With the shipped default
            // field set that leaves the door time, which has nowhere else to go.
            const strap = [
                !shown.has("event.date") && text(formatDay(event?.date)),
                !shown.has("event.time") && text(event?.time) && `Doors ${text(event?.time)}`,
                !shown.has("event.venue") && !shown.has("event.location") &&
                    text(event?.venue || event?.location)
            ].filter(Boolean).join("   ·   ");

            const gridRows = Math.ceil(fields.length / 2);

            /* ================= measure ================= */

            doc.font("Helvetica-Bold").fontSize(titleSize);
            const titleLine = doc.currentLineHeight();
            const titleH = Math.min(
                doc.heightOfString(title, { width: CONTENT_W, lineGap: 1 }),
                titleLine * 2 + 2
            );

            let strapH = 0;
            if (strap) {
                doc.font("Helvetica").fontSize(10.5);
                strapH = 8 + doc.heightOfString(strap, { width: CONTENT_W, lineGap: 2 });
            }

            // One label column width for all extras, so the values line up
            // instead of each starting wherever its own label happens to end.
            doc.font("Helvetica-Bold").fontSize(9);
            const extraLabelW = extras.length
                ? Math.min(
                    Math.max(...extras.map((extra) => doc.widthOfString(text(extra.label)))) + 14,
                    CONTENT_W * 0.34
                )
                : 0;

            const extraHeights = extras.map((extra) => {
                doc.font("Helvetica").fontSize(9.5);
                return Math.max(
                    14,
                    doc.heightOfString(text(extra.value), { width: CONTENT_W - extraLabelW })
                ) + 5;
            });
            const extrasH = extras.length
                ? 16 + extraHeights.reduce((sum, h) => sum + h, 0)
                : 0;

            const bodyH =
                TITLE_TOP + titleH + strapH + RULE_ABOVE + RULE_BELOW +
                gridRows * ROW_H + extrasH + GRID_TAIL;

            const cardH = Math.max(
                MIN_CARD_H,
                Math.min(MAX_CARD_H, BAND_H + bodyH + STUB_H)
            );
            const cardY = Math.max(34, Math.round((PAGE_H - cardH) / 2) - 10);

            /* ================= page ================= */

            doc.rect(0, 0, PAGE_W, PAGE_H).fill(PAGE_BG);

            // Two soft accent glows so the page is not a flat rectangle. Radial
            // gradients from the accent to transparent read as light spill.
            const glow = (cx, cy, r, colour, strength) => {
                const gradient = doc.radialGradient(cx, cy, 0, cx, cy, r);
                gradient.stop(0, colour, strength);
                gradient.stop(1, colour, 0);
                doc.circle(cx, cy, r).fill(gradient);
            };
            glow(CARD_X + 30, cardY + 20, 270, accent, 0.55);
            glow(CARD_X + CARD_W - 10, cardY + cardH - 40, 240, accentLight, 0.3);

            /* ================= card ================= */

            // Per-stop opacity, so the accent glow behind the card bleeds through
            // the top edge - the glass effect, rather than a flat panel sitting on
            // top of the light.
            const cardFill = doc.linearGradient(CARD_X, cardY, CARD_X, cardY + cardH);
            cardFill.stop(0, CARD_TOP, 0.82);
            cardFill.stop(0.5, CARD_BOTTOM, 0.96);
            cardFill.stop(1, CARD_BOTTOM, 1);

            doc.save();
            doc.roundedRect(CARD_X, cardY, CARD_W, cardH, CARD_R).fill(cardFill);

            // Everything from here is clipped to the card, so the header band, the
            // stub tint and the edge notches all follow its rounded corners.
            doc.roundedRect(CARD_X, cardY, CARD_W, cardH, CARD_R).clip();

            /* ---------- header band ---------- */

            const band = doc.linearGradient(CARD_X, cardY, CARD_X + CARD_W, cardY + BAND_H);
            band.stop(0, accentDeep);
            band.stop(0.55, accent);
            band.stop(1, accentLight);
            doc.rect(CARD_X, cardY, CARD_W, BAND_H).fill(band);

            doc.font("Helvetica-Bold").fontSize(21).fillColor(INK)
                .text("EVENTLY", CONTENT_X, cardY + 30, {
                    characterSpacing: 3.4,
                    lineBreak: false
                });

            doc.font("Helvetica").fontSize(8).fillColor(INK).opacity(0.85)
                .text("DIGITAL ENTRY PASS", CONTENT_X, cardY + 58, {
                    characterSpacing: 1.9,
                    lineBreak: false
                })
                .opacity(1);

            const heads = Math.max(1, Number(booking?.tickets) || 1);
            const badge = `${heads} ${heads === 1 ? "GUEST" : "GUESTS"}`;
            doc.font("Helvetica-Bold").fontSize(9);
            const badgeW = doc.widthOfString(badge, { characterSpacing: 1.4 }) + 24;
            const badgeX = CARD_X + CARD_W - PAD - badgeW;
            doc.opacity(0.22).roundedRect(badgeX, cardY + 34, badgeW, 24, 12).fill(INK).opacity(1);
            doc.fillColor(INK).text(badge, badgeX, cardY + 41, {
                width: badgeW,
                align: "center",
                characterSpacing: 1.4,
                lineBreak: false
            });

            /* ---------- title ---------- */

            let y = cardY + BAND_H + TITLE_TOP;

            doc.font("Helvetica-Bold").fontSize(titleSize).fillColor(INK)
                .text(title, CONTENT_X, y, {
                    width: CONTENT_W,
                    height: titleH,
                    ellipsis: true,
                    lineGap: 1
                });
            y += titleH;

            if (strap) {
                doc.font("Helvetica").fontSize(10.5).fillColor(INK_MUTED)
                    .text(strap, CONTENT_X, y + 8, { width: CONTENT_W, lineGap: 2 });
                y += strapH;
            }

            y += RULE_ABOVE;
            doc.save().opacity(0.55)
                .moveTo(CONTENT_X, y).lineTo(CONTENT_X + CONTENT_W, y)
                .lineWidth(0.75).strokeColor(accent).stroke()
                .restore();
            y += RULE_BELOW;

            /* ---------- fields, two columns ---------- */

            fields.forEach((field, index) => {
                const fx = CONTENT_X + (index % 2) * (COL_W + COL_GAP);
                const fy = y + Math.floor(index / 2) * ROW_H;

                doc.font("Helvetica").fontSize(7.5).fillColor(accentLight)
                    .text(text(field.label).toUpperCase(), fx, fy, {
                        width: COL_W,
                        characterSpacing: 1.3,
                        lineBreak: false
                    });

                // Codes read better monospaced, and fixed-width digits stop the
                // second column dancing from one ticket to the next.
                const isCode = field.key === "ticketId" || field.key === "paymentId";
                const value = text(field.value, "-");

                // A long value drops a size rather than being ellipsised. Losing
                // the tail of an email address makes the pass wrong, not just
                // tight, and two point sizes buy roughly ten more characters.
                doc.font(isCode ? "Courier-Bold" : "Helvetica-Bold").fontSize(isCode ? 11.5 : 12.5);
                if (doc.widthOfString(value) > COL_W) doc.fontSize(isCode ? 9.5 : 10.5);

                doc.fillColor(INK).text(value, fx, fy + 13, {
                    width: COL_W,
                    height: 26,
                    ellipsis: true,
                    lineGap: -1
                });
            });

            y += gridRows * ROW_H;

            /* ---------- organiser extras ---------- */

            if (extras.length) {
                doc.save().opacity(0.3)
                    .moveTo(CONTENT_X, y).lineTo(CONTENT_X + CONTENT_W, y)
                    .lineWidth(0.5).strokeColor(INK_FAINT).stroke()
                    .restore();
                y += 16;

                extras.forEach((extra, index) => {
                    const label = text(extra.label);
                    const value = text(extra.value);
                    if (!label || !value) return;

                    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK_MUTED)
                        .text(label, CONTENT_X, y, {
                            width: extraLabelW - 8,
                            height: 12,
                            ellipsis: true,
                            lineBreak: false
                        });

                    doc.font("Helvetica").fontSize(9.5).fillColor(INK)
                        .text(value, CONTENT_X + extraLabelW, y - 0.5, {
                            width: CONTENT_W - extraLabelW,
                            height: 26,
                            ellipsis: true
                        });

                    y += extraHeights[index];
                });
            }

            /* ---------- perforation + stub ---------- */

            const stubY = cardY + cardH - STUB_H;

            doc.rect(CARD_X, stubY, CARD_W, STUB_H).fill(STUB_BG);

            doc.save().dash(4, { space: 4 }).opacity(0.5)
                .moveTo(CARD_X + NOTCH_R + 5, stubY)
                .lineTo(CARD_X + CARD_W - NOTCH_R - 5, stubY)
                .lineWidth(1).strokeColor(INK_FAINT).stroke()
                .undash().restore();

            // Notches punched out of both edges - the detail that makes it read
            // as a ticket at a glance. Filled with the page colour, which is why
            // they are drawn inside the card clip.
            doc.circle(CARD_X, stubY, NOTCH_R).fill(PAGE_BG);
            doc.circle(CARD_X + CARD_W, stubY, NOTCH_R).fill(PAGE_BG);

            /* ---------- QR ---------- */

            const QR_SIZE = 116;
            const QR_PAD = 9;
            const panel = QR_SIZE + QR_PAD * 2;
            const qrX = CONTENT_X;
            const qrY = stubY + (STUB_H - panel) / 2;

            const qrBuffer = decodeQr(booking?.qrCode);

            // The panel is white whether or not there is a code to put on it: a QR
            // needs a light quiet zone to decode reliably, and the old ticket drew
            // the code straight onto the dark card.
            doc.roundedRect(qrX, qrY, panel, panel, 10).fill("#FFFFFF");

            if (qrBuffer) {
                doc.image(qrBuffer, qrX + QR_PAD, qrY + QR_PAD, {
                    width: QR_SIZE,
                    height: QR_SIZE
                });
            } else {
                doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111")
                    .text("NO QR CODE", qrX, qrY + panel / 2 - 16, { width: panel, align: "center" });
                doc.font("Helvetica").fontSize(7.5).fillColor("#555555")
                    .text("Quote the ticket ID", qrX, qrY + panel / 2 - 2, { width: panel, align: "center" });
            }

            /* ---------- stub text ---------- */

            const sx = qrX + panel + 22;
            const sw = CARD_X + CARD_W - PAD - sx;
            let sy = qrY + 6;

            doc.font("Helvetica-Bold").fontSize(8).fillColor(accentLight)
                .text(qrBuffer ? "SCAN AT ENTRY" : "SHOW AT ENTRY", sx, sy, {
                    width: sw,
                    characterSpacing: 1.6,
                    lineBreak: false
                });
            sy += 18;

            doc.font("Courier-Bold").fontSize(15).fillColor(INK)
                .text(text(booking?.ticketId, "NO TICKET ID"), sx, sy, {
                    width: sw,
                    characterSpacing: 0.6,
                    height: 22,
                    ellipsis: true
                });
            sy = doc.y + 10;

            doc.font("Helvetica").fontSize(8.5).fillColor(INK_MUTED)
                .text(
                    text(view.notes) ||
                        "One admission per booking. Have this pass ready on your phone or printed.",
                    sx, sy,
                    {
                        width: sw,
                        height: Math.max(0, qrY + panel - sy),
                        ellipsis: true,
                        lineGap: 1.5
                    }
                );

            doc.restore(); // release the card clip

            /* ---------- footer ---------- */

            doc.font("Helvetica").fontSize(7.5).fillColor(INK_FAINT)
                .text(
                    `Issued by Evently  ·  ${text(booking?.ticketId, "-")}  ·  Not transferable`,
                    CARD_X,
                    cardY + cardH + 13,
                    { width: CARD_W, align: "center", characterSpacing: 0.4 }
                );

            doc.end();
        } catch (err) {
            finish(err);
        }
    });
};

module.exports = generateTicketPdf;
module.exports.winAnsi = winAnsi;
