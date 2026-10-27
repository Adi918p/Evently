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
