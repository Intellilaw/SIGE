import { Prisma, type PrismaClient } from "@prisma/client";

import { AppError } from "../core/errors/app-error";
import { mapBudgetPlan, mapBudgetPlanSnapshot, mapFinanceRecord, mapGeneralExpense } from "./mappers";
import type { BudgetPlanUpdateRecord, BudgetPlanningRepository } from "./types";

const DEFAULT_MONTH_RANGE = { min: 1, max: 12 };

function assertMonth(month: number) {
  if (month < DEFAULT_MONTH_RANGE.min || month > DEFAULT_MONTH_RANGE.max) {
    throw new AppError(400, "INVALID_MONTH", "Month must be between 1 and 12.");
  }
}

function normalizeMoney(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(Math.max(0, numeric));
}

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasOwn<T extends object>(payload: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function calculateExpectedIncomeFromFinance(records: Array<{
  conceptFeesMxn: Prisma.Decimal;
  previousPaymentsMxn: Prisma.Decimal;
}>) {
  return records.reduce(
    (sum, record) => sum + Number(record.conceptFeesMxn || 0) - Number(record.previousPaymentsMxn || 0),
    0
  );
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isBeforeMonth(inputYear: number, inputMonth: number, targetYear: number, targetMonth: number) {
  return inputYear < targetYear || (inputYear === targetYear && inputMonth < targetMonth);
}

function getClosedMonthFilter(year: number, month: number) {
  return {
    OR: [
      { year: { lt: year } },
      {
        year,
        month: { lt: month }
      }
    ]
  };
}

export class PrismaBudgetPlanningRepository implements BudgetPlanningRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getOverview(year: number, month: number) {
    assertMonth(month);

    const [plan, financeRecords, generalExpenses] = await Promise.all([
      this.findOrCreatePlan(year, month),
      this.prisma.financeRecord.findMany({
        where: { year, month },
        orderBy: [{ createdAt: "asc" }, { clientNumber: "asc" }]
      }),
      this.prisma.generalExpense.findMany({
        where: { year, month },
        orderBy: [{ createdAt: "asc" }]
      })
    ]);

    return {
      plan: {
        ...plan,
        expectedIncomeMxn: calculateExpectedIncomeFromFinance(financeRecords)
      },
      financeRecords: financeRecords.map(mapFinanceRecord),
      generalExpenses: generalExpenses.map(mapGeneralExpense)
    };
  }

  public async updatePlan(year: number, month: number, payload: BudgetPlanUpdateRecord) {
    assertMonth(month);

    const data: Prisma.BudgetPlanUncheckedUpdateInput = {};
    if (hasOwn(payload, "expectedIncomeMxn")) {
      data.expectedIncomeMxn = normalizeMoney(payload.expectedIncomeMxn);
    }
    if (hasOwn(payload, "expectedExpenseMxn")) {
      data.expectedExpenseMxn = normalizeMoney(payload.expectedExpenseMxn);
    }
    if (hasOwn(payload, "notes")) {
      data.notes = normalizeOptionalText(payload.notes);
    }

    const plan = await this.prisma.budgetPlan.upsert({
      where: {
        year_month: {
          year,
          month
        }
      },
      create: {
        year,
        month,
        expectedIncomeMxn: hasOwn(payload, "expectedIncomeMxn") ? normalizeMoney(payload.expectedIncomeMxn) : new Prisma.Decimal(0),
        expectedExpenseMxn: hasOwn(payload, "expectedExpenseMxn") ? normalizeMoney(payload.expectedExpenseMxn) : new Prisma.Decimal(0),
        notes: hasOwn(payload, "notes") ? normalizeOptionalText(payload.notes) : null
      },
      update: data
    });

    const financeRecords = await this.prisma.financeRecord.findMany({
      where: { year, month },
      select: {
        conceptFeesMxn: true,
        previousPaymentsMxn: true
      }
    });

    return {
      ...mapBudgetPlan(plan),
      expectedIncomeMxn: calculateExpectedIncomeFromFinance(financeRecords)
    };
  }

  public async listSnapshotsBefore(year: number, month: number) {
    assertMonth(month);

    const closedMonthFilter = getClosedMonthFilter(year, month);
    const [planMonths, financeMonths, expenseMonths] = await Promise.all([
      this.prisma.budgetPlan.findMany({
        where: closedMonthFilter,
        select: { year: true, month: true }
      }),
      this.prisma.financeRecord.findMany({
        where: closedMonthFilter,
        select: { year: true, month: true },
        distinct: ["year", "month"]
      }),
      this.prisma.generalExpense.findMany({
        where: closedMonthFilter,
        select: { year: true, month: true },
        distinct: ["year", "month"]
      })
    ]);

    const monthLookup = new Map<string, { year: number; month: number }>();
    [...planMonths, ...financeMonths, ...expenseMonths].forEach((entry) => {
      if (isBeforeMonth(entry.year, entry.month, year, month)) {
        monthLookup.set(getMonthKey(entry.year, entry.month), entry);
      }
    });

    const months = [...monthLookup.values()].sort((left, right) =>
      left.year === right.year ? left.month - right.month : left.year - right.year
    );

    for (const entry of months) {
      await this.findOrCreateSnapshot(entry.year, entry.month);
    }

    const snapshots = await this.prisma.budgetPlanSnapshot.findMany({
      where: closedMonthFilter,
      orderBy: [{ year: "desc" }, { month: "desc" }]
    });

    return snapshots.map(mapBudgetPlanSnapshot);
  }

  private async findOrCreatePlan(year: number, month: number) {
    const plan = await this.prisma.budgetPlan.upsert({
      where: {
        year_month: {
          year,
          month
        }
      },
      create: {
        year,
        month,
        expectedIncomeMxn: new Prisma.Decimal(0),
        expectedExpenseMxn: new Prisma.Decimal(0),
        notes: null
      },
      update: {}
    });

    return mapBudgetPlan(plan);
  }

  private async findOrCreateSnapshot(year: number, month: number) {
    const existing = await this.prisma.budgetPlanSnapshot.findUnique({
      where: {
        year_month: {
          year,
          month
        }
      }
    });

    if (existing) {
      return mapBudgetPlanSnapshot(existing);
    }

    const [plan, financeRecords, generalExpenses] = await Promise.all([
      this.prisma.budgetPlan.findUnique({
        where: {
          year_month: {
            year,
            month
          }
        }
      }),
      this.prisma.financeRecord.findMany({
        where: { year, month }
      }),
      this.prisma.generalExpense.findMany({
        where: { year, month }
      })
    ]);

    const expectedIncomeMxn = calculateExpectedIncomeFromFinance(financeRecords);
    const expectedExpenseMxn = Number(plan?.expectedExpenseMxn ?? 0);
    const actualIncomeMxn = financeRecords.reduce(
      (sum, record) =>
        sum +
        Number(record.paidThisMonthMxn || 0) +
        Number(record.payment2Mxn || 0) +
        Number(record.payment3Mxn || 0),
      0
    );
    const actualExpenseMxn = generalExpenses.reduce((sum, expense) => sum + Number(expense.amountMxn || 0), 0);
    const expectedResultMxn = expectedIncomeMxn - expectedExpenseMxn;
    const actualResultMxn = actualIncomeMxn - actualExpenseMxn;

    const snapshot = await this.prisma.budgetPlanSnapshot.create({
      data: {
        year,
        month,
        expectedIncomeMxn: new Prisma.Decimal(expectedIncomeMxn),
        expectedExpenseMxn: new Prisma.Decimal(expectedExpenseMxn),
        actualIncomeMxn: new Prisma.Decimal(actualIncomeMxn),
        actualExpenseMxn: new Prisma.Decimal(actualExpenseMxn),
        expectedResultMxn: new Prisma.Decimal(expectedResultMxn),
        actualResultMxn: new Prisma.Decimal(actualResultMxn),
        financeRecordCount: financeRecords.length,
        generalExpenseCount: generalExpenses.length,
        notes: plan?.notes ?? null
      }
    });

    return mapBudgetPlanSnapshot(snapshot);
  }
}
