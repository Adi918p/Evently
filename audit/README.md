# Audit evidence

`file-inventory.json`, `probe-results.json` and `dependency-audit-before.json`
record the original vulnerable baseline. `reproduce-findings.cjs` is historical:
it intentionally asserts that defects exist and is not the regression suite.

Use `npm test` and `npm run test:browser` for current correct-behavior checks.
The latter requires a production frontend build and installed Chrome. Current
results are in `regression-results.txt`, `browser-results.txt`, `build-results.txt`,
`validation-inventory.json`, and the final dependency audit JSON files.
`razorpay-smoke.json` records only an actual unpaid test-order create/fetch.
Screenshots show isolated fixtures, not production users.

Read `WORK_LOG.md` and the remediation matrix in `AUDIT.md` for current scope,
results, and external checks still required. Baseline source line links may have
moved as the implementation changed.

The real-repository verification is recorded in `repo-backend-results.txt`
(41 passing checks), `repo-browser-results.txt` (8 passing checks),
`repo-build-results.txt` and `repo-syntax-results.txt`. `repo-race-before.txt`
records the newly reproduced refund/check-in race before its fix; the passing
regression is included in the backend results. Provider account evidence
(`brevo-smoke`, `google-live-status`, `local-*`, `razorpay-*`) and the local
integration setup notes are intentionally kept out of version control.

The performance/cash/email publication adds `performance-*-results.txt`,
`performance-before.json` and `performance-after.json`. The comparison uses a
built frontend with fixed local API data and cold headless Chrome contexts;
timings are not a production or physical-phone benchmark. Current suites pass
72 backend/API and 10 browser scenarios. `cash-*` screenshots use fixture guests.
Private email preflight/delivery evidence remains excluded from version control.
