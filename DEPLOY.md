# Deploying Evently

Two hosts, one apparent origin:

- **Vercel** builds and serves the React app in `client/`, and owns
  **event-ly.in**.
- **Render** runs Express and MongoDB access, and owns **api.event-ly.in**.

The browser only ever talks to event-ly.in. `client/vercel.json` rewrites
`/api`, `/Media` and `/uploads` through to the Render host at the edge, so from
the page's point of view everything is same-origin.

That single decision is what keeps this simple. Because there is no
cross-origin request:

- No CORS configuration. (`cors` is in `package.json` but is deliberately not
  mounted — the API is never called cross-origin, and leaving CORS off means a
  browser on someone else's site cannot read responses from api.event-ly.in
  even though it is publicly reachable.)
- No preflight `OPTIONS` on every mutating request.
- No `exposedHeaders` needed for `Content-Disposition`, so ticket PDFs keep
  their real filenames.
- No client code changes. Every call in `client/src/lib/api.js` stays relative.

The cost is one network hop: browser → Vercel edge → Render. Worth knowing when
reading timings, and worth revisiting if it ever shows up in practice.

## Vercel project settings

| Setting | Value |
| --- | --- |
| Root Directory | `client` |
| Framework Preset | Vite |
| Build Command | `npm run build` (the default) |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Node version | 22.x |

Root Directory is the setting people miss. The repo root is the Express app; the
Vercel project must be pointed at `client/`, which is also why `vercel.json`
lives there rather than at the root.

### Browser API origin

All API calls, including Google sign-in, use the current website origin.
Remove obsolete VITE_API_ORIGIN from Vercel settings; the application no longer
reads it. OAuth state and exchange cookies must stay on the same site.

Note that the rewrite destinations in `vercel.json` are hardcoded. `vercel.json`
does not interpolate environment variables, so the API host appears there
literally. If the API domain ever changes, that file changes too.

## Render service

Unchanged from the single-service setup, and still building the frontend. That
is intentional: it costs one build step and means Render can serve the whole app
on its own if Vercel is ever in the way. Rolling back is a DNS change, not a
redeploy.

| Setting | Value |
| --- | --- |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Node version | pinned to 22 by `.node-version` |
| Custom domain | `api.event-ly.in` |

`npm run build` resolves to
`npm --prefix client ci --include=dev && npm --prefix client run build`.
`--include=dev` is load-bearing: Render sets `NODE_ENV=production`, npm then
skips devDependencies, and `vite`, `@vitejs/plugin-react` and `tailwindcss` are
all devDependencies of `client`. Without it the install "succeeds" and the build
fails with `vite: not found`.

Do **not** set `PORT` — Render assigns it and `server.js` reads it.

### Environment variables

`MONGO_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `BREVO_API_KEY`, `MAIL_TRANSPORT`, `MAIL_FROM`, `MAIL_FROM_NAME`,
`EMAIL_USER`, `EMAIL_PASS`, `FRONTEND_URL`

`FRONTEND_URL` must be `https://event-ly.in` — the Vercel domain, no trailing
slash. It is not where the API lives; it is where the API sends people *back*
to after Google sign-in. Pointing it at api.event-ly.in is the mistake to avoid,
and it fails in a confusing way: sign-in appears to work, then dumps the user on
the API host.

## DNS

| Record | Points at |
| --- | --- |
| `event-ly.in` (apex) | Vercel — use the A / ALIAS record Vercel shows you |
| `www` | Vercel |
| `api` | CNAME → the `.onrender.com` hostname Render shows you |

Add `api.event-ly.in` as a custom domain in Render **before** moving the apex to
Vercel. Until `api` resolves and has a certificate, a Vercel deploy has nothing
to rewrite to and every request fails.

## Google OAuth

Register this exact authorized redirect URI in Google Cloud Console:

```text
https://event-ly.in/api/auth/google/callback
```

The strategy derives an absolute callback from FRONTEND_URL; it does not infer
HTTP/HTTPS from proxy headers. Locally, set FRONTEND_URL=http://localhost:5173
and allow http://localhost:5173/api/auth/google/callback in the Google client.
For a built app served directly on port 8000, use that origin consistently.

1. The browser opens /api/auth/google on the website origin.
2. The API stores a short-lived, single-use state record and HttpOnly cookie.
3. Google returns through the same website proxy. The API checks both state
   and the account's current status before issuing a short-lived handoff cookie.
