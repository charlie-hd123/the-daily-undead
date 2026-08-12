# Community statistics setup

The website stays on GitHub Pages. This folder deploys a separate Cloudflare Worker that exposes two small JSON endpoints backed by D1:

- `GET /api/stats?date=YYYY-MM-DD` reads the three community totals.
- `POST /api/attempts` records a finalized map guess once per browser and UTC puzzle date.

The browser creates a random local ID. The Worker hashes it with SHA-256 before writing it to D1, and the database's `UNIQUE (puzzle_date, player_hash)` rule prevents repeat submissions from increasing a day twice. No IP address, account, email address, or raw browser ID is stored in D1.

The all-time counter includes an estimated baseline of 100 historical games from before tracking launched. Migration `0002_seed_historical_total.sql` applies that baseline without lowering a genuine total that has already passed it.

## Before you start

You need a Cloudflare account. The production setup can be completed entirely in the Cloudflare dashboard; Node.js and Wrangler are only needed for the command-line and fully local options below.

This repository is currently configured for:

- Worker: `daily-undead-stats`
- D1 database: `daily-undead-stats`
- Production API: `https://api.thedailyundead.com`
- D1 binding name: `DB`

If using Wrangler, open a terminal in the repository root—the folder containing `index.html`. If `npx --version` fails, install the current Node.js LTS release first.

## 1. Sign in to Cloudflare from Wrangler

Type:

```sh
npx wrangler@latest login
```

Wrangler opens Cloudflare in your browser. Select the account that will own the Worker, click **Allow**, and return to the terminal after the success message. This login stays on your computer; it is not added to the repository or frontend JavaScript.

## 2. Create the D1 database

Type:

```sh
npx wrangler@latest d1 create daily-undead-stats
```

Cloudflare prints a `database_id` UUID. Copy it. Open `worker/wrangler.jsonc` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the UUID, leaving the quotation marks in place.

Dashboard alternative:

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com/).
2. In the left sidebar, click **Storage & Databases → D1 SQL database**.
3. Click **Create database**.
4. Enter `daily-undead-stats` and click **Create**.
5. On the database overview, copy its **Database ID** into `worker/wrangler.jsonc` as described above.

## 3. Create the schema

The schema is versioned in `worker/migrations/0001_create_attempts.sql`. Apply it to production by typing:

```sh
npx wrangler@latest d1 migrations apply daily-undead-stats --remote --config worker/wrangler.jsonc
```

Wrangler shows the pending migration and asks for confirmation. Type `y` and press Return.

Dashboard alternative:

1. Open **Storage & Databases → D1 SQL database → daily-undead-stats**.
2. Click **D1 Studio** (called **Console** in some dashboard versions).
3. Open `worker/migrations/0001_create_attempts.sql` locally.
4. Paste one complete SQL statement at a time into the editor and click **Run**. For the final trigger, include the whole `CREATE TRIGGER ... BEGIN ... END;` block as one statement.
5. Refresh the table tree and confirm it contains `attempts`, `daily_stats`, and `community_totals`.

Cloudflare's editor normally runs the statement containing the cursor unless text is selected. Running the file statement by statement avoids accidentally skipping part of the schema.

Use either method. The migration command is recommended because it records which migration was applied.

## 4. Create, bind, and deploy the Worker

Type:

```sh
npx wrangler@latest deploy --config worker/wrangler.jsonc
```

On the first deployment, Wrangler creates `daily-undead-stats`. The `d1_databases` block in `worker/wrangler.jsonc` also creates its `DB` binding, so no database password is required. Cloudflare prints a URL similar to:

```text
https://daily-undead-stats.YOUR-SUBDOMAIN.workers.dev
```

Copy it without a trailing slash.

To verify the binding in Cloudflare:

1. Open **Workers & Pages**.
2. Click **daily-undead-stats**.
3. Click **Settings → Bindings**.
4. Confirm a D1 binding named `DB` connects to `daily-undead-stats`.

If it is missing, click **Add binding → D1 database**, enter `DB` as the variable name, choose `daily-undead-stats`, and click **Add binding**. A later Wrangler deployment will also restore it from the config file.

Dashboard-only alternative:

1. Open **Workers & Pages** and click **Create application**.
2. Choose **Start with Hello World** (the wording can also be **Start with a template**), name it `daily-undead-stats`, and click **Deploy**.
3. Open the new Worker and click **Edit code**.
4. Replace the sample file with all of `worker/src/index.js`, then click **Deploy**.
5. Open the Worker's **Bindings** tab, click **Add binding**, choose **D1 database**, set the variable name to `DB`, choose `daily-undead-stats`, and save.
6. Open **Settings → Variables and secrets**, click **Add variable**, choose **Text**, and enter:

   - Name: `ALLOWED_ORIGINS`
   - Value: `https://thedailyundead.com,https://www.thedailyundead.com,http://localhost:8080,http://127.0.0.1:8080`

