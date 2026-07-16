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
import type {
  BudgetAreaProfitabilityRangeRecord,
  BudgetPlanExpenseBreakdownUpdateItem,
  BudgetPlanUpdateRecord,
  BudgetPlanningRepository
} from "./types";

const DEFAULT_MONTH_RANGE = { min: 1, max: 12 };
const AREA_PROFITABILITY_TEAMS = [
  { team: "LITIGATION", teamLabel: "Litigio", percentageField: "pctLitigation" },
  { team: "CORPORATE_LABOR", teamLabel: "Corporativo", percentageField: "pctCorporateLabor" },
  { team: "SETTLEMENTS", teamLabel: "Convenios", percentageField: "pctSettlements" },
  { team: "FINANCIAL_LAW", teamLabel: "Compliance Financiero", percentageField: "pctFinancialLaw" },
  { team: "TAX_COMPLIANCE", teamLabel: "Compliance Fiscal", percentageField: "pctTaxCompliance" }
] as const;

interface MonthPeriod {
  year: number;
  month: number;
}

interface TeamDistributionRecord {
  pctLitigation: Prisma.Decimal | number;
  pctCorporateLabor: Prisma.Decimal | number;
  pctSettlements: Prisma.Decimal | number;
  pctFinancialLaw: Prisma.Decimal | number;
  pctTaxCompliance: Prisma.Decimal | number;
}

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

function isPaymentReceived(method?: string | null, received?: boolean | null) {
  return method === "T" || method === "E_RECEIVED" || (method === "E" && received === true);
}

function hasPaymentDate(value?: Date | null) {
  return Boolean(value && !Number.isNaN(value.getTime()));
}