4. /login?oauth=complete exchanges that cookie once for the bearer token.
   Tokens are never put in redirect query strings.

The proxy must forward Set-Cookie unchanged and must not cache auth responses.
Existing old token-query callbacks are intentionally no longer accepted.

## Local development

Unaffected by the split. Two terminals:

```
npm run dev          # Express + nodemon on 8000
npm run dev:client   # Vite on 5173
```

Work against **http://localhost:5173**. Vite proxies `/api`, `/Media` and
`/uploads` to 8000 — the same shape as the Vercel rewrites in production, which
is why relative fetches work identically in both places.

To exercise the Render path instead, `npm run build && npm start` and use
http://localhost:8000.

## When something breaks

**Every API call 404s, and the response is HTML** — the SPA catch-all in
`vercel.json` swallowed the request, meaning the `/api` rewrite above it did not
match. Rewrites are evaluated in order and the catch-all must stay last.

**API calls 502 from Vercel** — Render is asleep or redeploying. `lib/api.js`
already special-cases a bodyless 5xx into "the server isn't responding", because
a proxy returns exactly that while the upstream restarts.

**Event images are broken but the page loads** — the `/Media` or
`/api/images` rewrite is missing. Image paths are stored in MongoDB as
app-relative strings (`/api/images/<key>`, `/Media/...`) and rendered straight
into `src`, so they depend on the rewrites just as much as `fetch` does.
`/uploads/...` paths are legacy: that folder is gitignored and Render's disk is
wiped each deploy, so those images are already gone and the rewrite only exists
so the URL resolves rather than hitting the SPA.

**Google sign-in ends on api.event-ly.in** — `FRONTEND_URL` is wrong on Render.

**Google returns `redirect_uri_mismatch`** — the Console entry does not exactly
match `https://event-ly.in/api/auth/google/callback`.

**`npm ci` fails with `lock file out of sync`** — `client/package-lock.json` is
behind `client/package.json`. Run `npm --prefix client install` locally and
commit the lockfile. `ci` will not repair it, by design.

**The Render build gets killed** — the Three.js bundle is memory-hungry and the
free instance has little headroom. `vite.config.js` already splits `three` and
`motion` into separate chunks; beyond that it needs a larger instance.

## Rolling back to one host

Point the apex `event-ly.in` back at Render and clear nothing else. Render is
still building and serving `client/dist` with a working SPA fallback, so it
serves the whole app unaided. Keep FRONTEND_URL and the Google callback on the
apex origin.

## Purchase integrity and recovery

MongoDB must be a replica set (including Atlas) or a supported sharded cluster.
Booking creation, seat allocation, purchase state and event/image edits use
transactions; a standalone database is intentionally not supported for writes.
Back up the database before deployment. Ensure Mongoose can create indexes and
confirm unique indexes on purchases (user/requestKey, orderId, paymentId),
bookings (purchase, ticketId, paymentId, orderId) and OAuth handoff hashes before
opening checkout. Resolve any existing duplicates explicitly; do not drop data
or indexes as a shortcut. Existing bookings are not rewritten by this release.

The API creates an immutable purchase before opening Checkout. Only a matching
captured payment can fulfill it. A zero-price event uses the free-booking API.
The browser receives a specific purchase ID and can resume its status from My
bookings. Changing an event's price/questions does not change a paid purchase's
stored details. Sales close at the event start time in Asia/Kolkata, or at the
end of that date when the event has no time.

Keep the current Razorpay **test** keys until the owner chooses to switch. Set
RAZORPAY_WEBHOOK_SECRET separately and configure a test-mode webhook at:

```text
https://event-ly.in/api/payments/webhook
```

