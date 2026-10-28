# Event access and Experience management

Date: 2026-10-28 (Asia/Calcutta).

The owner requested organizer access restricted to their own events, administrator
access across events, removal of the sample Experience sections, and an admin
panel for managing sections and photos. Existing repository publication authority
continues. Production domains, connection settings, credentials and payment mode
are unchanged.

## Event access

Existing event edit/manage/roster/cash/scanner checks enforce organizer ownership.
Four failures were reproduced before the changes (event-access-before.txt):
administrator event selectors and statistics were scoped to the admin's own
events; a demoted organizer still obtained attendee PDFs; an orphaned event owner
caused the guest-list endpoint to fail with 500.

Administrators now see all nonarchived events in the operational dashboard and
scanner, with historical totals across organizers. Admin Events provides direct
Bookings, Cash desk and Scanner links. The scanner preselects the linked event
only if it is in the authorized list. Organizers still see/manage only their own
events. Ticket, receipt and email-retry access now requires the current organizer
role as well as event ownership, or the buyer/admin role as appropriate. Existing
confirmed-booking and admission safeguards still apply to admins.

## Experience content

The five recaps were frontend constants, not saved database sections. A read-only
database inspection found no matching sample events and no Experience/recap/section
collections; it verified the same dataset using both public event IDs. No database
deletion was needed. Real event/booking records and the previous QA fixtures were
not changed.

The active Experience page now displays only published ExperienceSection records.
The automatic past-events shelf is removed; there is a clear empty state until
real photos are published. No seed data or invented events/photos were added.

Admin → Experience supports:

- Section titles/descriptions, ordering, draft and published states.
- Up to 12 JPG/PNG/WebP/GIF photos per section through existing compressed uploads.
- Image descriptions, ordering/removal, preview, editing and confirmed deletion.
- Publish validation requiring a photo, upload progress and preserved form input
  on save failures.

Sections and bytes persist in MongoDB. Section/image changes commit atomically.
Shared images remain retained across sections, events, bookings and purchases;
unreferenced removed images use the existing 24-hour cleanup TTL. Admin-only
routes use current-account authorization; public responses exclude drafts and
internal fields. The admin route is noindex, and the existing robots exclusion
for /admin covers the new page.

## Verification

| Check | Result |
| --- | --- |
| Production frontend build | Pass |
| Full backend suite | 119/119 pass |
| Full Chrome browser suite | 18/18 pass |
| JavaScript syntax | 78 files pass |
| Desktop/mobile screenshots | Inspected; no horizontal overflow in tested widths |
| Production data inspection | Read-only; zero placeholder matches, zero writes |

New coverage includes the authorization matrix, stale organizer roles, orphaned
ownership, published/draft separation, validation, missing-image rollback, shared
image retention, concurrency and failure rollback. Browser coverage exercises the
actual admin create/upload/edit/publish/unpublish/delete flow, photo modal focus,
failed-save recovery, public loading/error/empty states and admin event links.

Fixture tests use temporary replica sets and block external browser requests.
No real email, payment, cash sale or admission was performed. Existing Vite chunk
size and Mongoose deprecation warnings remain. These checks are not a claim that
every possible application case or physical phone has been tested.

## Publication

Implementation commit `e77cf9e7ddf109647480819caf97f0736be60e2b` was pushed normally
to main. [GitHub Actions 40663324953](https://github.com/Adi918p/Evently/actions/runs/40663324953)
passed, and Vercel Production deployment 7381536021 succeeded for that exact commit.

All 13 bounded live HTTP checks passed: both website/API hosts expose the empty
published Experience list; anonymous admin access returns 401; the admin crawler
page is noindex; existing event listings remain available. Deployed entry JS/CSS
and Experience/AdminExperience bundles match the tested local build byte-for-byte.

Live Chrome confirms the empty Experience state, absence of sample recaps and the
automatic archive, and regular-user denial for the editor. No captured console
warnings/errors. A connected admin browser session was unavailable, so no live
editor mutation was performed; the full editor workflow was tested with isolated
fixtures. The user can now add real photos at
[Admin → Experience](https://event-ly.in/admin/experience).

Evidence: experience-access-publication.json, experience-access-live-http.json
and experience-access-live-browser.json. The final follow-up commit contains only
documentation/evidence; successful CI and live checks above refer to the tested
implementation commit.
