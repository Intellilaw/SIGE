import { Prisma, type PrismaClient } from "@prisma/client";
import type { GeneralExpense, GeneralExpensePayrollEmployeeOption, GeneralExpensePayrollEntry } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getLaborDailySalaryRiStatus } from "../modules/labor-files/labor-salary-intelligence";
import {
  buildVacationSummary,
  mapGeneralExpense,
  mapGeneralExpensePayrollEntry,
  mapLaborGlobalVacationDay,
  mapLaborVacationEvent
} from "./mappers";
import type {
  GeneralExpenseActor,
  GeneralExpenseCreateRecord,
  GeneralExpensePayrollCreateRecord,
  GeneralExpensePayrollUpdateRecord,
  GeneralExpenseUpdateRecord,
  GeneralExpensesRepository
} from "./types";

const DEFAULT_TEAM: GeneralExpense["team"] = "Sin equipo";
const DEFAULT_PAYMENT_METHOD: GeneralExpense["paymentMethod"] = "Transferencia";
const DEFAULT_BANK: NonNullable<GeneralExpense["bank"]> = "Banamex";
const DEFAULT_HAS_VAT = true;
const DEFAULT_MONTH_RANGE = { min: 1, max: 12 };
const PAYROLL_VACATION_PREMIUM_RATE = 0.25;
const PAYROLL_BONUS_RATE = 0.1;
const LOCKED_AFTER_APPROVAL_FIELDS: Array<keyof GeneralExpenseUpdateRecord> = [
  "detail",
  "amountMxn",
  "countsTowardLimit",
  "generalExpense",
  "expenseWithoutTeam",
  "pctLitigation",
  "pctCorporateLabor",
  "pctSettlements",
  "pctFinancialLaw",
  "pctTaxCompliance",
  "paymentMethod",
  "bank",
  "hasVat",
  "recurring"
];
const PCT_KEYS: Array<keyof Pick<
  GeneralExpenseUpdateRecord,
  "pctLitigation" | "pctCorporateLabor" | "pctSettlements" | "pctFinancialLaw" | "pctTaxCompliance"
>> = [
  "pctLitigation",
  "pctCorporateLabor",
  "pctSettlements",
  "pctFinancialLaw",
  "pctTaxCompliance"
];

