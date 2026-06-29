INSERT INTO "TaskModule" ("id", "team", "label", "summary", "isActive", "createdAt", "updatedAt")
VALUES (
  'finance',
  'FINANCE',
  'Finanzas',
  'Dashboard operativo de cobranza, datos financieros y tareas adicionales del equipo de finanzas.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "team" = EXCLUDED."team",
  "label" = EXCLUDED."label",
  "summary" = EXCLUDED."summary",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
