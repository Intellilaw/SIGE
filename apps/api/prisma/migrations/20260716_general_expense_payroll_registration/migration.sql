ALTER TABLE "GeneralExpense"
  ADD COLUMN IF NOT EXISTS "payrollEntryId" TEXT,
  ADD COLUMN IF NOT EXISTS "payrollNetDepositMxn" DECIMAL(65,30);

CREATE UNIQUE INDEX IF NOT EXISTS "GeneralExpense_payrollEntryId_key"
  ON "GeneralExpense"("payrollEntryId");

ALTER TABLE "GeneralExpense"
  DROP CONSTRAINT IF EXISTS "GeneralExpense_payrollEntryId_fkey";

ALTER TABLE "GeneralExpense"
  ADD CONSTRAINT "GeneralExpense_payrollEntryId_fkey"
  FOREIGN KEY ("payrollEntryId") REFERENCES "GeneralExpensePayrollEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "GeneralExpensePayrollEntry"
SET
  "generalExpense" = true,
  "pctLitigation" = 20,
  "pctCorporateLabor" = 20,
  "pctSettlements" = 20,
  "pctFinancialLaw" = 20,
  "pctTaxCompliance" = 20
WHERE
  "finalPaymentApprovedByEmrt" = true
  AND ABS(
    "pctLitigation" +
    "pctCorporateLabor" +
    "pctSettlements" +
    "pctFinancialLaw" +
    "pctTaxCompliance" - 100
  ) > 0.0001;
