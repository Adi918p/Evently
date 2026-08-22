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

### Environment variable

`VITE_API_ORIGIN` = `https://api.event-ly.in`

Vite inlines `VITE_*` vars at build time, so changing this needs a redeploy, not
a restart. It is read in exactly one place — the Google OAuth start URL. Leave
it unset locally so the value stays empty and the Vite dev proxy handles it.

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
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`,
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

In Google Cloud Console, the authorised redirect URI must be:

```
https://api.event-ly.in/api/auth/google/callback
```

The strategy in `config/passport.js` uses a *relative* `callbackURL`, so it
adapts to whichever host serves the request. Only Google's allowlist is
absolute, and it must match byte for byte.

The full round trip, worth reading once because it looks wrong in the middle:

1. User clicks "Continue with Google" on event-ly.in. The button navigates to
   `https://api.event-ly.in/api/auth/google` — straight to the API host, not
   through the proxy. This is the one place `VITE_API_ORIGIN` is used.
2. Render redirects to Google. Google returns to the callback above.
3. Render signs a JWT and redirects to
   `${FRONTEND_URL}/login.html?token=<jwt>`.
4. Vercel serves the SPA for `/login.html`, and
   `client/src/routes/legacy.jsx` rewrites it to `/login`, which reads the token
   out of the query string and stores it.

Step 3's `.html` path is deliberate and is baked into the deployed server.
`legacy.jsx` exists partly to absorb it. Don't "tidy" either end without
changing both.

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
match `https://api.event-ly.in/api/auth/google/callback`.

**`npm ci` fails with `lock file out of sync`** — `client/package-lock.json` is
behind `client/package.json`. Run `npm --prefix client install` locally and
commit the lockfile. `ci` will not repair it, by design.

**The Render build gets killed** — the Three.js bundle is memory-hungry and the
free instance has little headroom. `vite.config.js` already splits `three` and
`motion` into separate chunks; beyond that it needs a larger instance.

## Rolling back to one host

Point the apex `event-ly.in` back at Render and clear nothing else. Render is
still building and serving `client/dist` with a working SPA fallback, so it
serves the whole app unaided. `VITE_API_ORIGIN` being baked into the Vercel
bundle does not matter, because nobody is being served that bundle.
