-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "shortName" TEXT,
    "role" TEXT NOT NULL,
    "legacyRole" TEXT NOT NULL,
    "team" TEXT,
    "legacyTeam" TEXT,
    "specificRole" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "emailConfirmedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "clientNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "responsibleTeam" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "quoteType" TEXT NOT NULL,
    "amountColumns" JSONB,
    "tableRows" JSONB,
    "lineItems" JSONB NOT NULL,
    "totalMxn" DECIMAL(65,30) NOT NULL,
    "milestone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteTemplate" (
    "id" TEXT NOT NULL,
    "templateNumber" TEXT,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "services" TEXT,
    "quoteType" TEXT NOT NULL,
    "amountColumns" JSONB,
    "tableRows" JSONB,
    "lineItems" JSONB NOT NULL,
    "totalMxn" DECIMAL(65,30) NOT NULL,
    "milestone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "quoteId" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "prospectName" TEXT,
    "commissionAssignee" TEXT,
    "quoteNumber" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "amountMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "communicationChannel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "lastInteractionLabel" TEXT,
    "lastInteraction" TIMESTAMP(3),
    "nextInteractionLabel" TEXT,
    "nextInteraction" TIMESTAMP(3),
    "notes" TEXT,
    "sentToClientAt" TIMESTAMP(3),
    "sentToMattersAt" TIMESTAMP(3),
    "hiddenFromTracking" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" TEXT NOT NULL,
    "matterNumber" TEXT NOT NULL,
    "clientId" TEXT,
    "clientNumber" TEXT,
    "quoteId" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "quoteNumber" TEXT,
    "commissionAssignee" TEXT,
    "matterType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "subject" TEXT NOT NULL DEFAULT '',
    "specificProcess" TEXT,
    "totalFeesMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "responsibleTeam" TEXT,
    "nextPaymentDate" TIMESTAMP(3),
    "communicationChannel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "r1InternalCreated" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotLinked" BOOLEAN NOT NULL DEFAULT false,
    "rdCreated" BOOLEAN NOT NULL DEFAULT false,
    "rfCreated" TEXT NOT NULL DEFAULT 'NO',
    "r1ExternalCreated" BOOLEAN NOT NULL DEFAULT false,
    "billingChatCreated" BOOLEAN NOT NULL DEFAULT false,
    "matterIdentifier" TEXT,
    "executionLinkedModule" TEXT,
    "executionLinkedAt" TIMESTAMP(3),
    "executionPrompt" TEXT,
    "nextAction" TEXT,
    "nextActionDueAt" TIMESTAMP(3),
    "nextActionSource" TEXT,
    "milestone" TEXT,
    "concluded" BOOLEAN NOT NULL DEFAULT false,
    "stage" TEXT NOT NULL DEFAULT 'INTAKE',
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneralExpense" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "amountMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "countsTowardLimit" BOOLEAN NOT NULL DEFAULT false,
    "team" TEXT NOT NULL DEFAULT 'Sin equipo',
    "generalExpense" BOOLEAN NOT NULL DEFAULT false,
    "expenseWithoutTeam" BOOLEAN NOT NULL DEFAULT false,
    "pctLitigation" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pctCorporateLabor" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pctSettlements" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pctFinancialLaw" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pctTaxCompliance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'Transferencia',
    "bank" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "approvedByEmrt" BOOLEAN NOT NULL DEFAULT false,
    "paidByEmrtAt" DATE,
    "reviewedByJnls" BOOLEAN NOT NULL DEFAULT false,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionReceiver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionReceiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRecord" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "clientNumber" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "quoteNumber" TEXT,
    "matterType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "subject" TEXT NOT NULL DEFAULT '',
    "contractSignedStatus" TEXT NOT NULL DEFAULT 'NO',
    "responsibleTeam" TEXT,
    "totalMatterMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "workingConcepts" TEXT,
    "conceptFeesMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "previousPaymentsMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nextPaymentDate" TIMESTAMP(3),
    "nextPaymentNotes" TEXT,
    "paidThisMonthMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "payment2Mxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "payment3Mxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentDate1" TIMESTAMP(3),
    "paymentDate2" TIMESTAMP(3),
    "paymentDate3" TIMESTAMP(3),
    "expenseNotes1" TEXT,
    "expenseNotes2" TEXT,
    "expenseNotes3" TEXT,
    "expenseAmount1Mxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expenseAmount2Mxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expenseAmount3Mxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pctLitigation" INTEGER NOT NULL DEFAULT 0,
    "pctCorporateLabor" INTEGER NOT NULL DEFAULT 0,
    "pctSettlements" INTEGER NOT NULL DEFAULT 0,
    "pctFinancialLaw" INTEGER NOT NULL DEFAULT 0,
    "pctTaxCompliance" INTEGER NOT NULL DEFAULT 0,
    "clientCommissionRecipient" TEXT,
    "closingCommissionRecipient" TEXT,
    "milestone" TEXT,
    "concluded" BOOLEAN NOT NULL DEFAULT false,
    "financeComments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSnapshot" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "totalIncomeMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalExpenseMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "snapshotData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSnapshot" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalNetMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "snapshotData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskModule" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTrack" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "trackCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskItem" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "matterId" TEXT,
    "matterNumber" TEXT,
    "subject" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTrackingRecord" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "tableCode" TEXT NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "matterId" TEXT,
    "matterNumber" TEXT,
    "clientNumber" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "specificProcess" TEXT,
    "matterIdentifier" TEXT,
    "taskName" TEXT NOT NULL DEFAULT '',
    "eventName" TEXT,
    "responsible" TEXT NOT NULL DEFAULT '',
    "dueDate" DATE,
    "termDate" DATE,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "workflowStage" INTEGER NOT NULL DEFAULT 1,
    "reportedMonth" TEXT,
    "termId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTrackingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTerm" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "sourceTable" TEXT,
    "sourceRecordId" TEXT,
    "matterId" TEXT,
    "matterNumber" TEXT,
    "clientNumber" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "specificProcess" TEXT,
    "matterIdentifier" TEXT,
    "eventName" TEXT NOT NULL DEFAULT '',
    "pendingTaskLabel" TEXT,
    "responsible" TEXT NOT NULL DEFAULT '',
    "dueDate" DATE,
    "termDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "reportedMonth" TEXT,
    "verification" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDistributionEvent" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetTables" JSONB NOT NULL DEFAULT '[]',
    "defaultTaskName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskDistributionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDistributionHistory" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "matterId" TEXT,
    "matterNumber" TEXT,
    "clientNumber" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "specificProcess" TEXT,
    "matterIdentifier" TEXT,
    "eventName" TEXT NOT NULL DEFAULT '',
    "targetTables" JSONB NOT NULL DEFAULT '[]',
    "eventNamesPerTable" JSONB NOT NULL DEFAULT '[]',
    "createdIds" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskDistributionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAdditionalTask" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "responsible2" TEXT,
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAdditionalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_consumedAt_expiresAt_idx" ON "PasswordResetToken"("userId", "consumedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_clientNumber_key" ON "Client"("clientNumber");

-- CreateIndex
CREATE INDEX "Client_deletedAt_clientNumber_idx" ON "Client"("deletedAt", "clientNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteTemplate_templateNumber_key" ON "QuoteTemplate"("templateNumber");

-- CreateIndex
CREATE INDEX "QuoteTemplate_team_name_idx" ON "QuoteTemplate"("team", "name");

-- CreateIndex
CREATE INDEX "QuoteTemplate_createdAt_idx" ON "QuoteTemplate"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_status_hiddenFromTracking_sentToMattersAt_idx" ON "Lead"("status", "hiddenFromTracking", "sentToMattersAt");

-- CreateIndex
CREATE INDEX "Lead_sentToClientAt_idx" ON "Lead"("sentToClientAt");

-- CreateIndex
CREATE UNIQUE INDEX "Matter_matterNumber_key" ON "Matter"("matterNumber");

-- CreateIndex
CREATE INDEX "Matter_deletedAt_createdAt_idx" ON "Matter"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Matter_matterType_deletedAt_idx" ON "Matter"("matterType", "deletedAt");

-- CreateIndex
CREATE INDEX "Matter_quoteNumber_idx" ON "Matter"("quoteNumber");

-- CreateIndex
CREATE INDEX "GeneralExpense_year_month_createdAt_idx" ON "GeneralExpense"("year", "month", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionReceiver_name_key" ON "CommissionReceiver"("name");

-- CreateIndex
CREATE INDEX "FinanceRecord_year_month_createdAt_idx" ON "FinanceRecord"("year", "month", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceRecord_year_month_quoteNumber_idx" ON "FinanceRecord"("year", "month", "quoteNumber");

-- CreateIndex
CREATE INDEX "FinanceRecord_year_month_clientName_subject_idx" ON "FinanceRecord"("year", "month", "clientName", "subject");

-- CreateIndex
CREATE INDEX "FinanceSnapshot_year_month_createdAt_idx" ON "FinanceSnapshot"("year", "month", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionSnapshot_year_month_section_createdAt_idx" ON "CommissionSnapshot"("year", "month", "section", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTrack_moduleId_trackCode_key" ON "TaskTrack"("moduleId", "trackCode");

-- CreateIndex
CREATE INDEX "TaskItem_moduleId_trackId_state_dueDate_idx" ON "TaskItem"("moduleId", "trackId", "state", "dueDate");

-- CreateIndex
CREATE INDEX "TaskTrackingRecord_moduleId_tableCode_status_dueDate_idx" ON "TaskTrackingRecord"("moduleId", "tableCode", "status", "dueDate");

-- CreateIndex
CREATE INDEX "TaskTrackingRecord_sourceTable_status_idx" ON "TaskTrackingRecord"("sourceTable", "status");

-- CreateIndex
CREATE INDEX "TaskTrackingRecord_matterId_idx" ON "TaskTrackingRecord"("matterId");

-- CreateIndex
CREATE INDEX "TaskTerm_moduleId_status_termDate_idx" ON "TaskTerm"("moduleId", "status", "termDate");

-- CreateIndex
CREATE INDEX "TaskTerm_sourceTable_sourceRecordId_idx" ON "TaskTerm"("sourceTable", "sourceRecordId");

-- CreateIndex
CREATE INDEX "TaskDistributionEvent_moduleId_name_idx" ON "TaskDistributionEvent"("moduleId", "name");

-- CreateIndex
CREATE INDEX "TaskDistributionHistory_moduleId_createdAt_idx" ON "TaskDistributionHistory"("moduleId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskDistributionHistory_matterId_idx" ON "TaskDistributionHistory"("matterId");

-- CreateIndex
CREATE INDEX "TaskAdditionalTask_moduleId_status_dueDate_idx" ON "TaskAdditionalTask"("moduleId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTrack" ADD CONSTRAINT "TaskTrack_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TaskModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TaskModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

