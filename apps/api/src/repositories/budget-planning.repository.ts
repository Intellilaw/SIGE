import { Prisma, type PrismaClient } from "@prisma/client";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import {
  mapBudgetPlan,
  mapBudgetPlanExpenseBreakdownItem,
  mapBudgetPlanSnapshot,
  mapFinanceRecord,
  mapGeneralExpense
} from "./mappers";
import type { BudgetPlanExpenseBreakdownUpdateItem, BudgetPlanUpdateRecord, BudgetPlanningRepository } from "./types";

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

function calculateExpectedIncomeMxn(record: {
  conceptFeesMxn: Prisma.Decimal;
}) {
  return Number(record.conceptFeesMxn || 0);
}

function calculateExpectedIncomeBreakdownFromFinance(records: Array<{
  conceptFeesMxn: Prisma.Decimal;
  highCollectionProbability: boolean;
  lowCollectionProbability: boolean;
}>) {
  return records.reduce(
    (totals, record) => {
      const expectedIncomeMxn = calculateExpectedIncomeMxn(record);

      return {
        total: totals.total + expectedIncomeMxn,
        highProbability: totals.highProbability + (record.highCollectionProbability ? expectedIncomeMxn : 0),
        lowProbability: totals.lowProbability + (record.lowCollectionProbability ? expectedIncomeMxn : 0)
      };
    },
    { total: 0, highProbability: 0, lowProbability: 0 }
  );
}

function calculateExpectedExpenseFromBreakdown(records: Array<{ amountMxn: Prisma.Decimal }>) {
  return records.reduce((sum, record) => sum + Number(record.amountMxn || 0), 0);
}

