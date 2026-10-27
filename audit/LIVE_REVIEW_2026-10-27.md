# Evently live audit — 27 October 2026

Follow-up: the owner subsequently authorized fixes. See [remediation results](LIVE_FIXES_2026-10-27.md); the observations below retain the pre-fix audit state.

## Outcome and scope

Tested the deployed website at https://event-ly.in, its API/proxy, the owner's signed-in user session, and the separately connected admin session. No localhost application tests were used as evidence for this review. Source was read only to understand intended behavior and resolve ambiguous observations.

**Two confirmed low-severity routing/cache defects remain. One unexpected sign-out needs investigation.** The exercised free booking, cash desk, email delivery, ticket downloads, scanner persistence, and admin browsing flows passed. This does not establish that every possible case is correct.

The public HTTP pass ran **91 sequential GET/HEAD checks: 86 expected outcomes and five deviations**, grouped into two findings. Browser scenarios below are separate; they are not included in that number.

No application implementation, dependency/configuration change, credential change, commit, push, or deployment was performed. Git HEAD remained `a9ef5143497d56e90cc6488960c9b81792cef9c8`.

## Findings requiring a decision

| ID | Priority / confidence | Finding and impact | Proposed next step — not implemented |
| --- | --- | --- | --- |
| LIVE-01 | Medium investigation; observed once, cause unconfirmed | The original signed-in user session unexpectedly returned to `/login?mode=login&next=%2Fmy-bookings`. The owner confirmed they had not switched accounts. Later restored/fresh sessions remained signed in through repeated navigations, refreshes, booking and ticket checks. | Capture the failing `/auth/me` or protected request, status and server correlation data; distinguish expired/revoked tokens from transient server/network errors. Do not assign a root cause without this evidence. |
| LIVE-02 | Low; confirmed | A nonexistent `/assets/evently-audit-nonexistent.js` returns HTTP 200 with HTML and a **one-year immutable cache policy**. A missing `/Media/evently-audit-nonexistent.png` also returns HTML 200. Stale/invalid assets can therefore fail with misleading success responses; cached HTML can prolong recovery for an affected asset URL. Current referenced assets passed. | Exclude static asset paths from SPA fallback; return genuine 404s with appropriate cache headers, then test deployed missing and existing assets. |
| LIVE-03 | Low; confirmed | Googlebot requests to unknown nested event/club routes return generic indexable HTTP 200 pages. The organizer cash-desk route is also indexable in the crawler response. This is incorrect indexing/soft-404 behavior, **not demonstrated disclosure of attendee information**. | Match valid public routes exactly; return 404 for unknown nested routes and noindex for cash-desk/private routes. Verify the live crawler responses and robots rules. |

Exact HTTP reproduction URLs, response headers, and coverage are in [HTTP summary](live-review-http-summary-2026-10-27.md) and [raw sanitized results](live-review-http-2026-10-27.json).

An existing booking initially showed **Email delivery failed**. Its one explicitly approved retry cleared the failure state, and its actual message with both PDF attachments was found in the recipient's Gmail conversation. The original failure cause is unknown; this is a recovered historical failure, not evidence of a continuing delivery outage.

## Live browser coverage

