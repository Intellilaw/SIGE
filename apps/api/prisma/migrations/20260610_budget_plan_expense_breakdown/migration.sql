CREATE TABLE "BudgetPlanExpenseBreakdownItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "concept" TEXT NOT NULL DEFAULT '',
  "amountMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BudgetPlanExpenseBreakdownItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BudgetPlanExpenseBreakdownItem_organizationId_year_month_sortOrder_idx"
ON "BudgetPlanExpenseBreakdownItem"("organizationId", "year", "month", "sortOrder");

ALTER TABLE "BudgetPlanExpenseBreakdownItem"
ADD CONSTRAINT "BudgetPlanExpenseBreakdownItem_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
