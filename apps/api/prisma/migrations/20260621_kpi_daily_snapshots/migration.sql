CREATE TABLE "KpiDailySnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "userKey" TEXT NOT NULL,
  "metricId" TEXT NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "target" INTEGER NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "actualLabel" TEXT NOT NULL,
  "targetLabel" TEXT NOT NULL,
  "helper" TEXT,
  "incidents" JSONB NOT NULL DEFAULT '[]',
  "sourceData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KpiDailySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KpiDailySnapshot_organizationId_userKey_metricId_snapshot_key"
  ON "KpiDailySnapshot"("organizationId", "userKey", "metricId", "snapshotDate");

CREATE INDEX "KpiDailySnapshot_organizationId_userKey_snapshotDate_idx"
  ON "KpiDailySnapshot"("organizationId", "userKey", "snapshotDate");

CREATE INDEX "KpiDailySnapshot_organizationId_metricId_snapshotDate_idx"
  ON "KpiDailySnapshot"("organizationId", "metricId", "snapshotDate");

ALTER TABLE "KpiDailySnapshot"
  ADD CONSTRAINT "KpiDailySnapshot_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
