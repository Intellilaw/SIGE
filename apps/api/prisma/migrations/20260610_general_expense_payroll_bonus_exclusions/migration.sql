ALTER TABLE "GeneralExpensePayrollEntry"
  ADD COLUMN IF NOT EXISTS "punctualityBonusExcluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attendanceBonusExcluded" BOOLEAN NOT NULL DEFAULT false;
