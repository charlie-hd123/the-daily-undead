# Clerk to Supabase Auth migration

This runbook keeps the Cloudflare Worker and D1 database in place. Only the
authentication provider and transactional account email delivery change:

- Supabase Auth replaces Clerk for passwordless email-code sign-in.
- Resend delivers Supabase's authentication emails.
- Cloudflare Worker continues to own the application API.
- Cloudflare D1 continues to own profiles, saves, scores, results and
  leaderboards.
- Application-owned IDs (`acct_...`) keep game accounts independent of Clerk,
  Supabase and Cloudflare identity formats.

## Current safety boundary

The production frontend switched to Supabase Auth on 7 October 2026. The
production Worker continues accepting both Clerk and Supabase during the
rollback overlap period. Clerk configuration, imported Supabase users and the
historical identity mappings must remain in place until that period ends.

## Staging state

- Staging site: `https://daily-undead-staging.pages.dev`
- Staging API: `https://daily-undead-staging-api.charlieharrisondavies.workers.dev`
- Supabase project: `The Daily Undead Staging`
- Imported auth users: 38
- Passwordless email codes: working through Resend
- Fresh sign-in, sign-out and session persistence: verified
- Full automated suite: 118 tests passing on 7 October 2026
- Staging build: completed successfully on 7 October 2026
- Staging health check: both Clerk and Supabase providers configured
- Application-owned account IDs: applied to staging D1
- Authenticated visit activity: writing to Supabase
- Protected database heartbeat: deployed and invoked by the staging Worker
- Heartbeat schedule: every 12 hours

The deliberately created `CharlieStage` profile predates the bulk user import.
It remains a staging-only Supabase profile. Its migrated Clerk identity did not
have a staging D1 profile, so retaining `CharlieStage` is expected and does not
represent a duplicate production account.

## Production Supabase preparation state

- Supabase project: `The Daily Undead Production`
- Project ref: `bhqhfxwdcpujfxxvcoeo`
- Production site and redirect URLs: configured
- Resend SMTP and email-code template: configured; copy uses digit-count-neutral
  wording to match Supabase's current eight-digit production codes; the code
  appears prominently in the subject and body. The production email uses a
  plain transactional email layout with a standard wordmark, divider and
  unboxed code. Its subject is `<token> is your verification code`. The body
  splits the visually continuous token with word-break opportunities and
  disables telephone format detection to prevent iOS from presenting it as a
  phone-number link while keeping it selectable
- Production authentication email: delivered and visually verified on
  7 October 2026 after template propagation
- Authenticated activity and service heartbeat tables: created with RLS
- Protected heartbeat Edge Function: deployed with legacy JWT verification off
- Dedicated server-only `heartbeat` key: created
- Imported auth users: 39
- Import verification: 39 existing, 0 missing, 0 skipped
- Temporary `migration` key and local encryption bridge: revoked/deleted
- Production D1 backup:
  `backups/daily-undead-stats-pre-auth-identity-20261006T191900Z.sql`
- Backup SHA-256:
  `7a012b54f30dbb796033676e1523c87f0b7e291ee5fe4188c82c1e6bf08d0926`
- Cutover D1 Time Travel bookmark:
  `0000146e-00000000-000050fd-148eb9b171522d68eb7bc4869d26510f`
- Cutover restore window: seven days from 7 October 2026
- Production D1 identity migration: applied and verified
- D1 verification: 39 profiles, 39 unique account IDs, 39 Clerk identities,
  0 missing mappings and 0 orphans
- Dual-provider production Worker: deployed with Clerk retained
- Worker version after code deployment:
  `090a69d7-e213-4013-a0b6-a5835a15a6c0`
- Worker version after heartbeat secret change:
  `ea750ef8-893f-4a30-9eae-e2d64590fba3`
- Pre-migration Worker rollback version:
  `66d592bf-5881-4bdb-abaf-5db7c7ab84c4`
- Protected production heartbeat: invoked successfully and database row verified
- Existing live Clerk session: verified with unchanged username and game totals
- Production Supabase authentication: OTP exchange reached the live Worker and
  created one Supabase identity for `TheWarden`; D1 confirms that Clerk and
  Supabase both resolve to the same application-owned account
- Production frontend: Supabase Auth enabled on 7 October 2026
- Clerk settings: unchanged; Worker fallback retained for rollback
- Cutover verification: eight-digit Resend code accepted, existing `TheWarden`
  account restored with Score 4,780 and 59 Solves, session persisted after a
  reload, public statistics and leaderboards remained available
