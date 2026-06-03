-- Align LegalFlow's superadmin login with Eduardo's operational account.
-- The password hash is copied from Eduardo's existing Rusconi/Intellilaw user
-- when present, so the repo does not store a personal password.

DELETE FROM "RefreshToken"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "organizationId" = 'org-legalflow'
);

DELETE FROM "PasswordResetToken"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "organizationId" = 'org-legalflow'
);

DELETE FROM "User"
WHERE "organizationId" = 'org-legalflow'
  AND "email" <> 'eduardo.rusconi@intellilaw.ai';

WITH "EduardoSourcePassword" AS (
  SELECT "passwordHash"
  FROM "User"
  WHERE "organizationId" IN ('org-intellilaw', 'org-rusconi')
    AND (
      lower("email") = 'eduardo.rusconi@intellilaw.ai'
      OR lower("email") = 'eduardo.rusconi@calculadora.app'
      OR lower("username") IN ('eduardo rusconi', 'eduardo miguel rusconi trujillo')
      OR lower("displayName") IN ('eduardo rusconi', 'eduardo miguel rusconi trujillo')
    )
  ORDER BY CASE "organizationId"
    WHEN 'org-intellilaw' THEN 1
    WHEN 'org-rusconi' THEN 2
    ELSE 3
  END
  LIMIT 1
)
INSERT INTO "User" (
  "id",
  "organizationId",
  "email",
  "username",
  "displayName",
  "shortName",
  "role",
  "legacyRole",
  "team",
  "legacyTeam",
  "specificRole",
  "permissions",
  "isActive",
  "passwordResetRequired",
  "emailConfirmedAt",
  "passwordHash",
  "createdAt",
  "updatedAt"
)
SELECT
  'usr-legalflow-superadmin',
  'org-legalflow',
  'eduardo.rusconi@intellilaw.ai',
  'Eduardo Rusconi',
  'Eduardo Rusconi',
  'EMRT',
  'SUPERADMIN',
  'SUPERADMIN',
  'ADMIN',
  'Direccion general',
  'Direccion general',
  '["*"]'::jsonb,
  true,
  false,
  CURRENT_TIMESTAMP,
  COALESCE(
    (SELECT "passwordHash" FROM "EduardoSourcePassword"),
    '647db4cd4d9cc595e44dfd387b3c8503:7a0d23addc70906a3bd8d84319dc99be1273fd1a93ba930ebf983c8d5f99da92cdaa8520dfa7be438e3211b8c54e3ef298a1c55149d4285d3fb040e002bdf0cc'
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
ON CONFLICT ("organizationId", "email") DO UPDATE SET
  "id" = EXCLUDED."id",
  "username" = EXCLUDED."username",
  "displayName" = EXCLUDED."displayName",
  "shortName" = EXCLUDED."shortName",
  "role" = EXCLUDED."role",
  "legacyRole" = EXCLUDED."legacyRole",
  "team" = EXCLUDED."team",
  "legacyTeam" = EXCLUDED."legacyTeam",
  "specificRole" = EXCLUDED."specificRole",
  "permissions" = EXCLUDED."permissions",
  "isActive" = true,
  "passwordResetRequired" = false,
  "emailConfirmedAt" = COALESCE("User"."emailConfirmedAt", CURRENT_TIMESTAMP),
  "passwordHash" = COALESCE(EXCLUDED."passwordHash", "User"."passwordHash"),
  "updatedAt" = CURRENT_TIMESTAMP;
