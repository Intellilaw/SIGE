ALTER TABLE "LaborVacationEvent"
ADD COLUMN "globalVacationDayId" TEXT;

CREATE INDEX "LaborVacationEvent_globalVacationDayId_idx"
ON "LaborVacationEvent"("globalVacationDayId");
