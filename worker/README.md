# Community statistics operations guide

The Daily Undead remains a static GitHub Pages site. Community statistics are handled separately by a Cloudflare Worker and D1 database.

## Live production configuration

- Worker: `daily-undead-stats`
- API: `https://api.thedailyundead.com`
- D1 database: `daily-undead-stats`
- D1 binding: `DB`
- Worker variable: `ALLOWED_ORIGINS`
- Custom domain: `api.thedailyundead.com`
- `workers.dev` URL: disabled; the custom domain is the only production address
- Observability: invocation logs enabled, traces disabled
- Cron triggers, queues, routes, build hooks, and secrets: none

The frontend API address is the public metadata value in `index.html`; it is not a credential. Cloudflare API tokens and account credentials must never be added to frontend files.

The Worker exposes:

- `GET /health` for a simple health check.
- `GET /api/stats?date=YYYY-MM-DD` for players today, total games, and yesterday's result.
- `POST /api/attempts` for a completed current-day map guess.

## What counts and what is stored

A play is recorded only when the player confirms a map. Visiting, refreshing, revealing clues, choosing a game, or completing the bonus order does not create a new attempt.

The browser creates a random local identifier. The Worker hashes it with SHA-256 before D1 storage. D1's `UNIQUE (puzzle_date, player_hash)` rule is the final protection against repeat submissions from one browser on one UTC date. Another browser or device can count separately.

The database stores the puzzle/date, answer map, correct/incorrect map result, hashed browser identifier, and submission time. It does not store player accounts, email addresses, the raw browser identifier, or the bonus-step order. Worker invocation logs are a separate Cloudflare operational feature and can contain normal request metadata.

The all-time total started with an estimated 100 historical games from before tracking launched. `migrations/0002_seed_historical_total.sql` documents that one-time baseline and cannot reduce a total that has already passed 100.

## Current schema

The schema is versioned in:

- `migrations/0001_create_attempts.sql` — tables, index, and aggregate trigger.
- `migrations/0002_seed_historical_total.sql` — guarded historical baseline.

D1 contains three application tables:

- `attempts` — one accepted browser/date entry per completed map guess.
- `daily_stats` — daily attempt and correct-answer aggregates plus the answer map.
- `community_totals` — the all-time total.

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

## Deploy Worker code from the dashboard

1. Open **Workers & Pages → daily-undead-stats → Edit code**.
2. Replace `worker.js` with the complete contents of `worker/src/index.js`.
3. Check the editor reports no problems.
4. Click **Deploy**.
5. Open `https://api.thedailyundead.com/health` and confirm `{"ok":true}`.
6. Verify a read without inserting data:

```sh
curl -i -H 'Origin: https://thedailyundead.com' \
  'https://api.thedailyundead.com/api/stats?date=YYYY-MM-DD'
```

The response should be `200` and include `Access-Control-Allow-Origin: https://thedailyundead.com`.

## Deploy with Wrangler

Wrangler can reproduce the configuration in `worker/wrangler.jsonc`:

```sh
npx wrangler@latest login
npx wrangler@latest d1 migrations apply daily-undead-stats --remote --config worker/wrangler.jsonc
npx wrangler@latest deploy --config worker/wrangler.jsonc
```

Treat `worker/wrangler.jsonc` as the source of truth when deploying with Wrangler. It keeps the `workers.dev` URL disabled and binds production D1 as `DB`.

## Recreate or verify dashboard configuration

If the Worker ever has to be recreated:

1. Create a D1 database named `daily-undead-stats` under **Storage & databases → D1 SQL Database**.
2. In D1 Studio, apply each complete statement from `0001_create_attempts.sql`, followed by `0002_seed_historical_total.sql`. Run the entire `CREATE TRIGGER ... BEGIN ... END;` block as one statement.
3. Create a Worker named `daily-undead-stats` and deploy `src/index.js`.
4. Under **Bindings**, add D1 database `daily-undead-stats` with variable name `DB`.
5. Under **Settings → Variables and secrets**, add the text variable:

   ```text
   ALLOWED_ORIGINS=https://thedailyundead.com,https://www.thedailyundead.com,http://localhost:8080,http://127.0.0.1:8080
   ```

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
