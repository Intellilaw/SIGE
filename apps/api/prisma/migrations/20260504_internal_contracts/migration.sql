CREATE TABLE "InternalContract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL DEFAULT 'CONTRACT',
    "clientId" TEXT,
    "clientNumber" TEXT,
    "clientName" TEXT,
    "collaboratorName" TEXT,
    "originalFileName" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileContent" BYTEA,
    "paymentMilestones" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InternalContract_contractNumber_key" ON "InternalContract"("contractNumber");
CREATE INDEX "InternalContract_contractType_contractNumber_idx" ON "InternalContract"("contractType", "contractNumber");
CREATE INDEX "InternalContract_clientId_idx" ON "InternalContract"("clientId");
CREATE INDEX "InternalContract_collaboratorName_idx" ON "InternalContract"("collaboratorName");

ALTER TABLE "InternalContract"
ADD CONSTRAINT "InternalContract_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
