CREATE TABLE IF NOT EXISTS "ExternalContractInpc" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "periodYear" INTEGER NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "periodDate" DATE NOT NULL,
  "value" DECIMAL(14, 6) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'BANXICO',
  "sourceSeries" TEXT NOT NULL DEFAULT 'SP1',
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalContractInpc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalContractInpc_organizationId_periodYear_periodMonth_key"
  ON "ExternalContractInpc"("organizationId", "periodYear", "periodMonth");

CREATE INDEX IF NOT EXISTS "ExternalContractInpc_organizationId_periodDate_idx"
  ON "ExternalContractInpc"("organizationId", "periodDate");

CREATE INDEX IF NOT EXISTS "ExternalContractInpc_organizationId_sourceSeries_idx"
  ON "ExternalContractInpc"("organizationId", "sourceSeries");

ALTER TABLE "ExternalContractInpc"
  DROP CONSTRAINT IF EXISTS "ExternalContractInpc_organizationId_fkey";

ALTER TABLE "ExternalContractInpc"
  ADD CONSTRAINT "ExternalContractInpc_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
