CREATE TABLE IF NOT EXISTS "ExternalContractRenewal" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "externalContractId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "renewalDate" DATE,
  "leaseStartDate" DATE,
  "leaseEndDate" DATE,
  "monthlyRentMxn" DECIMAL(12, 2),
  "rentIncreasePct" DECIMAL(5, 2),
  "inpcBasePeriod" TEXT,
  "inpcTargetPeriod" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalContractRenewal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalContractRenewal_organizationId_externalContractId_sequence_key"
  ON "ExternalContractRenewal"("organizationId", "externalContractId", "sequence");

CREATE INDEX IF NOT EXISTS "ExternalContractRenewal_organizationId_externalContractId_idx"
  ON "ExternalContractRenewal"("organizationId", "externalContractId");

CREATE INDEX IF NOT EXISTS "ExternalContractRenewal_organizationId_renewalDate_idx"
  ON "ExternalContractRenewal"("organizationId", "renewalDate");

ALTER TABLE "ExternalContractRenewal"
  DROP CONSTRAINT IF EXISTS "ExternalContractRenewal_externalContractId_fkey";

ALTER TABLE "ExternalContractRenewal"
  ADD CONSTRAINT "ExternalContractRenewal_externalContractId_fkey"
  FOREIGN KEY ("externalContractId")
  REFERENCES "ExternalContract"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ExternalContractRenewal"
  DROP CONSTRAINT IF EXISTS "ExternalContractRenewal_organizationId_fkey";

ALTER TABLE "ExternalContractRenewal"
  ADD CONSTRAINT "ExternalContractRenewal_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

INSERT INTO "ExternalContractRenewal" (
  "id",
  "organizationId",
  "externalContractId",
  "sequence",
  "renewalDate",
  "rentIncreasePct",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(contract."organizationId" || ':' || contract."id" || ':renewal:1'),
  contract."organizationId",
  contract."id",
  1,
  COALESCE(contract."renewalDate", contract."rentIncreaseDate"),
  contract."rentIncreasePct",
  CASE
    WHEN contract."renewalDate" IS NOT NULL AND contract."rentIncreaseDate" IS NOT NULL AND contract."renewalDate" <> contract."rentIncreaseDate"
      THEN 'Migrado desde campos anteriores. Fecha anterior de aumento de renta: ' || contract."rentIncreaseDate"::text
    ELSE NULL
  END,
  contract."createdAt",
  CURRENT_TIMESTAMP
FROM "ExternalContract" contract
WHERE (
    contract."renewalDate" IS NOT NULL
    OR contract."rentIncreaseDate" IS NOT NULL
    OR contract."rentIncreasePct" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ExternalContractRenewal" renewal
    WHERE renewal."organizationId" = contract."organizationId"
      AND renewal."externalContractId" = contract."id"
      AND renewal."sequence" = 1
  );
