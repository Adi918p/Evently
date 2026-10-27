# Evently work log

Last updated: 2026-10-27 (Asia/Calcutta)

## Working agreement

- Read this file at the start of every task, then the relevant AUDIT.md sections and source.
- Update this file after each task with changes, checks/results, unresolved issues and next steps.
- Follow reproduce → implement → test → evaluate → fix/retest when a defect remains. Do not repeat passing checks without a new change or concrete concern.
- Never describe passing tests as proof that the entire website is bug-free or breach-proof. Record external and untested flows explicitly.
- Current authorization: fix the audited defects. Razorpay stays in test mode; the owner will switch to live credentials later. Do not replace secrets or change payment environment.
- 21st scope: Evently only. No project dependency/config/runtime integration was found, so nothing project-specific needed uninstalling. Computer-wide tools and skills were left untouched.

## Current task — direct push to main (complete)

- The owner explicitly requested committing and pushing directly to the supplied
  Adi918p/Evently repository instead of leaving the work in a pull request.
- Fetched origin and verified main still pointed to 4e6aaf7. Fast-forwarded local
  main to the existing tested commits b28216d and 02ced98, then successfully pushed
  main. A fresh remote reference check confirmed origin/main at 02ced98.
  No force push or rewritten history was used. Saved GitHub authentication worked;
  no additional API key was needed.
- GitHub automatically closed PR #1 as merged after the direct push contained its
  commits. The pull-request workflow is no longer pending user action.
- Existing GitHub checks at exact pushed commit 02ced98 passed on the branch and
  pull-request runs (40462904156 and 40462908222): build, syntax, 41 backend and
  8 Chrome browser tests. The main push also started the same workflow. No code
  changed this task, so the already-passing local suites were not repeated.
- Final documentation update is committed directly on main. The checkout is now
  main. No secrets or local integration data were committed. Hosting may react to
  a main push automatically; deployed environment settings and end-to-end flows
  have not been verified in this task. Existing device/deployment limits remain.
- Next: follow the owner's next requested scope; verify the hosted release and
  production integration configuration when deployment work is requested.

## Previous completed task — real repository implementation and verification

- Confirmed X:/EVENTLY is the checkout of Adi918p/Evently. GitHub main and local
  HEAD both started at 4e6aaf7; the authorized audit/integration/scanner work was
  present only as uncommitted changes. Committed the implementation as b28216d
  on codex/evently-audit-scanner-fixes and pushed it to the real repository.
  Draft pull request: https://github.com/Adi918p/Evently/pull/1 (attached to chat).
- Reproduced an additional check-in/refund race: a refund committed between the
  ticket read and conditional admission returned checked-in instead of cancelled.
  The controller now reports the freshly loaded status and handles a missing or
  otherwise changed pass. The regression injects a real transactional refund in
  that interval, checks denial/cancellation and confirms the seat is released.
- Added a GitHub workflow for lockfile installs, production build, syntax checks,
  isolated backend tests and Chrome checkout/scanner/mobile regressions. Added
  local setup/testing instructions to the previously empty README.
- Fresh local checks: 41 backend tests pass after the fix (the new regression
  failed beforehand); all 8 browser tests pass; production build passes. The
  browser suite verified the existing scanner/UI implementation; the new backend
  race is verified separately by its HTTP/database regression. Existing Three.js
  bundle-size and Mongoose deprecation warnings remain non-failing.
- Initial restricted execution could not connect to temporary MongoDB on
  localhost; rerunning with local-process access passed. Evidence:
  audit/repo-backend-results.txt, audit/repo-browser-results.txt,
  audit/repo-build-results.txt and audit/repo-race-before.txt.
- Excluded local account evidence, integration setup notes and loose duplicate
  MP3s from version control. Bundled source MP3s remain included. Account-specific
  evidence referenced in historical entries is available only in the local copy.
- Current parser/media inventory passes (147 script/modules, 20 inline scripts,
  16 JSON and 11 CSS files); JavaScript syntax and compiled stylesheet checks
  pass. Checked 104 staged added/modified files against local credential values
  and common secret patterns: no matches. Removed whitespace from the captured
  failing-test log; no application behavior changed in these final checks.
