# Clerk retirement — 31 October 2026

This is the October retirement record. The 7 November audit confirmed that the
live and staging Workers report Supabase as their sole account provider.
The historical identity records below are still part of account recovery.

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

## Pre-retirement hosted audit

At the October review the live Worker still advertised both providers and its
bindings included `CLERK_ISSUER` and `CLERK_AUTHORIZED_PARTIES`. The cleanup
removed both from the Worker configuration. The only Worker secret
name in production and staging was `SUPABASE_HEARTBEAT_SECRET_KEY`; it must be
preserved. No Clerk secret was found in either Worker secret-name list.

At that review the live frontend still had the obsolete Clerk public metadata,
and `clerk.thedailyundead.com` pointed to `frontend-api.clerk.services`. The
7 November public DNS sample returned no CNAME, A or AAAA answer for that host.

Review the external project, credentials, webhooks, billing and rollback
dependencies separately before any service cancellation. Preserve the
historical D1 mappings and Supabase migration metadata.

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
