CREATE TABLE IF NOT EXISTS "AccountingAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "satGroupingCode" TEXT,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "nature" TEXT NOT NULL DEFAULT 'DEBIT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "exportedAt" TIMESTAMP(3),
    "requiresRegeneration" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccountingCfdiDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "uuid" TEXT NOT NULL,
    "version" TEXT,
    "type" TEXT NOT NULL,
    "issuerRfc" TEXT NOT NULL,
    "issuerName" TEXT,
    "receiverRfc" TEXT NOT NULL,
    "receiverName" TEXT,
    "issueDate" TIMESTAMP(3),
    "certificationDate" TIMESTAMP(3),
    "subtotalMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "paymentMethod" TEXT,
    "paymentForm" TEXT,
    "usage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "linkedSourceType" TEXT,
    "linkedSourceId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "xmlContent" TEXT NOT NULL,
    "parsedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingCfdiDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingCfdiDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccountingJournalEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "entryDate" DATE NOT NULL,
    "number" TEXT NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "description" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceFingerprint" TEXT,
    "cfdiDocumentId" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingJournalEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingJournalEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingJournalEntry_cfdiDocumentId_fkey" FOREIGN KEY ("cfdiDocumentId") REFERENCES "AccountingCfdiDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccountingJournalLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "debitMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingJournalLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingJournalLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingJournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountingJournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccountingRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "ruleType" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "taxAccountId" TEXT,
    "cashAccountId" TEXT,
    "counterAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccountingSettings" (
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "companyRfc" TEXT,
    "legalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("organizationId"),
    CONSTRAINT "AccountingSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingAccount_organizationId_code_key" ON "AccountingAccount"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "AccountingAccount_organizationId_type_isActive_idx" ON "AccountingAccount"("organizationId", "type", "isActive");
CREATE INDEX IF NOT EXISTS "AccountingAccount_organizationId_parentId_idx" ON "AccountingAccount"("organizationId", "parentId");

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingPeriod_organizationId_year_month_key" ON "AccountingPeriod"("organizationId", "year", "month");
CREATE INDEX IF NOT EXISTS "AccountingPeriod_organizationId_year_month_status_idx" ON "AccountingPeriod"("organizationId", "year", "month", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingCfdiDocument_organizationId_uuid_key" ON "AccountingCfdiDocument"("organizationId", "uuid");
CREATE INDEX IF NOT EXISTS "AccountingCfdiDocument_organizationId_issueDate_idx" ON "AccountingCfdiDocument"("organizationId", "issueDate");
CREATE INDEX IF NOT EXISTS "AccountingCfdiDocument_organizationId_issuerRfc_idx" ON "AccountingCfdiDocument"("organizationId", "issuerRfc");
CREATE INDEX IF NOT EXISTS "AccountingCfdiDocument_organizationId_receiverRfc_idx" ON "AccountingCfdiDocument"("organizationId", "receiverRfc");

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingJournalEntry_organizationId_year_month_number_key" ON "AccountingJournalEntry"("organizationId", "year", "month", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingJournalEntry_organizationId_sourceType_sourceFingerprint_key" ON "AccountingJournalEntry"("organizationId", "sourceType", "sourceFingerprint");
CREATE INDEX IF NOT EXISTS "AccountingJournalEntry_organizationId_year_month_entryDate_idx" ON "AccountingJournalEntry"("organizationId", "year", "month", "entryDate");
CREATE INDEX IF NOT EXISTS "AccountingJournalEntry_organizationId_sourceType_sourceId_idx" ON "AccountingJournalEntry"("organizationId", "sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "AccountingJournalLine_organizationId_entryId_idx" ON "AccountingJournalLine"("organizationId", "entryId");
CREATE INDEX IF NOT EXISTS "AccountingJournalLine_organizationId_accountId_createdAt_idx" ON "AccountingJournalLine"("organizationId", "accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccountingJournalLine_organizationId_sourceType_sourceId_idx" ON "AccountingJournalLine"("organizationId", "sourceType", "sourceId");

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingRule_organizationId_ruleType_sourceKey_key" ON "AccountingRule"("organizationId", "ruleType", "sourceKey");
CREATE INDEX IF NOT EXISTS "AccountingRule_organizationId_ruleType_isActive_idx" ON "AccountingRule"("organizationId", "ruleType", "isActive");
