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

## Local setup

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

3. Point `DATABASE_URL` to PostgreSQL.

4. Generate Prisma client:

```bash
npm run db:generate --workspace @sige/api
```

5. Apply your Prisma migration workflow, then seed baseline data:

```bash
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

1. Add Prisma migrations and import scripts for legacy `Intranet` data.
2. Move auth from seeded local credentials to full persistent user administration and optional SSO/OAuth.
3. Add audit logging, S3 document storage, and background jobs for recurring task generation.
4. Migrate the remaining legacy modules: finance ledger, expenses, commissions, KPI history, calculators, and document library.

## Users migration

The `Usuarios` module now has a dedicated metadata migration path documented in [docs/users-migration.md](docs/users-migration.md).

Prepared assets:

- extraction SQL from `Intranet` metadata
- dry-run/apply importer into `SIGE_2`
- password strategy based on metadata-only import plus forced reset

## Onboarding and reset flow

Imported users now land in a secure onboarding flow instead of reusing legacy passwords.

- public request page: `/intranet-password-help`
- reset completion page: `/intranet-reset-password?token=...`
- admin manual link generation: `Usuarios` module
- imported `@calculadora.app` users are marked with `passwordResetRequired = true`

Local usage:

1. Open the RC access page and choose `Activar cuenta o restablecer contrasena`.
2. Enter the imported username or email.
3. In local development, SIGE_2 shows a preview reset link.
4. Open the link, define a new password, and the user is signed in automatically.
