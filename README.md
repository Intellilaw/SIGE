# SIGE_2

`SIGE_2` is a ground-up rebuild of the legacy `Intranet` system with a clear frontend/backend split, stronger security controls, and an AWS-ready deployment model.

## What was extracted from Intranet

The reference project is a large React + Vite single-page app that talks directly to Supabase from the browser. Its strongest business signals are:

- client catalog, quote catalog, quote history, and lead follow-up
- active matters that move work into execution teams
- team-based task tracking for litigation, corporate/labor, settlements, financial law, and tax compliance
- recurring terms and due-date workflows with business-day rules
- finance, expenses, commissions, document library, KPI dashboards, and admin user management

The analysis and migration notes are documented in [docs/intranet-analysis.md](docs/intranet-analysis.md) and [docs/architecture.md](docs/architecture.md).

## Architecture chosen for SIGE_2

- `apps/api`: Fastify + TypeScript backend with JWT auth, RBAC, validation, rate limiting, Prisma repositories, and modular domain routes
- `apps/web`: React + Vite + TypeScript frontend that consumes the API only
- `packages/contracts`: shared domain contracts and task-module definitions extracted from the legacy system
- `apps/api/prisma/schema.prisma`: PostgreSQL schema targeting AWS RDS / Aurora PostgreSQL
- `infra/aws`: deployment guidance for ECS Fargate, ALB, Secrets Manager, CloudFront, and RDS

This structure keeps the backend stateless and horizontally scalable, while leaving room to split domains into microservices later.

## Current implementation scope

The repository now includes an initial production-oriented foundation plus the first persisted migration slice:

- token-based authentication with refresh-token rotation
- Prisma-backed repositories for users, clients, quotes, leads, matters, dashboard, and task tracking
- task modules persisted in the database instead of being runtime-only state
- RBAC and team-aware permissions in the backend
- a frontend shell with dashboard and core operational screens
- environment examples, Dockerfiles, Prisma schema, AWS deployment notes, and a database seed path

## Workspace layout

```text
SIGE_2/
  apps/
    api/
    web/
  packages/
    contracts/
  docs/
  infra/
```

## Environment setup

1. Install dependencies:

```bash
npm install
```

### Local development with local PostgreSQL

1. Copy the local example files:

```bash
copy .env.local.example .env.local
copy apps\api\.env.local.example apps\api\.env.local
copy apps\web\.env.local.example apps\web\.env.local
```

2. Edit only the copied local files and set:

- `APP_ENV=local`
- `DATABASE_URL` to your local PostgreSQL database only, using `localhost`, `127.0.0.1`, or `::1`
- local JWT/SSO placeholders with non-production development values

Do not paste an AWS RDS production URL into `.env`, `.env.local`, `apps/api/.env`, or `apps/api/.env.local`.

3. Make sure the local PostgreSQL database named in `DATABASE_URL` exists, then generate Prisma:

```bash
npm run db:local:generate
```

4. Apply migrations and seed baseline data against local PostgreSQL:

```bash
npm run db:local:migrate
npm run db:local:seed
```

5. Start the backend:

```bash
npm run dev:local:api
```

6. Start the frontend in another terminal:

```bash
npm run dev:local:web
```

7. For local verification, sign in through `/intranet-login?organization=rusconi-consulting`.
   Seeded local databases include superadmin users with the seed password shown in `apps/api/prisma/seed.ts`.

The API refuses to start with `APP_ENV=local` or `APP_ENV=test` when `DATABASE_URL` points to a remote host. Local scripts also reject `SIGE_USE_RDS_TUNNEL=true`.

### Refresh local data from production RDS

The local app must keep using local PostgreSQL:

```text
DATABASE_URL=postgresql://...@127.0.0.1:15432/sige_2?schema=public
```

Production RDS is only a dump source. Do not change local `DATABASE_URL` to an RDS URL.

Downloaded snapshots are written to `db_snapshots/`, which is ignored by Git because dumps can contain production data.

1. Prepare an existing private S3 bucket for dump files. The bucket must already exist; the dump script will not create it. Required bucket settings:

```text
Full S3 Public Access Block enabled
No public bucket policy
No public ACL grants
Uploads encrypted server-side
```

Use that bucket name in `SIGE_RDS_DUMP_BUCKET`. The AWS caller needs read-only bucket checks such as `s3:HeadBucket`, `s3:GetBucketPublicAccessBlock`, `s3:GetBucketPolicyStatus`, and `s3:GetBucketAcl`; it also needs `ssm:SendCommand`, `ssm:GetCommandInvocation`, and `secretsmanager:DescribeSecret`. The SSM bastion instance role needs `secretsmanager:GetSecretValue` for `sige-prod-readonly-dump`, plus `s3:PutObject` and `s3:GetObject` for the dump prefix. The bastion also needs AWS CLI, `pg_dump`, `python3`, and `sha256sum`.

2. In a controlled shell, set only the AWS/S3 dump settings. Do not set `RDS_SOURCE_DATABASE_URL`; `db:rds:dump` refuses to run when that variable is present.

```powershell
$env:AWS_PROFILE="intellilaw-deploy"
$env:AWS_REGION="us-east-1"
$env:SIGE_RDS_DUMP_BUCKET="<existing-private-dump-bucket>"
$env:SIGE_RDS_DUMP_PREFIX="prod-rds-readonly"
```

3. Create a production dump through the existing SSM bastion:

```bash
npm run db:rds:dump -- --preflight-only --bucket sige-prod-readonly-dumps-110661052936-us-east-1
```

