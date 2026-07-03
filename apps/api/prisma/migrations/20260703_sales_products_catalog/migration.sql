-- Persist sales products per tenant, including archive state and optional logos.

CREATE TABLE IF NOT EXISTS "SalesProduct" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'org-rusconi',
  "productKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tagline" TEXT NOT NULL,
  "initials" TEXT NOT NULL,
  "accentColor" TEXT NOT NULL DEFAULT '#2563eb',
  "logoAlt" TEXT NOT NULL,
  "logoOriginalFileName" TEXT,
  "logoMimeType" TEXT,
  "logoSizeBytes" INTEGER,
  "logoContent" BYTEA,
  "defaultStrategy" TEXT NOT NULL,
  "defaultDailyReport" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SalesProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesProduct_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesProduct_organizationId_productKey_key"
  ON "SalesProduct"("organizationId", "productKey");

CREATE INDEX IF NOT EXISTS "SalesProduct_organizationId_deletedAt_archivedAt_idx"
  ON "SalesProduct"("organizationId", "deletedAt", "archivedAt");

CREATE INDEX IF NOT EXISTS "SalesProduct_organizationId_name_idx"
  ON "SalesProduct"("organizationId", "name");

INSERT INTO "SalesProduct" (
  "id",
  "organizationId",
  "productKey",
  "name",
  "tagline",
  "initials",
  "accentColor",
  "logoAlt",
  "defaultStrategy",
  "defaultDailyReport",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT("Organization"."id", '-sales-product-start'),
  "Organization"."id",
  'start',
  'Start',
  'Producto de apertura para nuevos clientes de LegalFlow.',
  'ST',
  '#2563eb',
  'Start by LegalFlow',
  'Delimitar el mensaje de entrada de Start: explicar el beneficio concreto, el tipo de cliente ideal, los canales prioritarios y la oferta inicial que debe convertirse en llamada comercial.',
  'Registrar contactos realizados, piezas publicadas, respuestas recibidas, siguientes acciones y bloqueos detectados durante el dia.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId", "productKey") DO NOTHING;

INSERT INTO "SalesProduct" (
  "id",
  "organizationId",
  "productKey",
  "name",
  "tagline",
  "initials",
  "accentColor",
  "logoAlt",
  "defaultStrategy",
  "defaultDailyReport",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT("Organization"."id", '-sales-product-pld'),
  "Organization"."id",
  'pld',
  'Intellilaw PLD',
  'Solucion para cumplimiento, prevencion y control operativo PLD.',
  'PLD',
  '#2563eb',
  'Intellilaw PLD by LegalFlow',
  'Delimitar segmentos regulados, dolores por auditoria y cumplimiento, argumentos de confianza, objeciones frecuentes y ruta de demostracion de Intellilaw PLD.',
  'Registrar prospectos contactados, demostraciones agendadas, preguntas recurrentes, materiales enviados y acuerdos de seguimiento.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId", "productKey") DO NOTHING;

INSERT INTO "SalesProduct" (
  "id",
  "organizationId",
  "productKey",
  "name",
  "tagline",
  "initials",
  "accentColor",
  "logoAlt",
  "defaultStrategy",
  "defaultDailyReport",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT("Organization"."id", '-sales-product-remates'),
  "Organization"."id",
  'remates',
  'Remates',
  'Oferta comercial enfocada en oportunidades inmobiliarias y seguimiento juridico.',
  'RM',
  '#1d4ed8',
  'Remates Inmobiliarios Mexico by LegalFlow',
  'Delimitar inventario objetivo, perfil de inversionista, mensajes de oportunidad, reglas de calificacion de leads y cadencia de seguimiento.',
  'Registrar propiedades revisadas, leads calificados, llamadas realizadas, dudas legales y proximas tareas comerciales.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId", "productKey") DO NOTHING;

INSERT INTO "SalesProduct" (
  "id",
  "organizationId",
  "productKey",
  "name",
  "tagline",
  "initials",
  "accentColor",
  "logoAlt",
  "defaultStrategy",
  "defaultDailyReport",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT("Organization"."id", '-sales-product-minka'),
  "Organization"."id",
  'minka',
  'Minka',
  'Inteligencia contractual con IA para abogados y equipos legales.',
  'MK',
  '#6d28d9',
  'Minka by LegalFlow',
  'Delimitar casos de uso contractuales, promesas de eficiencia, perfil de usuarios juridicos, mensajes de confianza y secuencia de demostracion para Minka.',
  'Registrar despachos y equipos legales contactados, demos agendadas, contratos analizados, dudas sobre IA y siguientes acciones comerciales.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId", "productKey") DO NOTHING;
