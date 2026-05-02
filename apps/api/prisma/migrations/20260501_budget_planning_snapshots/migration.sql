CREATE TABLE "BudgetPlanSnapshot" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "expectedIncomeMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expectedExpenseMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualIncomeMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualExpenseMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expectedResultMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualResultMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "financeRecordCount" INTEGER NOT NULL DEFAULT 0,
    "generalExpenseCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetPlanSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetPlanSnapshot_year_month_key" ON "BudgetPlanSnapshot"("year", "month");
CREATE INDEX "BudgetPlanSnapshot_year_month_createdAt_idx" ON "BudgetPlanSnapshot"("year", "month", "createdAt");
