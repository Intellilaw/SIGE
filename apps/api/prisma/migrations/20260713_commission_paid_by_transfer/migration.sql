ALTER TABLE "CommissionPaymentAcknowledgement"
ADD COLUMN "paidByTransfer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paidByTransferAt" TIMESTAMP(3),
ADD COLUMN "paidByTransferUserId" TEXT,
ADD COLUMN "paidByTransferName" TEXT;