7. Save the variable. It is configuration, not a secret; no Cloudflare token belongs here or in the frontend.
8. If the binding or variable was added after the code deployment, redeploy the latest Worker version if Cloudflare prompts you to do so.

## 5. Connect the GitHub Pages frontend

Open `index.html` and find:

```html
<meta name="daily-undead-stats-api" content="https://api.thedailyundead.com">
```

For a different deployment, paste its Worker or custom-domain URL into `content`, for example:

```html
<meta name="daily-undead-stats-api" content="https://daily-undead-stats.YOUR-SUBDOMAIN.workers.dev">
```

This public URL is not a credential. Never put Cloudflare API tokens, account tokens, or D1 credentials in this tag or any frontend file.

Commit and push the change to the branch GitHub Pages publishes. The existing Pages settings and `CNAME` stay unchanged.

## 6. CORS and domains

`worker/wrangler.jsonc` already allows browser requests from:

- `https://thedailyundead.com`
- `https://www.thedailyundead.com`
- `http://localhost:8080`
- `http://127.0.0.1:8080`

If the site is used directly at a GitHub Pages URL, add its exact origin to `ALLOWED_ORIGINS`, separated by a comma—for example, `https://your-name.github.io`, with no path or trailing slash. Deploy again afterward. The Worker reflects only listed origins. Do not change this to `*`.

Custom Worker domain used by this site:

1. Open **Workers & Pages → daily-undead-stats → Domains**.
2. Under **Custom Domains and Routes**, click **Add Domain**.
3. Search for and select `thedailyundead.com`.
4. Enter `api` as the subdomain and click **Add domain**.
5. Once it appears in the domains table, use `https://api.thedailyundead.com` in the frontend meta tag.

The `workers.dev` URL remains a fallback. The first-party domain is preferable here because some browser privacy filters block generic Worker hostnames.

## Environment variables and secrets

There are no required secrets. The only Worker variable is `ALLOWED_ORIGINS`, committed in `worker/wrangler.jsonc`. The D1 binding is named `DB` and exists only in the Worker runtime.

The site never receives a Cloudflare API token or direct D1 access. Its random browser ID travels over HTTPS and is immediately hashed before database storage.

## Test locally

Create the local-only schema:

```sh
npx wrangler@latest d1 migrations apply daily-undead-stats --local --config worker/wrangler.jsonc
```

In terminal 1, start the Worker and local D1:

```sh
npx wrangler@latest dev --config worker/wrangler.jsonc
```

It should listen at `http://localhost:8787`.

In terminal 2, start the static site:

```sh
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). Localhost automatically uses `http://localhost:8787`, even while the production meta tag is blank or points to the deployed Worker.

To test counting cleanly:

1. Open DevTools → **Application** (Chrome/Edge) or **Storage** (Firefox/Safari).
2. In Local Storage for `http://localhost:8080`, remove keys beginning with `the-daily-undead:community-` and the current `dead-drop:` key.
3. Refresh, choose a map, and click **Confirm map**.
4. The local total should become `1`. Refreshing the completed result must leave it at `1`.
5. Use a private window to simulate another browser/device; its completed guess should increase the total to `2`.

Inspect local D1 rows with:

```sh
npx wrangler@latest d1 execute daily-undead-stats --local --config worker/wrangler.jsonc --command "SELECT puzzle_date, answer_map_name, is_correct, created_at FROM attempts ORDER BY id DESC;"
```

## Test production

After deploying the Worker and publishing the configured frontend:

1. Open `https://api.thedailyundead.com/health`. It should return `{"ok":true}`. If a browser extension blocks direct API pages, use `curl -i https://api.thedailyundead.com/health` or continue with the site/network check below.
2. Open `https://thedailyundead.com`, then open browser DevTools → **Network**.
3. Refresh and confirm `GET /api/stats?...` returns `200`.
4. Complete today's map guess and confirm `POST /api/attempts` returns `200` and the counters update.
5. Refresh. The totals must not increase again.
6. Open **Storage & Databases → D1 SQL database → daily-undead-stats → Console** and run:

```sql
SELECT puzzle_date, COUNT(*) AS players, SUM(is_correct) AS correct
FROM attempts
GROUP BY puzzle_date
ORDER BY puzzle_date DESC;
```

The frontend deliberately ignores submission errors. If the Worker or D1 is unavailable, the game still loads and completes; community numbers show `—` until the next successful read.
