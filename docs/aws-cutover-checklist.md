# Supabase to AWS Cutover Checklist

This checklist is the operational sequence for moving `SIGE_2` from a Supabase-backed PostgreSQL environment to AWS RDS or Aurora PostgreSQL with the least amount of manual work and the clearest rollback path.

## Scope

- source database: Supabase PostgreSQL already populated for `SIGE_2`
- target database: AWS RDS PostgreSQL or Aurora PostgreSQL
- schema management: Prisma migrations
- business payload: imported legacy `Intranet` data plus current `SIGE_2` data

## Preconditions

1. `SIGE_2` code deployed and stable in the source environment
2. AWS PostgreSQL reachable from the API runtime
3. destination secrets prepared for `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WEB_ORIGIN`, `WEB_ORIGINS`, and `OPENAI_API_KEY`
4. `pg_dump` and `pg_restore` available on the operator machine or release runner
5. versioned Prisma migrations present in [apps/api/prisma/migrations](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/apps/api/prisma/migrations)

## 1. Freeze window

1. announce the maintenance window
2. stop admin bulk edits and imports
3. avoid running the legacy importer during the final cutover unless it is part of the planned final sync

## 2. Final source validation

1. confirm the current source database URL points to Supabase
2. run `npm.cmd run db:migrate:status --workspace @sige/api`
3. verify key business counts in source:
   - clients
   - quotes
   - leads
   - matters
   - finance records
   - commission snapshots
   - task tracking rows

## 3. Prepare AWS destination

1. create the target PostgreSQL database in RDS or Aurora
2. point `DATABASE_URL` to AWS in a controlled shell
3. apply the versioned schema:

```powershell
npm.cmd run db:migrate:deploy --workspace @sige/api
```

4. confirm Prisma status again:

```powershell
npm.cmd run db:migrate:status --workspace @sige/api
```

## 4. Create final backup from Supabase

Keep a restorable dump before switching traffic.

```powershell
npm.cmd run db:transfer --workspace @sige/api -- --mode dump --source-url "postgresql://SUPABASE..." --output runtime-logs\sige-pre-cutover.dump
```

## 5. Copy normalized `SIGE_2` data to AWS

For the primary transfer:

```powershell
npm.cmd run db:transfer --workspace @sige/api -- --mode copy --source-url "postgresql://SUPABASE..." --target-url "postgresql://AWS..."
```

If you already created a dump in step 4 and want a two-step restore:

```powershell
npm.cmd run db:transfer --workspace @sige/api -- --mode restore --target-url "postgresql://AWS..." --input runtime-logs\sige-pre-cutover.dump
```

## 6. Post-copy validation

1. compare source and target row counts for the main domains
2. confirm a sample of the newest business records exists in AWS
3. validate these app flows against AWS:
   - login
   - clients list / create / edit / delete
   - quote create / export
   - lead tracking
   - active matters
   - finance snapshots
   - commissions
   - tasks and execution tracking

## 7. Switch application configuration

1. update ECS / container / secret configuration to the AWS `DATABASE_URL`
2. redeploy the API if needed
3. keep the frontend origin and API base URL aligned with the production host
4. confirm the API runtime secret also includes OpenAI access for template translation:

```powershell
$secretId="arn:aws:secretsmanager:us-east-1:110661052936:secret:sige-prod-api-config-ALU8io"
$secret = aws secretsmanager get-secret-value --secret-id $secretId --query SecretString --output text | ConvertFrom-Json
$secret | Add-Member -NotePropertyName OPENAI_API_KEY -NotePropertyValue $env:OPENAI_API_KEY -Force
$secret | Add-Member -NotePropertyName OPENAI_BASE_URL -NotePropertyValue "https://api.openai.com/v1" -Force
$secret | Add-Member -NotePropertyName OPENAI_QUOTE_TRANSLATION_MODEL -NotePropertyValue "gpt-4o-mini" -Force
$secret | Add-Member -NotePropertyName OPENAI_QUOTE_TRANSLATION_TIMEOUT_MS -NotePropertyValue 45000 -Force
aws secretsmanager put-secret-value --secret-id $secretId --secret-string ($secret | ConvertTo-Json -Compress)
```

5. verify health checks and application startup logs
6. run the AWS runtime guardrail before handing the environment back to users:

```powershell
npm.cmd run aws:verify-runtime --workspace @sige/api -- `
  --app-secret-id "arn:aws:secretsmanager:us-east-1:110661052936:secret:sige-prod-api-config-ALU8io" `
  --rds-secret-id "arn:aws:secretsmanager:us-east-1:110661052936:secret:rds!db-4d317298-c0ba-44a8-97f0-02ab35a3dc75-ZkgZoU" `
  --api-base-url "https://api.pruebasb.online"
```

For a full login smoke test, set these only in the shell session before running the command:

```powershell
$env:SIGE_VERIFY_LOGIN_IDENTIFIER="Eduardo Rusconi"
$env:SIGE_VERIFY_LOGIN_PASSWORD="REPLACE_WITH_TEST_PASSWORD"
```

The guardrail fails the deployment if the API secret is malformed, if `OPENAI_API_KEY` is missing, if `DATABASE_URL` no longer matches the active RDS secret, or if the production health endpoint fails.

If the command runs from inside the AWS VPC or from a runner with network access to the private RDS endpoint, add `--direct-db` to also open a Prisma connection directly from the runner:

```powershell
npm.cmd run aws:verify-runtime --workspace @sige/api -- `
  --app-secret-id "arn:aws:secretsmanager:us-east-1:110661052936:secret:sige-prod-api-config-ALU8io" `
  --rds-secret-id "arn:aws:secretsmanager:us-east-1:110661052936:secret:rds!db-4d317298-c0ba-44a8-97f0-02ab35a3dc75-ZkgZoU" `
  --api-base-url "https://api.pruebasb.online" `
  --direct-db
```

## 8. Smoke test after cutover

1. sign in with an existing user
2. load dashboard, clients, quotes, leads, matters, finances and tasks
3. create one non-destructive record in a safe module if the window allows it
4. confirm the new record lands in AWS, not Supabase

## 9. Rollback plan

Rollback conditions:

- migration deploy fails in AWS
- row-count deltas are unexplained
- login or key business flows fail after switch

Rollback steps:

1. point runtime `DATABASE_URL` back to Supabase
2. redeploy or recycle the API tasks
3. confirm health checks
4. notify stakeholders the cutover was reverted
5. preserve the failed AWS dump and logs for inspection

## Notes

- `Intranet` remains read-only throughout this process
- the legacy importer should be run before the final database copy, not after the app is already live on AWS
- quote export is now expected to run on Linux hosts, but any remaining Windows-only integrations should be removed before production cutover
