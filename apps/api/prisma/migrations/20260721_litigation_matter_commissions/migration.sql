CREATE TABLE "MatterConclusionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "matterId" TEXT NOT NULL,
    "concluded" BOOLEAN NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatterConclusionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionMatterExclusionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "matterId" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "effectiveMonth" INTEGER NOT NULL,
    "excluded" BOOLEAN NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionMatterExclusionEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MatterConclusionEvent" (
    "id",
    "organizationId",
    "matterId",
    "concluded",
    "effectiveAt",
    "createdAt"
)
SELECT
    'initial-conclusion-' || "id",
    "organizationId",
    "id",
    TRUE,
    "updatedAt",
    CURRENT_TIMESTAMP
FROM "Matter"
WHERE "concluded" = TRUE;

CREATE INDEX "MatterConclusionEvent_organizationId_matterId_effectiveAt_idx"
ON "MatterConclusionEvent"("organizationId", "matterId", "effectiveAt");

CREATE UNIQUE INDEX "CommissionMatterExclusion_org_matter_period_key"
ON "CommissionMatterExclusionEvent"("organizationId", "matterId", "effectiveYear", "effectiveMonth");

CREATE INDEX "CommissionMatterExclusion_org_period_idx"
ON "CommissionMatterExclusionEvent"("organizationId", "effectiveYear", "effectiveMonth");

CREATE INDEX "CommissionMatterExclusion_org_matter_period_idx"
ON "CommissionMatterExclusionEvent"("organizationId", "matterId", "effectiveYear", "effectiveMonth");

ALTER TABLE "MatterConclusionEvent"
ADD CONSTRAINT "MatterConclusionEvent_matterId_fkey"
FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatterConclusionEvent"
ADD CONSTRAINT "MatterConclusionEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionMatterExclusionEvent"
ADD CONSTRAINT "CommissionMatterExclusionEvent_matterId_fkey"
FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommissionMatterExclusionEvent"
ADD CONSTRAINT "CommissionMatterExclusionEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