function calculateReceivedIncomeMxn(record: {
  paidThisMonthMxn: Prisma.Decimal;
  payment2Mxn: Prisma.Decimal;
  payment3Mxn: Prisma.Decimal;
  paymentDate1?: Date | null;
  paymentDate2?: Date | null;
  paymentDate3?: Date | null;
  paymentMethod?: string | null;
  paymentMethod2?: string | null;
  paymentMethod3?: string | null;
  paymentReceived?: boolean | null;
  paymentReceived2?: boolean | null;
  paymentReceived3?: boolean | null;
}) {
  const primaryPaymentMxn =
    hasPaymentDate(record.paymentDate1) && isPaymentReceived(record.paymentMethod, record.paymentReceived)
      ? Number(record.paidThisMonthMxn || 0)
      : 0;
  const payment2Mxn =
    hasPaymentDate(record.paymentDate2) && isPaymentReceived(record.paymentMethod2, record.paymentReceived2)
      ? Number(record.payment2Mxn || 0)
      : 0;
  const payment3Mxn =
    hasPaymentDate(record.paymentDate3) && isPaymentReceived(record.paymentMethod3, record.paymentReceived3)
      ? Number(record.payment3Mxn || 0)
      : 0;
  return primaryPaymentMxn + payment2Mxn + payment3Mxn;
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

function getPeriodIndex(period: MonthPeriod) {
  return period.year * 12 + period.month - 1;
}

function getPeriodFromIndex(index: number): MonthPeriod {
  return {
    year: Math.floor(index / 12),
    month: index % 12 + 1
  };
}

function getPeriodsBetween(from: MonthPeriod, to: MonthPeriod) {
  const periods: MonthPeriod[] = [];
  for (let index = getPeriodIndex(from); index <= getPeriodIndex(to); index += 1) {
    periods.push(getPeriodFromIndex(index));
  }
  return periods;
}

function getRangeFilter(from: MonthPeriod, to: MonthPeriod) {
  return {
    AND: [
      {
        OR: [
          { year: { gt: from.year } },
          { year: from.year, month: { gte: from.month } }
        ]
      },
      {
        OR: [
          { year: { lt: to.year } },
          { year: to.year, month: { lte: to.month } }
        ]
      }
    ]
  };
}

function normalizePercentage(value: Prisma.Decimal | number) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getAreaProfitabilitySelectedRange(
  range: BudgetAreaProfitabilityRangeRecord | undefined,
  availablePeriods: MonthPeriod[]
) {
  if (range) {
    const from = { year: range.fromYear, month: range.fromMonth };
    const to = { year: range.toYear, month: range.toMonth };
    if (getPeriodIndex(from) > getPeriodIndex(to)) {
      throw new AppError(400, "INVALID_PERIOD_RANGE", "El periodo inicial no puede ser posterior al periodo final.");
    }
    return { from, to };
  }

  if (availablePeriods.length > 0) {
    const fromAvailable = availablePeriods[0];
    const to = availablePeriods[availablePeriods.length - 1];
    const from = getPeriodFromIndex(Math.max(getPeriodIndex(fromAvailable), getPeriodIndex(to) - 11));
    return { from, to };
  }

  const now = new Date();
  const to = { year: now.getFullYear(), month: now.getMonth() + 1 };
  return { from: getPeriodFromIndex(getPeriodIndex(to) - 11), to };
}

function getTeamPercentage(record: TeamDistributionRecord, percentageField: typeof AREA_PROFITABILITY_TEAMS[number]["percentageField"]) {
  return normalizePercentage(record[percentageField]);
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

  public async getAreaProfitability(range?: BudgetAreaProfitabilityRangeRecord) {
    const [financePeriods, expensePeriods] = await Promise.all([
      this.prisma.financeRecord.findMany({
        select: { year: true, month: true },
        distinct: ["year", "month"]
      }),
      this.prisma.generalExpense.findMany({
        select: { year: true, month: true },
        distinct: ["year", "month"]
      })
    ]);

    const availablePeriodLookup = new Map<string, MonthPeriod>();
    [...financePeriods, ...expensePeriods].forEach((period) => {
      availablePeriodLookup.set(getMonthKey(period.year, period.month), period);
    });
    const availablePeriods = [...availablePeriodLookup.values()].sort(
      (left, right) => getPeriodIndex(left) - getPeriodIndex(right)
    );
    const selectedRange = getAreaProfitabilitySelectedRange(range, availablePeriods);
    const periodFilter = getRangeFilter(selectedRange.from, selectedRange.to);
    const [financeRecords, generalExpenses] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where: periodFilter,
        select: {
          year: true,
          month: true,
          paidThisMonthMxn: true,
          payment2Mxn: true,
          payment3Mxn: true,
          paymentDate1: true,
          paymentDate2: true,
          paymentDate3: true,
          paymentMethod: true,
          paymentMethod2: true,
          paymentMethod3: true,
          paymentReceived: true,
          paymentReceived2: true,
          paymentReceived3: true,
          pctLitigation: true,
          pctCorporateLabor: true,
          pctSettlements: true,
          pctFinancialLaw: true,
          pctTaxCompliance: true
        }
      }),
      this.prisma.generalExpense.findMany({
        where: periodFilter,
        select: {
          year: true,
          month: true,
          amountMxn: true,
          expenseWithoutTeam: true,
          pctLitigation: true,
          pctCorporateLabor: true,
          pctSettlements: true,
          pctFinancialLaw: true,
          pctTaxCompliance: true
        }
      })
    ]);

    const periods = getPeriodsBetween(selectedRange.from, selectedRange.to);
    const totalsByPeriodAndTeam = new Map<string, Map<typeof AREA_PROFITABILITY_TEAMS[number]["team"], {
      incomeMxn: number;
      expenseMxn: number;
    }>>();

    periods.forEach((period) => {
      totalsByPeriodAndTeam.set(
        getMonthKey(period.year, period.month),
        new Map(AREA_PROFITABILITY_TEAMS.map(({ team }) => [team, { incomeMxn: 0, expenseMxn: 0 }]))
      );
    });

    financeRecords.forEach((record) => {
      const incomeMxn = calculateReceivedIncomeMxn(record);
      const teamTotals = totalsByPeriodAndTeam.get(getMonthKey(record.year, record.month));
      if (!teamTotals || incomeMxn === 0) {
        return;
      }

      AREA_PROFITABILITY_TEAMS.forEach(({ team, percentageField }) => {
        const totals = teamTotals.get(team)!;
        totals.incomeMxn += incomeMxn * getTeamPercentage(record, percentageField) / 100;
      });
    });

    generalExpenses.forEach((expense) => {
      if (expense.expenseWithoutTeam) {
        return;
      }

      const expenseMxn = Number(expense.amountMxn || 0);
      const teamTotals = totalsByPeriodAndTeam.get(getMonthKey(expense.year, expense.month));
      if (!teamTotals || expenseMxn === 0) {
        return;
      }

      AREA_PROFITABILITY_TEAMS.forEach(({ team, percentageField }) => {
        const totals = teamTotals.get(team)!;
        totals.expenseMxn += expenseMxn * getTeamPercentage(expense, percentageField) / 100;
      });
    });

    return {
      selectedRange,
      availableRange: availablePeriods.length > 0
        ? { from: availablePeriods[0], to: availablePeriods[availablePeriods.length - 1] }
        : undefined,
      series: AREA_PROFITABILITY_TEAMS.map(({ team, teamLabel }) => ({
        team,
        teamLabel,
        points: periods.map((period) => {
          const totals = totalsByPeriodAndTeam.get(getMonthKey(period.year, period.month))!.get(team)!;
          const incomeMxn = roundMoney(totals.incomeMxn);
          const expenseMxn = roundMoney(totals.expenseMxn);
          return {
            ...period,
            incomeMxn,
            expenseMxn,
            profitMxn: roundMoney(incomeMxn - expenseMxn)
          };
        })
      }))
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
      (sum, record) => sum + calculateReceivedIncomeMxn(record),
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
