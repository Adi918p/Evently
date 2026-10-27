# Live audit fixes — 27 October 2026

The owner authorized remediation after reviewing the live audit. This change addresses LIVE-02/LIVE-03 and reproducible session-loss edge cases related to LIVE-01. Domains, database connections, provider credentials, payment mode and booking/admission rules are unchanged. No production email, booking, admission, cancellation or cleanup was performed during remediation.

## Changes

### Missing static resources

- Express now returns a plain-text, `Cache-Control: no-store` 404 for missing resource directories and file-like paths. Existing files are served first, and legacy `.html` links retain their SPA compatibility behavior.
- Vercel's `/assets/*` misses resolve to a small 404 function. Actual build assets retain filesystem precedence and their one-year immutable caching; the function overrides that policy with no-store for misses.
- Browser/crawler fallbacks exclude file-like paths, including uppercase/unknown extensions, while preserving page deep links, root routing, API/media proxies and legacy HTML links.
- The configuration was parsed by official `@vercel/routing-utils` with no validation error. Its emitted routes place filesystem handling before the asset-miss rewrite and external API proxy.

Vercel documents [filesystem precedence for rewrites](https://vercel.com/docs/project-configuration/vercel-json#rewrites) and [function cache-header precedence](https://vercel.com/docs/caching/cdn-cache#using-vercel-functions). Actual hosted behavior still requires the deployment check below.

### Crawler routing

- Unknown nested event/club paths and private-prefix lookalikes return noindex 404 pages.
- Exact account/operator routes, including `/events/:id/cash`, return noindex without querying public event data.
- Public event/club metadata and legacy redirects remain supported. Missing details are noindex; database-outage responses stay retryable 503s with no-store.
- Public robots.txt now excludes event cash desks.

### Session handling

- A blocked/full browser store now retains a newly issued token in the current tab's memory. Where removal is possible, it removes the older persisted token to prevent restoring the previous account on reload.
- Temporary storage-read failures preserve the last known token.
- Old token decoding, delayed unauthorized responses and stale expiry timers cannot invalidate a replacement session.
- Current-token 401, true expiry and cross-tab sign-out still invalidate authentication. Transient server/network failures do not sign users out.

The original live sign-out's exact cause remains unknown. These are independently reproduced bugs and regression-tested fixes, not proof that they caused that particular incident. A memory-only session cannot survive a full reload; browser storage must be available for persistence. Completely inaccessible storage also cannot be guaranteed cleared across reloads.

## Verification before publication

| Check | Result / evidence |
| --- | --- |
| Static miss regression against old server | Failed with HTTP 200 instead of 404; `live-fixes-static-before.txt` |
| Crawler regression against old renderer | 5 failures out of 6 scenarios; `crawler-routing-before.txt` |
| Session regressions against old code/build | Four initial unit scenarios and both browser scenarios failed; `session-auth-before.txt`, `session-browser-before.txt` |
| Previous-account storage fallback regression | Failed before the additional removal safeguard; `session-storage-before.txt` |
| Final backend/unit/HTTP regressions | **100/100 passed**; `live-fixes-backend.txt` |
| Final browser regressions | **14/14 passed**; `live-fixes-browser.txt` |
| Production frontend build | Passed; `live-fixes-build.txt` |
| JavaScript syntax | 75 files passed; `live-fixes-syntax.txt` |
| Vercel routing transformation | No validation error; `live-fixes-vercel-routes.json` |
| Whitespace | `git diff --check` passed |

The existing build chunk-size and Mongoose deprecation warnings remain non-failing. Tests used isolated local fixtures and mock providers, not live financial/email operations. Generated fixture screenshots are preserved in ignored `.cache/live-fixes-browser-images/` rather than replacing historical audit screenshots.

## Publication and live checks

Pending publication at the time of the implementation commit. Check GitHub CI and deployed responses before treating the hosted defects as resolved. Verify missing asset/media responses, an actual hashed asset, unknown nested crawler URLs, cash-desk noindex, public metadata and the new client bundle. Do not trigger new live bookings or email merely to check this release.

The earlier QA event and its two zero-value issued bookings remain as documented in the live audit. Cash/free cancellation and direct database cleanup are separate operations and were not included in these three fixes.
