# Project release rules

## Staging and production parity

- Treat staging as the real production application running with staging-only configuration and test data. Do not implement or approve user-facing behaviour only in `staging-demo.html`, `js/staging-demo.js`, or another parallel prototype renderer.
- A staging change is not complete until the production runtime emits the same markup, classes, states, wording, responsive layout, and animation hooks. Shared CSS alone does not prove parity.
- Promote the exact commit that was visually approved on staging to production. Do not manually recreate a list of staging changes during the production merge.
- Before every live deployment, compare staging and the production build on representative mobile and desktop viewports. Exercise both puzzles through initial play, selection, success, failure, bonus, result, just-for-fun, community stats, and leaderboard states.
- Run the complete automated test suite, check the production asset version/cache busting, and keep the previous production commit available as the rollback point.
- After deployment, verify the normal public URL—not only a local or cache-busted preview—and confirm the expected commit/assets and key visual states are live.
- Production player data, account progress, daily assignments, and in-progress puzzles must remain untouched unless the release explicitly includes a reviewed migration.

If staging and production ever require separate rendering code, document why and add parity tests for every shared user-facing state before release.
