CREATE TABLE "PeriodicMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "teamKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "senderEmail" TEXT NOT NULL,
  "toRecipients" JSONB NOT NULL DEFAULT '[]',
  "ccRecipients" JSONB NOT NULL DEFAULT '[]',
  "bccRecipients" JSONB NOT NULL DEFAULT '[]',
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "signatureText" TEXT,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "frequency" TEXT NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "weekdays" JSONB NOT NULL DEFAULT '[]',
  "dayOfMonth" INTEGER,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
  "nonBusinessDayPolicy" TEXT NOT NULL DEFAULT 'NEXT_BUSINESS_DAY',
  "nonBusinessOverrideAck" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PAUSED',
  "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "updatedByName" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PeriodicMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PeriodicMessageDelivery" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "periodicMessageId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failureMessage" TEXT,
  "messageSnapshot" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PeriodicMessageDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PeriodicMessage_organizationId_teamKey_status_deletedAt_idx" ON "PeriodicMessage"("organizationId", "teamKey", "status", "deletedAt");
CREATE INDEX "PeriodicMessage_organizationId_nextRunAt_status_idx" ON "PeriodicMessage"("organizationId", "nextRunAt", "status");
CREATE UNIQUE INDEX "PeriodicMessageDelivery_organizationId_idempotencyKey_key" ON "PeriodicMessageDelivery"("organizationId", "idempotencyKey");
CREATE INDEX "PeriodicMessageDelivery_organizationId_periodicMessageId_scheduledFor_idx" ON "PeriodicMessageDelivery"("organizationId", "periodicMessageId", "scheduledFor");
CREATE INDEX "PeriodicMessageDelivery_organizationId_status_scheduledFor_idx" ON "PeriodicMessageDelivery"("organizationId", "status", "scheduledFor");

ALTER TABLE "PeriodicMessage" ADD CONSTRAINT "PeriodicMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeriodicMessage" ADD CONSTRAINT "PeriodicMessage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeriodicMessageDelivery" ADD CONSTRAINT "PeriodicMessageDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeriodicMessageDelivery" ADD CONSTRAINT "PeriodicMessageDelivery_periodicMessageId_fkey" FOREIGN KEY ("periodicMessageId") REFERENCES "PeriodicMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeriodicMessageDelivery" ADD CONSTRAINT "PeriodicMessageDelivery_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
