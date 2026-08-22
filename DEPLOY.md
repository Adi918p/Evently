# Deploying Evently to Render

Evently deploys as **one Render Web Service**. Express is the only process: it
serves the API under `/api`, the legacy media folders, and the built React app.
There is no second service and no static site — so there is no CORS setup, one
custom domain, and one deploy to keep track of.

## How the single service fits together

`server.js` mounts things in this order, and the order matters:

1. `/api/*` — all the JSON routes. Registered first so a page route can never
   shadow an endpoint.
2. `/uploads` and `/Media` — files still on disk under `Public/`. Note that
   `Public/` as a whole is deliberately **not** served; mounting it would let
   `Public/Login.html` answer `/login.html` before React could.
3. `client/dist` — the Vite build, with fingerprinted `assets/` cached for a
   year and `index.html` marked `no-cache`.
4. An `/api` catch-all that 404s in JSON, so a bad endpoint never returns HTML
   that the client would try to parse as JSON.
5. The SPA fallback, which sends `client/dist/index.html` for any other GET.

`client/dist` is gitignored. It is **built on the server at deploy time**, which
is why the build command below is not optional. If it is missing, the app still
boots and every page returns a plain-text 503 explaining that the front end has
not been built — that message is the signal that the build command is wrong.

## Render dashboard settings

| Setting | Value |
| --- | --- |
| Environment | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Node version | pinned to 22 by `.node-version` |

The build command is the one thing most likely to still be on Render's default
of `npm install`, left over from when the front end was hand-written HTML that
needed no build step. On its own it does not produce `client/dist`.

`npm run build` resolves to:

```
npm --prefix client ci --include=dev && npm --prefix client run build
```

`--include=dev` is load-bearing. Render sets `NODE_ENV=production`, and npm then
skips devDependencies — but `vite`, `@vitejs/plugin-react` and `tailwindcss` are
all devDependencies of `client`. Without the flag the install "succeeds" and the
build immediately fails with `vite: not found`.

## Environment variables

These must exist on the Render service. Values live in the dashboard, never in
git — `.env` is gitignored.

`MONGO_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`,
`EMAIL_USER`, `EMAIL_PASS`, `FRONTEND_URL`

Do **not** set `PORT`. Render assigns it and `server.js` already reads
`process.env.PORT`.

`FRONTEND_URL` must be `https://event-ly.in` — no trailing slash. It is used in
exactly one place, the Google OAuth success redirect in `routes/auth.js`, which
sends the browser to `${FRONTEND_URL}/login.html?token=...`. That `.html` path
looks wrong but is intentional: it is baked into the registered Google
credential, and `client/src/routes/legacy.jsx` rewrites it to the SPA login
route. Changing it means re-registering with Google, so leave it alone.

In Google Cloud Console, the authorised redirect URI must be
`https://event-ly.in/api/auth/google/callback`. The strategy itself uses a
relative `callbackURL`, so it adapts to whatever host serves it — only Google's
allowlist is absolute.

## Local development

Two terminals, two ports — this is a dev-only arrangement and does not resemble
production:

```
npm run dev          # Express + nodemon on 8000
npm run dev:client   # Vite on 5173
```

Work against **http://localhost:5173**. Vite proxies `/api`, `/Media` and
`/uploads` through to 8000, so the browser sees a single origin exactly as it
will in production, and relative fetches like `/api/events` work unchanged in
both places.

To check the real production path locally, run `npm run build` then `npm start`
and use http://localhost:8000 — that serves the built bundle through Express,
which is what Render does.

## When a deploy misbehaves

**Plain-text 503, "The front end has not been built yet"** — the build command
did not produce `client/dist`. Check it is `npm install && npm run build`, then
read the build log for `vite: not found`.

**`npm ci` exits with `lock file out of sync`** — `client/package-lock.json` is
behind `client/package.json`. Run `npm --prefix client install` locally and
commit the updated lockfile. `ci` will not repair it for you, by design.

**Build is killed partway through** — a Three.js bundle is memory-hungry and the
free instance type has little headroom. `vite.config.js` already splits `three`
and `motion` into their own chunks, which helps; if it persists the fix is a
larger instance, not a config change.

**A page 404s only after a hard refresh** — the SPA fallback is not being
reached. Almost always a new `app.use` registered after it in `server.js`;
the fallback has to stay last.

**API returns HTML instead of JSON** — a request went past the `/api`
catch-all, meaning the route was mounted after it. Check mount order.
