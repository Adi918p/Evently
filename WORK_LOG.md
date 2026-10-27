# Evently work log

Last updated: 2026-10-27 (Asia/Calcutta)

## Working agreement

- Read this file at the start of every task, then the relevant AUDIT.md sections and source.
- Update this file after each task with changes, checks/results, unresolved issues and next steps.
- Follow reproduce → implement → test → evaluate → fix/retest when a defect remains. Do not repeat passing checks without a new change or concrete concern.
- Never describe passing tests as proof that the entire website is bug-free or breach-proof. Record external and untested flows explicitly.
- Current authorization: fix the audited defects. Razorpay stays in test mode; the owner will switch to live credentials later. Do not replace secrets or change payment environment.
- 21st scope: Evently only. No project dependency/config/runtime integration was found, so nothing project-specific needed uninstalling. Computer-wide tools and skills were left untouched.

## Current task — performance and repository publication (2026-10-27)

- Owner requested faster pages/processes and publication to Adi918p/Evently,
  explicitly preserving event-ly.in, api.event-ly.in and existing database/hosting
  connections. Deployment secrets and payment mode remain unchanged.
- Established a controlled built-app baseline with fixed local API responses and
  cold Chrome contexts: mobile home loaded 1,519,701 uncompressed JavaScript bytes;
  mobile events/login also downloaded Three.js and created a decorative canvas.
  Home-to-events navigation took 304 ms desktop / 309 ms mobile in this run.
  Evidence: audit/performance-before.json; not a real-phone/network benchmark.
- Restricted ambient WebGL to capable desktop home/experience pages, deferred it
  until after initial rendering, capped animation near 30 FPS and paused it when
  hidden. Operational pages, mobile, reduced-motion and data-saving sessions use
  the existing CSS backdrop. Removed the route-exit wait before mounting pages.
- Public event cards request an optional summary projection (observed response
  2,324 -> 594 bytes on current local data); full list/detail contracts remain.
  Dashboard totals aggregate in MongoDB without fetching QR codes/snapshots.
  City search submits once; auth refresh skips hidden tabs, deduplicates requests
  and avoids resetting unchanged account context. Server permission checks remain.
- GitHub main had three newer commits. Preserve their CI, README, scanner/refund
  race fix and historical logs during integration. Owner completed Git Credential
  Manager device authorization; repository-scoped credentials now select the
  account with write access. No token/password was printed or committed.
- Verification/publication in progress. Initial build passed, but the first
  production comparison exposed shared-chunk hoisting that eagerly loaded Three
  even without a canvas. Correcting that before final tests/push. Final results
  and any remaining limits will be recorded here when complete.

## Previous task — event cash desk and email delivery (2026-10-27)

- User requested per-event cash registration with name, phone, email and at most
  10 tickets, plus repair of signup and ticket emails. Owner selected use of the
  organizer's signed-in device; separate staff accounts were not requested.
- Added Cash desk links to the organizer dashboard and event bookings, opening
  /events/:id/cash. The event owner or an admin can register a guest without
  creating or verifying a user account. Existing event questions still apply.
  Cash sales require an approved, unarchived event and remain open through the
  event day in Asia/Kolkata; online sales retain the existing start-time cutoff.
- POST /api/bookings/cash calculates the current price on the server, checks the
  displayed amount in paise and explicit cash receipt, accepts 1–10 tickets,
  records collector/time and attendee/event snapshots, and commits seats and
  the booking together. Cash and digital sales share the same inventory. The
  actor/request-key index and transaction prevent replay/race duplication.
- The cash form requires cash confirmation again when the amount changes. It
  saves the exact attempt in tab session storage before submitting, refuses to
  submit if recovery storage is unavailable, retains the same attempt through
  connection errors, reloads and recovery rate limits, and remounts on account
  changes. Confirmed sales show the QR, ticket/receipt downloads and email state.
  One QR admits the booked group together. Next guest clears the old attempt.
- Guest names/phones now appear in the roster and scanner, CSV includes phone
  and payment method, and the event roster shows the cash total. Ticket and
  receipt downloads enforce booking/event ownership and confirmed status.
- Added a printable one-page itemized booking receipt, attached alongside the
  ticket PDF. Amounts/details use saved snapshots; no tax/GST information is
  invented. Unique receipt files avoid concurrent overwrite and are deleted
  after email/download. Delivery remains failed/retryable if either PDF fails.
  The worker includes cash guests, records safe error codes/provider IDs and
  preserves its lease when updating delivery status.
