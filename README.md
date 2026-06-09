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

2. Copy env files:

```bash
copy .env.example .env
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
```

3. Point `DATABASE_URL` to your managed PostgreSQL instance.
   Recommended: AWS RDS or Aurora PostgreSQL, with secrets injected from Secrets Manager.

4. Generate Prisma client:

```bash
npm run db:generate --workspace @sige/api
```

5. Apply Prisma migrations, then seed baseline data:

```bash
npm run db:migrate:deploy --workspace @sige/api
npm run db:seed --workspace @sige/api
```

6. Start the backend:

```bash
npm run dev:api
```

7. Start the frontend in another terminal:

```bash
npm run dev:web
```

8. For local verification, sign in through `/intranet-login?organization=rusconi-consulting`.
   Seeded development databases include superadmin users with the seed password shown in `apps/api/prisma/seed.ts`.

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

For local API startup, `npm run dev:api` respects `SIGE_USE_RDS_TUNNEL`. If the RDS tunnel is requested but AWS SSM is unavailable, the dev script falls back to `SIGE_LOCAL_DATABASE_URL` unless `SIGE_RDS_TUNNEL_REQUIRED=true`.

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
