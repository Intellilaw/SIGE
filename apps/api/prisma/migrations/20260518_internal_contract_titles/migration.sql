ALTER TABLE "InternalContract" ADD COLUMN "title" TEXT;

UPDATE "InternalContract"
SET "title" = CONCAT(
  COALESCE(NULLIF(BTRIM("Quote"."clientName"), ''), 'Cliente sin nombre'),
  ' (',
  COALESCE(NULLIF(BTRIM("Quote"."quoteNumber"), ''), 'Sin numero'),
  ') (',
  COALESCE(NULLIF(BTRIM("Quote"."subject"), ''), 'Sin asunto'),
  ')'
)
FROM "Quote"
WHERE "InternalContract"."contractNumber" = "Quote"."quoteNumber"
  AND NULLIF(BTRIM("Quote"."quoteNumber"), '') IS NOT NULL;

UPDATE "InternalContract"
SET "title" = COALESCE(NULLIF(BTRIM("contractNumber"), ''), "originalFileName")
WHERE NULLIF(BTRIM(COALESCE("title", '')), '') IS NULL;

CREATE INDEX "InternalContract_title_idx" ON "InternalContract"("title");
