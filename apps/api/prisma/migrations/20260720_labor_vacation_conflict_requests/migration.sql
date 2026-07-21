CREATE TABLE IF NOT EXISTS "LaborVacationConflictRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "laborFileId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "vacationDates" JSONB NOT NULL,
  "conflicts" JSONB NOT NULL,
  "requestedByUserId" TEXT,
  "requestedByName" TEXT NOT NULL,
  "requestedByEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LaborVacationConflictRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LaborVacationConflictRequest_organizationId_laborFileId_key"
  ON "LaborVacationConflictRequest"("organizationId", "laborFileId");

CREATE INDEX IF NOT EXISTS "LaborVacationConflictRequest_organizationId_updatedAt_idx"
  ON "LaborVacationConflictRequest"("organizationId", "updatedAt");

ALTER TABLE "LaborVacationConflictRequest"
  ADD CONSTRAINT "LaborVacationConflictRequest_laborFileId_fkey"
  FOREIGN KEY ("laborFileId") REFERENCES "LaborFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LaborVacationConflictRequest"
  ADD CONSTRAINT "LaborVacationConflictRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
