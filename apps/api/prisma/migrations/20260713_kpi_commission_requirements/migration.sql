CREATE TABLE "KpiCommissionObligation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "userId" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "metricLabel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "originDate" DATE NOT NULL,
    "initialAmount" DECIMAL(12,2) NOT NULL,
    "remainingAmount" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '[]',
    "resolvedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiCommissionObligation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KpiCommissionRepair" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "obligationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "repairDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '[]',
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiCommissionRepair_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KpiCommissionObligation_organizationId_userId_metricId_sourceKey_key"
ON "KpiCommissionObligation"("organizationId", "userId", "metricId", "sourceKey");

CREATE INDEX "KpiCommissionObligation_organizationId_userId_originDate_remainingAmount_idx"
ON "KpiCommissionObligation"("organizationId", "userId", "originDate", "remainingAmount");

CREATE INDEX "KpiCommissionObligation_organizationId_metricId_originDate_idx"
ON "KpiCommissionObligation"("organizationId", "metricId", "originDate");

CREATE UNIQUE INDEX "KpiCommissionRepair_organizationId_obligationId_sourceKey_key"
ON "KpiCommissionRepair"("organizationId", "obligationId", "sourceKey");

CREATE INDEX "KpiCommissionRepair_organizationId_userId_metricId_repairDate_idx"
ON "KpiCommissionRepair"("organizationId", "userId", "metricId", "repairDate");

CREATE INDEX "KpiCommissionRepair_organizationId_obligationId_voidedAt_idx"
ON "KpiCommissionRepair"("organizationId", "obligationId", "voidedAt");

ALTER TABLE "KpiCommissionObligation"
ADD CONSTRAINT "KpiCommissionObligation_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "KpiCommissionRepair"
ADD CONSTRAINT "KpiCommissionRepair_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "KpiCommissionRepair"
ADD CONSTRAINT "KpiCommissionRepair_obligationId_fkey"
FOREIGN KEY ("obligationId") REFERENCES "KpiCommissionObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
