ALTER TABLE "LaborGlobalVacationDay"
ADD COLUMN "vacationDates" JSONB;

UPDATE "LaborGlobalVacationDay"
SET "vacationDates" = (
  SELECT jsonb_agg(to_char(day_value, 'YYYY-MM-DD') ORDER BY day_value)
  FROM generate_series(
    "date",
    "date" + ((GREATEST(FLOOR("days")::int, 1) - 1) * INTERVAL '1 day'),
    INTERVAL '1 day'
  ) AS dates(day_value)
)
WHERE "vacationDates" IS NULL;
