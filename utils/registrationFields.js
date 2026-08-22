/**
 * Questions an organiser asks at booking time, and the answers that come back.
 *
 * Event.ticketConfig decides which of Evently's *own* facts get printed
 * (see utils/ticketFields.js). This file is the other half: extra questions the
 * organiser invents - "Industry", "Firm name", "Dietary needs" - which the
 * attendee answers while booking, and whose answers then ride onto the pass and
 * the door screen.
 *
 * Two rules make this safe, and both live here rather than in the controllers:
 *
 *  1. A label is never taken from the client on the way in. The attendee's
 *     request carries only { key: value }; the label is looked up in the event's
 *     own definition. Otherwise anyone could post
 *     `{ key: "x", label: "VIP - skip the queue", value: "yes" }` and get it
 *     printed onto a pass in the organiser's own layout.
 *
 *  2. An answer to a `select` must be one of the options the organiser wrote,
 *     matched case-insensitively and stored with the organiser's spelling. A
 *     free-text field is capped, not interpreted.
 *
 * The answer is denormalised onto the booking (key *and* label) on purpose. An
 * organiser who renames "Industry" to "Sector" next month must not retitle the
 * answers on passes already issued, and one who deletes the question must not
 * leave a row with no label behind.
 */

/** The control the attendee sees. Anything else falls back to plain text. */
const REGISTRATION_FIELD_TYPES = [
    "text",
    "select",
    "multiselect",
    "number",
    "checkbox"
];

const TYPES = new Set(REGISTRATION_FIELD_TYPES);

const MAX_FIELDS = 8;      // a booking form, not a survey
const MAX_OPTIONS = 20;
const KEY_MAX = 32;
const LABEL_MAX = 40;
const OPTION_MAX = 60;
const HELPER_MAX = 120;
const VALUE_MAX = 160;

/** "Firm's industry?" -> "firm-s-industry". Stable across label edits. */
const slug = (value) =>
    String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, KEY_MAX);

/* ==========================================================================
   Organiser side: the definitions
   ========================================================================== */

/**
 * Normalises what the organiser's editor submitted into storable definitions.
 *
 * Safe to run over already-stored definitions too - keys are honoured when they
 * are already slugs - so tightening a cap later also clamps old events on read.
 */
function sanitizeRegistrationFields(input) {
    const rows = Array.isArray(input) ? input : [];
    const used = new Set();
    const fields = [];

    for (const raw of rows) {
        if (!raw || typeof raw !== "object") continue;

        const label = String(raw.label ?? "").trim().slice(0, LABEL_MAX);
        if (!label) continue;   // a question with no wording cannot be asked

        const type = TYPES.has(raw.type) ? raw.type : "text";
        const choice = type === "select" || type === "multiselect";

        const options = choice
            ? [
                ...new Set(
                    (Array.isArray(raw.options) ? raw.options : [])
                        .map((option) => String(option ?? "").trim().slice(0, OPTION_MAX))
                        .filter(Boolean)
                )
            ].slice(0, MAX_OPTIONS)
            : [];

        // A dropdown with nothing in it renders as a dead control, and blocks
        // the booking outright if it is also required.
        if (choice && options.length === 0) continue;

        let key = slug(raw.key) || slug(label) || `field-${fields.length + 1}`;
        if (used.has(key)) {
            let suffix = 2;
            while (used.has(`${key}-${suffix}`)) suffix += 1;
            key = `${key}-${suffix}`;
        }
        used.add(key);

        fields.push({
            key,
            label,
            type,
            options,
            required: raw.required === true,
            // Opt-out, not opt-in: an organiser who bothered to ask the question
            // wants the answer where they can see it.
            showOnTicket: raw.showOnTicket !== false,
            showOnScan: raw.showOnScan !== false,
            helper: String(raw.helper ?? "").trim().slice(0, HELPER_MAX)
        });

        if (fields.length >= MAX_FIELDS) break;
    }

    return fields;
}

/* ==========================================================================
   Attendee side: the answers
   ========================================================================== */

/** Accepts { key: value } or [{ key, value }] - the client may send either. */
const answerMap = (input) => {
    if (Array.isArray(input)) {
        const map = {};
        for (const row of input) {
            if (row && typeof row === "object" && row.key !== undefined) {
                map[String(row.key)] = row.value;
            }
        }
        return map;
    }
    return input && typeof input === "object" ? input : {};
};

/** Case-insensitive membership test that returns the organiser's spelling. */
const matchOption = (options, raw) => {
    const text = String(raw ?? "").trim();
    if (!text) return null;
    return options.find((option) => option.toLowerCase() === text.toLowerCase()) || null;
};

