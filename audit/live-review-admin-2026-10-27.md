# Live admin review — 2026-10-27

## Scope and method

- Website: `https://event-ly.in` in the owner's already authenticated Chrome Work profile.
- Read-only admin UI checks in a separate temporary tab; no local app tests or API/database shortcuts.
- No event moderation, role/status changes, deletion, contact messages, replies, or additional fixtures were performed by this review.
- Desktop and isolated 390 × 844 mobile viewport checks. The viewport override was removed and the temporary tab closed afterward.
- Personal account, contact, message, booking, and QR details are intentionally omitted.

## Results

| Area | Checks actually performed | Result |
| --- | --- | --- |
| Overview `/admin` | Dashboard loads; revenue, tickets, accounts, event summaries and review sections render; desktop/mobile layout has no document overflow. | Pass in observed session. |
| Events `/admin/events` | Default Pending empty state; Approved list; Rejected empty state; All list; deliberately unmatched search; clearing search restores event results. | Pass. No moderation/edit/delete action executed. |
| Users `/admin/users` | Everyone lists the account role controls; unmatched account search gives `No matches`; clearing restores the full list. Organizers and Restricted filters show `Nobody here`; Admins filter shows only administrator accounts. | Pass. Counts correspond to the observed live data; account totals omitted from this public report. |
| Admin account safeguards | Admins filter has no Suspend buttons; current account's Role selector is disabled. | Display checks pass. Backend rejection/other-account changes were not attempted. |
| Inbox `/admin/inbox` | Page loads and gives `Inbox empty` with explanatory copy. | Empty state passes. No messages existed to test search/filter/disclosure/reply behavior. |
| Analytics `/admin/analytics` | Summary cards, account growth, categories, catalogue health, organizers, best sellers and calculation explanation render; ticket and gross-value totals match the contemporaneous overview sample. | Pass for the sample. Private totals omitted. Historical price/cancellation differences are documented by the UI and were not exercised. |
| Mobile layout | Overview, Events, Users, Inbox, Analytics checked at 390 × 844; populated account selectors and event action rows fit within the viewport. Analytics screenshot visually reviewed. | No horizontal document overflow; no clipped account selectors or event actions observed. Admin navigation is horizontally scrollable. |
| Browser console | Captured warnings/errors checked after navigation and mobile checks. | None captured in this review tab. This does not establish that all network requests or all sessions are error-free. |

During the review, Events/Analytics increased from one event to two. The parent audit confirmed creation of its separately authorized, clearly marked test event; this changing live count is not an inconsistency finding.

## Findings and limits

No reproducible admin defect was found in the executed read-only paths. This is not a claim of exhaustive correctness.

Not exercised: approval/rejection/delete success or error paths; role changes/suspension/reactivation; pending/rejected records with content; populated inbox search/read/reply/delete; large-data pagination/performance; concurrent admin changes; backend permission failures; slow/offline/retry behavior; non-Latin or unusually long account/event data; physical mobile browser behavior. These need suitable controlled records or explicit actions beyond this read-only pass.

No source implementation, Git commit, push, or deployment was performed.

## Follow-up: live QA guest CSV

Inspected the CSV downloaded from the parent audit's controlled event: `qa-test-only-evently-audit-2026-10-27-guests.csv` (398 bytes, downloaded 2026-10-27 at 17:31 local time). The private export remains in Downloads and was not added to the repository.

- Header contains 11 expected guest/export columns: Name, Email, Phone, Payment method, Ticket ID, Tickets, Amount, Status, Checked in, Checked in at, Booked at.
- Exactly two data rows and two distinct ticket IDs: one `cash` booking and one `free` booking, both `confirmed`, each one ticket with amount `0`.
- Total is two tickets and amount `0`; both were booked on the audit date. Both have name/email/ticket ID/booking time present. The cash row has a phone value; the free account row has none.
- Both show `Checked in = no` with blank check-in times at export time, consistent with the pre-scanner fixture state.
- No third row or duplicate cash/ticket ID appears in this export. This supports successful cash-recovery deduplication for the observed fixture; it does not establish all concurrency scenarios.
- Only the two expected fixture-shaped booking rows are present. Personal values and ticket identifiers were not copied into this report. Exact identity matching against another authoritative data source was not performed.

This was read-only inspection of the actual live UI download; no production records, source files, or Git state were changed by the check.
