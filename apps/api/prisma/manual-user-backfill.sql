ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "legacyRole" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "legacyTeam" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailConfirmedAt" TIMESTAMP(3);

UPDATE "User"
SET "username" = LOWER(SPLIT_PART("email", '@', 1))
WHERE "username" IS NULL;

UPDATE "User"
SET "legacyRole" = CASE
  WHEN "role" = 'SUPERADMIN' THEN 'SUPERADMIN'
  ELSE 'INTRANET'
END
WHERE "legacyRole" IS NULL;

UPDATE "User"
SET "legacyTeam" = CASE "team"
  WHEN 'CLIENT_RELATIONS' THEN 'Comunicación con cliente'
  WHEN 'FINANCE' THEN 'Finanzas'
  WHEN 'LITIGATION' THEN 'Litigio'
  WHEN 'CORPORATE_LABOR' THEN 'Corporativo y laboral'
  WHEN 'SETTLEMENTS' THEN 'Convenios'
  WHEN 'FINANCIAL_LAW' THEN 'Der Financiero'
  WHEN 'TAX_COMPLIANCE' THEN 'Compliance Fiscal'
  WHEN 'AUDIT' THEN 'AuditorÃ­a'
  WHEN 'ADMIN_OPERATIONS' THEN 'Servicios administrativos'
  WHEN 'ADMIN' THEN 'Dirección general'
  ELSE NULL
END
WHERE "legacyTeam" IS NULL;

UPDATE "User"
SET "isActive" = TRUE
WHERE "isActive" IS NULL;

UPDATE "User"
SET "emailConfirmedAt" = NOW()
WHERE "emailConfirmedAt" IS NULL;