function normalizeExpenseBreakdownItems(items?: BudgetPlanExpenseBreakdownUpdateItem[]) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      concept: normalizeOptionalText(item.concept)?.slice(0, 160) ?? "",
      amountMxn: Math.max(0, Number(item.amountMxn ?? 0))
    }))
    .filter((item) => item.concept.length > 0 || item.amountMxn > 0);
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getNextMonth(year: number, month: number) {
  if (month >= 12) {
    return { year: year + 1, month: 1 };
  }

  return { year, month: month + 1 };
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

    const [plan, financeRecords, generalExpenses, expectedExpenseBreakdown] = await Promise.all([
      this.findOrCreatePlan(year, month),
      this.prisma.financeRecord.findMany({
        where: { year, month },
        orderBy: [{ createdAt: "asc" }, { clientNumber: "asc" }]
      }),
      this.prisma.generalExpense.findMany({
        where: { year, month },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.budgetPlanExpenseBreakdownItem.findMany({
        where: { year, month },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      })
    ]);

    const expectedIncome = calculateExpectedIncomeBreakdownFromFinance(financeRecords);
    const expectedExpenseMxn = calculateExpectedExpenseFromBreakdown(expectedExpenseBreakdown);

    return {
      plan: {
        ...plan,
        expectedIncomeMxn: expectedIncome.total,
        expectedExpenseMxn
      },
      expectedExpenseBreakdown: expectedExpenseBreakdown.map(mapBudgetPlanExpenseBreakdownItem),
      financeRecords: financeRecords.map(mapFinanceRecord),
      generalExpenses: generalExpenses.map(mapGeneralExpense)
    };
  }

  public async updatePlan(year: number, month: number, payload: BudgetPlanUpdateRecord) {
    assertMonth(month);
    const organizationId = getCurrentOrganizationIdOrDefault();

    const data: Prisma.BudgetPlanUncheckedUpdateInput = {};
    const shouldReplaceExpectedExpenseBreakdown = hasOwn(payload, "expectedExpenseBreakdown");
    const expectedExpenseBreakdown = shouldReplaceExpectedExpenseBreakdown
      ? normalizeExpenseBreakdownItems(payload.expectedExpenseBreakdown)
      : [];
    const expectedExpenseBreakdownTotal = expectedExpenseBreakdown.reduce((sum, item) => sum + item.amountMxn, 0);

    if (hasOwn(payload, "expectedIncomeMxn")) {
      data.expectedIncomeMxn = normalizeMoney(payload.expectedIncomeMxn);
    }
    if (shouldReplaceExpectedExpenseBreakdown) {
      data.expectedExpenseMxn = normalizeMoney(expectedExpenseBreakdownTotal);
    } else if (hasOwn(payload, "expectedExpenseMxn")) {
      data.expectedExpenseMxn = normalizeMoney(payload.expectedExpenseMxn);
    }
    if (hasOwn(payload, "notes")) {
      data.notes = normalizeOptionalText(payload.notes);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.budgetPlan.upsert({
        where: {
          organizationId_year_month: {
            organizationId,
            year,
            month
          }
        },
        create: {
          organizationId,
          year,
          month,
          expectedIncomeMxn: hasOwn(payload, "expectedIncomeMxn") ? normalizeMoney(payload.expectedIncomeMxn) : new Prisma.Decimal(0),
          expectedExpenseMxn: shouldReplaceExpectedExpenseBreakdown
            ? normalizeMoney(expectedExpenseBreakdownTotal)
            : hasOwn(payload, "expectedExpenseMxn")
              ? normalizeMoney(payload.expectedExpenseMxn)
              : new Prisma.Decimal(0),
          notes: hasOwn(payload, "notes") ? normalizeOptionalText(payload.notes) : null
        },
        update: data
      });

      if (shouldReplaceExpectedExpenseBreakdown) {
        await tx.budgetPlanExpenseBreakdownItem.deleteMany({
          where: { organizationId, year, month }
        });

        if (expectedExpenseBreakdown.length > 0) {
          await tx.budgetPlanExpenseBreakdownItem.createMany({
            data: expectedExpenseBreakdown.map((item, index) => ({
              organizationId,
              year,
              month,
              concept: item.concept,
              amountMxn: normalizeMoney(item.amountMxn),
              sortOrder: index
            }))
          });
        }
      }
    });

    return this.getOverview(year, month);
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
    const organizationId = getCurrentOrganizationIdOrDefault();
    const plan = await this.prisma.budgetPlan.upsert({
      where: {
        organizationId_year_month: {
          organizationId,
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
    const organizationId = getCurrentOrganizationIdOrDefault();
    const existing = await this.prisma.budgetPlanSnapshot.findUnique({
      where: {
        organizationId_year_month: {
          organizationId,
          year,
          month
        }
      }
    });

    if (existing) {
      return mapBudgetPlanSnapshot(existing);
    }

    const [plan, financeRecords, generalExpenses, expectedExpenseBreakdown] = await Promise.all([
      this.prisma.budgetPlan.findUnique({
        where: {
          organizationId_year_month: {
            organizationId,
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
      }),
      this.prisma.budgetPlanExpenseBreakdownItem.findMany({
        where: { year, month }
      })
    ]);

    const expectedIncome = calculateExpectedIncomeBreakdownFromFinance(financeRecords);
    const expectedIncomeMxn = expectedIncome.total;
    const expectedExpenseMxn = calculateExpectedExpenseFromBreakdown(expectedExpenseBreakdown);
    const actualIncomeMxn = financeRecords.reduce(
      (sum, record) =>
        sum +
        Number(record.paidThisMonthMxn || 0) +
        Number(record.payment2Mxn || 0) +
        Number(record.payment3Mxn || 0),
      0
    );
    const actualExpenseMxn = generalExpenses.reduce((sum, expense) => sum + Number(expense.amountMxn || 0), 0);
    const expectedResultMxn = expectedIncome.highProbability - expectedExpenseMxn;
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

  public async copyExpenseBreakdownToNextMonth(year: number, month: number) {
    assertMonth(month);
    const organizationId = getCurrentOrganizationIdOrDefault();
    const next = getNextMonth(year, month);
    const sourceItems = await this.prisma.budgetPlanExpenseBreakdownItem.findMany({
      where: { organizationId, year, month },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    const copiedTotal = calculateExpectedExpenseFromBreakdown(sourceItems);

    await this.prisma.$transaction(async (tx) => {
      await tx.budgetPlan.upsert({
        where: {
          organizationId_year_month: {
            organizationId,
            year: next.year,
            month: next.month
          }
        },
        create: {
          organizationId,
          year: next.year,
          month: next.month,
          expectedIncomeMxn: new Prisma.Decimal(0),
          expectedExpenseMxn: normalizeMoney(copiedTotal),
          notes: null
        },
        update: {
          expectedExpenseMxn: normalizeMoney(copiedTotal)
        }
      });

      await tx.budgetPlanExpenseBreakdownItem.deleteMany({
        where: { organizationId, year: next.year, month: next.month }
      });

      if (sourceItems.length > 0) {
        await tx.budgetPlanExpenseBreakdownItem.createMany({
          data: sourceItems.map((item, index) => ({
            organizationId,
            year: next.year,
            month: next.month,
            concept: item.concept,
            amountMxn: item.amountMxn,
            sortOrder: index
          }))
        });
      }
    });

    return {
      year: next.year,
      month: next.month,
      copied: sourceItems.length
    };
  }
}
