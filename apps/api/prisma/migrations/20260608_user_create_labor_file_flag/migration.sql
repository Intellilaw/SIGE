ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "createLaborFile" BOOLEAN NOT NULL DEFAULT true;

UPDATE "User"
SET "createLaborFile" = false
WHERE "isExternal" = true
  OR "legacyRole" = 'SUPERADMIN'
  OR "role" = 'SUPERADMIN';
