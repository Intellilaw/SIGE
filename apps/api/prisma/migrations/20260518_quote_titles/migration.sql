ALTER TABLE "Quote" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';

UPDATE "Quote"
SET "title" = CONCAT(
  COALESCE(NULLIF(BTRIM("clientName"), ''), 'Cliente sin nombre'),
  ' (',
  COALESCE(NULLIF(BTRIM("quoteNumber"), ''), 'Sin numero'),
  ') (',
  COALESCE(NULLIF(BTRIM("subject"), ''), 'Sin asunto'),
  ')'
)
WHERE BTRIM("title") = '';

CREATE INDEX "Quote_title_idx" ON "Quote"("title");
