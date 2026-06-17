-- Backfill the first KPI history anchors for records that existed before
-- the Manager started storing explicit dates for term marking and BE/BL flow.

UPDATE "TaskTrackingRecord"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{termMarkedAt}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND NOT (COALESCE("data", '{}'::jsonb) ? 'termMarkedAt')
  AND (
    "termDate" IS NOT NULL
    OR lower(COALESCE("data"->>'termEnabled', '')) IN ('true', '1', 'si', 'yes')
    OR replace(lower("sourceTable"), '-', '_') = 'desahogo_prevenciones'
    OR replace(lower("tableCode"), '-', '_') = 'desahogo_prevenciones'
  );

UPDATE "TaskTrackingRecord"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{writingPresentedAt}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND "workflowStage" >= 3
  AND NOT (COALESCE("data", '{}'::jsonb) ? 'writingPresentedAt')
  AND (
    replace(lower("sourceTable"), '-', '_') = 'escritos_fondo'
    OR replace(lower("tableCode"), '-', '_') = 'escritos_fondo'
  );

UPDATE "TaskTrackingRecord"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{writingRegisteredAt}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND "workflowStage" >= 4
  AND NOT (COALESCE("data", '{}'::jsonb) ? 'writingRegisteredAt')
  AND (
    replace(lower("sourceTable"), '-', '_') = 'escritos_fondo'
    OR replace(lower("tableCode"), '-', '_') = 'escritos_fondo'
  );

UPDATE "TaskTerm"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{termMarkedAt}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND NOT (COALESCE("data", '{}'::jsonb) ? 'termMarkedAt');

UPDATE "TaskTerm"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{verificationDates}', '{}'::jsonb, true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND (
    lower(COALESCE("verification"->>'verificado_meoo', '')) IN ('si', 'yes')
    OR lower(COALESCE("verification"->>'verificado_lamr', '')) IN ('si', 'yes')
    OR lower(COALESCE("verification"->>'verificado_ekpo', '')) IN ('si', 'yes')
    OR lower(COALESCE("verification"->>'verificado_nbsg', '')) IN ('si', 'yes')
  )
  AND jsonb_typeof(COALESCE("data", '{}'::jsonb)->'verificationDates') IS DISTINCT FROM 'object';

UPDATE "TaskTerm"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{verificationDates,verificado_meoo}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND lower(COALESCE("verification"->>'verificado_meoo', '')) IN ('si', 'yes')
  AND NOT (COALESCE("data"->'verificationDates', '{}'::jsonb) ? 'verificado_meoo');

UPDATE "TaskTerm"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{verificationDates,verificado_lamr}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND lower(COALESCE("verification"->>'verificado_lamr', '')) IN ('si', 'yes')
  AND NOT (COALESCE("data"->'verificationDates', '{}'::jsonb) ? 'verificado_lamr');

UPDATE "TaskTerm"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{verificationDates,verificado_ekpo}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND lower(COALESCE("verification"->>'verificado_ekpo', '')) IN ('si', 'yes')
  AND NOT (COALESCE("data"->'verificationDates', '{}'::jsonb) ? 'verificado_ekpo');

UPDATE "TaskTerm"
SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{verificationDates,verificado_nbsg}', '"2026-06-17"', true)
WHERE "deletedAt" IS NULL
  AND "moduleId" = 'litigation'
  AND lower(COALESCE("verification"->>'verificado_nbsg', '')) IN ('si', 'yes')
  AND NOT (COALESCE("data"->'verificationDates', '{}'::jsonb) ? 'verificado_nbsg');
