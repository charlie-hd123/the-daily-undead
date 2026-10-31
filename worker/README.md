# Account and community statistics operations guide

The Daily Undead remains a static GitHub Pages site. Optional accounts, cross-device saves, verified results, and community statistics are handled by a Cloudflare Worker and D1 database. Supabase handles passwordless email-code authentication; the Worker verifies Supabase session tokens against the project’s published signing keys.

## Live production configuration

- Worker: `daily-undead-stats`
- API: `https://api.thedailyundead.com`
- D1 database: `daily-undead-stats`
- D1 binding: `DB`
- Worker variable: `ALLOWED_ORIGINS`
- Worker variable: `SUPABASE_ISSUER`
- Worker variable: `SUPABASE_HEARTBEAT_URL`
- Server-only secret: `SUPABASE_SECRET_KEY` or existing `SUPABASE_HEARTBEAT_SECRET_KEY`
- Dashboard-managed custom domain: `api.thedailyundead.com`
- `workers.dev` URL: disabled; the custom domain is the only production address
- Observability: invocation logs enabled, traces disabled
- Cron: every 12 hours for Supabase heartbeat and account maintenance; preserve existing server secrets

The frontend API address is the public metadata value in `index.html`; it is not a credential. Cloudflare API tokens and account credentials must never be added to frontend files.

The Worker exposes:

- `GET /health` for a simple health check.
- `GET /api/stats?date=YYYY-MM-DD` for unique players today, total puzzles, and yesterday's per-puzzle results.
- `GET /api/leaderboards?date=YYYY-MM-DD` for the day's verified official-puzzle solves, community player count, and unchanged all-time account progress.
- `GET /api/game-dates?from=YYYY-MM-DD&to=YYYY-MM-DD` for protected Round dates.
- `POST /api/attempts` for a completed current-day Last Words or Quest Steps attempt.
- `GET /api/account?date=YYYY-MM-DD` for a signed-in player's profile and save.
- `POST /api/account/register` to reserve a username and optionally import local progress.
- `PUT /api/account/username` to change a signed-in player's unique public username.
- `PUT /api/account/save` to synchronise personal progress and the current daily state.
- `POST /api/account/results/map`, `POST /api/account/results/bonus`, and `POST /api/account/results/word` for server-verified official daily results.

All `/api/account` routes require a Supabase bearer token. The Worker verifies the ES256/RS256 signature against the configured project's JWKS, then checks issuer, expiry, authenticated audience/role and subject. Browser origins are restricted by `ALLOWED_ORIGINS`. Clerk tokens are rejected in the cleanup candidate; production retains its existing behavior until explicit promotion.

Account saves may include the last cloud revision seen by the browser. D1 increments the revision on every successful save and rejects stale revisions with `409`, preventing pending progress from one device from silently replacing newer progress saved on another device. A player can explicitly resolve that conflict in the browser before retrying.

Save choices affect puzzle state only. Ordinary saves cannot write Score, Solves,
Round, Highest Round or the participation date. Round and Highest Round are
reconstructed immediately from the account's baseline, verified results and
protected-date calendar; successful result responses include that reconstruction.
New-account baselines precede their first puzzle, whereas imported baselines
already include their anchor day's play. Reconstruction uses revision checks so
an older read cannot overwrite a result received concurrently.

The browser automatically loads a newer cloud puzzle when it contains every
queued local action. It compares all puzzle sessions, including just-for-fun
play, and retains a recovery copy. Different guess histories, Blood Ties attempts,
active selections or bonus arrangements remain an explicit choice. Account
totals are shown once in the dialog rather than presented as selectable saves.

## What counts and what is stored

A Quest Steps play is recorded when the player confirms a map. A Last Words play is recorded when its answer is solved or its fifth miss is made. Visiting or refreshing does not create a new attempt, and the bonus order does not create a second Quest Steps attempt.

The browser creates a random local identifier. The Worker hashes it with SHA-256 before D1 storage. D1's `UNIQUE (puzzle_date, player_hash, puzzle_type)` rule is the final protection against repeat submissions from one browser for the same puzzle on one UTC date. Another browser or device can count separately.

