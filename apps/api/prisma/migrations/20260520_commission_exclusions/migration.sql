-- CreateTable
CREATE TABLE "CommissionExclusion" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "financeRecordId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionExclusion_year_month_section_group_financeRecordId_key" ON "CommissionExclusion"("year", "month", "section", "group", "financeRecordId");

-- CreateIndex
CREATE INDEX "CommissionExclusion_year_month_section_idx" ON "CommissionExclusion"("year", "month", "section");
