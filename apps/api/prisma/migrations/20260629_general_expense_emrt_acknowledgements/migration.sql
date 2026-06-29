CREATE TABLE IF NOT EXISTS "GeneralExpenseEmrtAcknowledgement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "paidByEmrtDate" DATE NOT NULL,
  "totalMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "summaryMessage" TEXT NOT NULL DEFAULT '',
  "expenseIds" JSONB NOT NULL DEFAULT '[]',
  "snapshotData" JSONB,
  "snapshotHash" TEXT NOT NULL DEFAULT '',
  "receivedByAle" BOOLEAN NOT NULL DEFAULT false,
  "receivedByAleAt" TIMESTAMP(3),
  "paidByEmrt" BOOLEAN NOT NULL DEFAULT false,
  "paidByEmrtAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneralExpenseEmrtAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GeneralExpenseEmrtAcknowledgement_organizationId_year_month_paidByEmrtDate_key"
  ON "GeneralExpenseEmrtAcknowledgement"("organizationId", "year", "month", "paidByEmrtDate");

CREATE INDEX IF NOT EXISTS "GeneralExpenseEmrtAcknowledgement_organizationId_year_month_paidByEmrtDate_idx"
  ON "GeneralExpenseEmrtAcknowledgement"("organizationId", "year", "month", "paidByEmrtDate");

ALTER TABLE "GeneralExpenseEmrtAcknowledgement"
  DROP CONSTRAINT IF EXISTS "GeneralExpenseEmrtAcknowledgement_organizationId_fkey";

ALTER TABLE "GeneralExpenseEmrtAcknowledgement"
  ADD CONSTRAINT "GeneralExpenseEmrtAcknowledgement_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
