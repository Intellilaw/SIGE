ALTER TABLE "LaborFile"
  ADD COLUMN "advanceVacationDaysPaidPrevious" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "advanceVacationDaysPaidCurrent" DECIMAL(6, 2) NOT NULL DEFAULT 0;

UPDATE "LaborFile"
SET
  "advanceVacationDaysPaidPrevious" = "advanceVacationDaysPaidBalance",
  "advanceVacationDaysPaidCurrent" = 0
WHERE "advanceVacationDaysPaidBalance" <> 0;
