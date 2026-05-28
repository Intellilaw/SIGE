ALTER TABLE "TaskModule"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE INDEX "TaskModule_isActive_label_idx" ON "TaskModule"("isActive", "label");

INSERT INTO "TaskModule" ("id", "team", "label", "summary", "isActive", "deactivatedAt", "createdAt", "updatedAt")
SELECT
  lower(replace("key", '_', '-')) AS "id",
  "key" AS "team",
  "label",
  'Espacio de tareas pendiente de configuracion.' AS "summary",
  "isActive",
  "deactivatedAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "UserTeam"
WHERE NOT EXISTS (
  SELECT 1
  FROM "TaskModule"
  WHERE "TaskModule"."id" = lower(replace("UserTeam"."key", '_', '-'))
);

UPDATE "TaskModule"
SET
  "team" = "UserTeam"."key",
  "label" = "UserTeam"."label",
  "isActive" = "UserTeam"."isActive",
  "deactivatedAt" = "UserTeam"."deactivatedAt",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "UserTeam"
WHERE "TaskModule"."id" = lower(replace("UserTeam"."key", '_', '-'));