const truthy = (value) =>
    value === true || value === 1 || value === "1" || value === "true" || value === "on" || value === "yes";

/**
 * Validates an attendee's answers against the event's own definitions.
 *
 * -> { answers, errors }
 *
 * `answers` is always storable, even when `errors` is non-empty: invalid rows are
 * dropped rather than substituted. That lets the pre-payment path refuse on
 * `errors` while the post-payment path keeps whatever was valid, because once the
 * money is taken a booking must never fail over a dropdown.
 *
 * An unanswered optional question produces no row at all - a pass with
 * "Industry: —" printed on it looks broken.
 */
function resolveAnswers(fields, input) {
    const defs = sanitizeRegistrationFields(fields);
    const given = answerMap(input);
    const answers = [];
    const errors = [];

    for (const def of defs) {
        const raw = given[def.key];
        let value = null;
        let values = null;

        switch (def.type) {
            case "select": {
                value = matchOption(def.options, raw);
                if (!value && String(raw ?? "").trim()) {
                    errors.push(`Pick one of the listed options for "${def.label}".`);
                    continue;
                }
                break;
            }

            case "multiselect": {
                const picked = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
                    .map((entry) => matchOption(def.options, entry))
                    .filter(Boolean);
                values = [...new Set(picked)].slice(0, MAX_OPTIONS);
                value = values.join(", ").slice(0, VALUE_MAX) || null;
                break;
            }

            case "number": {
                const text = String(raw ?? "").trim();
                if (text) {
                    const amount = Number(text);
                    if (!Number.isFinite(amount)) {
                        errors.push(`"${def.label}" needs to be a number.`);
                        continue;
                    }
                    value = String(amount);
                }
                break;
            }

            case "checkbox": {
                const ticked = truthy(raw);
                if (def.required && !ticked) {
                    errors.push(`Please tick "${def.label}" to continue.`);
                    continue;
                }
                // An unticked optional box is still an answer worth recording,
                // but only if the form actually asked and got a reply.
                value = ticked ? "Yes" : raw === undefined ? null : "No";
                break;
            }

            default: {
                value = String(raw ?? "").trim().slice(0, VALUE_MAX) || null;
            }
        }

        if (def.required && !value) {
            errors.push(`"${def.label}" is required.`);
            continue;
        }

        if (!value) continue;

        answers.push({
            key: def.key,
            label: def.label,
            value,
            ...(values && values.length > 1 ? { values } : {})
        });
    }

    return { answers, errors };
}

/* ==========================================================================
   Rendering
   ========================================================================== */

/**
 * The answer rows to append to a pass or a door screen, in the order the
 * organiser asked the questions.
 *
 * Row keys are namespaced (`answer:industry`) so they can never collide with a
 * catalogue key from utils/ticketFields.js.
 */
function answerRows({ event, booking, where = "ticket" }) {
    const defs = new Map(
        (Array.isArray(event?.registrationFields) ? event.registrationFields : [])
            .map((field) => [String(field?.key ?? ""), field])
    );

    const rows = [];

    for (const answer of Array.isArray(booking?.answers) ? booking.answers : []) {
        const label = String(answer?.label ?? "").trim().slice(0, LABEL_MAX);
        const value = String(answer?.value ?? "").trim().slice(0, VALUE_MAX);
        if (!label || !value) continue;

        const def = defs.get(String(answer?.key ?? ""));

        // No definition left means the organiser has since deleted the question.
        // The answer still happened, so the door keeps seeing it, but it stops
        // being printed: that honours the deletion everywhere the organiser
        // controls the layout, without rewriting history at the gate.
        const show = def
            ? (where === "ticket" ? def.showOnTicket !== false : def.showOnScan !== false)
            : where !== "ticket";

        if (!show) continue;

        rows.push({ key: `answer:${answer.key}`, label, value });
        if (rows.length >= MAX_FIELDS) break;
    }

    return rows;
}

/** Ordered definitions for the booking form, with nothing internal attached. */
const registrationFormFields = (event) =>
    sanitizeRegistrationFields(event?.registrationFields);

module.exports = {
    REGISTRATION_FIELD_TYPES,
    MAX_REGISTRATION_FIELDS: MAX_FIELDS,
    MAX_REGISTRATION_OPTIONS: MAX_OPTIONS,
    sanitizeRegistrationFields,
    resolveAnswers,
    answerRows,
    registrationFormFields
};