- Added failed-email retry to ticket views and POST /api/bookings/:id/email/retry.
  It checks authorization/status and refuses sent, queued or actively leased
  mail, plus legacy bookings outside the supported delivery queue. No bulk
  resend or historical booking rewrite was performed.
- Reproduced Brevo HTTP 401 because the current outbound IPv6 was not authorized.
  Owner added it in Brevo; read-only recheck now returns HTTP 200, authenticated
  API and verified sender. Added `npm run check:email` (never sends), safe mail
  error classification, and signup/resend HTTP 503 diagnostics without provider
  details in public responses. Evidence: audit/email-preflight.json.
- Owner explicitly authorized exactly one new test email to the previously
  selected inbox. Sent the prepared TEST-only ticket and receipt once; Brevo
  reports delivered/opened. No booking/payment was created for this send.
  Evidence: audit/email-delivery-test.json. Recipient PDF-opening confirmation
  for this new two-attachment message remains a user acceptance check.
- Runtime check found system DNS pointing at 127.0.0.1 and refusing Atlas SRV
  resolution (ECONNREFUSED). Public resolver probes succeeded. Added optional
  EVENTLY_DNS_SERVERS in config/db.js/.env.example and set it only in ignored
  local .env to 1.1.1.1,8.8.8.8. It changes this Node process's resolver, not OS
  DNS or TLS verification. The existing nodemon backend reloaded; API/database
  access is restored. Secrets, Google origin and Razorpay TEST keys remain intact.
- Read-only index inspection found missing purchase/cash booking indexes with
  no duplicate purchase groups or existing cash rows. Added only purchase_1
  (unique sparse) and collectedBy_1_cashRequestKey_1 (unique partial cash), with
  zero documents modified and zero indexes dropped. Evidence:
  audit/cash-index-check.json. Runtime frontend/API are HTTP 200, new protected
  routes reject anonymous access with 401: audit/cash-runtime-check.json.
- Verification: final full backend suite 62/62 passes (isolated databases and
  mocked mail/providers), saved in audit/cash-email-backend-results.txt. Build
  passes, 5,930 modules; existing Three.js chunk warning remains. Eight existing
  browser tests passed in the full run; the new cash test first exposed an
  overly strict required-label locator, then passed in focused reruns. Its final
  run checks amount reconfirmation, lost committed response, retry 429, reload,
  one booking/seat increment, blocked-storage refusal, mobile width, roster and
  both PDF downloads. All 9 browser scenarios now pass across full/focused runs.
  Reviewed audit/cash-desk-mobile.png, cash-confirmed-mobile.png and rendered
  receipt previews. Receipt tests cover totals, snapshot retention, concurrent
  filenames and long fields. Changed-file syntax/whitespace checks pass.
- Review caught and fixed loss of the retry key on a recovery 429, stale cash
  acknowledgement after quantity changes, silent storage failure and account
  switching. The legacy retry test initially hit the real limiter; isolated
  limiter state was reset between scenarios and both focused checks passed.
- Current runtime remains Vite :5173 -> nodemon API :8000 -> configured MongoDB;
  the isolated harness is stopped. No deployment/commit/live payment. Remaining:
  user acceptance at a physical cash stall and opening the delivered PDFs; the
  existing non-Latin PDF font/physical scanner/deployment limits still apply.
  A changed outbound IP can require a new Brevo authorization. Next: use
  Dashboard -> event -> Cash desk; failed emails can be retried individually
  from Ticket & receipt. Follow the owner's next scope.

## Previous task — Google sign-in local routing corrected (2026-10-27)

- User reported `Google sign-in expired. Please try again.` when starting Google
  login from localhost:8000. Found two independent apps: ordinary server.js on
  8000 (PID 7148, using the configured hosted database) and the isolated harness
  on 5173 (PID 8712, local database on 27029). Both used FRONTEND_URL=:5173.
  Starting on 8000 therefore saved OAuth state in one database while Google's
  callback reached the other. The shorter error is the missing-record branch
  of utils/oauth.js; localhost cookies can reach both ports.
