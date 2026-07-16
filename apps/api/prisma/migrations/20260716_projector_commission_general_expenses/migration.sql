ALTER TABLE "GeneralExpense"
  ADD COLUMN IF NOT EXISTS "projectorCommissionId" TEXT,
  ADD COLUMN IF NOT EXISTS "projectorCommissionRecipient" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "GeneralExpense_projectorCommissionId_projectorCommissionRecipient_key"
  ON "GeneralExpense"("projectorCommissionId", "projectorCommissionRecipient");

ALTER TABLE "GeneralExpense"
  DROP CONSTRAINT IF EXISTS "GeneralExpense_projectorCommissionId_fkey";

ALTER TABLE "GeneralExpense"
  ADD CONSTRAINT "GeneralExpense_projectorCommissionId_fkey"
  FOREIGN KEY ("projectorCommissionId") REFERENCES "ProjectorCommission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeneralExpense"
  DROP CONSTRAINT IF EXISTS "GeneralExpense_single_managed_source_check";

ALTER TABLE "GeneralExpense"
  ADD CONSTRAINT "GeneralExpense_single_managed_source_check"
  CHECK ("payrollEntryId" IS NULL OR "projectorCommissionId" IS NULL);

INSERT INTO "GeneralExpense" (
  "id",
  "organizationId",
  "year",
  "month",
  "detail",
  "amountMxn",
  "countsTowardLimit",
  "team",
  "generalExpense",
  "expenseWithoutTeam",
  "pctLitigation",
  "pctCorporateLabor",
  "pctSettlements",
  "pctFinancialLaw",
  "pctTaxCompliance",
  "paymentMethod",
  "bank",
  "hasVat",
  "hasWithholdings",
  "recurring",
  "approvedByEmrt",
  "emrtReimbursementPending",
  "reviewedByJnls",
  "paid",
  "projectorCommissionId",
  "projectorCommissionRecipient",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('projector-commission-expense-', pc."id", '-', recipients."recipient"),
  pc."organizationId",
  pc."year",
  pc."month",
  CASE recipients."recipient"
    WHEN 'PROJECTOR' THEN CONCAT(
      'Comisión por escrito de fondo - ',
      pc."responsibleCode",
      ' - ',
      COALESCE(NULLIF(TRIM(pc."clientName"), ''), 'Cliente sin nombre'),
      ' - ',
      COALESCE(NULLIF(TRIM(pc."subject"), ''), 'Asunto sin nombre')
    )
    ELSE CONCAT(
      'Comisión por escrito de fondo - Litigio (líder) - ',
      COALESCE(NULLIF(TRIM(pc."clientName"), ''), 'Cliente sin nombre'),
      ' - ',
      COALESCE(NULLIF(TRIM(pc."subject"), ''), 'Asunto sin nombre')
    )
  END,
  pc."amountMxn",
  false,
  'Litigio',
  false,
  false,
  100,
  0,
  0,
  0,
  0,
  'Transferencia',
  NULL,
  false,
  false,
  false,
  true,
  false,
  false,
  false,
  pc."id",
  recipients."recipient",
  COALESCE(pc."authorizedAt", pc."updatedAt", CURRENT_TIMESTAMP),
  COALESCE(pc."authorizedAt", pc."updatedAt", CURRENT_TIMESTAMP)
FROM "ProjectorCommission" pc
CROSS JOIN (VALUES ('PROJECTOR'), ('LITIGATION_LEADER')) AS recipients("recipient")
WHERE pc."authorized" = true
ON CONFLICT ("projectorCommissionId", "projectorCommissionRecipient") DO NOTHING;