- GitHub clean Ubuntu checks PASS for implementation b28216d on both push and
  pull-request runs: lockfile installation, build, syntax, all 41 backend checks
  and all 8 Chrome checks. Runs: 40462447322 and 40462608799. Fixture screenshot
  artifacts were produced. The changes have not been merged into main.
- In response to the owner's database question, a fresh read-only ping using the
  configured hosted MONGO_URI passed. Its selected database is named `test`.
  This proves hosted connectivity, not a deployed end-to-end acceptance test.
  Local port 5173 is currently unreachable and the recorded local integration
  process is stopped; the older handoff's running-process note is superseded.
  The regression suites used their own temporary databases. No hosted records
  were read or changed; the connection was closed after ping.
- No production data, credentials, payment mode or hosting configuration changed.
  Next: review/merge the PR when requested, then perform any separately requested
  deployment and device acceptance. Physical-device and deployed integration
  checks remain subject to the requirements below.

## Previous completed task — scanner result popup and supplied sounds

- User requested a scan-result popup, with the next scan allowed only after OK,
  and the supplied success.mp3/error.mp3 with responsive, smooth operation.
- Established the old behavior: inline result, synthetic oscillator tones,
  2.5-second same-code cooldown and no acknowledgement lock. Async camera
  decodes could also overlap. Retained server-confirmed, persisted admission.
- Added an OK-only result dialog for camera, manual entry and guest-list scans.
  Success shows admission details; duplicate/refused/invalid/network failures
  show the actual result. Escape/backdrop do not dismiss it. OK receives focus,
  Tab stays inside, and admission controls/event selection stay disabled.
- A synchronous lock covers verification AND the displayed result. Only OK
  releases it. One decoder runs at a time; stale frames are discarded across
  acknowledgement, stop and event changes. Removed the fixed rescan cooldown;
  retained the live camera between scans and scan at most every 120 ms. Pending
  camera startup is guarded and streams are released on stop/unmount/change.
- Copied the owner's MP3s unchanged into client/src/assets/sounds (SHA-256
  matches the originals). Preload and decode once, unlock audio on a user action,
  use success only for saved admission and error for all other results. OK/mute
  stops old/pending audio so it cannot overlap the next result. Audio loading
  never blocks the popup; failures get a visible message. Mute also works for
  browsers using manual entry only. Root originals remain untouched.
- Verification: production build passes and bundles both MP3 files; browser
  suite passes 8/8 against an isolated temporary MongoDB replica set and Chrome.
  The three scanner checks cover actual admission persistence, repeat rejection,
  OK-only dismissal/focus, actual MP3 bytes decoded and played in a running audio
  context, delayed verification, overlapping/stale frames, network-error recovery,
  invalid QR, mute/unmute, mobile width and camera shutdown. No uncaught browser
  errors. The sound-hash fixture path subsequently moved to the identical bundled
  source assets so the tests do not depend on the loose root copies.
- Controlled-camera OK-to-next-request timings were 25 ms and 34 ms; this is
  browser scheduling latency, not total server/network time or physical-camera
  performance. Evidence: audit/scanner-browser-results.txt. Inspected desktop
  success and mobile error screenshots in audit/scanner-*-*.png. Test processes
  were closed by teardown; no external mail/payment calls were made.
- Remaining check: physical phone/camera QR recognition and audible speaker
  volume at the door. Automated tests used a real video stream with deterministic
  detector results and real Web Audio playback, not a physical lens/speaker test.
  No guarantee of zero latency on a slow network. Existing deployed-release and
  accessibility coverage limits below still apply. Razorpay remains TEST.
- Next: refresh the local scanner to load the new build and perform the device
  acceptance check, or follow the user's next requested scope. No deployment,
  credentials, payment settings or email settings were changed.
- Final checks: changed JavaScript/test syntax and whitespace checks pass. The
  running localhost:5173/scanner returns HTTP 200 and serves the new build.

