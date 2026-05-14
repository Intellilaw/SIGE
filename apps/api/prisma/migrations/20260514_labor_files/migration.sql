-- Create labor files for every non-superadmin user and keep the file alive after user deactivation.
CREATE TABLE "LaborFile" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "employeeName" TEXT NOT NULL,
  "employeeEmail" TEXT,
  "employeeUsername" TEXT NOT NULL,
  "employeeShortName" TEXT,
  "team" TEXT,
  "legacyTeam" TEXT,
  "specificRole" TEXT,
  "status" TEXT NOT NULL DEFAULT 'INCOMPLETE',
  "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "hireDate" DATE NOT NULL,
  "employmentEndedAt" DATE,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LaborFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaborFileDocument" (
  "id" TEXT NOT NULL,
  "laborFileId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "fileContent" BYTEA NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LaborFileDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaborVacationEvent" (
  "id" TEXT NOT NULL,
  "laborFileId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "startDate" DATE,
  "endDate" DATE,
  "days" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LaborVacationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LaborFile_userId_key" ON "LaborFile"("userId");
CREATE INDEX "LaborFile_status_employmentStatus_idx" ON "LaborFile"("status", "employmentStatus");
CREATE INDEX "LaborFile_employeeName_idx" ON "LaborFile"("employeeName");
CREATE INDEX "LaborFileDocument_laborFileId_documentType_idx" ON "LaborFileDocument"("laborFileId", "documentType");
CREATE INDEX "LaborFileDocument_uploadedAt_idx" ON "LaborFileDocument"("uploadedAt");
CREATE INDEX "LaborVacationEvent_laborFileId_eventType_idx" ON "LaborVacationEvent"("laborFileId", "eventType");
CREATE INDEX "LaborVacationEvent_startDate_endDate_idx" ON "LaborVacationEvent"("startDate", "endDate");

ALTER TABLE "LaborFile"
  ADD CONSTRAINT "LaborFile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LaborFileDocument"
  ADD CONSTRAINT "LaborFileDocument_laborFileId_fkey"
  FOREIGN KEY ("laborFileId") REFERENCES "LaborFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LaborVacationEvent"
  ADD CONSTRAINT "LaborVacationEvent_laborFileId_fkey"
  FOREIGN KEY ("laborFileId") REFERENCES "LaborFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LaborFile" (
  "id",
  "userId",
  "employeeName",
  "employeeEmail",
  "employeeUsername",
  "employeeShortName",
  "team",
  "legacyTeam",
  "specificRole",
  "status",
  "employmentStatus",
  "hireDate",
  "employmentEndedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'labor-file-' || "id",
  "id",
  COALESCE(NULLIF("displayName", ''), "username"),
  "email",
  "username",
  "shortName",
  "team",
  "legacyTeam",
  "specificRole",
  'INCOMPLETE',
  CASE WHEN "isActive" THEN 'ACTIVE' ELSE 'FORMER' END,
  "createdAt"::DATE,
  CASE WHEN "isActive" THEN NULL ELSE "updatedAt"::DATE END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "legacyRole" <> 'SUPERADMIN'
  AND "role" <> 'SUPERADMIN'
  AND NOT EXISTS (
    SELECT 1
    FROM "LaborFile"
    WHERE "LaborFile"."userId" = "User"."id"
  );
