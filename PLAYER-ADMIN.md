# Finding players by username

Usernames and gameplay live in Cloudflare D1. Supabase handles authentication.
The stable `account_id` links a profile to its provider identities; migrated
players can retain an old Clerk `user_id` that differs from their Supabase ID.

## Cloudflare

Open **Storage & databases → D1 → daily-undead-staging → Studio** for staging.
After migration 0013, these read-only views join records to their usernames:

| View | Contents |
| --- | --- |
| `admin_player_overview` | One row per player: username, account/legacy/Supabase IDs, score, solves, stored round and dates |
| `admin_player_results` | Daily results with username, account ID and Supabase ID |
| `admin_player_daily_saves` | Saved daily puzzle state with the same identity columns |

If the Studio table picker does not list views, use its SQL console:

```sql
SELECT * FROM admin_player_overview ORDER BY username;
SELECT * FROM admin_player_results
WHERE username = 'CharlieStage' COLLATE NOCASE ORDER BY puzzle_date DESC;
SELECT * FROM admin_player_daily_saves
WHERE username = 'CharlieStage' COLLATE NOCASE ORDER BY puzzle_date DESC;
```

Views reflect username changes immediately and do not copy or modify progress.
`stored_current_round` is the saved value; the game may reconstruct the current
round using the game-date calendar. Fictional fixtures and profiles without a
linked Supabase login appear with a blank `supabase_user_id`.
Anonymous aggregate attempts are not linked to usernames.

## Supabase

In the **staging** project (`zsnnvzhimtlhpvwhwxpy`), open **SQL Editor** and use
the saved **Player lookup** query, or paste `supabase/player-lookup.sql` and save
it under that name. It shows email, username, Supabase ID, account ID and dates
in one table. A query can be added to Favorites from its actions menu.

The normal **Authentication → Users** page also shows each linked player's
username in its **Display name** column. Refresh that list after syncing.

The Worker copies `daily_undead_username` and `daily_undead_account_id` into
server-managed `app_metadata` after account reads, registration and renaming.
It also sets `user_metadata.name`, the field used by the native **Display name**
column. That display field is user-editable through Supabase and is never used
as an authoritative game username or for authorisation.
Other auth metadata is preserved by the Auth Admin API. Cloudflare remains the
source of truth; this copy is only for identification, never authentication or
gameplay decisions. Metadata is also visible in an auth user's Raw JSON.

The existing 12-hour Worker schedule backfills/retries up to 20 linked players
per run, prioritising those not attempted recently. Successful copies are
periodically refreshed after a day. Failed copies cannot fail a profile save;
account reads retry them too. Local development never writes shared auth
metadata. The existing server-only Supabase key is reused, with no browser key
or new public database access.

A blank username can mean onboarding is unfinished, an old account has not yet
linked its Supabase identity by signing in, or its copy is awaiting a retry.
Account deletion removes the sync checkpoint with the rest of the D1 profile
and uses the existing Supabase auth deletion flow.

## Release scope

Migration `0013_player_admin_views.sql` creates three views and the small
`auth_profile_sync` checkpoint table. It does not update existing profile,
result or save rows. Staging deployment applies it only to staging D1.
Production application of this migration and metadata backfill still requires
explicit review/authorisation under `AGENTS.md`, followed by exact promotion.
No Supabase schema migration is needed for the saved lookup query.

Migration `0014_refresh_auth_display_names.sql` requeues existing sync
checkpoints so previously synced players also receive the native display name.
It does not change player profiles or progress. Its production application
requires the same explicit migration review/authorisation.
