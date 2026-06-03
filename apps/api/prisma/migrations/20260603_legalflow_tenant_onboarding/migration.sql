-- Activate LegalFlow as SIGE's third tenant and guarantee a clean start.
-- Only rows scoped to org-legalflow are touched.

INSERT INTO "Organization" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
VALUES ('org-legalflow', 'legalflow', 'LegalFlow', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "slug" = EXCLUDED."slug",
  "name" = EXCLUDED."name",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "AuditLog"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "TaskAdditionalTask"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "TaskDistributionHistory"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "TaskDistributionEvent"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "TaskTrackingRecord"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "TaskTerm"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "TaskItem"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "CommissionExclusion"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "CommissionSnapshot"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "FinanceSnapshot"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "FinanceRecord"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "BudgetPlanSnapshot"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "BudgetPlan"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "GeneralExpensePayrollEntry"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "GeneralExpense"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "LaborVacationEvent"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "LaborFileDocument"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "LaborGlobalVacationDay"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "LaborFile"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "ExternalContractRenewalDocument"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "ExternalContractGeneratedDocument"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "ExternalContractMilestone"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "ExternalContractRenewal"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "ExternalContract"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "DailyDocumentAssignment"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "InternalContract"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "InternalContractTemplate"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "Lead"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "Matter"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "Quote"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "QuoteTemplate"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "Client"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "ExternalContractInpc"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "CommissionReceiver"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "Holiday"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "SystemModuleSetting"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "UserTeam"
WHERE "organizationId" = 'org-legalflow';

DELETE FROM "RefreshToken"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "organizationId" = 'org-legalflow'
);

DELETE FROM "PasswordResetToken"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "organizationId" = 'org-legalflow'
);

DELETE FROM "User"
WHERE "organizationId" = 'org-legalflow';

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
  'usr-legalflow-superadmin',
  'org-legalflow',
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
);
