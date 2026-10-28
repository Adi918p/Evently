# Evently

Event booking, organizer check-in and administration, built with React/Vite,
Express and MongoDB. Payments use Razorpay; transactional email uses Brevo.

## Local setup

Use Node.js 22.12 or later and a MongoDB replica set (including a suitable Atlas
cluster). Purchases use transactions; a standalone MongoDB server is insufficient.

```sh
npm ci
npm --prefix client ci
```

Copy `.env.example` to `.env` and configure your own database, session secret and
optional integration credentials. Keep Razorpay in test mode while validating.
Use `FRONTEND_URL=http://localhost:5173` for local Google login and register that
origin's `/api/auth/google/callback` URL with Google.

```sh
npm start
```

The launcher starts the API and Vite, forwarding API requests through the local
website. See [DEPLOY.md](DEPLOY.md) for the Vercel/Render deployment configuration.

## Verification

```sh
npm test
npm run build
npx playwright install --with-deps chrome
npm run test:browser
npm run test:syntax
```

The backend and browser suites use temporary MongoDB replica sets and fixture
accounts. Payment and email regressions use isolated doubles; no production
database or external payment/email credentials are required. The first run
downloads a MongoDB test binary, and browser tests require installed Chrome and
the production frontend build. The GitHub workflow runs these checks on pushes
and pull requests.

Coverage includes bound purchases, concurrent seat allocation, refunds,
authorization, Google state handling, ticket PDFs, scanner admission persistence,
OK-only scan results, supplied sounds, mobile navigation, event cash sales,
ticket/receipt delivery, summary APIs and stale authentication responses. Physical phone
camera/speaker testing and deployed integration smoke tests remain separate.

Read [WORK_LOG.md](WORK_LOG.md) and [AUDIT.md](AUDIT.md) before changing the project.
Local account-specific integration evidence is excluded from version control.

Organizers can open an event's **Cash desk** from the dashboard or bookings page
to register 1–10 tickets after collecting cash. Ticket emails include an admission
pass and an itemized receipt. `npm run check:email` checks Brevo access and sender
configuration without sending a message.

Organizers manage only the events they own. Administrators can manage all events,
including their guest lists, cash desks and scanners, from **Admin → Events**.
Existing booking and admission safeguards still apply.

Use **Admin → Experience** to create sections, upload up to 12 photos per section,
add image descriptions, choose their display order, and save drafts or publish.
Published sections require at least one image. The public Experience page shows
only these published sections; sample recaps and automatic past-event listings
are removed. Sections and uploaded images persist in MongoDB. Removing a section
releases its unshared images for cleanup while keeping images referenced by
other sections, events or booking history.

For a controlled frontend performance comparison after a build, run
`node tests/performance-smoke.cjs audit/performance-latest.json`. It uses fixed
local event data and cold desktop/mobile Chrome contexts; it does not measure
the live network or a physical phone. The renderer loads only on eligible desktop
showcase pages. Production routing remains at `event-ly.in` and `api.event-ly.in`.
