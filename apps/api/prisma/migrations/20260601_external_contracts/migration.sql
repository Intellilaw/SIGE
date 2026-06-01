CREATE TABLE IF NOT EXISTS "ExternalContract" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "contractNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "contractType" TEXT NOT NULL DEFAULT 'LEASE',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "clientId" TEXT NOT NULL,
  "clientNumber" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "propertyAddress" TEXT,
  "landlordName" TEXT,
  "tenantName" TEXT,
  "leaseStartDate" DATE,
  "leaseEndDate" DATE,
  "renewalDate" DATE,
  "rentIncreaseDate" DATE,
  "monthlyRentMxn" DECIMAL(12, 2),
  "rentIncreasePct" DECIMAL(5, 2),
  "originalFileName" TEXT,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "fileContent" BYTEA,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalContract_organizationId_contractNumber_key" ON "ExternalContract"("organizationId", "contractNumber");
CREATE INDEX IF NOT EXISTS "ExternalContract_organizationId_clientId_status_idx" ON "ExternalContract"("organizationId", "clientId", "status");
CREATE INDEX IF NOT EXISTS "ExternalContract_organizationId_contractType_renewalDate_idx" ON "ExternalContract"("organizationId", "contractType", "renewalDate");
CREATE INDEX IF NOT EXISTS "ExternalContract_organizationId_rentIncreaseDate_idx" ON "ExternalContract"("organizationId", "rentIncreaseDate");
CREATE INDEX IF NOT EXISTS "ExternalContract_organizationId_clientName_idx" ON "ExternalContract"("organizationId", "clientName");

ALTER TABLE "ExternalContract" DROP CONSTRAINT IF EXISTS "ExternalContract_organizationId_fkey";
ALTER TABLE "ExternalContract"
ADD CONSTRAINT "ExternalContract_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExternalContract" DROP CONSTRAINT IF EXISTS "ExternalContract_clientId_fkey";
ALTER TABLE "ExternalContract"
ADD CONSTRAINT "ExternalContract_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
