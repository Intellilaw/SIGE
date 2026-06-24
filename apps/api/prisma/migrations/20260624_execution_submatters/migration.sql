CREATE TABLE "ExecutionSubmatter" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "matterId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "specificProcess" TEXT,
  "matterIdentifier" TEXT,
  "communicationChannel" TEXT NOT NULL DEFAULT 'WHATSAPP',
  "executionPrompt" TEXT,
  "expirationDate" TIMESTAMP(3),
  "expirationRiOutput" TEXT,
  "promotionCommand" TEXT,
  "holidayAuthorityShortName" TEXT,
  "internalTelegramGroupId" TEXT,
  "internalTelegramGroupName" TEXT,
  "milestone" TEXT,
  "concluded" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExecutionSubmatter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutionSubmatter_organizationId_matterId_deletedAt_sortOrder_idx"
  ON "ExecutionSubmatter"("organizationId", "matterId", "deletedAt", "sortOrder");

CREATE INDEX "ExecutionSubmatter_organizationId_deletedAt_createdAt_idx"
  ON "ExecutionSubmatter"("organizationId", "deletedAt", "createdAt");

ALTER TABLE "ExecutionSubmatter"
  ADD CONSTRAINT "ExecutionSubmatter_matterId_fkey"
  FOREIGN KEY ("matterId") REFERENCES "Matter"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutionSubmatter"
  ADD CONSTRAINT "ExecutionSubmatter_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
