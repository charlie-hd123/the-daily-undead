# Scoring redesign launch runbook

This runbook is preparation only. Do not run any production command until Charlie
explicitly approves the live launch. Commands naming `daily-undead-stats`,
`worker/wrangler.jsonc`, `thedailyundead.com` or `main` affect production.

## Release rules

- Use the canonical UTC game date throughout.
- Do not launch across the `00:00 UTC` reset boundary.
- Freeze API writes before taking the final preview or changing the schema.
- Keep the public maintenance page active until every database and API check passes.
- If maintenance materially prevents play, protect the affected UTC game date.
- Never commit generated username/Score output to GitHub.

## Prepared files

- `maintenance.html` — public maintenance page.
- `worker/src/maintenance.js` — temporary API version that returns `503` for all API traffic.
- `worker/wrangler.maintenance.jsonc` — production maintenance API configuration.
- `worker/launch/final-score-preview.sql` — private username-linked final review.
- `worker/launch/opening-score-migration.sql` — backed-up, idempotent Score write.
- `worker/launch/opening-score-verification.sql` — post-write checks and final ranking.
- `worker/launch/opening-score-rollback.sql` — pre-reopening rollback only.
- `scripts/validate-production-launch.mjs` — refuses a release with no fixed launch time.

## Before maintenance

1. Confirm staging on Mac and mobile.
2. Pick the exact launch time and replace
   `__PROGRESSION_UPDATE_LAUNCH_AT__` in `index.html` with its UTC ISO timestamp.
3. Run `node scripts/validate-production-launch.mjs` and the complete test suite.
4. Run the username-linked final preview read-only and privately review its output.
5. Export a fresh production D1 backup into the ignored `backups/` directory.
6. Prepare both Worker versions but do not expose the redesigned website yet.

## Enter maintenance

1. Publish `maintenance.html` as the temporary public homepage and verify it from
   a separate browser or mobile connection. Staging remains available to Charlie.
2. Upload and deploy the version built from `worker/wrangler.maintenance.jsonc`.
3. Confirm `/health` returns `{ "ok": true, "maintenance": true }`.
4. Confirm an API write receives `503`, `maintenance: true` and `Retry-After: 300`.
5. Record the UTC time and decide whether the affected game date must be protected.

No database step begins until the public page and API write freeze are confirmed.

## Database cutover

1. Export D1 again after the write freeze. This is the authoritative rollback copy.
2. Apply migrations `0006`, `0007` and `0008` using the production Wrangler config.
3. Run `worker/launch/opening-score-migration.sql` once.
4. Run `worker/launch/opening-score-verification.sql`.
5. Stop if either `score_below_old_balance` or `negative_scores` is non-zero.
6. Stop if any changed Round, Highest Round or Solves count is non-zero.
7. Confirm `migrated_accounts` equals `accounts` and privately inspect the ranking.
8. Run the opening migration a second time and confirm totals do not change. This
   proves the one-time guard before the site reopens.

## Deploy and verify while the public page stays closed

1. Upload the redesigned production Worker with `worker/wrangler.jsonc` and deploy
   that exact version.
2. Confirm `/health` reports normal operation and `maintenance` is absent.
3. Verify read-only stats, Today leaderboard, All Time leaderboard and one account.
4. Verify the progression launch validator reports the intended two-day popup and
   four-day leaderboard-reminder cutoffs.
5. Publish the redesigned website from the reviewed `scoring-redesign` commit.
6. Verify the real domain on Mac and mobile before removing the maintenance layer.

## Reopen

1. Remove the public maintenance routing/homepage.
2. Confirm the real homepage shows `SCORE | SOLVES | ROUND`.
3. Confirm All Time is ranked by Score and profiles show all four career stats.
4. Complete one controlled current-day result and verify Score changes exactly once.
5. Refresh and confirm it is not awarded twice.
6. Monitor Worker errors, D1 writes and the first live leaderboard entries.

## Rollback boundary

Before reopening, `opening-score-rollback.sql` can restore every backed-up Score.
After reopening and awarding any new permanent Score, do not use that SQL. Restore
from the authoritative D1 backup or perform a reviewed forward repair instead.

## Staging rehearsal record

Rehearsed against isolated staging on 2 October 2026:

- maintenance API returned `503` with `Retry-After: 300` for writes;
- all eight staging accounts received the migration marker;
- zero Scores fell below the previous Points balance;
- zero Round, Highest Round or Puzzle Solves values changed;
- the second migration run wrote zero rows and left the Score total unchanged;
- the rollback restored all eight backup rows;
- the migration was reapplied successfully;
- the normal staging API and leaderboard were restored afterward.
