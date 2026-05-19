ALTER TABLE "InternalContract"
ADD COLUMN "sourceMatterId" TEXT,
ADD COLUMN "sourceQuoteId" TEXT,
ADD COLUMN "signatureStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "pdfOriginalFileName" TEXT,
ADD COLUMN "pdfFileMimeType" TEXT,
ADD COLUMN "pdfFileSizeBytes" INTEGER,
ADD COLUMN "pdfFileContent" BYTEA,
ADD COLUMN "generatedPayload" JSONB;

CREATE UNIQUE INDEX "InternalContract_sourceMatterId_key" ON "InternalContract"("sourceMatterId");
CREATE INDEX "InternalContract_sourceQuoteId_idx" ON "InternalContract"("sourceQuoteId");
