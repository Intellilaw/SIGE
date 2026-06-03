-- Final cleanup for LegalFlow after superadmin provisioning.
-- Leaves only the Organization row and Eduardo's superadmin user.

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
WHERE "organizationId" = 'org-legalflow'
  AND "email" <> 'eduardo.rusconi@intellilaw.ai';
