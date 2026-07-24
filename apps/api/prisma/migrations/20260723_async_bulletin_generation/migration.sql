ALTER TABLE "Bulletin"
ADD COLUMN "generationStatus" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN "generationError" TEXT,
ADD COLUMN "generationStartedAt" TIMESTAMP(3),
ADD COLUMN "generationCompletedAt" TIMESTAMP(3);

CREATE INDEX "Bulletin_organizationId_generationStatus_updatedAt_idx"
ON "Bulletin"("organizationId", "generationStatus", "updatedAt");
