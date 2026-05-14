-- Extend holidays from a single global calendar to an authority-specific calendar.
DROP INDEX IF EXISTS "Holiday_date_key";

ALTER TABLE "Holiday"
  ADD COLUMN "authorityShortName" TEXT NOT NULL DEFAULT 'PJF',
  ADD COLUMN "authorityName" TEXT NOT NULL DEFAULT 'Poder Judicial de la Federacion',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Holiday"
  ALTER COLUMN "date" TYPE DATE USING "date"::date,
  ALTER COLUMN "label" SET DEFAULT 'Dia inhabil';

CREATE UNIQUE INDEX "Holiday_authorityShortName_date_key" ON "Holiday"("authorityShortName", "date");
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
CREATE INDEX "Holiday_authorityShortName_date_idx" ON "Holiday"("authorityShortName", "date");
