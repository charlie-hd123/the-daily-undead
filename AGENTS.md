# Website development and release rules

## Source of truth and scope

- `main` is the live source. `staging` contains the complete next release, including every unreleased change. Start ordinary website work on the latest staging branch; do not start from main and accidentally omit pending work.
- Default website changes to staging. Publish production only when the user explicitly requests it. A request to implement or deploy staging is not permission to publish live.
- Before editing, inspect Git status, fetch origin and use `npm run release:sync` on staging. Preserve unfinished work and unrelated untracked files. If live and staging diverged, incorporate origin/main into staging, resolve conflicts and review before release. Never reset/force-push away work.
- Prefer the existing release commands and STAGING.md over rediscovering infrastructure. Keep tool output concise; investigate specific failures instead of repeatedly reading whole files or dumping logs.

## One complete application

- Staging runs the production application with isolated configuration and persistent test data. Use the same HTML, JavaScript, CSS, puzzle catalogues, account routes and database migrations. No parallel prototype renderer or simulated staging account UI.
- `staging-demo.html` is a compatibility redirect. `staging-demo.css` is a historical filename for shared production styling, not a separate staging implementation. Local `socialDemo` is an optional illustration, never evidence of release readiness.
- Use `npm run dev` for the full local app/API with local-only D1 and staging authentication. Local, staging and production progress remain separate. Never use the old read-only production leaderboard preview to verify account writes.
- Fictional staging activity is maintained by `worker/src/staging-fixtures.js`. It may touch only reserved fixture IDs in local/staging. Never copy production players into staging or copy staging players into production. Preserve the user's staging account and progress across deployments.

## Checks proportional to the change

- Run the complete fast automated suite once for each committed candidate using `npm run release:check` or `npm run deploy:staging`. Passing results are cached for the exact commit and Node version; don't rerun unchanged checks without a reason.
- Marketing text or isolated wording: inspect the affected output and relevant responsive layout; no unrelated gameplay walkthrough.
- Local styling: inspect affected states at representative mobile and desktop widths, including shared components affected by the selector.
- Gameplay, scoring, accounts, shared rendering/layout, persistence, infrastructure or puzzle assignment changes: run the broader affected-state review. For shared gameplay/rendering, exercise both puzzles through initial play, selection, success, failure, bonus, result, just-for-fun, stats and leaderboards. Infrastructure changes also require real staging account/API checks.
- Automated source/build parity and real SQLite/API integration tests replace repeated manual comparisons of identical application code. Do not claim unexercised browser states were tested. Keep review scope explicit.
- Reuse a visual review only while the reviewed application/configuration is unchanged. New changes invalidate affected checks. Before promotion, consider the cumulative diff from main, not just the latest edit.

## Staging and exact promotion

- After browser asset changes, run `npm run release:prepare`, review the version changes and commit all intended files. Add new files deliberately; never `git add .` with unrelated user files present.
- `npm run deploy:staging` checks branch freshness, tests the committed snapshot, builds both environments, applies staging-only migrations, deploys the matching API if needed, pushes staging and publishes the complete site. It verifies current statistics, profiles, leaderboards and website/API release identity.
- Review the normal staging URL. Record the exact commit and affected browser states in the task. Additional requested changes accumulate on staging.
- On an explicit request to publish, use `npm run release:status` and promote the exact approved commit with `npm run release:promote -- FULL_COMMIT_SHA`. Never cherry-pick/recreate a list of staging edits or silently publish local changes after approval.
- Promotion refuses drift, missing live hotfixes, modified historical migrations and unapplied production migrations. Production schema/data migrations need explicit review and authorisation; never substitute production configuration in staging commands.
- The script preserves a rollback tag and previous API identity. A push is not completion: wait for GitHub Pages, run `npm run release:verify-live` against normal public URLs, and inspect the affected public states. Avoid repeated polling with unchanged results.
- Production player data, account progress, daily assignments and in-progress puzzles must remain untouched unless the release explicitly includes a reviewed migration. Application promotion never copies staging data.