Subscribe to payment.captured, order.paid and refund.processed/refund.failed.
The handler validates the signature over the raw body, then retrieves current
provider state. Do not put the bearer-auth middleware in front of this route.
Use automatic capture or configure capture in Razorpay; an authorized payment
does not issue a pass. See [Razorpay's integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
and [webhook validation/testing](https://razorpay.com/docs/webhooks/validate-test/).

The Express process runs recovery every 30 seconds: it revisits unfulfilled
purchases, recovers lost order responses by receipt, and retries full refunds
when payment succeeds after seats or eligibility disappear. Retries use durable
database state and leases. Keep the API process running; a sleeping host delays
recovery. A known failed refund remains pending for operator review rather than
creating another refund repeatedly. A full refund reported for an issued pass
atomically cancels it and releases its seats. Partial refunds do not cancel the
whole booking automatically and need an explicit support decision. Subscribe to
refund webhooks so dashboard refunds reach Evently.

Ticket email delivery has up to five background attempts. Downloading a PDF
remains available to the booking owner if mail fails. Monitor failed deliveries
and refund_pending purchases. Historical purchases made with a different
Razorpay environment are not reconciled with the new environment's keys; settle
test purchases and outstanding refunds before switching. Use a fresh webhook
secret and matching keys for the new environment.

Events with confirmed bookings cannot be deleted or hidden. Unsold events are
archived, preserving records. Existing administrator accounts cannot be demoted
or suspended through these endpoints; account-owner maintenance is required.
Uploaded images must be owned by the editor; referenced shared/historical images
are retained. Legacy file deletion is opt-in and runs after successful saves.

## Verification and remaining release checks

```text
npm ci
npm --prefix client ci
npm test
npm --prefix client run build
npm run test:browser
node audit/inventory.cjs
npm audit
npm --prefix client audit
```

The tests start a fresh local MongoDB replica set; they do not use MONGO_URI or
production records. The first run downloads a MongoDB binary into .cache.
Browser tests use installed Chrome, the production build and simulated Razorpay
callbacks; external browser requests are blocked. The optional
`node tests/razorpay-smoke.cjs --test-mode` creates an unpaid order using the
configured test keys. It refuses live keys and does not create a payment.

Before release, finish an actual Razorpay test payment, verify capture/webhook
delivery, close the checkout before its callback and confirm recovery, exercise
a refund, complete Google sign-in through the deployed proxy, and confirm a
real ticket email arrives. RAZORPAY_WEBHOOK_SECRET was absent in the local
configuration reviewed on 2026-10-26; it must be supplied by the owner. Google
Console also needs the updated callback above. No real payment capture, email
send, production database operation or deployment was performed by these tests.

API limits use per-process memory plus persistent OTP attempt/cooldown records.
Configure TRUST_PROXY only for known proxies after checking the real ingress
path. Leaving it unset can group proxied visitors under a shared IP; trusting
unverified forwarding headers lets callers evade limits. Use a shared rate-limit
store or edge protection when scaling to multiple API instances. Monitor and
review the deployed host configuration; local passing tests are not a security
certification. The existing large Three.js chunk warning remains a performance
measurement item, not a failed build.

## Current email provider and external test setup

Brevo is the default transactional email provider. The Resend integration has
been removed. Complete the sender/key setup in [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md)
before deploying this mailer change. The same guide records the exact webhook
and Google configuration dependencies; choose the intended public origin first.

## Cash desk and delivery update (2026-10-27)

The organizer dashboard and each event's bookings page link to `/events/:id/cash`.
The owner/admin enters guest name, phone, email and 1–10 tickets, confirms the
cash collected and receives an ordinary scanner-compatible group pass. The guest
does not need an account. Cash sales close at the end of the event day in India;
online sales retain their existing cutoff. Keep the signed-in organizer device
with the trusted operator. No separate staff permissions are implemented.

Before enabling cash sales on another database, ensure the bookings collection
has the unique partial index `{ collectedBy: 1, cashRequestKey: 1 }` restricted
to `{ paymentMethod: 'cash' }`, and the existing unique sparse purchase index.
Do not drop indexes or rewrite historical bookings to resolve a conflict.
These missing indexes were added to the current configured database without
altering records. Cash fixtures and concurrency tests used isolated databases.

Ticket emails now attach both the admission pass and an itemized booking receipt.
Failed delivery can be queued again from the ticket view. Already sent/pending
mail cannot be resubmitted by that endpoint. Older bookings outside the durable
purchase/cash queue require support review. Run `npm run check:email` for a
read-only Brevo sender/authentication check; it never sends a message. Brevo's
authorized IP list must include the server's current outbound address.

If a local resolver refuses MongoDB Atlas SRV/TXT queries, the optional
`EVENTLY_DNS_SERVERS` setting changes DNS for the Evently Node process only.
It is configured locally after diagnosing a failed loopback resolver. Leave it
unset on hosts whose normal DNS works; it does not disable TLS verification.