## Previous completed task — external integrations and Brevo migration

User authorized Razorpay test webhook setup and remaining payment/Google/email
tests, and requested replacing Resend with Brevo. Read INTEGRATION_SETUP.md for
account settings and exact inputs. Razorpay stays in test mode.

- Replaced Resend with Brevo HTTPS email, removed the unused Resend dependency,
  added strict sender/key checks and PDF attachment tests. Brevo failures do not
  fall back silently to Gmail; legacy SMTP requires explicit selection.
- Generated a random RAZORPAY_WEBHOOK_SECRET in ignored local .env without
  printing it. Existing Razorpay keys were not changed. The local harness and
  enabled Razorpay TEST webhook now use the matching secret, verified by actual
  signed provider deliveries. Deployment configuration remains a future task.
- User confirmed LOCAL ONLY. Local .env FRONTEND_URL is now http://localhost:5173.
  Started scripts/local-integration.cjs: built site on 5173, separate local
  replica-set database on 27029, private test JWT, test-only fixtures and no
  automatic email. The configured hosted MONGO_URI was not used or modified.
- A webhook-only relay runs on 8788 and a temporary Cloudflare tunnel is active:
  The temporary URL is recorded in the ignored local integration setup notes.
  It accepts signed webhook bodies and returns 404 for other website/API paths.
  Public connectivity and actual payment.captured, order.paid and refund.processed
  deliveries passed with HTTP 200. See audit/razorpay-webhook-test.json.
- Google start returns 302 with one-use state/cookie and the exact callback
  http://localhost:5173/api/auth/google/callback. Actual account login now passes.
- Brevo IP restriction resolved after the owner approved the current IPv4 and
  IPv6 addresses. Real sender API authentication now passes. Corrected ignored
  .env MAIL_FROM to the account's active verified sender, Evently <event@event-ly.in>.
  The owner explicitly authorized a test inbox and random content. Sent exactly
  one labelled test email with a random sentence and a
  generated TEST-only PDF. Brevo reports delivered (also an opened event).
  Recipient confirmed the attached PDF opens correctly. Evidence:
  audit/brevo-smoke.json. No duplicate email was sent.
- Owner confirmed saving the temporary Razorpay webhook and Google callback.
  Google real sign-in returned redirect_uri_mismatch. A fresh local redirect
  check confirms the callback is http://localhost:5173/api/auth/google/callback
  and the client matches the one configured privately in .env.
  Owner corrected Authorized redirect URIs on that exact client and confirmed
  successful login. The isolated local database contains one active, verified
  Google account. Evidence: audit/google-live-status.json.
- Added tests/brevo-smoke.cjs: read-only sender/API preflight by default, with
  explicit --send for one test PDF email and provider delivery-event checking.
  Added --status to inspect the saved message without sending duplicates;
  exercised it against the accepted message and confirmed delivery.
- Four focused Brevo tests, two relay tests and the complete backend suite pass:
  40 tests, zero failures. The Windows ES-module import was slow; a bounded
  focused check also passed all 11 unit/relay tests. Backend dependency audit
  previously reported zero known vulnerabilities.
  Current inventory/parser/media and whitespace checks pass. Existing six Chrome
  tests are the prior baseline; UI was unchanged in this migration.
- Completed two actual Razorpay-hosted TEST Checkout payments for INR 1 each,
  using its mock netbanking page and fixture contact data. Normal checkout
  captured payment, created exactly one booking/seat, survived refresh and
  downloaded a PDF. Closing Evently's second checkout tab before bank success
  produced zero browser verification requests; background reconciliation still
  confirmed exactly one booking. Both test payments were fully refunded.
- Refund processing and replay were checked with locally signed notifications
  containing actual provider refund entities. The service fetched fresh provider
  state, cancelled each pass and released seats once. Replaying returned 200
  without duplication; refunded PDF access returned 409 and UI hid the pass.
  Final fixture state: zero active bookings and zero seats allocated. Evidence:
  audit/razorpay-live-test.json (all records are TEST, despite the filename).
