# Clerk retirement — 31 October 2026

This cleanup is staged for review. Production publication is a separate explicit
approval under AGENTS.md. It includes no database migration, account export,
account deletion, identity rewrite or production configuration change.

## Removed from the candidate

- Browser Clerk SDK loading, fallback configuration, appearance settings and
  custom profile pages, their unused CSS/buttons, and obsolete provider copy.
- Worker Clerk JWT verification and issuer/authorized-party configuration.
- One-off account-import scripts and the `migrate:auth-users` command. These
  remain recoverable in Git history; do not rerun the old migration.
- Obsolete Clerk names for the active Supabase client. Supabase's session
  storage, email-code flow, account settings and save behavior are preserved.

The application dependencies and lockfile already contain no Clerk SDK or
Svix dependency. GitHub's checked-in workflow and Supabase functions/SQL have
no active Clerk integration. Local profile preview now uses isolated staging
Supabase authentication with a local-only D1 database.

## Records and compatibility that must remain

Production was audited with an aggregate SELECT only on 31 October. D1 reported
56 profiles, 39 historical Clerk mappings, 48 Supabase-linked profiles and
8 profiles not yet linked to Supabase; `rows_written` was zero. These are
point-in-time totals, not a requirement that player counts stay fixed.

Keep original `user_id` values, `acct_...` IDs, all saves/results, historical
`account_identities` rows, revocation records and the signed Supabase
`app_metadata.daily_undead_clerk_user_id` migration hint. Returning imported
players may still need the D1 lookup that attaches their first Supabase visit
to their existing profile. This lookup does not contact Clerk. Existing
Supabase attachments take precedence; no accounts are merged by email.

Historical SQL migrations and admin views remain unchanged. Client storage
keys, pending-save recovery and legacy user-ID compatibility remain unchanged.
No production player data is copied to staging.

## Hosted audit and remaining external retirement

Read-only checks found the production Worker still advertises both providers
before this release. Its deployed bindings contain `CLERK_ISSUER` and
`CLERK_AUTHORIZED_PARTIES`; the candidate removes both. The only Worker secret
name in production and staging was `SUPABASE_HEARTBEAT_SECRET_KEY`; it must be
preserved. No Clerk secret was found in either Worker secret-name list.

The public frontend has Supabase configuration and no static Clerk script tag,
but still has the obsolete Clerk public metadata removed by this candidate.
The public DNS name `clerk.thedailyundead.com` still points to
`frontend-api.clerk.services`.

Do not remove that DNS record, cancel/delete the Clerk application, revoke
external credentials or delete Clerk users as part of this staging release.
Those external dashboard settings and any third-party webhooks/billing have
not been exhaustively audited. After explicit promotion and live account
verification, review them separately before final service cancellation.
Deleting historical D1 mappings or Supabase migration metadata is never part
of service cancellation.

## Validation scope

The added tests reject retired Clerk tokens without fetching their keys and
retain migration hints from verified Supabase tokens. A real SQLite test
applies every unchanged migration, links a returning player, compares all
profile/save/result/assignment rows before and after, checks repeat sign-in,
preserves another player and rejects conflicting identity hints.

The standard committed-candidate release check and staging deployment must
pass before reporting this release ready. Browser review covers Supabase
session restoration, account/profile/security/username/email dialogs,
sign-out controls, current saved result, stats and leaderboards on the normal
staging URL at desktop and mobile widths. Fresh OTP submission and destructive
account/email changes are reported separately if exercised. Puzzle generation,
scoring and progression code are outside this cleanup.
