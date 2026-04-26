-- CreateTable
CREATE TABLE "LegacyImportBatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "exportName" TEXT,
    "exportedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyImportArchive" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "legacyTable" TEXT NOT NULL,
    "legacyId" TEXT,
    "entityType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyImportArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyImportBatch_source_createdAt_idx" ON "LegacyImportBatch"("source", "createdAt");

-- CreateIndex
CREATE INDEX "LegacyImportArchive_batchId_legacyTable_idx" ON "LegacyImportArchive"("batchId", "legacyTable");

-- CreateIndex
CREATE INDEX "LegacyImportArchive_legacyTable_legacyId_idx" ON "LegacyImportArchive"("legacyTable", "legacyId");

-- CreateIndex
CREATE INDEX "LegacyImportArchive_entityType_createdAt_idx" ON "LegacyImportArchive"("entityType", "createdAt");

-- AddForeignKey
ALTER TABLE "LegacyImportArchive" ADD CONSTRAINT "LegacyImportArchive_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LegacyImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
