-- Persist LegalFlow sales strategy and daily activity reports in AWS RDS.

CREATE TABLE IF NOT EXISTS "SalesStrategy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "productId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesStrategy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesStrategy_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesStrategy_organizationId_productId_key"
  ON "SalesStrategy"("organizationId", "productId");

CREATE INDEX IF NOT EXISTS "SalesStrategy_organizationId_productId_idx"
  ON "SalesStrategy"("organizationId", "productId");

CREATE TABLE IF NOT EXISTS "SalesDailyReport" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "productId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "content" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "updatedByUserId" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesDailyReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesDailyReport_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesDailyReport_organizationId_productId_reportDate_key"
  ON "SalesDailyReport"("organizationId", "productId", "reportDate");

CREATE INDEX IF NOT EXISTS "SalesDailyReport_organizationId_reportDate_idx"
  ON "SalesDailyReport"("organizationId", "reportDate");

CREATE INDEX IF NOT EXISTS "SalesDailyReport_organizationId_productId_reportDate_idx"
  ON "SalesDailyReport"("organizationId", "productId", "reportDate");
