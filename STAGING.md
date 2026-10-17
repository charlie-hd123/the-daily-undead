# Complete staging and release workflow

Staging is the whole Daily Undead application plus pending changes. It uses the same source and real account/API/database code as production. Test data and environment configuration differ. See [WEBSITE-WORKFLOW.md](WEBSITE-WORKFLOW.md) for the plain-English prompting guide.

## Environments

| | Local | Staging | Production |
|---|---|---|---|
| Website | http://localhost:8080 | https://daily-undead-staging.pages.dev | https://thedailyundead.com |
| API | localhost:8787 | daily-undead-staging-api.charlieharrisondavies.workers.dev | api.thedailyundead.com |
| D1 | local daily-undead-development | daily-undead-staging | daily-undead-stats |
| Supabase Auth | staging project | zsnnvzhimtlhpvwhwxpy | bhqhfxwdcpujfxxvcoeo |
| Source | local staging work | committed staging | main |

Public frontend configuration lives in `config/environments.json`; no server secrets belong there. Worker bindings/variables live in the corresponding Wrangler configs. Cloudflare retains existing secrets. Staging is still password protected with its existing `STAGING_PASSWORD`; no password is embedded in a build. Only the non-sensitive commit/hash manifest is public at `/.well-known/release.json` so automation can verify release identity without credentials.

## Start work

Use Node 24 and `pnpm install --frozen-lockfile`. Wrangler is pinned in the lockfile. Existing npm/pnpm script commands are interchangeable.

1. Inspect `git status`; preserve local edits and unrelated files.
2. `git fetch origin`, switch to `staging`, then `npm run release:sync`.
3. If there is divergent history, incorporate `origin/staging` and `origin/main` deliberately, preserving all pending changes. The sync command only performs safe fast-forwards and refuses conflicts.
4. Edit the shared source. Use `npm run dev` for a complete local app: it starts the real Worker, applies migrations to local-only D1, seeds fictional activity and serves the real page. Both stats and accounts use port 8787. It uses staging Supabase for email-code authentication; saves remain in local D1. Add new source files to Git's index before local preview; refresh to rebuild.

The local server is a developer preview and can stop whenever you like. Hosted staging/live do not depend on it. `npm start` remains a lightweight static-only option; without the API it is not a full staging check. The legacy social demo and read-only leaderboard commands remain optional development tools, not release environments.

Browser puzzle data is packaged from the existing map index, map JSON and word bank into two content-addressed files in `data/catalogues/`. Run `npm run generate:browser-catalogues` after editing those sources and add the newly generated files plus `js/puzzle-catalogue-assets.js` deliberately before local preview. `release:prepare` also regenerates them; automated checks reject stale or missing packages. Keep previously released catalogue hashes so older open pages can still load their matching data. Browser caching applies only to these public, content-addressed catalogues; account saves and release checks retain their existing behaviour.

## Put a complete candidate on staging

```sh
npm run release:prepare
# Review the diff and commit intended files explicitly.
npm run deploy:staging
```

The command refuses dirty tracked files or stale/divergent branches. It snapshots the commit, runs the complete automated suite once, builds production and staging from the same tracked source, applies only staging migrations, deploys the matching staging Worker when code/configuration changed, backs up the source to GitHub staging and deploys the full website. Unrelated untracked diagrams/drafts are excluded.

A release manifest identifies the source commit, application asset hashes, API source hash, environment-specific API configuration hash and migration checksums. HTML differences are limited to environment configuration, noindex metadata and a small environment badge; browser JavaScript, CSS, data and rendering are shared. The obsolete `/staging-demo.html` redirects to the real app.

After upload, the command verifies the hosted release identity, API identity, current-day community activity, both yesterday statistics, current/all-time leaderboards, public profiles and unauthenticated account protection. `.releases/staging.json` stores the result locally. `npm run release:status` reports local/GitHub/deployed status and every pending commit.

Review the normal staging address. Use the cumulative diff to select browser checks under AGENTS.md. Later edits accumulate on the same branch and site. Commit-based checks cannot silently include unfinished local files. Ordinary copy changes do not require a new full manual game walkthrough.

## Persistent, current fictional activity

The footer's **Advance a day** and **Return to today** controls are injected only into staging/local builds. Production source and output omit their HTML, and shared JavaScript additionally requires a local host or the exact staging host with staging metadata. A preview uses isolated per-day browser progress and disables account progress/result uploads; the normal staging account stays intact. Server result-date validation still rejects future results. Return to today restores the ordinary game and account sync. Future-day community statistics can legitimately be unavailable until that real UTC day.

