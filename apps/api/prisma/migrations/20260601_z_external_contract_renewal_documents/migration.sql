CREATE TABLE IF NOT EXISTS "ExternalContractRenewalDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "externalContractId" TEXT NOT NULL,
  "renewalId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'RENEWAL_SUPPORT',
  "originalFileName" TEXT NOT NULL,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "fileContent" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalContractRenewalDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExternalContractRenewalDocument_organizationId_externalContractId_renewalId_idx"
  ON "ExternalContractRenewalDocument"("organizationId", "externalContractId", "renewalId");

CREATE INDEX IF NOT EXISTS "ExternalContractRenewalDocument_organizationId_renewalId_createdAt_idx"
  ON "ExternalContractRenewalDocument"("organizationId", "renewalId", "createdAt");

ALTER TABLE "ExternalContractRenewalDocument"
  DROP CONSTRAINT IF EXISTS "ExternalContractRenewalDocument_externalContractId_fkey";

ALTER TABLE "ExternalContractRenewalDocument"
  ADD CONSTRAINT "ExternalContractRenewalDocument_externalContractId_fkey"
  FOREIGN KEY ("externalContractId")
  REFERENCES "ExternalContract"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ExternalContractRenewalDocument"
  DROP CONSTRAINT IF EXISTS "ExternalContractRenewalDocument_renewalId_fkey";

ALTER TABLE "ExternalContractRenewalDocument"
  ADD CONSTRAINT "ExternalContractRenewalDocument_renewalId_fkey"
  FOREIGN KEY ("renewalId")
  REFERENCES "ExternalContractRenewal"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ExternalContractRenewalDocument"
  DROP CONSTRAINT IF EXISTS "ExternalContractRenewalDocument_organizationId_fkey";

ALTER TABLE "ExternalContractRenewalDocument"
  ADD CONSTRAINT "ExternalContractRenewalDocument_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
