ALTER TABLE "UserTeam"
  ADD COLUMN IF NOT EXISTS "executionSpaceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "executionSpaceDeactivatedAt" TIMESTAMP(3);

UPDATE "UserTeam" AS ut
SET
  "executionSpaceEnabled" = EXISTS (
    SELECT 1
    FROM "TaskModule" AS tm
    WHERE tm."team" = ut."key"
      AND tm."isActive" = true
  ),
  "executionSpaceDeactivatedAt" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "TaskModule" AS tm
      WHERE tm."team" = ut."key"
        AND tm."isActive" = true
    ) THEN NULL
    ELSE ut."deactivatedAt"
  END
WHERE ut."executionSpaceDeactivatedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "UserTeam_organizationId_executionSpaceEnabled_idx"
  ON "UserTeam"("organizationId", "executionSpaceEnabled");
