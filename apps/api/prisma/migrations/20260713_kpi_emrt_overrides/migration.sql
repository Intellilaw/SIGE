CREATE TABLE "KpiEmrtOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "userId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "overrideDate" DATE NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiEmrtOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KpiEmrtOverride_organizationId_userId_metricId_overrideDate_key"
ON "KpiEmrtOverride"("organizationId", "userId", "metricId", "overrideDate");

CREATE INDEX "KpiEmrtOverride_organizationId_userId_overrideDate_revokedAt_idx"
ON "KpiEmrtOverride"("organizationId", "userId", "overrideDate", "revokedAt");

CREATE INDEX "KpiEmrtOverride_organizationId_metricId_overrideDate_revokedAt_idx"
ON "KpiEmrtOverride"("organizationId", "metricId", "overrideDate", "revokedAt");

ALTER TABLE "KpiEmrtOverride"
ADD CONSTRAINT "KpiEmrtOverride_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
