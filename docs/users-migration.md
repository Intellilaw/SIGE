# Users Migration

This document defines the safe migration path for `Usuarios` from `Intranet` into `SIGE_2`.

## Goal

Migrate only user metadata and permissions.

Do not migrate legacy passwords.

## Password strategy

The chosen strategy is:

- import metadata only
- generate a random unknown password for every imported account
- store only the hash in `SIGE_2`
- require a password reset before productive use

Why this strategy:

- `Intranet` uses Supabase Auth, while `SIGE_2` uses local `scrypt` password hashes
- there is no safe direct password-portability path between both systems
- copying only metadata avoids authentication drift and reduces migration risk
- imported users stay blocked for normal login until the reset flow is completed

Operational note:

- keep the local SIGE_2 admin account available during the migration
- do not distribute credentials to imported users yet
- the reset/onboarding flow is now enabled in `SIGE_2`

## Files prepared

- RPC extractor: [extract-intranet-users.ts](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/users/extract-intranet-users.ts)
- SQL extractor: [extract-intranet-users-json.sql](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/users/extract-intranet-users-json.sql)
- example export: [intranet-users-export.example.json](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/users/intranet-users-export.example.json)
- importer: [import-intranet-users.ts](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/users/import-intranet-users.ts)

## Extraction from Intranet

Run the SQL in the `Intranet` database context, for example through the Supabase SQL editor or a PostgreSQL session with access to `auth.users`.

The query returns one JSON payload containing:

- `legacyUserId`
- `email`
- `username`
- `displayName`
- `legacyRole`
- `legacyTeam`
- `specificRole`
- `shortName`
- `createdAt`
- `lastLoginAt`
- `emailConfirmedAt`
- `rawUserMetaData`

If you have local read-only access to the `Intranet` project, you can also use the prepared RPC extractor. It reads the legacy Supabase URL, anon key, and admin credentials from the sibling `Intranet` workspace, authenticates as the legacy superadmin, and exports the same migration format without modifying the source project.

```powershell
npm.cmd run users:extract --workspace @sige/api
```

Suggested workflow:

1. Run either [extract-intranet-users.ts](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/users/extract-intranet-users.ts) or [extract-intranet-users-json.sql](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/users/extract-intranet-users-json.sql) against `Intranet`.
2. Save the JSON result as a local file, for example:

```text
C:\Users\edrus\Dropbox\2 Intellilaw\SIGE_2\runtime-logs\intranet-users-export.json
```

3. Review the export for:
   - duplicated emails
   - duplicated usernames
   - duplicated `shortName`
   - unknown `team` labels
   - unexpected legacy roles outside `superadmin` or `intranet`

## Import into SIGE_2

Dry run first:

```powershell
npm.cmd run users:import --workspace @sige/api -- --input runtime-logs/intranet-users-export.json
```

Apply only after reviewing the report:

```powershell
npm.cmd run users:import --workspace @sige/api -- --input runtime-logs/intranet-users-export.json --apply
```

Default report output:

```text
runtime-logs/intranet-users-import-report.json
```

The importer:

- validates the JSON structure
- skips non-intranet/public users
- normalizes `username`
- preserves `legacyTeam`, `specificRole`, and `shortName`
- derives internal `role`, `team`, and `permissions`
- upserts by `email`
- assigns a random password hash to enforce reset
- marks imported accounts with `passwordResetRequired = true`

## Reset and onboarding usage

Once the import is applied, imported users should not receive manual passwords.

Use one of these paths instead:

1. Public self-service request
   - open `/intranet-password-help`
   - enter `username` or `email`
   - in local development, SIGE_2 returns a preview activation link
2. Admin-generated secure link
   - open the `Usuarios` module
   - locate the imported account
   - click `Enlace`
   - share the generated link through a secure channel

When the user opens the link:

- SIGE_2 validates the token
- the user defines a new password
- the password is hashed locally in `SIGE_2`
- `passwordResetRequired` switches to `false`
- existing refresh tokens are revoked
- the user is signed in with a fresh session

## Safety rules

- do not run destructive deletes as part of the first migration pass
- do not overwrite users outside the imported email set
- keep one working SIGE_2 admin available before and after import
- review the dry-run report before `--apply`

## Recommended cutover sequence

1. Export users from `Intranet`.
2. Run dry-run import into `SIGE_2`.
3. Review report and fix any unmapped teams or duplicate short names.
4. Run the real import with `--apply`.
5. Generate onboarding links or use the public request page.
6. Only then onboard imported users into the new system.