The preflight checks AWS access, the SSM bastion connection, the read-only secret metadata, and the S3 bucket privacy/encryption/lifecycle settings without sending the remote dump command.

```bash
npm run db:rds:dump
```

This command sends a read-only `pg_dump` job to the bastion. The remote script uses only Secrets Manager secret `sige-prod-readonly-dump`, rejects `username=sige_admin`, rejects any username other than `sige_readonly_dump`, and aborts unless the secret has `dbname=sige`. It does not read `DATABASE_URL`, does not read app secrets, does not open RDS to the Internet, and does not modify security groups.

The temporary dump exists only under `/tmp` on the bastion, with `umask 077`, and is deleted at the end. The dump and checksum are uploaded to S3 with server-side encryption, then the script verifies that the uploaded objects are encrypted.

4. Download the dump from S3 into the ignored local snapshots folder:

```powershell
New-Item -ItemType Directory -Force db_snapshots
aws s3 cp "s3://<existing-private-dump-bucket>/prod-rds-readonly/<dump-file>.dump" ".\db_snapshots\latest-prod.dump" --profile intellilaw-deploy --region us-east-1
aws s3 cp "s3://<existing-private-dump-bucket>/prod-rds-readonly/<dump-file>.dump.sha256" ".\db_snapshots\latest-prod.dump.sha256" --profile intellilaw-deploy --region us-east-1
```

5. Optional: create a manual backup of the current local database:

```bash
npm run db:local:backup
```

6. Restore a dump into local PostgreSQL only:

```bash
npm run db:local:restore -- --input db_snapshots/latest-prod.dump
```

The restore script refuses to run unless `APP_ENV=local` and `DATABASE_URL` points exactly to `127.0.0.1:15432/sige_2`. Before restoring, it creates a local backup in `db_snapshots/` and asks you to type `RESTORE sige_2`.

These refresh scripts do not run Prisma migrations, do not seed, do not modify RDS, and do not make the local app connect to RDS.

### Production

Production must run with `APP_ENV=production` and an AWS RDS PostgreSQL `DATABASE_URL` injected through AWS Secrets Manager or the deployment environment. Do not commit production credentials to any env file.

Run production database commands only from a controlled deployment shell with `APP_ENV=production` and the intended RDS secret loaded:

```bash
npm run db:migrate:deploy --workspace @sige/api
```

## Rusconi Intelligence

Rusconi Intelligence runs from the backend so local and production use the same secured flow.

Required runtime settings:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`, normally `https://api.openai.com/v1`
- `OPENAI_RUSCONI_INTELLIGENCE_MODEL`, default `gpt-5.5`
- `OPENAI_RUSCONI_INTELLIGENCE_TIMEOUT_MS`
- `INTELLILAW_BOT_API_URL` and, when required by the bot service, `INTELLILAW_BOT_API_KEY`
- `TELEGRAM_GROUP_LOOKUP_TIMEOUT_MS`

Readiness check:

```bash
curl http://localhost:4000/api/v1/health/rusconi-intelligence
```

Protected app routes such as `/app/execution/litigio` are expected to redirect to the access page when there is no active session. In production this must remain protected; in local, log in with a seeded or migrated user before testing RI columns.

## Security baseline

- access and refresh JWT separation
- hashed refresh tokens persisted in PostgreSQL
- input validation with `zod`
- rate limiting and secure headers
- origin allowlist for CORS
- no browser-to-database direct access
- centralized authorization rules
- environment-based secrets handling

## Deployment direction

- frontend: S3 + CloudFront
- backend: ECS Fargate behind ALB or API Gateway
- database: AWS RDS PostgreSQL or Aurora PostgreSQL
- secrets: AWS Secrets Manager
- logs: CloudWatch
- edge protection: AWS WAF

## Next migration steps

1. Replace browser-side token storage with HttpOnly/SameSite cookies.
2. Add audit logging, S3 document storage, and background jobs for recurring task generation.
3. Finish replacing any Windows-only document generation flows with Linux-safe renderers.
4. Migrate the remaining legacy modules: KPI history, calculators, and document library.

## Users migration

The `Usuarios` module now has a dedicated metadata migration path documented in [docs/users-migration.md](docs/users-migration.md).

Business-data migration from legacy `Intranet` into the normalized `SIGE_2` schema is documented in [docs/business-data-migration.md](docs/business-data-migration.md).

The operational cutover checklist for Supabase -> AWS is documented in [docs/aws-cutover-checklist.md](docs/aws-cutover-checklist.md).

Prepared assets:

- extraction SQL from `Intranet` metadata
- dry-run/apply importer into `SIGE_2`
- password strategy based on metadata-only import plus forced reset
- business-data extractor/importer for operational modules
- PostgreSQL transfer helper for Supabase -> AWS cutover
- Prisma baseline migration for `migrate deploy`

## Onboarding and reset flow

Imported users now land in a secure onboarding flow instead of reusing legacy passwords.

- public request page: `/intranet-password-help`
- reset completion page: `/intranet-reset-password?token=...`
- admin manual link generation: `Usuarios` module
- imported `@calculadora.app` users are marked with `passwordResetRequired = true`

Development usage:

1. Open the RC access page and choose `Activar cuenta o restablecer contrasena`.
2. Enter the imported username or email.
3. Only if `PASSWORD_RESET_EXPOSE_PREVIEW=true`, SIGE_2 shows a preview reset link.
4. Open the link, define a new password, and the user is signed in automatically.