The real API runs `worker/src/staging-fixtures.js` only with explicit staging/local environment flags and the staging authentication issuer. Reserved `stage_demo_*` players populate real profile, save, verified-result and anonymous-attempt tables. The API uses the same deterministic catalogue to show the correct answers for today/yesterday. Unique database constraints keep seeding idempotent. Activity refreshes on the first request of each UTC day, with the scheduled task also warming it.

The user's actual staging login/account is never reset or overwritten by fixtures. Deployments do not reset the database. Production lacks fixture flags and its issuer is rejected by the fixture guard. The integration tests apply every real migration to SQLite and exercise rollover, deduplication, both puzzle types, accounts, profile saves, signed result verification and revision conflicts. The old fixed-date SQL is retired.

Account settings support verified email changes and permanent self-service deletion. Migration `0012_account_deletion.sql` adds revoked provider IDs (to block existing JWTs and legacy identity relinking) and a durable auth-deletion retry queue. Deletion atomically removes the player's profile and cascading saves/results/identities, then hard-deletes the Supabase auth user. Failed auth removals retry on the Worker schedule. Only provider IDs remain for session revocation; anonymous aggregate activity is unchanged. The server uses `SUPABASE_SECRET_KEY`, falling back to the existing server-only `SUPABASE_HEARTBEAT_SECRET_KEY` (both are Supabase project secret keys). No key is sent to the browser. Local deletion refuses to mutate the shared staging authentication project: exercise deletion with a disposable account on the normal staging website. Production application of migration 0012 requires explicit review and authorization before promotion.

Player administration is documented in [PLAYER-ADMIN.md](PLAYER-ADMIN.md). Migration `0013_player_admin_views.sql` adds read-only views with usernames beside IDs, progress and daily records, plus a cascading auth-metadata sync checkpoint. The Worker copies usernames/account IDs to Supabase app metadata after account reads, registration and renaming; its 12-hour schedule backfills/retries up to 20 linked players. Local development cannot update shared auth metadata. `supabase/player-lookup.sql` provides the admin-only Supabase lookup without a public view or schema change. Production application of migration 0013 and metadata backfill requires explicit review and authorization before promotion.

The same sync also writes `user_metadata.name` so usernames appear in **Authentication → Users → Display name**. Migration `0014_refresh_auth_display_names.sql` requeues prior sync checkpoints for this additional display field without changing player profiles or progress. Production application requires explicit review and authorization too.

## Promote all approved work

Only after the user explicitly requests live publication:

```sh
npm run release:status
npm run release:promote -- FULL_APPROVED_COMMIT_SHA
# Wait for GitHub Pages deployment, then:
npm run release:verify-live
```

Promotion checks that local/GitHub/hosted staging and the approved commit match, and that all live changes are ancestors of that candidate. It reuses passing automated checks for the same commit, repeats inexpensive service/version checks, checks production migration status read-only, and preserves a remote rollback tag and the previous API identity. It uploads/deploys the approved API code if needed and fast-forwards `main` to the exact staged commit. GitHub Pages continues using its existing main/root hosting; no hosting migration is required.

No staging database/account records are transferred. The command refuses unapplied production migrations: review/apply those explicitly under a separate approved migration before publishing. Historical migrations must not be edited. Frontend/API deployment spans two providers and is not an atomic transaction; API changes must remain compatible with the previous frontend during rollout. Breaking API changes require a deliberate staged migration/release plan.

`release:verify-live` checks normal public entry points, critical assets, every changed website asset and the production API/configuration hashes. A deployment delay or stale response fails verification rather than reporting success. Finish with scoped browser checks. Record the approved commit, rollback tag and outcome in the task. Never force-push main to roll back; use a reviewed source revert/hosting rollback and restore the recorded Worker version as appropriate. Production data is never reset as a release rollback.

If an urgent fix is made on main, incorporate it into staging before its next deployment. After normal promotion, main/staging point at the same approved source; further work starts from there.

## Token and transfer efficiency

Prefer `release:status`, committed-snapshot checks and concise pass/fail receipts. The complete fast suite runs once per commit/Node version; identical API code/configuration is not redeployed. Uploads contain only tracked runtime assets, and Cloudflare deduplicates unchanged assets. Browser review is scoped to the change and reused until relevant changes invalidate it. A hundred small changes can accumulate in staging and be promoted once; do not rebuild the site manually from a conversational checklist.
