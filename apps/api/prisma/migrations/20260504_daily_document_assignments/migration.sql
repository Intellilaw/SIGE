CREATE TABLE "DailyDocumentAssignment" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyDocumentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyDocumentAssignment_clientId_createdAt_idx" ON "DailyDocumentAssignment"("clientId", "createdAt");
CREATE INDEX "DailyDocumentAssignment_templateId_createdAt_idx" ON "DailyDocumentAssignment"("templateId", "createdAt");
CREATE INDEX "DailyDocumentAssignment_createdAt_idx" ON "DailyDocumentAssignment"("createdAt");

ALTER TABLE "DailyDocumentAssignment"
ADD CONSTRAINT "DailyDocumentAssignment_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
