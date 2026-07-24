CREATE TABLE "Bulletin" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "origin" TEXT NOT NULL DEFAULT 'GENERATED',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "bulletinDate" DATE NOT NULL,
    "titleEs" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "twoPageReason" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "sourceText" TEXT,
    "sourceUrls" JSONB NOT NULL DEFAULT '[]',
    "docxOriginalFileName" TEXT,
    "docxFileMimeType" TEXT,
    "docxFileSizeBytes" INTEGER,
    "docxFileContent" BYTEA,
    "pdfOriginalFileName" TEXT,
    "pdfFileMimeType" TEXT,
    "pdfFileSizeBytes" INTEGER,
    "pdfFileContent" BYTEA,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bulletin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BulletinAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "bulletinId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileContent" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulletinAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Bulletin_organizationId_deletedAt_bulletinDate_idx"
ON "Bulletin"("organizationId", "deletedAt", "bulletinDate");

CREATE INDEX "Bulletin_organizationId_status_updatedAt_idx"
ON "Bulletin"("organizationId", "status", "updatedAt");

CREATE INDEX "BulletinAttachment_organizationId_bulletinId_uploadedAt_idx"
ON "BulletinAttachment"("organizationId", "bulletinId", "uploadedAt");

ALTER TABLE "Bulletin"
ADD CONSTRAINT "Bulletin_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BulletinAttachment"
ADD CONSTRAINT "BulletinAttachment_bulletinId_fkey"
FOREIGN KEY ("bulletinId") REFERENCES "Bulletin"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BulletinAttachment"
ADD CONSTRAINT "BulletinAttachment_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
