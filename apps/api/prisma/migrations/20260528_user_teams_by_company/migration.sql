ALTER TABLE "UserTeam"
  ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi';

DROP INDEX IF EXISTS "UserTeam_key_key";
DROP INDEX IF EXISTS "UserTeam_isActive_sortOrder_idx";
DROP INDEX IF EXISTS "UserTeam_label_idx";

CREATE UNIQUE INDEX "UserTeam_organizationId_key_key" ON "UserTeam"("organizationId", "key");
CREATE INDEX "UserTeam_organizationId_isActive_sortOrder_idx" ON "UserTeam"("organizationId", "isActive", "sortOrder");
CREATE INDEX "UserTeam_organizationId_label_idx" ON "UserTeam"("organizationId", "label");

ALTER TABLE "UserTeam"
  ADD CONSTRAINT "UserTeam_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