- Post-cutover D1 verification: 39 profiles, 39 unique account IDs, 39 Clerk
  identities, 1 linked Supabase identity, 0 missing account IDs and 0 orphans
- Supabase authenticated activity: visit recorded at cutover

## Identity linking model

Every D1 profile has an application-owned `account_id`. The
`account_identities` table maps external provider subjects to that account:

```text
Clerk user ID ----\
                  > account_id (acct_...) -> D1 profile and game data
Supabase user ID -/
```

Imported Supabase users carry their original Clerk user ID in server-controlled
app metadata. On their first Supabase-authenticated API request, the Worker
links the Supabase subject to the existing Clerk-backed `account_id`. No email
address is stored in D1.

If no D1 profile existed under Clerk, the user signs in successfully and can
create a new game profile in the normal way. If a Supabase identity is already
attached to a profile, the Worker preserves that existing attachment instead
of silently merging accounts.

## Verification before production

Run these checks on staging and record the result:

1. `npm test` passes.
2. The staging build completes.
3. `GET /health` reports both Clerk and Supabase account providers configured.
4. A migrated user receives a Resend code and signs in.
5. Reloading the page retains the Supabase session.
6. Signing out clears only the local session; signing in restores the profile.
7. A migrated user with an existing Clerk-backed D1 profile resolves to the
   same `account_id`, username, Score, Solves, Round and saved daily state.
8. A migrated user without a D1 profile sees the normal profile-creation flow.
9. A brand-new Supabase user can create a profile without colliding with an
   imported user.
10. `authenticated_activity` receives a signed-in visit and does not contain
    email addresses or tokens.
11. The protected heartbeat function records a `service_heartbeat` row.
12. The staging D1 profile count does not increase during sign-in to an existing
    profile.
13. Guest play and anonymous statistics still work when signed out.
14. Production continues to sign in through Clerk throughout these checks.

## Production preparation

Use a separate production Supabase project. Do not reuse the staging project or
its keys. Before cutover:

1. Create the production Supabase project and record its project URL and public
   publishable key.
2. Configure the production site URL and approved redirect URLs.
3. Configure Resend SMTP using the verified authentication subdomain.
4. Install and verify the email-code templates. Avoid stating a fixed digit
   count in the copy because the current production code is eight digits.
5. Apply the Supabase activity-table migration and deploy the heartbeat Edge
   Function.
6. Create a dedicated heartbeat secret, store it as a Worker secret and never
   put it in frontend code.
7. Add the production Supabase issuer and heartbeat URL to the Worker
   configuration, but keep Clerk verification enabled during the overlap.
8. Apply D1 migration `0010_create_account_identities.sql`. Take a D1 backup
   first and verify every existing profile received exactly one Clerk identity.
9. Create a short-lived Supabase secret key for the import, run the migration in
   dry-run mode, review its totals, then run it once for real.
10. Confirm the Supabase user count and migration metadata, then revoke the
    short-lived migration key immediately.
11. Deploy the dual-provider Worker and verify Clerk users can still use the
    live site before changing the frontend.

## Cutover

A maintenance page should not normally be necessary because the Worker accepts
both providers during the transition. Use a quiet traffic window and:

1. Take a final D1 backup.
2. Re-run the user-import dry-run to detect any Clerk users created since the
   earlier import; import only the missing users and revoke the temporary key.
3. Publish the production Supabase URL and publishable key in the frontend.
4. Verify one imported account, one new account, guest play, account saving and
   leaderboards on production.
5. Watch Worker errors, Supabase Auth logs, Resend delivery and D1 profile counts.
6. Keep Clerk verification enabled for a defined overlap period so the frontend
   can be rolled back without locking players out.

## Rollback

If the production checks fail, restore the Clerk-configured frontend. The
dual-provider Worker and identity table can remain deployed: they do not alter
the existing Clerk subject stored on each profile, and Clerk-authenticated users
continue resolving to the same application-owned account.

Do not delete imported Supabase users or the new D1 identity rows during an
urgent rollback. They are non-destructive additions and can be reviewed after
the live site is stable.

## Decommissioning Clerk

Only remove Clerk after the overlap period and after the active-user population
has been observed signing in through Supabase successfully. Before cancellation:

1. Export and retain the final Clerk-to-Supabase migration audit securely.
2. Confirm no production frontend still loads Clerk.
3. Confirm the Worker no longer needs Clerk for active authentication.
4. Keep the historical Clerk identity mappings in D1 for account provenance and
   recovery unless a separate, reviewed data-retention task removes them.
5. Remove Clerk configuration and dependencies in a later cleanup release, not
   during the authentication cutover itself.
