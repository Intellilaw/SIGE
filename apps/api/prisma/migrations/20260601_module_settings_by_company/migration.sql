ALTER TABLE "SystemModuleSetting"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';

ALTER TABLE "SystemModuleSetting"
  DROP CONSTRAINT IF EXISTS "SystemModuleSetting_pkey";

INSERT INTO "SystemModuleSetting" (
  "organizationId",
  "moduleId",
  "isEnabled",
  "updatedByUserId",
  "updatedByName",
  "createdAt",
  "updatedAt"
)
SELECT
  'org-intellilaw',
  source."moduleId",
  source."isEnabled",
  source."updatedByUserId",
  source."updatedByName",
  source."createdAt",
  source."updatedAt"
FROM "SystemModuleSetting" source
WHERE source."organizationId" = 'org-rusconi'
  AND NOT EXISTS (
    SELECT 1
    FROM "SystemModuleSetting" target
    WHERE target."organizationId" = 'org-intellilaw'
      AND target."moduleId" = source."moduleId"
  );

ALTER TABLE "SystemModuleSetting"
  ADD CONSTRAINT "SystemModuleSetting_pkey" PRIMARY KEY ("organizationId", "moduleId");

DROP INDEX IF EXISTS "SystemModuleSetting_isEnabled_idx";

CREATE INDEX IF NOT EXISTS "SystemModuleSetting_organizationId_isEnabled_idx"
  ON "SystemModuleSetting"("organizationId", "isEnabled");

ALTER TABLE "SystemModuleSetting"
  DROP CONSTRAINT IF EXISTS "SystemModuleSetting_organizationId_fkey";

ALTER TABLE "SystemModuleSetting"
  ADD CONSTRAINT "SystemModuleSetting_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