| Area | Executed checks and observed outcome |
| --- | --- |
| Public browsing | Home, live event details, city/search trimming, combined search parameters, no-match results, clearing filters, mobile search-dialog navigation, and the default upcoming list worked. The real event retained 668 available seats throughout the controlled fixture tests. |
| User profile/session | Profile identity, active/verified user state and existing booking totals rendered. The isolated sign-out above remains unresolved; subsequent protected navigations/reloads and booking completion worked. |
| Role boundaries | A user account received the access-denied screen for organizer dashboard, admin and event cash desk. Separately, 11 anonymous protected GET endpoints returned 401. This is not full cross-user ownership/security coverage. |
| My bookings | Existing two bookings rendered with correct one- and three-ticket totals. Past empty state and All restoration worked. The new free QA booking appeared in the user's account. Cash attendees are intentionally separate guest records, so the cash booking appeared in the organizer roster rather than the account's My bookings. |
| Ticket dialog | Existing and QA tickets displayed QR, quantity, paid amount and admission state. Escape closed the dialog and returned focus to Show ticket. At 390 × 844, the dialog fit horizontally and its long content could scroll; no horizontal document overflow was found. |
| PDF downloads | Actual authenticated ticket and receipt downloads succeeded. Both downloaded samples were valid single-page PDFs, visually readable, with correct sample event/quantity/amount and no observed clipping. Printer output and non-Latin text were not tested. Private files/renders remain under `.cache/live-review-2026-10-27/`. |
| Quantity bounds | Inputs 0, -1, 1.5, 11 and empty were normalized to the supported integer range. Ten tickets produced ₹4,990 for the ₹499 event; the plus button disabled at ten. A two-seat QA event reduced the online maximum to two. No paid order was submitted. |
| Booking status URLs | Missing purchase ID showed Choose a booking. Malformed and nonexistent purchase IDs showed Could not check this purchase / Purchase not found, without a false confirmation. |
| Required registration answer | Blank QA reference refused booking with an explicit required-answer error. Filling the answer allowed exactly one approved free booking. The answer was retained and shown at admission. |
| Free booking | One ₹0, one-ticket booking confirmed, generated its pass, reserved one seat and survived success-page reload. App delivery status became sent; actual Gmail message contained ticket and receipt PDFs. |
| Event creation/editing | Empty required fields were rejected. Created one clearly labelled zero-capacity QA fixture, verified sold-out state, then set capacity to two. Editing capacity below two issued tickets was rejected. A temporary price change to ₹1 did not change the existing booking's original ₹0 amount; price was restored. |
| Cash desk | Zero capacity disabled the form. Select options were 1–10. Selecting ten with one seat remaining disabled confirmation. Required guest details/answer and invalid email were rejected before valid submission. Exactly one approved one-ticket ₹0 cash booking confirmed. No real cash was collected. |
| Cash recovery | Reload showed Recover this booking. Recovery returned the same ticket ID. Roster and downloaded CSV contained exactly two distinct bookings, one free and one cash, with no duplicate cash row. Register next guest cleared the recovery state and correctly blocked sales at zero remaining seats. Concurrent/lost-response cases were not forced. |
| Email | Exactly one approved retry plus two explicitly approved QA booking emails were triggered. All three messages were found in the intended recipient's Gmail conversation, each with ticket and receipt PDF attachments. No additional retry was clicked. Inbox evidence remains private. |
| Guest roster / CSV | Both controlled attendees and cash phone were shown; no-match search and clearing worked. Live CSV had 11 columns and exactly two distinct one-ticket ₹0 rows with correct cash/free method and confirmed status. It was exported before check-in; both admission values were correctly false then. |
| Invalid scanner input | An unrelated UPI/payment string immediately showed Invalid ticket with **zero network requests** during the observed action. Tool-measured click completion was approximately 603 ms, including automation overhead; this is not a physical-camera decode benchmark. Escape could not dismiss the result; OK was required. |
| Unknown ticket | A syntactically plausible all-zero Evently ID made one verification request and showed No ticket matches that code. Observed action-to-result was approximately 1.97 seconds, including tooling/network; no full-roster request was observed. |
| Admission / duplicates | QA free ticket admitted once; immediate repeat showed Already used. Reload preserved door count 1/2 and the user's checked-in ticket state. Tapping the remaining QA cash guest admitted it, giving 2/2 and Everyone's in. No existing real ticket's admission or cancellation state was changed. |
| Admin | Overview, Events status filters and search recovery, Users role/status filters and no-match recovery, empty Inbox, and Analytics rendered correctly. Current admin role selector was disabled. Five admin pages passed 390 × 844 layout checks. Detailed scope/limits are in [admin report](live-review-admin-2026-10-27.md). |
| Contact | Empty subject/message produced validation errors. No contact message was sent. |
| Mobile/navigation | My bookings, ticket dialog, menu Escape/focus return, search dialog, event results and five admin pages were checked at 390 × 844. Overrides were removed afterward. This is desktop Chrome emulation, not a physical-device test. |

The browser's native QR decoder was unavailable on this desktop. The scanner displayed its manual/roster fallback. Camera permission, camera decoding, physical audio output, poor lighting and device-specific behavior remain untested.

## Authorized production test records and cleanup

The owner approved disposable QA inventory and then explicitly approved exactly two ₹0 bookings and their two emails.

- Event: `6ae0916e6b6ef540ba900da3`, `[QA TEST ONLY] Evently audit 2026-10-27`.
- One free account booking and one cash guest booking, each one ticket and ₹0; both checked in only for the controlled admission test.
- Original event price restored to ₹0. Capacity remains two with two issued tickets.
- Hiding the fixture was correctly refused: **Events with confirmed bookings cannot be hidden. Contact support to arrange cancellation.** The rejection made no partial edit.
- The fixture was then marked as completed in its description and moved to **26 October 2026**. The live page shows **finished** and **Ticket sales for this event have closed**. It no longer appears in the default upcoming list, which again showed only the real event.
- **The event and two test records remain stored**, and the fixture can still be visible when past events are included. Metrics therefore include two extra ₹0 tickets. No permanent deletion, direct database cleanup, real payment/refund or credential change was performed.

Operational follow-up: the current interface has no completed cash/free booking cancellation workflow, so fully removing these issued test records requires a deliberate support/admin cleanup. Do not mistake the protection against hiding confirmed bookings for a defect, or bypass it during this audit. Review a cancellation/cleanup design before implementation.

## Important untested cases

- Fresh Google/password sign-in, signup/OTP resend/verification, expired-token reproduction, password recovery and logout across devices.
- Live Razorpay purchase/capture/refund/webhook/reconciliation. Previous local TEST evidence is not counted as live coverage here.
- Actual positive-value cash sale, refund, cancellation, group admission greater than one on a newly issued fixture, and cross-event rejection using an unused real ticket.
- Other organizer ownership, arbitrary other-user downloads, role changes/suspension, destructive moderation, populated Inbox actions and uploads/deletions.
- Simultaneous last-seat purchases, concurrent/replayed writes, interrupted payment/cash responses, forced provider/network outages, slow/offline requests, rate-limit exhaustion and load testing.
- Physical Android/iPhone camera and audio; screen readers, printing, non-Latin names, very long records and large datasets.
- CSV formula-leading input hardening is a source-review follow-up, not a live reproduced security finding in this audit.

The next step is the owner's choice of fixes. No fixes or repository publication are authorized by this audit report itself.
