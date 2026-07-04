UPDATE "Matter" AS matter
SET "milestone" = quote."milestone"
FROM "Quote" AS quote
WHERE matter."organizationId" = quote."organizationId"
  AND (
    matter."quoteId" = quote."id"
    OR (
      matter."quoteNumber" IS NOT NULL
      AND quote."quoteNumber" IS NOT NULL
      AND lower(matter."quoteNumber") = lower(quote."quoteNumber")
    )
  )
  AND (matter."milestone" IS NULL OR btrim(matter."milestone") = '')
  AND quote."milestone" IS NOT NULL
  AND btrim(quote."milestone") <> '';

UPDATE "FinanceRecord" AS finance
SET "milestone" = matter."milestone"
FROM "Matter" AS matter
WHERE matter."deletedAt" IS NULL
  AND finance."organizationId" = matter."organizationId"
  AND (
    (
      finance."quoteNumber" IS NOT NULL
      AND matter."quoteNumber" IS NOT NULL
      AND lower(finance."quoteNumber") = lower(matter."quoteNumber")
    )
    OR (
      lower(finance."clientName") = lower(matter."clientName")
      AND lower(finance."subject") = lower(matter."subject")
    )
  );

ALTER TABLE "Quote" DROP COLUMN "milestone";
ALTER TABLE "QuoteTemplate" DROP COLUMN "milestone";
