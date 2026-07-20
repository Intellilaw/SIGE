CREATE TABLE IF NOT EXISTS "LaborVacationConflictAuthorization" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "laborFileId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "vacationDates" JSONB NOT NULL,
  "conflicts" JSONB NOT NULL,
  "authorizedByUserId" TEXT,
  "authorizedByName" TEXT NOT NULL,
  "authorizedByEmail" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LaborVacationConflictAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LaborVacationConflictAuthorization_organizationId_laborFileId_requestKey_key"
  ON "LaborVacationConflictAuthorization"("organizationId", "laborFileId", "requestKey");

CREATE INDEX IF NOT EXISTS "LaborVacationConflictAuthorization_organizationId_laborFileId_createdAt_idx"
  ON "LaborVacationConflictAuthorization"("organizationId", "laborFileId", "createdAt");

ALTER TABLE "LaborVacationConflictAuthorization"
  ADD CONSTRAINT "LaborVacationConflictAuthorization_laborFileId_fkey"
  FOREIGN KEY ("laborFileId") REFERENCES "LaborFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LaborVacationConflictAuthorization"
  ADD CONSTRAINT "LaborVacationConflictAuthorization_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
