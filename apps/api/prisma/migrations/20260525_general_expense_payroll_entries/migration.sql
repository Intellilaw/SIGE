CREATE TABLE "GeneralExpensePayrollEntry" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "half" INTEGER NOT NULL,
  "laborFileId" TEXT,
  "employeeName" TEXT NOT NULL DEFAULT '',
  "dailySalaryMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "grossSalaryMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "punctualityBonusMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "attendanceBonusMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "overtimeHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "overtimeDetail" TEXT NOT NULL DEFAULT '',
  "overtimeApprovedByEmrt" BOOLEAN NOT NULL DEFAULT false,
  "isrWithholdingMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "imssWithholdingMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "payrollStampedByAraceli" BOOLEAN NOT NULL DEFAULT false,
  "finalPaymentApprovedByEmrt" BOOLEAN NOT NULL DEFAULT false,
  "reviewedByJnls" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GeneralExpensePayrollEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneralExpensePayrollEntry_year_month_half_createdAt_idx"
  ON "GeneralExpensePayrollEntry"("year", "month", "half", "createdAt");

CREATE INDEX "GeneralExpensePayrollEntry_laborFileId_idx"
  ON "GeneralExpensePayrollEntry"("laborFileId");

ALTER TABLE "GeneralExpensePayrollEntry"
  ADD CONSTRAINT "GeneralExpensePayrollEntry_laborFileId_fkey"
  FOREIGN KEY ("laborFileId") REFERENCES "LaborFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
