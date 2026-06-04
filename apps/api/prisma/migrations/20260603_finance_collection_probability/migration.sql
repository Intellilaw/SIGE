ALTER TABLE "FinanceRecord"
ADD COLUMN "highCollectionProbability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lowCollectionProbability" BOOLEAN NOT NULL DEFAULT false;
