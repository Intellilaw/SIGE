-- Include historical rows where only sourceTable carries the writings-table alias.
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
    EXTRACT(YEAR FROM ((COALESCE(record."completedAt", record."updatedAt") AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City'))::INTEGER,
    EXTRACT(MONTH FROM ((COALESCE(record."completedAt", record."updatedAt") AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City'))::INTEGER,
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
  AND (
    REPLACE(LOWER(record."tableCode"), '-', '_') = 'escritos_fondo'
    OR REPLACE(LOWER(record."sourceTable"), '-', '_') = 'escritos_fondo'
  )
  AND record."workflowStage" >= 5
  AND record."deletedAt" IS NULL
  AND UPPER(TRIM(record."responsible")) IN ('EKPO', 'NBSG')
ON CONFLICT ("organizationId", "taskTrackingRecordId") DO NOTHING;

-- Prisma stores DateTime as a UTC timestamp without timezone. Convert it to the
-- Mexico City calendar before deriving the commission period.
UPDATE "ProjectorCommission"
SET
  "year" = EXTRACT(YEAR FROM (("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City'))::INTEGER,
  "month" = EXTRACT(MONTH FROM (("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City'))::INTEGER,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" = 'org-rusconi';
