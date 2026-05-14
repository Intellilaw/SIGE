CREATE TABLE "InternalContractTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileContent" BYTEA NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalContractTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InternalContractTemplate_title_idx" ON "InternalContractTemplate"("title");
CREATE INDEX "InternalContractTemplate_createdAt_idx" ON "InternalContractTemplate"("createdAt");
