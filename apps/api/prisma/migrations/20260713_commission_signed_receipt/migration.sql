ALTER TABLE "CommissionPaymentAcknowledgement"
ADD COLUMN "signedReceiptFileName" TEXT,
ADD COLUMN "signedReceiptMimeType" TEXT,
ADD COLUMN "signedReceiptSizeBytes" INTEGER,
ADD COLUMN "signedReceiptUploadedAt" TIMESTAMP(3),
ADD COLUMN "signedReceiptUserId" TEXT,
ADD COLUMN "signedReceiptUserName" TEXT,
ADD COLUMN "signedReceiptFileContent" BYTEA;
