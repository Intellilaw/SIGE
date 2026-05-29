-- Create company catalog for SIGE tenants.
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_isActive_name_idx" ON "Organization"("isActive", "name");

INSERT INTO "Organization" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
VALUES
  ('org-rusconi', 'rusconi-consulting', 'Rusconi Consulting', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('org-intellilaw', 'intellilaw', 'Intellilaw', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('org-legalflow', 'legalflow', 'LegalFlow', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "slug" = EXCLUDED."slug",
  "name" = EXCLUDED."name",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "User" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "LaborFile" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "LaborFileDocument" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "LaborVacationEvent" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "LaborGlobalVacationDay" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "Client" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "InternalContract" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "InternalContractTemplate" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "DailyDocumentAssignment" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "Quote" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "QuoteTemplate" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "Lead" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "Matter" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "GeneralExpense" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "GeneralExpensePayrollEntry" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "BudgetPlan" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "BudgetPlanSnapshot" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "CommissionReceiver" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "CommissionExclusion" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "FinanceRecord" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "FinanceSnapshot" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "CommissionSnapshot" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "TaskItem" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "TaskTrackingRecord" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "TaskTerm" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "TaskDistributionEvent" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "TaskDistributionHistory" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "TaskAdditionalTask" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "Holiday" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';

DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_username_key";
DROP INDEX IF EXISTS "Client_clientNumber_key";
DROP INDEX IF EXISTS "InternalContract_contractNumber_key";
DROP INDEX IF EXISTS "InternalContract_sourceMatterId_key";
DROP INDEX IF EXISTS "Quote_quoteNumber_key";
DROP INDEX IF EXISTS "QuoteTemplate_templateNumber_key";
DROP INDEX IF EXISTS "Matter_matterNumber_key";
DROP INDEX IF EXISTS "LaborGlobalVacationDay_date_key";
DROP INDEX IF EXISTS "BudgetPlan_year_month_key";
DROP INDEX IF EXISTS "BudgetPlanSnapshot_year_month_key";
DROP INDEX IF EXISTS "CommissionReceiver_name_key";
DROP INDEX IF EXISTS "CommissionExclusion_year_month_section_group_financeRecordId_key";
DROP INDEX IF EXISTS "Holiday_authorityShortName_date_key";

DROP INDEX IF EXISTS "LaborFile_status_employmentStatus_idx";
DROP INDEX IF EXISTS "LaborFileDocument_laborFileId_documentType_idx";
DROP INDEX IF EXISTS "LaborFileDocument_uploadedAt_idx";
DROP INDEX IF EXISTS "LaborVacationEvent_laborFileId_eventType_idx";
DROP INDEX IF EXISTS "LaborVacationEvent_globalVacationDayId_idx";
DROP INDEX IF EXISTS "LaborVacationEvent_startDate_endDate_idx";
DROP INDEX IF EXISTS "LaborGlobalVacationDay_date_idx";
DROP INDEX IF EXISTS "Client_deletedAt_clientNumber_idx";
DROP INDEX IF EXISTS "InternalContract_contractType_contractNumber_idx";
DROP INDEX IF EXISTS "InternalContract_title_idx";
DROP INDEX IF EXISTS "InternalContract_clientId_idx";
DROP INDEX IF EXISTS "InternalContract_collaboratorName_idx";
DROP INDEX IF EXISTS "InternalContract_sourceQuoteId_idx";
DROP INDEX IF EXISTS "InternalContractTemplate_title_idx";
DROP INDEX IF EXISTS "InternalContractTemplate_createdAt_idx";
DROP INDEX IF EXISTS "DailyDocumentAssignment_clientId_createdAt_idx";
DROP INDEX IF EXISTS "DailyDocumentAssignment_templateId_createdAt_idx";
DROP INDEX IF EXISTS "DailyDocumentAssignment_createdAt_idx";
DROP INDEX IF EXISTS "Quote_title_idx";
DROP INDEX IF EXISTS "QuoteTemplate_team_name_idx";
DROP INDEX IF EXISTS "QuoteTemplate_createdAt_idx";
DROP INDEX IF EXISTS "Lead_status_hiddenFromTracking_sentToMattersAt_idx";
DROP INDEX IF EXISTS "Lead_sentToClientAt_idx";
DROP INDEX IF EXISTS "Matter_deletedAt_createdAt_idx";
DROP INDEX IF EXISTS "Matter_matterType_deletedAt_idx";
DROP INDEX IF EXISTS "Matter_quoteNumber_idx";
DROP INDEX IF EXISTS "GeneralExpense_year_month_createdAt_idx";
DROP INDEX IF EXISTS "GeneralExpensePayrollEntry_year_month_half_createdAt_idx";
DROP INDEX IF EXISTS "GeneralExpensePayrollEntry_laborFileId_idx";
DROP INDEX IF EXISTS "BudgetPlan_year_month_idx";
DROP INDEX IF EXISTS "BudgetPlanSnapshot_year_month_createdAt_idx";
DROP INDEX IF EXISTS "CommissionExclusion_year_month_section_idx";
DROP INDEX IF EXISTS "FinanceRecord_year_month_createdAt_idx";
DROP INDEX IF EXISTS "FinanceRecord_year_month_quoteNumber_idx";
DROP INDEX IF EXISTS "FinanceRecord_year_month_clientName_subject_idx";
DROP INDEX IF EXISTS "FinanceSnapshot_year_month_createdAt_idx";
DROP INDEX IF EXISTS "CommissionSnapshot_year_month_section_createdAt_idx";
DROP INDEX IF EXISTS "TaskItem_moduleId_trackId_state_dueDate_idx";
DROP INDEX IF EXISTS "TaskTrackingRecord_moduleId_tableCode_status_dueDate_idx";
DROP INDEX IF EXISTS "TaskTrackingRecord_sourceTable_status_idx";
DROP INDEX IF EXISTS "TaskTrackingRecord_matterId_idx";
DROP INDEX IF EXISTS "TaskTerm_moduleId_status_termDate_idx";
DROP INDEX IF EXISTS "TaskTerm_sourceTable_sourceRecordId_idx";
DROP INDEX IF EXISTS "TaskDistributionEvent_moduleId_name_idx";
DROP INDEX IF EXISTS "TaskDistributionHistory_moduleId_createdAt_idx";
DROP INDEX IF EXISTS "TaskDistributionHistory_matterId_idx";
DROP INDEX IF EXISTS "TaskAdditionalTask_moduleId_status_dueDate_idx";
DROP INDEX IF EXISTS "Holiday_date_idx";
DROP INDEX IF EXISTS "Holiday_authorityShortName_date_idx";
DROP INDEX IF EXISTS "AuditLog_entityType_entityId_createdAt_idx";

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
  'Eduardo Rusconi',
  'Eduardo Rusconi',
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
ON CONFLICT ("id") DO UPDATE SET
  "organizationId" = EXCLUDED."organizationId",
  "email" = EXCLUDED."email",
  "username" = EXCLUDED."username",
  "displayName" = EXCLUDED."displayName",
  "shortName" = EXCLUDED."shortName",
  "role" = EXCLUDED."role",
  "legacyRole" = EXCLUDED."legacyRole",
  "team" = EXCLUDED."team",
  "legacyTeam" = EXCLUDED."legacyTeam",
  "specificRole" = EXCLUDED."specificRole",
  "permissions" = EXCLUDED."permissions",
  "isActive" = EXCLUDED."isActive",
  "passwordResetRequired" = EXCLUDED."passwordResetRequired",
  "emailConfirmedAt" = EXCLUDED."emailConfirmedAt",
  "passwordHash" = EXCLUDED."passwordHash",
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");
CREATE UNIQUE INDEX "User_organizationId_username_key" ON "User"("organizationId", "username");
CREATE INDEX "User_organizationId_isActive_idx" ON "User"("organizationId", "isActive");
CREATE INDEX "LaborFile_organizationId_status_employmentStatus_idx" ON "LaborFile"("organizationId", "status", "employmentStatus");
CREATE INDEX "LaborFileDocument_organizationId_laborFileId_documentType_idx" ON "LaborFileDocument"("organizationId", "laborFileId", "documentType");
CREATE INDEX "LaborFileDocument_organizationId_uploadedAt_idx" ON "LaborFileDocument"("organizationId", "uploadedAt");
CREATE INDEX "LaborVacationEvent_organizationId_laborFileId_eventType_idx" ON "LaborVacationEvent"("organizationId", "laborFileId", "eventType");
CREATE INDEX "LaborVacationEvent_organizationId_globalVacationDayId_idx" ON "LaborVacationEvent"("organizationId", "globalVacationDayId");
CREATE INDEX "LaborVacationEvent_organizationId_startDate_endDate_idx" ON "LaborVacationEvent"("organizationId", "startDate", "endDate");
CREATE UNIQUE INDEX "LaborGlobalVacationDay_organizationId_date_key" ON "LaborGlobalVacationDay"("organizationId", "date");
CREATE INDEX "LaborGlobalVacationDay_organizationId_date_idx" ON "LaborGlobalVacationDay"("organizationId", "date");
CREATE UNIQUE INDEX "Client_organizationId_clientNumber_key" ON "Client"("organizationId", "clientNumber");
CREATE INDEX "Client_organizationId_deletedAt_clientNumber_idx" ON "Client"("organizationId", "deletedAt", "clientNumber");
CREATE UNIQUE INDEX "InternalContract_organizationId_contractNumber_key" ON "InternalContract"("organizationId", "contractNumber");
CREATE UNIQUE INDEX "InternalContract_organizationId_sourceMatterId_key" ON "InternalContract"("organizationId", "sourceMatterId");
CREATE INDEX "InternalContract_organizationId_contractType_contractNumber_idx" ON "InternalContract"("organizationId", "contractType", "contractNumber");
CREATE INDEX "InternalContract_organizationId_title_idx" ON "InternalContract"("organizationId", "title");
CREATE INDEX "InternalContract_organizationId_clientId_idx" ON "InternalContract"("organizationId", "clientId");
CREATE INDEX "InternalContract_organizationId_collaboratorName_idx" ON "InternalContract"("organizationId", "collaboratorName");
CREATE INDEX "InternalContract_organizationId_sourceQuoteId_idx" ON "InternalContract"("organizationId", "sourceQuoteId");
CREATE INDEX "InternalContractTemplate_organizationId_title_idx" ON "InternalContractTemplate"("organizationId", "title");
CREATE INDEX "InternalContractTemplate_organizationId_createdAt_idx" ON "InternalContractTemplate"("organizationId", "createdAt");
CREATE INDEX "DailyDocumentAssignment_organizationId_clientId_createdAt_idx" ON "DailyDocumentAssignment"("organizationId", "clientId", "createdAt");
CREATE INDEX "DailyDocumentAssignment_organizationId_templateId_createdAt_idx" ON "DailyDocumentAssignment"("organizationId", "templateId", "createdAt");
CREATE INDEX "DailyDocumentAssignment_organizationId_createdAt_idx" ON "DailyDocumentAssignment"("organizationId", "createdAt");
CREATE UNIQUE INDEX "Quote_organizationId_quoteNumber_key" ON "Quote"("organizationId", "quoteNumber");
CREATE INDEX "Quote_organizationId_title_idx" ON "Quote"("organizationId", "title");
CREATE UNIQUE INDEX "QuoteTemplate_organizationId_templateNumber_key" ON "QuoteTemplate"("organizationId", "templateNumber");
CREATE INDEX "QuoteTemplate_organizationId_team_name_idx" ON "QuoteTemplate"("organizationId", "team", "name");
CREATE INDEX "QuoteTemplate_organizationId_createdAt_idx" ON "QuoteTemplate"("organizationId", "createdAt");
CREATE INDEX "Lead_organizationId_status_hiddenFromTracking_sentToMattersAt_idx" ON "Lead"("organizationId", "status", "hiddenFromTracking", "sentToMattersAt");
CREATE INDEX "Lead_organizationId_sentToClientAt_idx" ON "Lead"("organizationId", "sentToClientAt");
CREATE UNIQUE INDEX "Matter_organizationId_matterNumber_key" ON "Matter"("organizationId", "matterNumber");
CREATE INDEX "Matter_organizationId_deletedAt_createdAt_idx" ON "Matter"("organizationId", "deletedAt", "createdAt");
CREATE INDEX "Matter_organizationId_matterType_deletedAt_idx" ON "Matter"("organizationId", "matterType", "deletedAt");
CREATE INDEX "Matter_organizationId_quoteNumber_idx" ON "Matter"("organizationId", "quoteNumber");
CREATE INDEX "GeneralExpense_organizationId_year_month_createdAt_idx" ON "GeneralExpense"("organizationId", "year", "month", "createdAt");
CREATE INDEX "GeneralExpensePayrollEntry_organizationId_year_month_half_createdAt_idx" ON "GeneralExpensePayrollEntry"("organizationId", "year", "month", "half", "createdAt");
CREATE INDEX "GeneralExpensePayrollEntry_organizationId_laborFileId_idx" ON "GeneralExpensePayrollEntry"("organizationId", "laborFileId");
CREATE UNIQUE INDEX "BudgetPlan_organizationId_year_month_key" ON "BudgetPlan"("organizationId", "year", "month");
CREATE INDEX "BudgetPlan_organizationId_year_month_idx" ON "BudgetPlan"("organizationId", "year", "month");
CREATE UNIQUE INDEX "BudgetPlanSnapshot_organizationId_year_month_key" ON "BudgetPlanSnapshot"("organizationId", "year", "month");
CREATE INDEX "BudgetPlanSnapshot_organizationId_year_month_createdAt_idx" ON "BudgetPlanSnapshot"("organizationId", "year", "month", "createdAt");
CREATE UNIQUE INDEX "CommissionReceiver_organizationId_name_key" ON "CommissionReceiver"("organizationId", "name");
CREATE UNIQUE INDEX "CommissionExclusion_organizationId_year_month_section_group_financeRecordId_key" ON "CommissionExclusion"("organizationId", "year", "month", "section", "group", "financeRecordId");
CREATE INDEX "CommissionExclusion_organizationId_year_month_section_idx" ON "CommissionExclusion"("organizationId", "year", "month", "section");
CREATE INDEX "FinanceRecord_organizationId_year_month_createdAt_idx" ON "FinanceRecord"("organizationId", "year", "month", "createdAt");
CREATE INDEX "FinanceRecord_organizationId_year_month_quoteNumber_idx" ON "FinanceRecord"("organizationId", "year", "month", "quoteNumber");
CREATE INDEX "FinanceRecord_organizationId_year_month_clientName_subject_idx" ON "FinanceRecord"("organizationId", "year", "month", "clientName", "subject");
CREATE INDEX "FinanceSnapshot_organizationId_year_month_createdAt_idx" ON "FinanceSnapshot"("organizationId", "year", "month", "createdAt");
CREATE INDEX "CommissionSnapshot_organizationId_year_month_section_createdAt_idx" ON "CommissionSnapshot"("organizationId", "year", "month", "section", "createdAt");
CREATE INDEX "TaskItem_organizationId_moduleId_trackId_state_dueDate_idx" ON "TaskItem"("organizationId", "moduleId", "trackId", "state", "dueDate");
CREATE INDEX "TaskTrackingRecord_organizationId_moduleId_tableCode_status_dueDate_idx" ON "TaskTrackingRecord"("organizationId", "moduleId", "tableCode", "status", "dueDate");
CREATE INDEX "TaskTrackingRecord_organizationId_sourceTable_status_idx" ON "TaskTrackingRecord"("organizationId", "sourceTable", "status");
CREATE INDEX "TaskTrackingRecord_organizationId_matterId_idx" ON "TaskTrackingRecord"("organizationId", "matterId");
CREATE INDEX "TaskTerm_organizationId_moduleId_status_termDate_idx" ON "TaskTerm"("organizationId", "moduleId", "status", "termDate");
CREATE INDEX "TaskTerm_organizationId_sourceTable_sourceRecordId_idx" ON "TaskTerm"("organizationId", "sourceTable", "sourceRecordId");
CREATE INDEX "TaskDistributionEvent_organizationId_moduleId_name_idx" ON "TaskDistributionEvent"("organizationId", "moduleId", "name");
CREATE INDEX "TaskDistributionHistory_organizationId_moduleId_createdAt_idx" ON "TaskDistributionHistory"("organizationId", "moduleId", "createdAt");
CREATE INDEX "TaskDistributionHistory_organizationId_matterId_idx" ON "TaskDistributionHistory"("organizationId", "matterId");
CREATE INDEX "TaskAdditionalTask_organizationId_moduleId_status_dueDate_idx" ON "TaskAdditionalTask"("organizationId", "moduleId", "status", "dueDate");
CREATE UNIQUE INDEX "Holiday_organizationId_authorityShortName_date_key" ON "Holiday"("organizationId", "authorityShortName", "date");
CREATE INDEX "Holiday_organizationId_date_idx" ON "Holiday"("organizationId", "date");
CREATE INDEX "Holiday_organizationId_authorityShortName_date_idx" ON "Holiday"("organizationId", "authorityShortName", "date");
CREATE INDEX "AuditLog_organizationId_entityType_entityId_createdAt_idx" ON "AuditLog"("organizationId", "entityType", "entityId", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LaborFile" ADD CONSTRAINT "LaborFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LaborFileDocument" ADD CONSTRAINT "LaborFileDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LaborVacationEvent" ADD CONSTRAINT "LaborVacationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LaborGlobalVacationDay" ADD CONSTRAINT "LaborGlobalVacationDay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalContract" ADD CONSTRAINT "InternalContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalContractTemplate" ADD CONSTRAINT "InternalContractTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyDocumentAssignment" ADD CONSTRAINT "DailyDocumentAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteTemplate" ADD CONSTRAINT "QuoteTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneralExpense" ADD CONSTRAINT "GeneralExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneralExpensePayrollEntry" ADD CONSTRAINT "GeneralExpensePayrollEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetPlan" ADD CONSTRAINT "BudgetPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetPlanSnapshot" ADD CONSTRAINT "BudgetPlanSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionReceiver" ADD CONSTRAINT "CommissionReceiver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionExclusion" ADD CONSTRAINT "CommissionExclusion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceSnapshot" ADD CONSTRAINT "FinanceSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionSnapshot" ADD CONSTRAINT "CommissionSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskTrackingRecord" ADD CONSTRAINT "TaskTrackingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskTerm" ADD CONSTRAINT "TaskTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskDistributionEvent" ADD CONSTRAINT "TaskDistributionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskDistributionHistory" ADD CONSTRAINT "TaskDistributionHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAdditionalTask" ADD CONSTRAINT "TaskAdditionalTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
