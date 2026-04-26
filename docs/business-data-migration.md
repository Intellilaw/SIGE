# Business Data Migration

This document defines the migration path for business data that currently lives in legacy `Intranet` on Supabase and needs to land cleanly in `SIGE_2`, whether the target PostgreSQL runs on Supabase first or later on AWS RDS / Aurora.

## What this covers

- operational business data from `Intranet`
- normalized import into the `SIGE_2` schema
- raw-row preservation for legacy-only tables and columns
- PostgreSQL dump / restore between environments

User metadata and password onboarding remain documented separately in [docs/users-migration.md](docs/users-migration.md).

## Prepared scripts

- extractor: [extract-intranet-business-data.ts](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/migration/extract-intranet-business-data.ts)
- importer: [import-intranet-business-data.ts](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/migration/import-intranet-business-data.ts)
- Postgres transfer helper: [transfer-postgres.ts](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/scripts/migration/transfer-postgres.ts)

Prisma baseline migration is now versioned under [apps/api/prisma/migrations](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/prisma/migrations).

## Legacy sources inspected

The migration tooling was aligned against real `Intranet` usage, not only assumptions. The extractor includes:

- `clients`
- `quote_types`
- `quotes`
- `leads_tracking`
- `active_matters`
- execution linkage tables such as `litigio_matters`, `corporativo_matters`, `convenios_matters`, `financiero_matters`, `compliance_matters`
- execution tables for litigio, corporativo, convenios, financiero y compliance
- master terms tables
- distributor history tables
- event catalogs (`sucesos*`)
- additional tasks tables
- `finance_records`
- `finance_snapshots`
- `gastos_generales`
- `commission_receivers`
- `commission_records`
- `commission_snapshots`
- `dias_inhabiles`

## Recommended flow

### 1. Export from `Intranet`

The extractor reads the sibling `Intranet` `.env` and `src/config/admin.js`, authenticates as the legacy superadmin, and downloads all configured business tables through Supabase REST without modifying `Intranet`.

```powershell
npm.cmd run intranet:extract-business --workspace @sige/api
```

Optional flags:

```powershell
npm.cmd run intranet:extract-business --workspace @sige/api -- --source-root ..\Intranet --output runtime-logs\intranet-business-export.json
```

### 2. Dry-run the import into `SIGE_2`

This generates a report only. It does not write into the target database.

```powershell
npm.cmd run intranet:import-business --workspace @sige/api -- --input runtime-logs\intranet-business-export.json
```

Default report output:

```text
runtime-logs/intranet-business-import-report.json
```

### 3. Apply into the target `SIGE_2` PostgreSQL

Point `DATABASE_URL` to the target database first.

Before importing, apply the versioned Prisma schema:

```powershell
npm.cmd run db:migrate:deploy --workspace @sige/api
```

```powershell
npm.cmd run intranet:import-business --workspace @sige/api -- --input runtime-logs\intranet-business-export.json --apply
```

If the target is a clean cutover database and you want the import to replace prior imported domain data:

```powershell
npm.cmd run intranet:import-business --workspace @sige/api -- --input runtime-logs\intranet-business-export.json --apply --replace
```

## What the importer does

- upserts clients, quote templates, quotes, leads, matters, finance records, finance snapshots, expenses, commission receivers, commission snapshots and holidays
- maps legacy execution tables into `TaskTrackingRecord`, `TaskTerm`, `TaskDistributionEvent`, `TaskDistributionHistory` and `TaskAdditionalTask`
- derives execution linkage from legacy matter-module tables
- preserves every exported raw row inside `LegacyImportBatch` and `LegacyImportArchive`
- embeds legacy `commission_records` inside imported commission snapshot payloads so no business row is lost even though the new UI computes commissions differently

## Supabase to AWS database transfer

Once `SIGE_2` is already populated in the source PostgreSQL, move that normalized database to AWS with the Postgres helper.

Requirements:

- `pg_dump`
- `pg_restore`
- source and target PostgreSQL URLs

Copy source to target in one command:

```powershell
npm.cmd run db:transfer --workspace @sige/api -- --mode copy --source-url "postgresql://..." --target-url "postgresql://..."
```

Dump only:

```powershell
npm.cmd run db:transfer --workspace @sige/api -- --mode dump --source-url "postgresql://..." --output runtime-logs\sige-aws-cutover.dump
```

Restore only:

```powershell
npm.cmd run db:transfer --workspace @sige/api -- --mode restore --target-url "postgresql://..." --input runtime-logs\sige-aws-cutover.dump
```

## Recommended production sequence

1. Apply Prisma migrations in the destination with `npm.cmd run db:migrate:deploy --workspace @sige/api`
2. Run the legacy extractor from `SIGE_2`
3. Dry-run the importer and review `runtime-logs/intranet-business-import-report.json`
4. Apply the importer into the normalized source database
5. Validate business counts and critical user journeys in `SIGE_2`
6. Copy the normalized PostgreSQL database from Supabase to AWS
7. Point runtime secrets and application config to AWS
8. Execute the cutover checklist in [docs/aws-cutover-checklist.md](docs/aws-cutover-checklist.md)

## Safety notes

- `Intranet` remains read-only in this workflow
- do not use `--replace` against a productive database unless you intend to refresh imported domain data
- run user metadata migration separately if you also need `Usuarios`
- apply Prisma schema changes in the destination before the import if that database does not yet include the latest models
