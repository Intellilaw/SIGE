CREATE TABLE "ExternalContractMilestone" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "externalContractId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "title" TEXT NOT NULL,
  "dueDate" DATE NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalContractMilestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalContractMilestone_organizationId_dueDate_idx"
ON "ExternalContractMilestone"("organizationId", "dueDate");

CREATE INDEX "ExternalContractMilestone_organizationId_externalContractId_dueDate_idx"
ON "ExternalContractMilestone"("organizationId", "externalContractId", "dueDate");

ALTER TABLE "ExternalContractMilestone"
ADD CONSTRAINT "ExternalContractMilestone_externalContractId_fkey"
FOREIGN KEY ("externalContractId") REFERENCES "ExternalContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalContractMilestone"
ADD CONSTRAINT "ExternalContractMilestone_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