- Actual Razorpay-originated webhook delivery now PASSES. After the earlier
  empty-list diagnosis and browser-control stop, the owner saved the webhook
  with payment.captured and order.paid. Inspected the enabled Test mode webhook,
  added refund.processed and refund.failed, saved and verified all four events.
- A third INR 1 TEST Checkout payment was completed with Evently's checkout tab
  closed and that purchase's background check deferred 15 minutes. Genuine
  payment.captured and order.paid notifications arrived with HTTP 200 and created
  exactly one confirmed booking/seat. This isolates webhook recovery from the
  browser callback and background worker. Its full test refund generated a genuine
  refund.processed notification (200), cancelled the booking, restored the seat,
  and made PDF access return 409. No local notification was injected for this run.
  Evidence: audit/razorpay-webhook-test.json. All three test payments are fully
  refunded, with zero active fixture bookings and zero seats allocated.
- Local payment/webhook, Google login and Brevo/PDF acceptance checks are complete.
  No application behavior changed this turn; the prior 40-test backend and six
  browser regression results remain valid. Only configuration, evidence and docs
  changed. No production deployment or live-mode payment was performed.

## Previous completed baseline

Implementation is complete for F01–F27, with local regression checks passing.
External release verification remains pending. The per-finding implementation,
evidence and limits are in the remediation matrix at the top of AUDIT.md.
Changes are in the working tree; no commit, deployment or production migration
was performed. Temporary test servers, browsers and MongoDB processes were closed
by the test teardown. Test download caches are ignored by Git.

## Completed tasks

1. **Initial audit:** inventoried all 209 originally tracked files, traced active
   frontend/API/database/integration flows and archived frontend patterns,
   documented 27 findings, and reproduced 15 baseline defects. Added AUDIT.md,
   audit evidence and AGENTS.md continuity instructions. Original audit files
   are historical evidence; the old defect probes are not correctness tests.
2. **Purchases and payment recovery (F01/F02/F06/F07/F10/F13/F17):** immutable
   purchases bind owner/event/amount/currency/tickets/answers; free checkout
   skips the provider; paid fulfillment requires matching captured payment.
   MongoDB transactions commit seats, booking and purchase together. Signed
   webhooks and a durable recovery worker recover interrupted checkout and
   lost order responses. Sold-out/unavailable paid purchases enter refund
   processing. Provider full refunds revoke passes and release seats once.
   Early webhooks cannot regress fulfilled state. Status polling does not
   exhaust checkout mutation limits. Checkout closing-time display matches
   the API's Indian event-time cutoff.
3. **Access and admission (F03/F04/F11/F14/F15/F16/F19):** current account status
   and role are checked on protected requests; check-in is authoritative and
   persisted; pending/cancelled passes are rejected. Google uses an absolute
   same-origin callback, one-use browser state and a short-lived cookie exchange.
   Added OTP caps/cooldown, crypto codes, route limits, bounded public input,
   safe admin serialization/role validation and administrator continuity.
4. **Events/images/data (F08/F09/F12/F18/F21/F27):** ownership-aware transactional
   image references, shared/history retention, MIME magic validation, upload
   budgets/quotas, bounded price/capacity/content, unique bounded question keys,
   immutable snapshots and soft archival. Confirmed-booking events cannot be
   deleted/hidden. Legacy cleanup runs only after saves and reference/path checks.
5. **Customer and organizer UI (F05/F20/F22):** all question types, organizer
   question/ticket settings, purchase-specific status, accurate email state,
   authenticated PDF downloads, description IDs, mobile focus containment,
   background inertness, Escape/backdrop closing and focus restoration.
6. **Search/media/SEO (F23/F24/F25):** on/after date searches, venue/city matching,
   missing gallery reference removed, real crawler 404/503 responses, club
   metadata and a single dynamic sitemap. Support profile copy corrected.
7. **Tests/dependencies/docs (F26):** isolated MongoDB replica-set tests, actual
   Chrome browser flows, payment provider simulator, failure/concurrency tests,
   final vulnerability audits, .env.example and updated DEPLOY.md. Upgraded
   vulnerable dependency versions, including Nodemailer; offline MIME/attachment
   construction is tested.