The anonymous tables store the puzzle/date, answer map, correct/incorrect map result, hashed browser identifier, and submission time. Account tables retain their original opaque player IDs, stable application account IDs, provider identity mappings, public username, permanent Score and Solves, Round and Highest Round, daily save state, and verified daily results. Verified result awards are idempotent, so a retried request cannot add Score twice. Email addresses and verification codes stay with Supabase Auth and are never stored in D1. Worker invocation logs are a separate Cloudflare operational feature and can contain normal request metadata.

The all-time total started with an estimated 100 historical games from before tracking launched. `migrations/0002_seed_historical_total.sql` documents that one-time baseline and cannot reduce a total that has already passed 100.

## Current schema

The schema is versioned in:

- `migrations/0001_create_attempts.sql` — tables, index, and aggregate trigger.
- `migrations/0002_seed_historical_total.sql` — guarded historical baseline.
- `migrations/0003_create_player_accounts.sql` — profiles, cross-device saves, daily state and verified results.
- `migrations/0004_create_social_profiles.sql` — avatar, theme, favourite map and bio fields.
- `migrations/0005_add_favourite_game.sql` — favourite game field.
- `migrations/0006_scoring_progression_redesign.sql` — permanent Score, idempotent awards and protected game dates.
- `migrations/0007_add_round_reconstruction_anchor.sql` — pre-redesign Round anchor for later reconstruction.
- `migrations/0008_make_result_awards_atomic.sql` — atomic, retry-safe application of verified progression.
- `migrations/0009_round_starts_at_one.sql` — normalises Round numbering.
- `migrations/0010_create_account_identities.sql` — stable app-owned account identities.
- `migrations/0011_add_multi_puzzle_results.sql` — additive puzzle attribution, Last Words misses, and per-puzzle community aggregates.

D1 contains these application tables:

- `attempts` — one accepted browser/date entry per completed map guess.
- `daily_stats` — daily attempt and correct-answer aggregates plus the answer map.
- `community_totals` — the all-time total.
- `player_profiles` — original player ID, stable application account ID and case-insensitive public username.
- `account_identities` — Supabase links plus historical Clerk mappings required for returning migrated players; preserve them.
- `player_saves` — cross-device progression totals and missed-day state.
- `player_daily_saves` — resumable per-day game state.
- `player_daily_results` — one independently verified result per player and UTC date.
- `puzzle_attempts` — one anonymous browser attempt per date and puzzle type.
- `puzzle_daily_stats` — separate daily aggregates and answers for both puzzles.
- `game_dates` — canonical UTC dates that are protected from Round continuity when `counts_for_round = 0`.

The legacy `points_balance` and `revive_count` columns remain private and unused
for audit/rollback safety. They are not player-facing progression. Before the
production redesign is migrated, run the read-only anonymised query in
`analysis/score-migration-preview.sql` and review its effects; do not fabricate
or automatically overwrite historical Score.

`sqlite_sequence` is created by SQLite for auto-increment bookkeeping and should be left alone.

## View entries in the Cloudflare dashboard

