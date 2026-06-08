ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "secondaryTeam" TEXT,
  ADD COLUMN IF NOT EXISTS "secondaryLegacyTeam" TEXT,
  ADD COLUMN IF NOT EXISTS "secondarySpecificRole" TEXT;
