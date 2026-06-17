ALTER TABLE "GeneralExpense"
  ADD COLUMN IF NOT EXISTS "emrtReimbursementPending" BOOLEAN NOT NULL DEFAULT false;
