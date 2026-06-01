CREATE TABLE IF NOT EXISTS "ExternalContractGeneratedDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "externalContractId" TEXT NOT NULL,
  "renewalId" TEXT,
  "templateId" TEXT NOT NULL,
  "templateTitle" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "fileContent" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalContractGeneratedDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExternalContractGeneratedDocument_organizationId_externalContractId_createdAt_idx"
  ON "ExternalContractGeneratedDocument"("organizationId", "externalContractId", "createdAt");

CREATE INDEX IF NOT EXISTS "ExternalContractGeneratedDocument_organizationId_templateId_idx"
  ON "ExternalContractGeneratedDocument"("organizationId", "templateId");

ALTER TABLE "ExternalContractGeneratedDocument"
  DROP CONSTRAINT IF EXISTS "ExternalContractGeneratedDocument_externalContractId_fkey";

ALTER TABLE "ExternalContractGeneratedDocument"
  ADD CONSTRAINT "ExternalContractGeneratedDocument_externalContractId_fkey"
  FOREIGN KEY ("externalContractId")
  REFERENCES "ExternalContract"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ExternalContractGeneratedDocument"
  DROP CONSTRAINT IF EXISTS "ExternalContractGeneratedDocument_organizationId_fkey";

ALTER TABLE "ExternalContractGeneratedDocument"
  ADD CONSTRAINT "ExternalContractGeneratedDocument_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
