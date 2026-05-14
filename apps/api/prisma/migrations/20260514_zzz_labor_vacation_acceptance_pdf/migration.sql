ALTER TABLE "LaborVacationEvent"
  ADD COLUMN "vacationDates" JSONB,
  ADD COLUMN "acceptanceOriginalFileName" TEXT,
  ADD COLUMN "acceptanceFileMimeType" TEXT,
  ADD COLUMN "acceptanceFileSizeBytes" INTEGER,
  ADD COLUMN "acceptanceFileContent" BYTEA;
