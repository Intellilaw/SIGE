DELETE FROM "GeneralExpense" AS expense
USING "GeneralExpensePayrollEntry" AS payroll
WHERE expense."payrollEntryId" = payroll."id"
  AND payroll."finalPaymentApprovedByEmrt" = false;
