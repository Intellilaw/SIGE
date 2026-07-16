UPDATE "GeneralExpense" AS expense
SET
  "team" = 'Sin equipo',
  "generalExpense" = payroll."generalExpense",
  "expenseWithoutTeam" = false,
  "pctLitigation" = payroll."pctLitigation",
  "pctCorporateLabor" = payroll."pctCorporateLabor",
  "pctSettlements" = payroll."pctSettlements",
  "pctFinancialLaw" = payroll."pctFinancialLaw",
  "pctTaxCompliance" = payroll."pctTaxCompliance",
  "paymentMethod" = 'Transferencia',
  "bank" = 'HSBC',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "GeneralExpensePayrollEntry" AS payroll
WHERE expense."payrollEntryId" = payroll."id";

WITH payroll_targets AS (
  SELECT
    expense."id" AS "expenseId",
    expense."organizationId",
    CASE
      WHEN payroll."half" = 1 THEN make_date(payroll."year", payroll."month", 25)
      ELSE (
        make_date(payroll."year", payroll."month", 1) + INTERVAL '1 month 9 days'
      )::date
    END AS "targetDate"
  FROM "GeneralExpense" AS expense
  INNER JOIN "GeneralExpensePayrollEntry" AS payroll
    ON payroll."id" = expense."payrollEntryId"
),
payroll_payment_dates AS (
  SELECT
    target."expenseId",
    scheduled."paymentDate"
  FROM payroll_targets AS target
  CROSS JOIN LATERAL (
    SELECT candidate::date AS "paymentDate"
    FROM generate_series(
      target."targetDate"::timestamp,
      (target."targetDate" - 370)::timestamp,
      INTERVAL '-1 day'
    ) AS candidates(candidate)
    WHERE EXTRACT(ISODOW FROM candidate) < 6
      AND NOT EXISTS (
        SELECT 1
        FROM "LaborGlobalVacationDay" AS vacation
        WHERE vacation."organizationId" = target."organizationId"
          AND (
            (
              CASE
                WHEN jsonb_typeof(vacation."vacationDates") = 'array'
                  THEN jsonb_array_length(vacation."vacationDates")
                ELSE 0
              END
            ) > 0
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(vacation."vacationDates") AS dates("dateKey")
              WHERE dates."dateKey" = to_char(candidate, 'YYYY-MM-DD')
            )
            OR (
              (
                CASE
                  WHEN jsonb_typeof(vacation."vacationDates") = 'array'
                    THEN jsonb_array_length(vacation."vacationDates")
                  ELSE 0
                END
              ) = 0
              AND candidate::date BETWEEN vacation."date"
                AND vacation."date" + (GREATEST(FLOOR(vacation."days")::int, 1) - 1)
            )
          )
      )
    ORDER BY candidate DESC
    LIMIT 1
  ) AS scheduled
)
UPDATE "GeneralExpense" AS expense
SET
  "paid" = true,
  "paidAt" = payment."paymentDate",
  "updatedAt" = CURRENT_TIMESTAMP
FROM payroll_payment_dates AS payment
WHERE expense."id" = payment."expenseId";
