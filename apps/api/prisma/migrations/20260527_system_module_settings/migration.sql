CREATE TABLE "SystemModuleSetting" (
  "moduleId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemModuleSetting_pkey" PRIMARY KEY ("moduleId")
);

CREATE INDEX "SystemModuleSetting_isEnabled_idx" ON "SystemModuleSetting"("isEnabled");
