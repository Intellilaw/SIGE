-- CreateTable
CREATE TABLE "ProjectorCommission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "taskTrackingRecordId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "responsibleCode" TEXT NOT NULL,
    "projectorName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "amountMxn" DECIMAL(65,30) NOT NULL DEFAULT 500,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "authorizedByUserId" TEXT,
    "authorizedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectorCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectorCommission_organizationId_taskTrackingRecordId_key"
ON "ProjectorCommission"("organizationId", "taskTrackingRecordId");

-- CreateIndex
CREATE INDEX "ProjectorCommission_organizationId_year_month_section_idx"
ON "ProjectorCommission"("organizationId", "year", "month", "section");

-- CreateIndex
CREATE INDEX "ProjectorCommission_organizationId_year_month_authorized_idx"
ON "ProjectorCommission"("organizationId", "year", "month", "authorized");

-- AddForeignKey
ALTER TABLE "ProjectorCommission"
ADD CONSTRAINT "ProjectorCommission_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed already-completed writings for Rusconi Consulting. Existing records did not
-- store the exact stage-5 transition separately, so completedAt (or updatedAt as a
-- fallback) is the best historical completion timestamp available.
INSERT INTO "ProjectorCommission" (
    "id",
    "organizationId",
    "taskTrackingRecordId",
    "year",
    "month",
    "section",
    "responsibleCode",
    "projectorName",
    "clientName",
    "subject",
    "amountMxn",
    "authorized",
    "completedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'projector-' || md5(record."organizationId" || ':' || record."id"),
    record."organizationId",
    record."id",
    EXTRACT(YEAR FROM (COALESCE(record."completedAt", record."updatedAt") AT TIME ZONE 'America/Mexico_City'))::INTEGER,
    EXTRACT(MONTH FROM (COALESCE(record."completedAt", record."updatedAt") AT TIME ZONE 'America/Mexico_City'))::INTEGER,
    CASE UPPER(TRIM(record."responsible"))
        WHEN 'EKPO' THEN 'Proyectista 1 (EKPO)'
        ELSE 'Proyectista 2 (NBSG)'
    END,
    UPPER(TRIM(record."responsible")),
    CASE UPPER(TRIM(record."responsible"))
        WHEN 'EKPO' THEN 'Evelyng Perez'
        ELSE 'Noelia Serrano'
    END,
    record."clientName",
    record."subject",
    500,
    false,
    COALESCE(record."completedAt", record."updatedAt"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "TaskTrackingRecord" AS record
WHERE record."organizationId" = 'org-rusconi'
  AND record."moduleId" = 'litigation'
  AND REPLACE(LOWER(COALESCE(NULLIF(record."tableCode", ''), record."sourceTable")), '-', '_') = 'escritos_fondo'
  AND record."workflowStage" >= 5
  AND record."deletedAt" IS NULL
  AND UPPER(TRIM(record."responsible")) IN ('EKPO', 'NBSG')
ON CONFLICT ("organizationId", "taskTrackingRecordId") DO NOTHING;
