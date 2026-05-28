-- CreateTable
CREATE TABLE "UserTeam" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTeam_key_key" ON "UserTeam"("key");

-- CreateIndex
CREATE INDEX "UserTeam_isActive_sortOrder_idx" ON "UserTeam"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "UserTeam_label_idx" ON "UserTeam"("label");

-- Preserve the team catalog that existed before teams became administrable.
INSERT INTO "UserTeam" ("id", "key", "label", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('team-litigation', 'LITIGATION', 'Litigio', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-corporate-labor', 'CORPORATE_LABOR', 'Corporativo y laboral', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-settlements', 'SETTLEMENTS', 'Convenios', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-financial-law', 'FINANCIAL_LAW', 'Der Financiero', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-tax-compliance', 'TAX_COMPLIANCE', 'Compliance Fiscal', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-audit', 'AUDIT', 'Auditoría', true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-client-relations', 'CLIENT_RELATIONS', 'Comunicación con cliente', true, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-sales', 'SALES', 'Ventas', true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-finance', 'FINANCE', 'Finanzas', true, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-admin-operations', 'ADMIN_OPERATIONS', 'Servicios administrativos', true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-admin', 'ADMIN', 'Dirección general', true, 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Also keep any real user team values that were not part of the static catalog.
WITH user_team_values AS (
  SELECT DISTINCT
    NULLIF(BTRIM("team"), '') AS stored_key,
    NULLIF(BTRIM("legacyTeam"), '') AS stored_label
  FROM "User"
  WHERE NULLIF(BTRIM(COALESCE("team", '')), '') IS NOT NULL
     OR NULLIF(BTRIM(COALESCE("legacyTeam", '')), '') IS NOT NULL
),
normalized_user_team_values AS (
  SELECT
    COALESCE(
      stored_key,
      NULLIF(TRIM(BOTH '_' FROM REGEXP_REPLACE(UPPER(stored_label), '[^A-Z0-9]+', '_', 'g')), '')
    ) AS team_key,
    COALESCE(stored_label, stored_key) AS team_label
  FROM user_team_values
)
INSERT INTO "UserTeam" ("id", "key", "label", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
  'team-imported-' || MD5(team_key),
  team_key,
  team_label,
  true,
  1000 + ROW_NUMBER() OVER (ORDER BY team_label),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM normalized_user_team_values
WHERE team_key IS NOT NULL
  AND team_label IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "UserTeam"
    WHERE "UserTeam"."key" = normalized_user_team_values.team_key
  );
