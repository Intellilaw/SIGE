ALTER TABLE "LaborFile"
  ADD COLUMN IF NOT EXISTS "advanceVacationDaysPaidBalance" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "advanceVacationDaysPaidCutoffDate" DATE;
