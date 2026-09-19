# Account and community statistics operations guide

The Daily Undead remains a static GitHub Pages site. Optional accounts, cross-device saves, verified results, and community statistics are handled by a Cloudflare Worker and D1 database. Clerk handles email-code authentication; the Worker verifies Clerk session tokens without storing a Clerk secret.

## Live production configuration

- Worker: `daily-undead-stats`
- API: `https://api.thedailyundead.com`
- D1 database: `daily-undead-stats`
- D1 binding: `DB`
- Worker variable: `ALLOWED_ORIGINS`
- Worker variable: `CLERK_ISSUER`
- Worker variable: `CLERK_AUTHORIZED_PARTIES`
- Dashboard-managed custom domain: `api.thedailyundead.com`
- `workers.dev` URL: disabled; the custom domain is the only production address
- Observability: invocation logs enabled, traces disabled
- Cron triggers, queues, routes, build hooks, and secrets: none

The frontend API address is the public metadata value in `index.html`; it is not a credential. Cloudflare API tokens and account credentials must never be added to frontend files.

The Worker exposes:

- `GET /health` for a simple health check.
- `GET /api/stats?date=YYYY-MM-DD` for players today, total games, and yesterday's result.
- `POST /api/attempts` for a completed current-day map guess.
- `GET /api/account?date=YYYY-MM-DD` for a signed-in player's profile and save.
- `POST /api/account/register` to reserve a username and optionally import local progress.
- `PUT /api/account/save` to synchronise personal progress and the current daily state.
- `POST /api/account/results/map` and `POST /api/account/results/bonus` for server-verified daily results.

All `/api/account` routes require a Clerk bearer token. The Worker verifies the RS256 signature against Clerk's published JWKS, then checks the issuer and authorized browser origin (`azp`).

## What counts and what is stored

A play is recorded only when the player confirms a map. Visiting, refreshing, revealing clues, choosing a game, or completing the bonus order does not create a new attempt.

The browser creates a random local identifier. The Worker hashes it with SHA-256 before D1 storage. D1's `UNIQUE (puzzle_date, player_hash)` rule is the final protection against repeat submissions from one browser on one UTC date. Another browser or device can count separately.

The anonymous tables store the puzzle/date, answer map, correct/incorrect map result, hashed browser identifier, and submission time. Account tables store an opaque Clerk user ID, public username, game progress, daily save state, and verified daily results. Email addresses, passwords, and verification codes stay with Clerk and are never stored in D1. Worker invocation logs are a separate Cloudflare operational feature and can contain normal request metadata.

The all-time total started with an estimated 100 historical games from before tracking launched. `migrations/0002_seed_historical_total.sql` documents that one-time baseline and cannot reduce a total that has already passed 100.

## Current schema

The schema is versioned in:

- `migrations/0001_create_attempts.sql` — tables, index, and aggregate trigger.
- `migrations/0002_seed_historical_total.sql` — guarded historical baseline.
- `migrations/0003_create_player_accounts.sql` — profiles, cross-device saves, daily state and verified results.

D1 contains these application tables:

- `attempts` — one accepted browser/date entry per completed map guess.
- `daily_stats` — daily attempt and correct-answer aggregates plus the answer map.
- `community_totals` — the all-time total.
- `player_profiles` — Clerk user ID plus the case-insensitive public username.
- `player_saves` — cross-device progression totals and missed-day state.
- `player_daily_saves` — resumable per-day game state.
- `player_daily_results` — one independently verified result per player and UTC date.

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

Install a current Node.js release, then run these commands from the repository root.

Apply the schema to local-only D1 storage:

```sh
npx wrangler@latest d1 migrations apply daily-undead-stats --local --config worker/wrangler.jsonc
```

Start the local Worker and D1 in terminal 1:

```sh
npx wrangler@latest dev --config worker/wrangler.jsonc
```

Start the static site in terminal 2:

```sh
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). Localhost always uses `http://localhost:8787`, regardless of the production API URL in `index.html`. If the local Worker is unavailable, the game continues normally and community figures show `—`.

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
   ALLOWED_ORIGINS=https://thedailyundead.com,https://www.thedailyundead.com,http://localhost:8080,http://127.0.0.1:8080
   ```

   Add `CLERK_ISSUER` using the Clerk instance URL and set `CLERK_AUTHORIZED_PARTIES` to the same comma-separated browser origins. These values are configuration, not secrets.

6. Under **Domains**, disable the production `workers.dev` URL.
7. Add the custom domain `api.thedailyundead.com`.
8. Leave routes, cron triggers, queues, build hooks, and secrets empty.

## Production verification after publishing the site

1. Open `https://thedailyundead.com` and confirm all three figures load.
2. Complete the current-day map guess in one browser.
3. Confirm players today and the all-time total each increase by one.
4. Refresh and confirm they do not increase again.
5. Check `attempts` in D1 Studio for exactly one row from that browser/date.
6. The following UTC day, confirm the previous day's solve percentage equals correct attempts divided by all attempts, rounded to the nearest whole percentage.

Statistics errors are deliberately non-blocking. If the Worker or D1 is unavailable, the game remains playable and community figures show `—`.