type StoredGeneralExpense = Awaited<ReturnType<PrismaClient["generalExpense"]["findUniqueOrThrow"]>>;
const PAYROLL_LABOR_SALARY_DOCUMENT_SELECT = {
  id: true,
  documentType: true,
  originalFileName: true,
  fileMimeType: true,
  uploadedAt: true,
  fileContent: true
} satisfies Prisma.LaborFileDocumentSelect;
const PAYROLL_ENTRY_INCLUDE = {
  laborFile: {
    select: {
      employeeName: true,
      hireDate: true,
      dailySalaryMxn: true,
      advanceVacationDaysPaidBalance: true,
      advanceVacationDaysPaidCutoffDate: true,
      employmentEndedAt: true,
      documents: {
        where: { documentType: { in: ["EMPLOYMENT_CONTRACT", "ADDENDUM"] } },
        select: PAYROLL_LABOR_SALARY_DOCUMENT_SELECT,
        orderBy: [{ uploadedAt: "asc" as const }]
      },
      vacationEvents: {
        orderBy: [{ startDate: "asc" as const }, { createdAt: "asc" as const }],
        select: {
          id: true,
          laborFileId: true,
          globalVacationDayId: true,
          eventType: true,
          startDate: true,
          endDate: true,
          vacationDates: true,
          days: true,
          description: true,
          acceptanceOriginalFileName: true,
          acceptanceFileMimeType: true,
          acceptanceFileSizeBytes: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  }
} satisfies Prisma.GeneralExpensePayrollEntryInclude;
type StoredGeneralExpensePayrollEntry = Prisma.GeneralExpensePayrollEntryGetPayload<{ include: typeof PAYROLL_ENTRY_INCLUDE }>;
type PayrollVacationEventRecord = NonNullable<StoredGeneralExpensePayrollEntry["laborFile"]>["vacationEvents"][number];
const PAYROLL_GLOBAL_VACATION_DAY_SELECT = {
  id: true,
  date: true,
  days: true,
  vacationDates: true,
  description: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.LaborGlobalVacationDaySelect;
type PayrollGlobalVacationDayRecord = Prisma.LaborGlobalVacationDayGetPayload<{
  select: typeof PAYROLL_GLOBAL_VACATION_DAY_SELECT;
}>;

function hasOwn<T extends object>(payload: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDateOnly(value?: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, "INVALID_DATE", `Invalid date value: ${value}`);
  }

  return parsed;
}

function toDateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function dateKeyToUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDateKey(value: string, days: number) {
  const date = dateKeyToUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function getMonthLastDateKey(year: number, month: number) {
  const date = new Date(Date.UTC(year, month, 0));
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addYearsToDateKey(value: string, years: number) {
  const date = dateKeyToUtcDate(value);
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth() + 1;
  const day = Math.min(date.getUTCDate(), getDaysInMonth(year, month));
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function getMexicoCityDateKey(value = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Mexico_City",
    year: "numeric"
  }).formatToParts(value);
  const parts = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getPayrollPeriodDateRange(year: number, month: number, half: GeneralExpensePayrollEntry["half"]) {
  const monthPart = padDatePart(month);
  return half === 1
    ? { startDate: `${year}-${monthPart}-01`, endDate: `${year}-${monthPart}-15` }
    : { startDate: `${year}-${monthPart}-16`, endDate: getMonthLastDateKey(year, month) };
}

function clampPercentage(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numeric));
}

function normalizePaymentMethod(value?: GeneralExpense["paymentMethod"] | null): GeneralExpense["paymentMethod"] {
  return value === "Efectivo" ? "Efectivo" : "Transferencia";
}

function normalizeBank(method: GeneralExpense["paymentMethod"], bank?: GeneralExpense["bank"] | null) {
  if (method !== "Transferencia") {
    return null;
  }

  return bank === "HSBC" ? "HSBC" : bank === "Banamex" ? "Banamex" : DEFAULT_BANK;
}

function normalizeHasVat(
  method: GeneralExpense["paymentMethod"],
  hasVat?: boolean | null,
  fallback = DEFAULT_HAS_VAT
) {
  if (method !== "Transferencia") {
    return false;
  }

  return typeof hasVat === "boolean" ? hasVat : fallback;
}

function isSuperadmin(actor: GeneralExpenseActor) {
  return actor.role === "SUPERADMIN" || actor.legacyRole === "SUPERADMIN" || actor.permissions.includes("*");
}

function isFinance(actor: GeneralExpenseActor) {
  return actor.team === "FINANCE" || normalizeComparableText(actor.legacyTeam) === "finanzas";
}

function isAraceliLozano(actor: GeneralExpenseActor) {
  const normalizedEmail = normalizeComparableText(actor.email);
  return isFinance(actor) && (
    normalizeComparableText(actor.username) === "araceli lozano" ||
    normalizeComparableText(actor.displayName) === "araceli lozano" ||
    normalizedEmail.startsWith("araceli lozano") ||
    normalizedEmail.startsWith("araceli.lozano")
  );
}

function isEduardoRusconi(actor: GeneralExpenseActor) {
  return (
    normalizeComparableText(actor.username) === "eduardo rusconi" ||
    normalizeComparableText(actor.displayName) === "eduardo rusconi" ||
    actor.email.toLowerCase().startsWith("eduardo.rusconi")
  );
}

function canReviewJnls(actor: GeneralExpenseActor) {
  return !isSuperadmin(actor) && (
    actor.team === "AUDIT" ||
    normalizeComparableText(actor.legacyTeam) === "auditoria"
  );
}

function assertMonth(month: number) {
  if (month < DEFAULT_MONTH_RANGE.min || month > DEFAULT_MONTH_RANGE.max) {
    throw new AppError(400, "INVALID_MONTH", "Month must be between 1 and 12.");
  }
}

function assertPayrollHalf(half: number): asserts half is GeneralExpensePayrollEntry["half"] {
  if (half !== 1 && half !== 2) {
    throw new AppError(400, "INVALID_PAYROLL_HALF", "Payroll half must be 1 or 2.");
  }
}

function normalizeMoney(value?: number | null) {
  const numeric = Number(value ?? 0);
  return new Prisma.Decimal(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
}

function normalizeHours(value?: number | null) {
  const numeric = Number(value ?? 0);
  return new Prisma.Decimal(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
}

function roundPayrollNumber(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function getPayrollGrossSalaryMxn(dailySalaryMxn: number) {
  return dailySalaryMxn * 15;
}

function getPayrollBonusMxn(netSalaryMxn: number) {
  return roundPayrollNumber(Math.max(0, netSalaryMxn * PAYROLL_BONUS_RATE));
}

function getPayrollEmployeeBonusKey(entry: Pick<GeneralExpensePayrollEntry, "id" | "laborFileId" | "employeeName">) {
  if (entry.laborFileId) {
    return `labor:${entry.laborFileId}`;
  }

  const normalizedName = normalizeComparableText(entry.employeeName);
  return normalizedName ? `name:${normalizedName}` : `entry:${entry.id}`;
}

function getPayrollNetDepositMxn(
  entry: GeneralExpensePayrollEntry,
  punctualityBonusMxn: number,
  attendanceBonusMxn: number
) {
  const payrollWithholdingsMxn = entry.isrWithholdingMxn + entry.imssWithholdingMxn + entry.infonavitCreditMxn;
  return (
    entry.netSalaryMxn +
    punctualityBonusMxn +
    attendanceBonusMxn +
    entry.vacationPremiumMxn +
    entry.overtimeTotalMxn +
    entry.employmentSubsidyMxn -
    payrollWithholdingsMxn
  );
}

function applyPayrollMonthlyBonusCalculations(entries: GeneralExpensePayrollEntry[]) {
  const monthlyNetSalaryByEmployee = new Map<string, number>();

  entries.forEach((entry) => {
    const key = getPayrollEmployeeBonusKey(entry);
    monthlyNetSalaryByEmployee.set(key, (monthlyNetSalaryByEmployee.get(key) ?? 0) + entry.netSalaryMxn);
  });

  return entries.map((entry) => {
    const monthlyNetSalaryMxn = monthlyNetSalaryByEmployee.get(getPayrollEmployeeBonusKey(entry)) ?? 0;
    const monthlyBonusMxn = entry.half === 2 ? getPayrollBonusMxn(monthlyNetSalaryMxn) : 0;

    return {
      ...entry,
      punctualityBonusMxn: monthlyBonusMxn,
      attendanceBonusMxn: monthlyBonusMxn,
      netDepositMxn: getPayrollNetDepositMxn(entry, monthlyBonusMxn, monthlyBonusMxn)
    };
  });
}

function isApprovedVacationEvent(event: PayrollVacationEventRecord) {
  const mimeType = (event.acceptanceFileMimeType ?? "").toLowerCase();
  const filename = (event.acceptanceOriginalFileName ?? "").toLowerCase();
  return (event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION") &&
    (mimeType === "application/pdf" || filename.endsWith(".pdf"));
}

function getVacationDateKeysFromJson(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => (
    typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item)
  )))].sort();
}

function enumerateDateKeys(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const result: string[] = [];
  let current = startDate;
  while (current <= endDate && result.length < 370) {
    result.push(current);
    current = addDateKey(current, 1);
  }

  return result;
}

function getVacationEventDateKeys(event: PayrollVacationEventRecord) {
  const explicitDates = getVacationDateKeysFromJson(event.vacationDates);
  if (explicitDates.length > 0) {
    return explicitDates;
  }

  const startDate = toDateInput(event.startDate);
  const endDate = toDateInput(event.endDate);
  if (startDate && endDate) {
    return enumerateDateKeys(startDate, endDate);
  }

  const days = Number(event.days ?? 0);
  if (startDate && Number.isInteger(days) && days > 1 && days <= 31) {
    return Array.from({ length: days }, (_, index) => addDateKey(startDate, index));
  }

  return startDate ? [startDate] : [];
}

function getVacationDaysInPayrollPeriod(
  event: PayrollVacationEventRecord,
  period: ReturnType<typeof getPayrollPeriodDateRange>
) {
  if (!isApprovedVacationEvent(event)) {
    return 0;
  }

  const dateKeys = getVacationEventDateKeys(event);
  const dateKeysInPeriod = dateKeys.filter((dateKey) => dateKey >= period.startDate && dateKey <= period.endDate);
  if (dateKeysInPeriod.length === 0) {
    return 0;
  }

  const recordedDays = Number(event.days ?? 0);
  if (recordedDays > 0 && dateKeys.length > 0 && Math.abs(recordedDays - dateKeys.length) > 0.01) {
    return dateKeysInPeriod.length * (recordedDays / dateKeys.length);
  }

  return dateKeysInPeriod.length;
}

function getNextMonth(year: number, month: number) {
  assertMonth(month);
  const nextMonthDate = new Date(year, month, 1);
  return {
    year: nextMonthDate.getFullYear(),
    month: nextMonthDate.getMonth() + 1
  };
}

export class PrismaGeneralExpensesRepository implements GeneralExpensesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  private getPayrollVacationTotals(record: StoredGeneralExpensePayrollEntry) {
    const period = getPayrollPeriodDateRange(record.year, record.month, record.half === 2 ? 2 : 1);
    const vacationDays = record.laborFile?.vacationEvents.reduce(
      (total, event) => total + getVacationDaysInPayrollPeriod(event, period),
      0
    ) ?? 0;
    const dailySalaryMxn = Number(record.laborFile?.dailySalaryMxn ?? record.dailySalaryMxn ?? 0);
    const vacationPremiumMxn = vacationDays * dailySalaryMxn * PAYROLL_VACATION_PREMIUM_RATE;

    return {
      vacationDays: roundPayrollNumber(vacationDays),
      vacationPremiumMxn: roundPayrollNumber(vacationPremiumMxn)
    };
  }

  private getPayrollAdvanceVacationData(
    record: StoredGeneralExpensePayrollEntry,
    globalVacationDayRecords: PayrollGlobalVacationDayRecord[]
  ) {
    const laborFile = record.laborFile;
    if (!laborFile) {
      return {
        rawAdvanceVacationDays: 0,
        advanceVacationDays: 0,
        advanceVacationPremiumPaymentDate: undefined,
        advanceVacationDaysPaid: false,
        advanceVacationDaysPaymentEligible: false
      };
    }

    const hireDate = toDateInput(laborFile.hireDate);
    const employmentEndedAt = toDateInput(laborFile.employmentEndedAt) || undefined;
    const vacationSummary = buildVacationSummary(
      hireDate,
      employmentEndedAt,
      laborFile.vacationEvents.map(mapLaborVacationEvent),
      globalVacationDayRecords.map(mapLaborGlobalVacationDay)
    );
    const rawAdvanceVacationDays = roundPayrollNumber(Math.max(0, -vacationSummary.remainingDays));
    const advanceVacationPremiumPaymentDate = rawAdvanceVacationDays > 0
      ? addYearsToDateKey(vacationSummary.currentYearStartDate, 1)
      : undefined;
    const paidCutoffDate = toDateInput(laborFile.advanceVacationDaysPaidCutoffDate);
    const paidBalance = paidCutoffDate && paidCutoffDate === advanceVacationPremiumPaymentDate
      ? roundPayrollNumber(Number(laborFile.advanceVacationDaysPaidBalance ?? 0))
      : 0;
    const advanceVacationDays = roundPayrollNumber(Math.max(0, rawAdvanceVacationDays - paidBalance));
    const advanceVacationDaysPaymentEligible = Boolean(
      advanceVacationPremiumPaymentDate &&
      getMexicoCityDateKey() >= advanceVacationPremiumPaymentDate &&
      rawAdvanceVacationDays > 0
    );
    const advanceVacationDaysPaid = rawAdvanceVacationDays > 0 && paidBalance >= rawAdvanceVacationDays;

    return {
      rawAdvanceVacationDays,
      advanceVacationDays,
      advanceVacationPremiumPaymentDate,
      advanceVacationDaysPaid,
      advanceVacationDaysPaymentEligible
    };
  }

  private async listPayrollGlobalVacationDayRecords() {
    return this.prisma.laborGlobalVacationDay.findMany({
      select: PAYROLL_GLOBAL_VACATION_DAY_SELECT,
      orderBy: [{ date: "asc" }]
    });
  }

  private async mapPayrollEntryWithSalaryRi(
    record: StoredGeneralExpensePayrollEntry,
    globalVacationDayRecords: PayrollGlobalVacationDayRecord[]
  ) {
    const mapped = mapGeneralExpensePayrollEntry({
      ...record,
      ...this.getPayrollVacationTotals(record),
      ...this.getPayrollAdvanceVacationData(record, globalVacationDayRecords)
    });
    const riStatus = await getLaborDailySalaryRiStatus(record.laborFile);

    return {
      ...mapped,
      dailySalaryRiVerified: riStatus.verified,
      dailySalaryRiVerificationDetail: riStatus.detail
    } satisfies GeneralExpensePayrollEntry;
  }

  private async mapPayrollEntriesWithMonthlyBonuses(
    records: StoredGeneralExpensePayrollEntry[],
    globalVacationDayRecords: PayrollGlobalVacationDayRecord[]
  ) {
    const mapped = await Promise.all(records.map((record) =>
      this.mapPayrollEntryWithSalaryRi(record, globalVacationDayRecords)
    ));
    return applyPayrollMonthlyBonusCalculations(mapped);
  }

  private async mapPayrollEntryWithMonthlyBonuses(record: StoredGeneralExpensePayrollEntry) {
    const [records, globalVacationDayRecords] = await Promise.all([
      this.prisma.generalExpensePayrollEntry.findMany({
        where: { year: record.year, month: record.month },
        include: PAYROLL_ENTRY_INCLUDE,
        orderBy: [{ half: "asc" }, { createdAt: "asc" }]
      }),
      this.listPayrollGlobalVacationDayRecords()
    ]);
    const mapped = await this.mapPayrollEntriesWithMonthlyBonuses(records, globalVacationDayRecords);
    return mapped.find((entry) => entry.id === record.id) ?? applyPayrollMonthlyBonusCalculations([
      await this.mapPayrollEntryWithSalaryRi(record, globalVacationDayRecords)
    ])[0];
  }

  public async list(year: number, month: number) {
    assertMonth(month);

    const records = await this.prisma.generalExpense.findMany({
      where: { year, month },
      orderBy: [{ createdAt: "asc" }]
    });

    return records.map(mapGeneralExpense);
  }

  public async create(payload: GeneralExpenseCreateRecord = {}) {
    const now = new Date();
    const year = payload.year ?? now.getFullYear();
    const month = payload.month ?? now.getMonth() + 1;
    assertMonth(month);

    const record = await this.prisma.generalExpense.create({
      data: {
        year,
        month,
        detail: "",
        amountMxn: new Prisma.Decimal(0),
        countsTowardLimit: false,
        team: DEFAULT_TEAM,
        generalExpense: false,
        expenseWithoutTeam: false,
        pctLitigation: new Prisma.Decimal(0),
        pctCorporateLabor: new Prisma.Decimal(0),
        pctSettlements: new Prisma.Decimal(0),
        pctFinancialLaw: new Prisma.Decimal(0),
        pctTaxCompliance: new Prisma.Decimal(0),
        paymentMethod: DEFAULT_PAYMENT_METHOD,
        bank: DEFAULT_BANK,
        hasVat: DEFAULT_HAS_VAT,
        recurring: false,
        approvedByEmrt: false,
        paidByEmrtAt: null,
        reviewedByJnls: false,
        paid: false,
        paidAt: null
      }
    });

    return mapGeneralExpense(record);
  }

  public async update(expenseId: string, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor) {
    const current = await this.findOrThrow(expenseId);
    this.assertFieldAccess(current, payload, actor);

    const data = this.buildUpdatePayload(current, payload);
    const record = await this.prisma.generalExpense.update({
      where: { id: expenseId },
      data
    });

    return mapGeneralExpense(record);
  }

  public async delete(expenseId: string) {
    const current = await this.findOrThrow(expenseId);
    if (current.approvedByEmrt) {
      throw new AppError(400, "GENERAL_EXPENSE_APPROVED_LOCKED", "Approved expenses cannot be deleted.");
    }

    await this.prisma.generalExpense.delete({
      where: { id: expenseId }
    });
  }

  public async copyRecurringToNextMonth(year: number, month: number) {
    assertMonth(month);

    const { year: targetYear, month: targetMonth } = getNextMonth(year, month);
    const recurringRows = await this.prisma.generalExpense.findMany({
      where: {
        year,
        month,
        recurring: true
      },
      orderBy: [{ createdAt: "asc" }]
    });

    if (recurringRows.length === 0) {
      return { year: targetYear, month: targetMonth, copied: 0 };
    }

    const result = await this.prisma.generalExpense.createMany({
      data: recurringRows.map((row) => ({
        year: targetYear,
        month: targetMonth,
        detail: row.detail,
        amountMxn: row.amountMxn,
        countsTowardLimit: row.countsTowardLimit,
        team: row.team,
        generalExpense: row.generalExpense,
        expenseWithoutTeam: row.expenseWithoutTeam,
        pctLitigation: row.pctLitigation,
        pctCorporateLabor: row.pctCorporateLabor,
        pctSettlements: row.pctSettlements,
        pctFinancialLaw: row.pctFinancialLaw,
        pctTaxCompliance: row.pctTaxCompliance,
        paymentMethod: row.paymentMethod,
        bank: row.bank,
        hasVat: normalizeHasVat(row.paymentMethod as GeneralExpense["paymentMethod"], row.hasVat, DEFAULT_HAS_VAT),
        recurring: true,
        approvedByEmrt: false,
        paidByEmrtAt: null,
        reviewedByJnls: false,
        paid: false,
        paidAt: null
      }))
    });

    return {
      year: targetYear,
      month: targetMonth,
      copied: result.count
    };
  }

  public async listPayrollEmployeeOptions(): Promise<GeneralExpensePayrollEmployeeOption[]> {
    const records = await this.prisma.laborFile.findMany({
      select: {
        id: true,
        employeeName: true,
        dailySalaryMxn: true,
        documents: {
          where: { documentType: { in: ["EMPLOYMENT_CONTRACT", "ADDENDUM"] } },
          select: PAYROLL_LABOR_SALARY_DOCUMENT_SELECT,
          orderBy: [{ uploadedAt: "asc" }]
        }
      },
      orderBy: [{ employmentStatus: "asc" }, { employeeName: "asc" }]
    });

    return Promise.all(records.map(async (record) => {
      const riStatus = await getLaborDailySalaryRiStatus(record);
      return {
        laborFileId: record.id,
        employeeName: record.employeeName,
        dailySalaryMxn: Number(record.dailySalaryMxn),
        dailySalaryRiVerified: riStatus.verified,
        dailySalaryRiVerificationDetail: riStatus.detail
      };
    }));
  }

  public async listPayrollEntries(year: number, month: number) {
    assertMonth(month);

    const [records, globalVacationDayRecords] = await Promise.all([
      this.prisma.generalExpensePayrollEntry.findMany({
        where: { year, month },
        include: PAYROLL_ENTRY_INCLUDE,
        orderBy: [{ half: "asc" }, { createdAt: "asc" }]
      }),
      this.listPayrollGlobalVacationDayRecords()
    ]);

    return this.mapPayrollEntriesWithMonthlyBonuses(records, globalVacationDayRecords);
  }

  public async copyPayrollToNextMonth(year: number, month: number) {
    assertMonth(month);

    const { year: targetYear, month: targetMonth } = getNextMonth(year, month);
    const [sourceRows, existingTargetRows] = await Promise.all([
      this.prisma.generalExpensePayrollEntry.findMany({
        where: { year, month },
        orderBy: [{ half: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.generalExpensePayrollEntry.count({
        where: { year: targetYear, month: targetMonth }
      })
    ]);

    if (sourceRows.length === 0) {
      return { year: targetYear, month: targetMonth, copied: 0 };
    }

    if (existingTargetRows > 0) {
      throw new AppError(
        409,
        "GENERAL_EXPENSE_PAYROLL_TARGET_NOT_EMPTY",
        "El mes destino ya tiene registros de nómina. Borra o ajusta esos registros antes de copiar la nómina."
      );
    }

    const result = await this.prisma.generalExpensePayrollEntry.createMany({
      data: sourceRows.map((row) => {
        const dailySalaryMxn = Number(row.dailySalaryMxn ?? 0);
        const bonusMxn = 0;

        return {
          year: targetYear,
          month: targetMonth,
          half: row.half,
          laborFileId: row.laborFileId,
          employeeName: row.employeeName,
          isPartTime: row.isPartTime,
          dailySalaryMxn: row.dailySalaryMxn,
          grossSalaryMxn: normalizeMoney(getPayrollGrossSalaryMxn(dailySalaryMxn)),
          punctualityBonusMxn: normalizeMoney(bonusMxn),
          attendanceBonusMxn: normalizeMoney(bonusMxn),
          absenceDays: new Prisma.Decimal(0),
          overtimeHours: new Prisma.Decimal(0),
          overtimeDetail: "",
          isrWithholdingMxn: row.isrWithholdingMxn,
          imssWithholdingMxn: row.imssWithholdingMxn,
          employmentSubsidyMxn: row.employmentSubsidyMxn,
          infonavitCreditMxn: row.infonavitCreditMxn,
          payrollStampedByAraceli: false,
          finalPaymentApprovedByEmrt: false,
          reviewedByJnls: false
        };
      })
    });

    return {
      year: targetYear,
      month: targetMonth,
      copied: result.count
    };
  }

  public async createPayrollEntry(payload: GeneralExpensePayrollCreateRecord = {}) {
    const now = new Date();
    const year = payload.year ?? now.getFullYear();
    const month = payload.month ?? now.getMonth() + 1;
    const half = payload.half ?? 1;
    assertMonth(month);
    assertPayrollHalf(half);
    const laborFile = payload.laborFileId ? await this.findPayrollLaborFileOrThrow(payload.laborFileId) : null;
    const dailySalaryMxn = Number(laborFile?.dailySalaryMxn ?? 0);
    const bonusMxn = 0;

    const record = await this.prisma.generalExpensePayrollEntry.create({
      data: {
        year,
        month,
        half,
        ...(laborFile ? { laborFile: { connect: { id: laborFile.id } } } : {}),
        employeeName: laborFile?.employeeName ?? "",
        isPartTime: false,
        dailySalaryMxn: normalizeMoney(dailySalaryMxn),
        grossSalaryMxn: normalizeMoney(getPayrollGrossSalaryMxn(dailySalaryMxn)),
        punctualityBonusMxn: normalizeMoney(bonusMxn),
        attendanceBonusMxn: normalizeMoney(bonusMxn),
        absenceDays: new Prisma.Decimal(0),
        overtimeHours: new Prisma.Decimal(0),
        overtimeDetail: "",
        isrWithholdingMxn: new Prisma.Decimal(0),
        imssWithholdingMxn: new Prisma.Decimal(0),
        employmentSubsidyMxn: new Prisma.Decimal(0),
        infonavitCreditMxn: new Prisma.Decimal(0),
        payrollStampedByAraceli: false,
        finalPaymentApprovedByEmrt: false,
        reviewedByJnls: false
      },
      include: PAYROLL_ENTRY_INCLUDE
    });

    return this.mapPayrollEntryWithMonthlyBonuses(record);
  }

  public async updatePayrollEntry(
    payrollEntryId: string,
    payload: GeneralExpensePayrollUpdateRecord,
    actor: GeneralExpenseActor
  ) {
    const current = await this.findPayrollEntryOrThrow(payrollEntryId);
    this.assertPayrollFieldAccess(current, payload, actor);

    const data = await this.buildPayrollUpdatePayload(current, payload);
    const record = await this.prisma.generalExpensePayrollEntry.update({
      where: { id: payrollEntryId },
      data,
      include: PAYROLL_ENTRY_INCLUDE
    });

    return this.mapPayrollEntryWithMonthlyBonuses(record);
  }

  public async deletePayrollEntry(payrollEntryId: string) {
    const current = await this.findPayrollEntryOrThrow(payrollEntryId);
    if (current.finalPaymentApprovedByEmrt) {
      throw new AppError(400, "GENERAL_EXPENSE_PAYROLL_FINAL_PAYMENT_LOCKED", "La fila ya fue autorizada por EMRT y no puede borrarse.");
    }

    await this.prisma.generalExpensePayrollEntry.delete({
      where: { id: payrollEntryId }
    });
  }

  private async findOrThrow(expenseId: string) {
    const record = await this.prisma.generalExpense.findUnique({
      where: { id: expenseId }
    });

    if (!record) {
      throw new AppError(404, "GENERAL_EXPENSE_NOT_FOUND", "The requested expense does not exist.");
    }

    return record;
  }

  private async findPayrollEntryOrThrow(payrollEntryId: string) {
    const record = await this.prisma.generalExpensePayrollEntry.findUnique({
      where: { id: payrollEntryId },
      include: PAYROLL_ENTRY_INCLUDE
    });

    if (!record) {
      throw new AppError(404, "GENERAL_EXPENSE_PAYROLL_NOT_FOUND", "The requested payroll entry does not exist.");
    }

    return record;
  }

  private async findPayrollLaborFileOrThrow(laborFileId: string) {
    const normalizedLaborFileId = normalizeOptionalText(laborFileId);
    if (!normalizedLaborFileId) {
      return null;
    }

    const laborFile = await this.prisma.laborFile.findUnique({
      where: { id: normalizedLaborFileId },
      select: {
        id: true,
        employeeName: true,
        dailySalaryMxn: true,
        documents: {
          where: { documentType: { in: ["EMPLOYMENT_CONTRACT", "ADDENDUM"] } },
          select: PAYROLL_LABOR_SALARY_DOCUMENT_SELECT,
          orderBy: [{ uploadedAt: "asc" }]
        }
      }
    });

    if (!laborFile) {
      throw new AppError(404, "GENERAL_EXPENSE_PAYROLL_LABOR_FILE_NOT_FOUND", "The selected labor file does not exist.");
    }

    return laborFile;
  }

  private assertFieldAccess(current: StoredGeneralExpense, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor) {
    if (current.approvedByEmrt && LOCKED_AFTER_APPROVAL_FIELDS.some((field) => hasOwn(payload, field))) {
      throw new AppError(400, "GENERAL_EXPENSE_APPROVED_LOCKED", "This expense is locked because it was already approved by EMRT.");
    }

    if (hasOwn(payload, "approvedByEmrt") && !isSuperadmin(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_APPROVE_FORBIDDEN", "Only superadmin can approve or unapprove expenses.");
    }

    if (hasOwn(payload, "paid") && !isFinance(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_PAY_FORBIDDEN", "Only the finance team can mark expenses as paid.");
    }

    if (hasOwn(payload, "reviewedByJnls")) {
      if (!canReviewJnls(actor)) {
        throw new AppError(403, "GENERAL_EXPENSE_REVIEW_FORBIDDEN", "Only the audit team can update the JNLS approval flag.");
      }
    }

    if (hasOwn(payload, "paidByEmrtAt")) {
      const nextPaymentMethod = hasOwn(payload, "paymentMethod")
        ? normalizePaymentMethod(payload.paymentMethod)
        : (current.paymentMethod as GeneralExpense["paymentMethod"]);

      if (!isEduardoRusconi(actor) || nextPaymentMethod !== "Efectivo") {
        throw new AppError(403, "GENERAL_EXPENSE_EMRT_DATE_FORBIDDEN", "Only Eduardo Rusconi can edit the EMRT paid date for cash expenses.");
      }
    }
  }

  private buildUpdatePayload(current: StoredGeneralExpense, payload: GeneralExpenseUpdateRecord): Prisma.GeneralExpenseUpdateInput {
    const data: Prisma.GeneralExpenseUpdateInput = {};

    if (hasOwn(payload, "detail")) {
      data.detail = payload.detail ?? "";
    }

    if (hasOwn(payload, "amountMxn")) {
      data.amountMxn = new Prisma.Decimal(Math.max(0, Number(payload.amountMxn ?? 0)));
    }

    if (hasOwn(payload, "countsTowardLimit")) {
      data.countsTowardLimit = Boolean(payload.countsTowardLimit);
    }

    if (hasOwn(payload, "team")) {
      data.team = payload.team ?? DEFAULT_TEAM;
    }

    if (hasOwn(payload, "generalExpense")) {
      data.generalExpense = Boolean(payload.generalExpense);
      if (payload.generalExpense) {
        data.expenseWithoutTeam = false;
        data.pctLitigation = new Prisma.Decimal(20);
        data.pctCorporateLabor = new Prisma.Decimal(20);
        data.pctSettlements = new Prisma.Decimal(20);
        data.pctFinancialLaw = new Prisma.Decimal(20);
        data.pctTaxCompliance = new Prisma.Decimal(20);
      }
    }

    if (hasOwn(payload, "expenseWithoutTeam")) {
      data.expenseWithoutTeam = Boolean(payload.expenseWithoutTeam);
      if (payload.expenseWithoutTeam) {
        data.generalExpense = false;
        data.pctLitigation = new Prisma.Decimal(0);
        data.pctCorporateLabor = new Prisma.Decimal(0);
        data.pctSettlements = new Prisma.Decimal(0);
        data.pctFinancialLaw = new Prisma.Decimal(0);
        data.pctTaxCompliance = new Prisma.Decimal(0);
      }
    }

    const nextGeneralExpense = hasOwn(payload, "generalExpense")
      ? Boolean(payload.generalExpense)
      : current.generalExpense;
    const nextExpenseWithoutTeam = hasOwn(payload, "expenseWithoutTeam")
      ? Boolean(payload.expenseWithoutTeam)
      : current.expenseWithoutTeam;

    if (!nextGeneralExpense && !nextExpenseWithoutTeam) {
      PCT_KEYS.forEach((key) => {
        if (hasOwn(payload, key)) {
          const value = clampPercentage(payload[key]);
          switch (key) {
            case "pctLitigation":
              data.pctLitigation = new Prisma.Decimal(value);
              break;
            case "pctCorporateLabor":
              data.pctCorporateLabor = new Prisma.Decimal(value);
              break;
            case "pctSettlements":
              data.pctSettlements = new Prisma.Decimal(value);
              break;
            case "pctFinancialLaw":
              data.pctFinancialLaw = new Prisma.Decimal(value);
              break;
            case "pctTaxCompliance":
              data.pctTaxCompliance = new Prisma.Decimal(value);
              break;
            default:
              break;
          }
        }
      });
    }

    const nextPaymentMethod = hasOwn(payload, "paymentMethod")
      ? normalizePaymentMethod(payload.paymentMethod)
      : (current.paymentMethod as GeneralExpense["paymentMethod"]);

    if (hasOwn(payload, "paymentMethod")) {
      data.paymentMethod = nextPaymentMethod;
    }

    if (hasOwn(payload, "hasVat") || hasOwn(payload, "paymentMethod")) {
      const nextHasVat = hasOwn(payload, "hasVat")
        ? normalizeHasVat(nextPaymentMethod, payload.hasVat, current.hasVat)
        : normalizeHasVat(nextPaymentMethod, current.hasVat, current.hasVat);
      data.hasVat = nextHasVat;
    }

    if (hasOwn(payload, "bank") || hasOwn(payload, "paymentMethod")) {
      const nextBank = hasOwn(payload, "bank")
        ? normalizeBank(nextPaymentMethod, payload.bank)
        : normalizeBank(nextPaymentMethod, current.bank as GeneralExpense["bank"] | null);
      data.bank = nextBank;
    }

    if (hasOwn(payload, "recurring")) {
      data.recurring = Boolean(payload.recurring);
    }

    if (hasOwn(payload, "approvedByEmrt")) {
      data.approvedByEmrt = Boolean(payload.approvedByEmrt);
    }

    if (hasOwn(payload, "paidByEmrtAt")) {
      data.paidByEmrtAt = parseDateOnly(payload.paidByEmrtAt);
    }

    if (hasOwn(payload, "reviewedByJnls")) {
      data.reviewedByJnls = Boolean(payload.reviewedByJnls);
    }

    if (hasOwn(payload, "paid")) {
      data.paid = Boolean(payload.paid);
    }

    if (hasOwn(payload, "paidAt")) {
      data.paidAt = parseDateOnly(payload.paidAt);
    }

    return data;
  }

  private assertPayrollFieldAccess(
    current: StoredGeneralExpensePayrollEntry,
    payload: GeneralExpensePayrollUpdateRecord,
    actor: GeneralExpenseActor
  ) {
    const payloadKeys = Object.keys(payload);
    const isFinalApprovalOnlyPatch = payloadKeys.length === 1 && hasOwn(payload, "finalPaymentApprovedByEmrt");

    if (current.finalPaymentApprovedByEmrt && payloadKeys.length > 0 && !isFinalApprovalOnlyPatch) {
      throw new AppError(400, "GENERAL_EXPENSE_PAYROLL_FINAL_PAYMENT_LOCKED", "La fila ya fue autorizada por EMRT y no admite cambios.");
    }

    if (hasOwn(payload, "payrollStampedByAraceli") && !isAraceliLozano(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_PAYROLL_STAMP_FORBIDDEN", "Solo Araceli Lozano del equipo de Finanzas puede verificar el timbrado de nómina.");
    }

    if (hasOwn(payload, "finalPaymentApprovedByEmrt") && !isSuperadmin(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_PAYROLL_FINAL_PAYMENT_APPROVE_FORBIDDEN", "Only superadmin can approve the final payroll payment.");
    }

    if (hasOwn(payload, "reviewedByJnls")) {
      if (!canReviewJnls(actor)) {
        throw new AppError(403, "GENERAL_EXPENSE_PAYROLL_REVIEW_FORBIDDEN", "Only the audit team can update the JNLS approval flag.");
      }
    }
  }

  private async buildPayrollUpdatePayload(
    current: StoredGeneralExpensePayrollEntry,
    payload: GeneralExpensePayrollUpdateRecord
  ): Promise<Prisma.GeneralExpensePayrollEntryUpdateInput> {
    const data: Prisma.GeneralExpensePayrollEntryUpdateInput = {};
    let nextDailySalaryMxn = Number(current.laborFile?.dailySalaryMxn ?? current.dailySalaryMxn ?? 0);
    let shouldRefreshCalculatedBonuses = false;

    if (hasOwn(payload, "laborFileId")) {
      const laborFile = payload.laborFileId ? await this.findPayrollLaborFileOrThrow(payload.laborFileId) : null;
      if (laborFile) {
        data.laborFile = { connect: { id: laborFile.id } };
      } else if (current.laborFileId) {
        data.laborFile = { disconnect: true };
      }
      data.employeeName = laborFile?.employeeName ?? "";
      nextDailySalaryMxn = Number(laborFile?.dailySalaryMxn ?? 0);
      data.dailySalaryMxn = normalizeMoney(nextDailySalaryMxn);
      data.grossSalaryMxn = normalizeMoney(getPayrollGrossSalaryMxn(nextDailySalaryMxn));
      shouldRefreshCalculatedBonuses = true;
    }

    const nextIsPartTime = hasOwn(payload, "isPartTime") ? Boolean(payload.isPartTime) : current.isPartTime;

    if (hasOwn(payload, "isPartTime")) {
      data.isPartTime = nextIsPartTime;
      if (!nextIsPartTime) {
        data.overtimeDetail = "";
      }
    }

    if (hasOwn(payload, "grossSalaryMxn")) {
      data.grossSalaryMxn = normalizeMoney(payload.grossSalaryMxn);
    }

    if (hasOwn(payload, "absenceDays")) {
      data.absenceDays = normalizeHours(payload.absenceDays);
      shouldRefreshCalculatedBonuses = true;
    }

    if (shouldRefreshCalculatedBonuses) {
      const bonusMxn = 0;
      data.punctualityBonusMxn = normalizeMoney(bonusMxn);
      data.attendanceBonusMxn = normalizeMoney(bonusMxn);
    }

    if (hasOwn(payload, "overtimeHours")) {
      data.overtimeHours = normalizeHours(payload.overtimeHours);
    }

    if (hasOwn(payload, "overtimeDetail")) {
      data.overtimeDetail = nextIsPartTime ? payload.overtimeDetail ?? "" : "";
    }

    if (hasOwn(payload, "isrWithholdingMxn")) {
      data.isrWithholdingMxn = normalizeMoney(payload.isrWithholdingMxn);
    }

    if (hasOwn(payload, "imssWithholdingMxn")) {
      data.imssWithholdingMxn = normalizeMoney(payload.imssWithholdingMxn);
    }

    if (hasOwn(payload, "employmentSubsidyMxn")) {
      data.employmentSubsidyMxn = normalizeMoney(payload.employmentSubsidyMxn);
    }

    if (hasOwn(payload, "infonavitCreditMxn")) {
      data.infonavitCreditMxn = normalizeMoney(payload.infonavitCreditMxn);
    }

    if (hasOwn(payload, "advanceVacationDaysPaid")) {
      if (!current.laborFile) {
        throw new AppError(
          400,
          "GENERAL_EXPENSE_PAYROLL_ADVANCE_VACATION_WITHOUT_LABOR_FILE",
          "La fila debe estar vinculada a un expediente laboral para marcar estos dÃ­as como pagados."
        );
      }

      if (hasOwn(payload, "laborFileId")) {
        throw new AppError(
          400,
          "GENERAL_EXPENSE_PAYROLL_ADVANCE_VACATION_PATCH_CONFLICT",
          "Actualiza primero el colaborador y luego marca los dÃ­as disfrutados por adelantado como pagados."
        );
      }

      const advanceVacationData = this.getPayrollAdvanceVacationData(
        current,
        await this.listPayrollGlobalVacationDayRecords()
      );

      if (payload.advanceVacationDaysPaid) {
        if (!advanceVacationData.advanceVacationDaysPaymentEligible || advanceVacationData.rawAdvanceVacationDays <= 0) {
          throw new AppError(
            400,
            "GENERAL_EXPENSE_PAYROLL_ADVANCE_VACATION_PAYMENT_NOT_ALLOWED",
            "Los dÃ­as disfrutados por adelantado solo pueden pagarse cuando llegue la fecha de corte correspondiente."
          );
        }

        data.laborFile = {
          update: {
            advanceVacationDaysPaidBalance: normalizeHours(advanceVacationData.rawAdvanceVacationDays),
            advanceVacationDaysPaidCutoffDate: parseDateOnly(advanceVacationData.advanceVacationPremiumPaymentDate)
          }
        };
      } else {
        data.laborFile = {
          update: {
            advanceVacationDaysPaidBalance: normalizeHours(0),
            advanceVacationDaysPaidCutoffDate: null
          }
        };
      }
    }

    if (hasOwn(payload, "payrollStampedByAraceli")) {
      data.payrollStampedByAraceli = Boolean(payload.payrollStampedByAraceli);
    }

    if (hasOwn(payload, "finalPaymentApprovedByEmrt")) {
      data.finalPaymentApprovedByEmrt = Boolean(payload.finalPaymentApprovedByEmrt);
    }

    if (hasOwn(payload, "reviewedByJnls")) {
      data.reviewedByJnls = Boolean(payload.reviewedByJnls);
    }

    return data;
  }
}
