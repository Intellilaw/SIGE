ALTER TABLE "LaborFileDocument"
ADD COLUMN "riExtractedDailySalaryMxn" DECIMAL(12, 2),
ADD COLUMN "riExtractedMonthlyGrossSalaryMxn" DECIMAL(12, 2),
ADD COLUMN "riSalaryExtractionDetail" TEXT;
