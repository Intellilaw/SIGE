-- Keep Intellilaw as a clean tenant. This migration only touches rows that
-- already belong to org-intellilaw; Rusconi Consulting rows are not modified.

DELETE FROM "AuditLog"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "TaskAdditionalTask"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "TaskDistributionHistory"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "TaskDistributionEvent"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "TaskTrackingRecord"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "TaskTerm"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "TaskItem"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "CommissionExclusion"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "CommissionSnapshot"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "FinanceSnapshot"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "FinanceRecord"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "BudgetPlanSnapshot"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "BudgetPlan"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "GeneralExpensePayrollEntry"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "GeneralExpense"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "LaborVacationEvent"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "LaborFileDocument"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "LaborGlobalVacationDay"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "LaborFile"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "DailyDocumentAssignment"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "InternalContract"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "InternalContractTemplate"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "Lead"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "Matter"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "Quote"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "QuoteTemplate"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "Client"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "CommissionReceiver"
WHERE "organizationId" = 'org-intellilaw';

DELETE FROM "UserTeam"
WHERE "organizationId" = 'org-intellilaw';

INSERT INTO "User" (
  "id",
  "organizationId",
  "email",
  "username",
  "displayName",
  "shortName",
  "role",
  "legacyRole",
  "team",
  "legacyTeam",
  "specificRole",
  "permissions",
  "isActive",
  "passwordResetRequired",
  "emailConfirmedAt",
  "passwordHash",
  "createdAt",
  "updatedAt"
)
VALUES (
  'usr-intellilaw-superadmin',
  'org-intellilaw',
  'eduardo.rusconi@intellilaw.ai',
  'Eduardo Miguel Rusconi Trujillo',
  'Eduardo Miguel Rusconi Trujillo',
  'EMRT',
  'SUPERADMIN',
  'SUPERADMIN',
  'ADMIN',
  'Direccion general',
  'Direccion general',
  '["*"]'::jsonb,
  true,
  false,
  CURRENT_TIMESTAMP,
  '647db4cd4d9cc595e44dfd387b3c8503:7a0d23addc70906a3bd8d84319dc99be1273fd1a93ba930ebf983c8d5f99da92cdaa8520dfa7be438e3211b8c54e3ef298a1c55149d4285d3fb040e002bdf0cc',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("organizationId", "email") DO UPDATE SET
  "id" = EXCLUDED."id",
  "username" = EXCLUDED."username",
  "displayName" = EXCLUDED."displayName",
  "shortName" = EXCLUDED."shortName",
  "role" = EXCLUDED."role",
  "legacyRole" = EXCLUDED."legacyRole",
  "team" = EXCLUDED."team",
  "legacyTeam" = EXCLUDED."legacyTeam",
  "specificRole" = EXCLUDED."specificRole",
  "permissions" = EXCLUDED."permissions",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "User"
WHERE "organizationId" = 'org-intellilaw'
  AND "id" <> 'usr-intellilaw-superadmin';