## Verification — final results

| Check | Result | Evidence/scope |
| --- | --- | --- |
| Backend/utility/email/relay tests | 40 passed, 0 failed | audit/regression-results.txt; isolated MongoDB, no production data |
| Chrome browser tests | 6 passed, 0 failed | audit/browser-results.txt; free/paid-simulated checkout, required answers, refresh, PDF, organizer editing, mobile focus and persisted scanner admission |
| Production frontend build | Pass, 5,926 modules | audit/build-results.txt; existing Three.js size warning remains |
| Compiled Tailwind audit | Pass | No namespace/property mismatches |
| Current inventory/parser/media checks | Pass | audit/validation-inventory.json: 250 tracked/new files, 141 script/module files, 20 inline scripts, 17 JSON, 11 CSS; no parser failures or missing literal active media |
| Git whitespace check | Pass | git diff --check |
| Backend dependency audit | 0 known vulnerabilities | audit/dependency-audit-backend.json |
| Frontend dependency audit | 0 known vulnerabilities | audit/dependency-audit-client.json |
| Actual Razorpay test API smoke | Order create/fetch passed | audit/razorpay-smoke.json; unpaid INR 1 order, no payment or charge |
| Actual Razorpay hosted TEST Checkout | Normal and closed-tab recovery passed; all three payments fully refunded | audit/razorpay-live-test.json and audit/razorpay-webhook-test.json |
| Actual Razorpay webhook delivery | payment.captured, order.paid, refund.processed each returned 200 | audit/razorpay-webhook-test.json; webhook-only recovery produced one booking, then automatic refund cancellation and PDF denial |
| Actual Google login | Passed after redirect URI correction | audit/google-live-status.json; owner confirmation and active verified local account |
| Actual Brevo PDF email | Delivered; recipient confirmed PDF opens | audit/brevo-smoke.json; exactly one authorized message |
| Screenshot review | Desktop/mobile inspected | audit/checkout-desktop.png and audit/menu-mobile.png; isolated fixtures |

The fix/test loop caught and corrected a duplicate import, an overly strict
browser locator, a mobile backdrop issue, refund revocation/replay, early-webhook
state regression and polling-limit interference. Tests were rerun after changes.
Mongoose deprecation warnings are non-failing compatibility follow-ups.

## Remaining work and release requirements

1. **Razorpay:** local TEST checkout/capture, webhook recovery, background recovery,
   full refund, cancellation and replay checks pass. Keep test keys. The temporary
   tunnel must stay running; a new tunnel URL requires updating the existing
   webhook. When deployment is requested, configure its stable HTTPS endpoint
   and matching secret, then repeat the external smoke. refund.failed is enabled;
   an actual provider refund failure was not induced (failure/retry behavior has
   isolated regression coverage).
2. **Google:** local actual login passes. When deployment is separately requested,
   set its FRONTEND_URL and exact allowed callback and repeat through the proxy.
   Do not change the working local origin now.
3. **Email:** Brevo delivery and recipient PDF-opening confirmation pass. Do not
   resend merely to check it; use tests/brevo-smoke.cjs --status. Printer/non-Latin
   layout, simultaneous PDF rendering and deployed queue/email smoke remain
   additional coverage items. Local integration harness automatic email stays off
   to protect fixture recipients; the real authorized send used the Brevo helper.
4. **Deployment:** ensure a MongoDB replica set and required unique indexes;
   back up existing data and review historical pre-fix paid bookings explicitly.
   Verify trusted-proxy settings and upstream protection. Per-process rate
   limits need a shared store or edge enforcement when running multiple APIs.
   Keep the API process awake for recovery. Never automatically rewrite or
   delete production records as part of a test.
5. **Coverage/product follow-ups:** human screen-reader verification, real-device
   camera/animated-image workflows, large-data pagination/load testing, measured
   mobile performance, privileged-action audit trail, and password recovery are
   not claimed complete. Known failed/partial refunds need support review.