- Stopped this chat's isolated harness via its terminal session. Confirmed its
  5173/8788/27029 listeners and MongoDB process closed. Started the actual Vite
  frontend with `npm --prefix client run dev -- --strictPort` (session 90518).
  It serves http://localhost:5173 and proxies /api to the existing backend on
  8000. The registered Google callback remains
  http://localhost:5173/api/auth/google/callback. No application source,
  credentials, Google configuration or payment environment was changed.
- Verified the running frontend serves Vite HTML with HTTP 200 and proxied
  /api/events returns JSON with HTTP 200. Fresh OAuth starts from BOTH 8000 and
  5173 issued the expected callback and cookie. Simulated cancellation callbacks
  through 5173 accepted their matching state and redirected to the login page;
  replaying each was rejected with HTTP 400. These probes created/consumed only
  their own temporary OAuth state, made no Google requests and changed no user
  accounts, bookings or payments. No full regression suite was needed for this
  runtime-only correction. Actual Google account sign-in awaits the owner's retry.
- Current runtime: Vite 5173 -> ordinary API 8000 -> its configured database.
  The isolated test harness and webhook relay are STOPPED. Do not run
  `npm run test:local` alongside this stack: it must own 5173 and uses a different
  database. For everyday use open http://localhost:5173/login and start a fresh
  login; old callback URLs are single-use. Next: owner retries Google login,
  then follow the requested work. Cloudflare download blocker remains unchanged.

## Previous task — project review and local startup (2026-10-27)

- Read all project Markdown guidance/setup/audit files: AGENTS.md, WORK_LOG.md,
  AUDIT.md, DEPLOY.md, INTEGRATION_SETUP.md, README.md and audit/README.md.
  Reviewed the F01–F27 remediation matrix, flow/endpoint maps, release limits,
  and existing test/build/inventory evidence. The app is a React/Vite SPA backed
  by an Express API, MongoDB, Razorpay test checkout, Google OAuth and Brevo;
  Public's hand-written HTML is archived/legacy, not the live app.
- Inspected the local harness and launcher before starting anything. No app,
  database or tunnel listeners were active. Started `npm run test:local`, which
  provisions an isolated local MongoDB replica set and test-only fixtures,
  disables automatic email, and serves on loopback port 5173. HEAD request to
  http://localhost:5173 returned HTTP 200. The running terminal session is
  managed by this task; do not start a duplicate harness.
- Tried to prepare a Cloudflare Quick Tunnel for phone access. `cloudflared` is
  not installed or on PATH. Downloading the official Windows binary failed
  certificate validation (`SEC_E_UNTRUSTED_ROOT` / `UntrustedRoot`) through the
  current network trust chain. No TLS verification was bypassed and no tunnel
  was started. The local site remains loopback-only until cloudflared can be
  installed through a trusted path.
- No source code or credentials changed. No tests were run in this review task;
  recorded historical results remain as listed above. Unresolved: temporary
  public phone link requires a trusted cloudflared installation. Next: await the
  user's requested project work; the isolated app was running at this handoff
  and has since been replaced by the frontend proxy described above.

## Current task — scanner result popup and supplied sounds (complete locally)

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
  https://ross-irrigation-subsection-scotland.trycloudflare.com/api/payments/webhook
  It accepts signed webhook bodies and returns 404 for other website/API paths.
  Public connectivity and actual payment.captured, order.paid and refund.processed
  deliveries passed with HTTP 200. See audit/razorpay-webhook-test.json.
- Google start returns 302 with one-use state/cookie and the exact callback
  http://localhost:5173/api/auth/google/callback. Actual account login now passes.
- Brevo IP restriction resolved after the owner approved the current IPv4 and
  IPv6 addresses. Real sender API authentication now passes. Corrected ignored
  .env MAIL_FROM to the account's active verified sender, Evently <event@event-ly.in>.
  The owner explicitly authorized the selected private test inbox and random
  content. Sent exactly one labelled test email with a random sentence and a
  generated TEST-only PDF. Brevo reports delivered (also an opened event).
  Recipient confirmed the attached PDF opens correctly. Evidence:
  audit/brevo-smoke.json. No duplicate email was sent.
- Owner confirmed saving the temporary Razorpay webhook and Google callback.
  Google real sign-in returned redirect_uri_mismatch. A fresh local redirect
  check confirms the callback is http://localhost:5173/api/auth/google/callback
  and the client matches .env (suffix i2rck4ik.apps.googleusercontent.com).
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
- Chrome shows the saved enabled Test mode webhook TsdtLLQYRSnHRM and all four
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
