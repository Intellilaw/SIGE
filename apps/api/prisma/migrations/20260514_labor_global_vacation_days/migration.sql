CREATE TABLE "LaborGlobalVacationDay" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "days" DECIMAL(6,2) NOT NULL DEFAULT 1,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LaborGlobalVacationDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LaborGlobalVacationDay_date_key" ON "LaborGlobalVacationDay"("date");
CREATE INDEX "LaborGlobalVacationDay_date_idx" ON "LaborGlobalVacationDay"("date");
