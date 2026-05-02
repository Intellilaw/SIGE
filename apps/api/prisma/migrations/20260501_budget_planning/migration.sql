CREATE TABLE "BudgetPlan" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "expectedIncomeMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expectedExpenseMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetPlan_year_month_key" ON "BudgetPlan"("year", "month");
CREATE INDEX "BudgetPlan_year_month_idx" ON "BudgetPlan"("year", "month");
