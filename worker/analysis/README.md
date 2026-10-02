# Score migration preview

`score-migration-preview.sql` is deliberately read-only and anonymised. It does
not contain an `UPDATE`, expose account IDs/usernames, or become part of the D1
migration chain.

The estimate keeps each current Points balance as an absolute floor, adds every
historic loss/revive cost that can be proved from saved snapshots, preserves
every verified result at its exact recorded value, and estimates only older
unrecorded solves using a player's verified scoring average gently blended with
the site-wide average. The highest of those values becomes the proposed opening
Score, rounded to 10 without ever dropping below the current balance.

Before production launch:

1. Run this against an export or read-only production query.
2. Review the anonymous distribution, ranking movement and outliers with Charlie.
3. Tune the formula if the preview reveals unfair results.
4. Prepare a separate, reviewed write migration. Never turn this preview query
   into an automatic production update.

The reviewed write, verification and pre-reopening rollback are kept separately
under `worker/launch/`. Generated username-linked output remains private and is
never committed to the repository.