## Next prompt procedure

Read this file and the remediation matrix first. Apply the user's newest scope,
continue the relevant pending item, make the result reviewable, run appropriate
checks, and update this log. Preserve Razorpay test mode until the user explicitly
changes it. Full release confidence remains conditional on the external checks
above; do not silently mark them passed.

## Task history

- 2026-10-26: initial audit completed before modifying application behavior.
- 2026-10-26: user authorized audited fixes and repeated testing; Razorpay test
  mode retained; user clarified 21st removal applies only to Evently.
- 2026-10-26: F01–F27 implemented, 40 automated checks passing, build/parser/CSS
  checks passing, both dependency audits clean, real unpaid test order verified.
  External release checks and operational follow-ups recorded above.

- 2026-10-26: Brevo implementation and 38 backend/email tests completed; Resend
  removed; webhook secret generated locally. Actual Brevo preflight returned 401.
  Waiting for a valid API key/authorized test inbox and target deployment details
  before real email, payment/webhook and Google login tests can complete.

### Previous local setup / handoff — superseded by 2026-10-27 results above

- The user reports Brevo/domain DNS setup completed and API key saved. A fresh
  real preflight still returned HTTP 401, now classified from Brevo's response
  as an authorized-IP/security-settings issue. Do not ask for replacement keys
  as the first remedy; approve the current source IP in Brevo or its security
  notification, then rerun tests/brevo-smoke.cjs. No secret was printed.
- Sender verification and delivery remain unconfirmed; EMAIL_TEST_TO is absent.
  Wait for the owner's chosen/authorized recipient before sending real mail.
- Two relay tests pass. Google-start and public signed relay connectivity checks
  pass; evidence: audit/local-integration-status.json and audit/local-tunnel-check.json.
- Computer Use was stopped by the runtime because it could not determine the
  current Chrome URL confidently enough to enforce policy. No dashboard UI
  changes were made. Do not resume app input in that stopped turn.
- Local integration process session 7764 and Cloudflare session 22588 were left
  running for this setup. Check their status before reusing the URL or starting
  another process. Temporary tunnel URLs change after restart. Test state is
  in ignored .cache/local-integration; do not expose its session token.
- Next: resolve Brevo source-IP restriction and get the authorized test inbox;
  add the localhost Google redirect in the OAuth client; configure the Razorpay
  TEST webhook with the URL above and matching secret from local .env, then
  perform actual Checkout/webhook/refund and Google login tests.

### Latest handoff — 2026-10-27

- Scanner follow-up completed after the integration work: OK-only popup, supplied
  MP3s and immediate acknowledgement gating are implemented. Current browser
  baseline is 8 passing tests; see the current-task section and scanner evidence.
- Local Brevo/PDF, Google and Razorpay/webhook checks completed as recorded above.
  Keep Razorpay TEST keys. No pending account-input step for these local checks.
- Local app/Mongo session 7764 and Cloudflare session 22588 remain running.
  Check health before reuse; do not start duplicate servers. Tunnel URL changes
  if restarted. .cache/local-integration/session.json contains a private token;
  never print it or commit the local database/session files.
- Chrome shows the saved enabled Test mode webhook and all four
  active events. Its actual capture/order/refund deliveries returned 200. The
  earlier physical-Escape stop was respected, then work resumed on the next
  user message; no secret/password-manager editing was needed this turn.
- Exactly one Brevo email was sent, and the owner confirmed its PDF opens. All
  three real-provider TEST payments are refunded with their passes cancelled;
  no real money or production data was used. Payment evidence distinguishes the
  earlier local signed replay from the final genuine provider notifications.
- Syntax check for the updated Brevo helper and git diff --check pass. The full
  backend run passed 40 tests. No deployment, commit or production migration.
- 2026-10-27 follow-up: added missing refund webhook events, verified saved Test
  configuration, isolated real webhook fulfillment and automatic refund revocation,
  and recorded final evidence. Payment-test browser/database client are closed;
  local site and tunnel remain available for local testing.
