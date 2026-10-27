# Live public HTTP audit — 27 October 2026

Tested `https://event-ly.in` and `https://api.event-ly.in` from 17:06 to 17:10 IST using **91 sequential GET/HEAD requests**. There were **86 expected outcomes and five deviations**, grouped into the two low-severity findings below. These counts describe HTTP checks, not exhaustive application or security coverage.

Evidence: [live-review-http-2026-10-27.json](live-review-http-2026-10-27.json). No credentials, account details, or private attendee records are included.

## Confirmed findings

**HTTP-01 — Low: missing static files return successful HTML responses.**

| Exact request on `event-ly.in` | Live result | Expected |
| --- | --- | --- |
| `GET /assets/evently-audit-nonexistent.js` | HTTP **200**, `Content-Type: text/html; charset=utf-8`, application shell; `Cache-Control: public, max-age=31536000, immutable` | HTTP 404; do not cache HTML as a fingerprinted JavaScript asset |
| `GET /Media/evently-audit-nonexistent.png` | HTTP **200**, `Content-Type: text/html; charset=utf-8`, application shell; `Cache-Control: public, max-age=0` | HTTP 404 for the missing image |

An invalid or stale asset URL can therefore produce a MIME/import failure with a misleading success status. The nonexistent JavaScript path also receives a one-year immutable cache policy. The actual current entry assets and referenced media tested below were healthy; this finding does not assert an existing broken visible image.

**HTTP-02 — Low: crawler routing treats invalid nested URLs and the cash desk as indexable pages.**

Send `User-Agent: Googlebot` with each request:

| Exact request on `event-ly.in` | Live result | Expected |
| --- | --- | --- |
| `GET /events/000000000000000000000000/not-a-real-route` | HTTP **200**, generic Evently title, self-canonical, `robots: index, follow, max-image-preview:large` | HTTP 404 for an unknown route |
| `GET /clubs/1/not-a-real-route` | Same HTTP 200/indexable generic response | HTTP 404 for an unknown route |
| `GET /events/6a8584c3a89d30e7b03930f4/cash` | Same HTTP 200/indexable generic response | `noindex` for the organizer cash desk, consistent with other account/operator pages |

The event ID above comes from the public event listing. These responses contain generic public text, not attendee information. The impact is incorrect indexing and soft 404s, not demonstrated access to private records. The live robots file also lacks a cash-desk exclusion. Source review points to the nested event/club exception and missing `cash` case in crawler private-path detection; no source changes were made.

## Coverage that passed

- Public page responses, live event summaries/full list/detail, and matching results through the frontend proxy and API subdomain.
- Exact-title, city, venue alias, category, literal regex characters, empty-result, future-date and reversed-date-range filters. Invalid date/category values were ignored without a server error; this behavior was recorded rather than classified as a failure.
- Malformed event ID returned 400; unknown valid event ID and unmatched API route returned 404.
- **11 anonymous protected GET endpoints returned 401**, covering account, organizer data, bookings, admin data, ticket/receipt downloads, and purchase status.
- Dynamic XML sitemap, API-host crawl exclusion, normal event/club crawler metadata, and top-level unknown crawler routes returning 404.
- **27 actual referenced media URLs returned 200 with media content types**, plus the current JavaScript and CSS entry assets. Missing database-backed images correctly returned 404.

## Limits

These checks did not exercise authenticated ownership boundaries, login/OTP delivery, payments, refunds, booking writes, cash collection, admission, email delivery, or destructive operations. Media availability was checked by HTTP, not visual inspection. No direct database access, load test, brute-force test, implementation, commit, or push was performed.

Homepage crawler requests returned the application shell with the expected default metadata rather than the dedicated rendered response. This is an observation, not a confirmed broken share preview. Single-request timing samples are not a load or physical-device performance benchmark. Other audit sections should report authenticated/browser coverage separately.
