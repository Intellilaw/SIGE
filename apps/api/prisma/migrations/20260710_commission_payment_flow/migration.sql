CREATE TABLE "CommissionPaymentAcknowledgement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "amountMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sourceHash" TEXT NOT NULL DEFAULT '',
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "receivedByAraceli" BOOLEAN NOT NULL DEFAULT false,
    "receivedByAraceliAt" TIMESTAMP(3),
    "receivedByAraceliUserId" TEXT,
    "receivedByAraceliName" TEXT,
    "receivedByEmrt" BOOLEAN NOT NULL DEFAULT false,
    "receivedByEmrtAt" TIMESTAMP(3),
    "receivedByEmrtUserId" TEXT,
    "receivedByEmrtName" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPaymentAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionPaymentAcknowledgementEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
    "acknowledgementId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "amountMxn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPaymentAcknowledgementEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionPaymentAcknowledgement_organizationId_year_month_section_key"
ON "CommissionPaymentAcknowledgement"("organizationId", "year", "month", "section");

CREATE INDEX "CommissionPaymentAcknowledgement_organizationId_year_month_receivedByEmrt_idx"
ON "CommissionPaymentAcknowledgement"("organizationId", "year", "month", "receivedByEmrt");

CREATE INDEX "CommissionPaymentAcknowledgementEvent_organizationId_acknowledgementId_createdAt_idx"
ON "CommissionPaymentAcknowledgementEvent"("organizationId", "acknowledgementId", "createdAt");

CREATE INDEX "CommissionPaymentAcknowledgementEvent_organizationId_action_createdAt_idx"
ON "CommissionPaymentAcknowledgementEvent"("organizationId", "action", "createdAt");

ALTER TABLE "CommissionPaymentAcknowledgement"
ADD CONSTRAINT "CommissionPaymentAcknowledgement_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionPaymentAcknowledgementEvent"
ADD CONSTRAINT "CommissionPaymentAcknowledgementEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionPaymentAcknowledgementEvent"
ADD CONSTRAINT "CommissionPaymentAcknowledgementEvent_acknowledgementId_fkey"
FOREIGN KEY ("acknowledgementId") REFERENCES "CommissionPaymentAcknowledgement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