1. Sign in to [Cloudflare](https://dash.cloudflare.com/).
2. Open **Storage & databases → D1 SQL Database**.
3. Select **daily-undead-stats → Studio**.
4. Click `attempts` to see raw accepted entries, or create a query and run:

```sql
SELECT
  id,
  puzzle_date,
  answer_map_name AS map,
  CASE is_correct WHEN 1 THEN 'Correct' ELSE 'Incorrect' END AS result,
  created_at
FROM attempts
ORDER BY id DESC;
```

`created_at` is UTC. The long `player_hash` is intentionally unreadable and is useful only for duplicate prevention.

To inspect the daily solve rate:

```sql
SELECT
  puzzle_date,
  attempts,
  correct,
  ROUND(100.0 * correct / attempts) AS solve_percentage,
  answer_map_name
FROM daily_stats
ORDER BY puzzle_date DESC;
```

To confirm the database remains internally consistent:

```sql
SELECT
  (SELECT COUNT(*) FROM attempts) AS raw_attempts,
  (SELECT COALESCE(SUM(attempts), 0) FROM daily_stats) AS stored_attempts,
  (SELECT COALESCE(SUM(is_correct), 0) FROM attempts) AS raw_correct,
  (SELECT COALESCE(SUM(correct), 0) FROM daily_stats) AS stored_correct,
  (SELECT total_games FROM community_totals WHERE id = 1) AS all_time_total;
```

Use `SELECT` queries for routine inspection. Avoid the Studio **Add row** and **Delete row** controls unless intentionally repairing data.

## Local development

Use Node 24 and install the pinned dependencies with `pnpm install --frozen-lockfile`. From the repository root, run:

```sh
npm run dev
```

This starts the complete website at http://localhost:8080 and the real API at http://localhost:8787, applies migrations to local-only `daily-undead-development`, and maintains fictional current-day players/results. Profiles, account saves, leaderboards and community stats share the same local database. Authentication uses the separate staging Supabase project; no writes go to production. Add new source files to Git's index before previewing and refresh the page after changes.

The old separate profile/read-only leaderboard configs are legacy development helpers. They are not used by the full local/staging workflow. See [../STAGING.md](../STAGING.md) for the release commands and environment boundaries.

The **Advance a day** preview never writes to production. The frontend submits only when the puzzle date equals the real current UTC date, and the Worker independently rejects non-current dates.

To simulate a fresh local browser, remove local-storage keys beginning with `the-daily-undead:community-` plus the current `dead-drop:` key. A completed local guess should count once; refreshing must leave the total unchanged.

## Deploy

The Worker now uses several ES modules, so use Wrangler from the repository instead of pasting only `src/index.js` into the dashboard editor. The custom domain is intentionally kept as an existing dashboard-managed target, allowing Wrangler access to stay limited to Worker scripts and D1:

```sh
npx wrangler@latest login
npx wrangler@latest d1 migrations apply daily-undead-stats --remote --config worker/wrangler.jsonc
npx wrangler@latest versions upload --config worker/wrangler.jsonc
npx wrangler@latest versions deploy VERSION_ID@100% --name daily-undead-stats -y
```

Copy `VERSION_ID` from the upload output. `wrangler deploy` is not used here because this Worker's only public target is maintained in the dashboard and is deliberately absent from the file.

Open `https://api.thedailyundead.com/health` and confirm `{"ok":true,"accountsConfigured":true}`. Then verify a read without inserting data:

```sh
curl -i -H 'Origin: https://thedailyundead.com' \
  'https://api.thedailyundead.com/api/stats?date=YYYY-MM-DD'
```

The response should be `200` and include `Access-Control-Allow-Origin: https://thedailyundead.com`.

Treat `worker/wrangler.jsonc` as the source of truth for code, variables and bindings. It keeps the `workers.dev` URL disabled and binds production D1 as `DB`; the existing `api.thedailyundead.com` custom domain remains the one dashboard-managed setting.

## Recreate or verify dashboard configuration

If the Worker ever has to be recreated:

1. Create a D1 database named `daily-undead-stats` under **Storage & databases → D1 SQL Database**.
2. Apply all migrations in filename order with Wrangler. If using D1 Studio for recovery, run every complete statement and keep the `CREATE TRIGGER ... BEGIN ... END;` block together.
3. Create a Worker named `daily-undead-stats` and deploy the Worker directory with Wrangler.
4. Under **Bindings**, add D1 database `daily-undead-stats` with variable name `DB`.
5. Under **Settings → Variables and secrets**, add the text variable:

   ```text
   ALLOWED_ORIGINS=https://thedailyundead.com,https://www.thedailyundead.com
   ```

   Set `SUPABASE_ISSUER` and `SUPABASE_HEARTBEAT_URL` from the environment’s tracked Wrangler configuration. Retain the existing server-only Supabase secret for heartbeat, account metadata and deletion. Use the local Wrangler configuration for localhost development; never substitute production authentication there.

6. Under **Domains**, disable the production `workers.dev` URL.
7. Add the custom domain `api.thedailyundead.com`.
8. Restore the tracked 12-hour cron and existing server-only Supabase secrets. Do not copy production data into staging.

## Production verification after publishing the site

1. Open `https://thedailyundead.com` and confirm all three figures load.
2. Complete the current-day map guess in one browser.
3. Confirm players today and the all-time total each increase by one.
4. Refresh and confirm they do not increase again.
5. Check `attempts` in D1 Studio for exactly one row from that browser/date.
6. The following UTC day, confirm the previous day's solve percentage equals correct attempts divided by all attempts, rounded to the nearest whole percentage.

Statistics errors are deliberately non-blocking. If the Worker or D1 is unavailable, the game remains playable and community figures show `—`.
