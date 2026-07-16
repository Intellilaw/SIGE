import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  GeneralExpense,
  GeneralExpenseEmrtDailyAcknowledgement,
  GeneralExpensePayrollEmployeeOption,
  GeneralExpensePayrollEntry
} from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import { getLaborDailySalaryRiStatus } from "../modules/labor-files/labor-salary-intelligence";
import { assertCommissionPeriodUnlocked } from "./commission-period-lock";
import {
  buildVacationSummary,
  mapGeneralExpense,
  mapGeneralExpenseEmrtAcknowledgement,
  mapGeneralExpensePayrollEntry,
  mapLaborGlobalVacationDay,
  mapLaborVacationEvent
} from "./mappers";
import type {
  GeneralExpenseActor,
  GeneralExpenseCreateRecord,
  GeneralExpenseEmrtAcknowledgementUpdateRecord,
  GeneralExpensePayrollCreateRecord,
  GeneralExpensePayrollUpdateRecord,
  GeneralExpenseUpdateRecord,
  GeneralExpensesRepository
} from "./types";

const DEFAULT_TEAM: GeneralExpense["team"] = "Sin equipo";
const DEFAULT_PAYMENT_METHOD: GeneralExpense["paymentMethod"] = "Transferencia";
const DEFAULT_BANK: NonNullable<GeneralExpense["bank"]> = "Banamex";
const PAYROLL_GENERATED_BANK: NonNullable<GeneralExpense["bank"]> = "HSBC";
const DEFAULT_HAS_VAT = true;
const DEFAULT_HAS_WITHHOLDINGS = false;
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
  "hasWithholdings",
  "recurring"
];
const LOCKED_AFTER_ALE_RECEIPT_FIELDS: Array<keyof GeneralExpenseUpdateRecord> = [
  ...LOCKED_AFTER_APPROVAL_FIELDS,
  "team",
  "approvedByEmrt",
  "paidByEmrtAt"
];
const SOURCE_MANAGED_EXPENSE_FIELDS: Array<keyof GeneralExpenseUpdateRecord> = [
  "detail",
  "amountMxn",
  "countsTowardLimit",
  "team",
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
  "hasWithholdings",
  "recurring",
  "approvedByEmrt",
  "paidByEmrtAt",
  "emrtReimbursementPending"
];
const PAYROLL_MANAGED_PAYMENT_FIELDS: Array<keyof GeneralExpenseUpdateRecord> = ["paid", "paidAt"];
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
      advanceVacationDaysPaidPrevious: true,
      advanceVacationDaysPaidCurrent: true,
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
  },
  registeredExpense: {
    select: {
      id: true,
      reviewedByJnls: true,
      paid: true,
      paidAt: true
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
type PayrollUpdateBuildResult = {
  data: Prisma.GeneralExpensePayrollEntryUpdateInput;
  laborFileUpdate?: Prisma.LaborFileUpdateInput;
};

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

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, "INVALID_DATE", `Invalid date value: ${value}`);
  }

  return value;
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

function maxDateKey(left: string, right: string) {
  return left > right ? left : right;
}

function minDateKey(left: string, right: string) {
  return left < right ? left : right;
}

function getMonthLastDateKey(year: number, month: number) {
  const date = new Date(Date.UTC(year, month, 0));
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function getYearMonthFromDateKey(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  assertMonth(month);
  return { year, month };
}

function formatMxn(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDateKeyDisplay(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
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

function normalizeHasWithholdings(
  method: GeneralExpense["paymentMethod"],
  hasWithholdings?: boolean | null,
  fallback = DEFAULT_HAS_WITHHOLDINGS
) {
  if (method !== "Transferencia") {
    return false;
  }

  return typeof hasWithholdings === "boolean" ? hasWithholdings : fallback;
}

function isSuperadmin(actor: GeneralExpenseActor) {
  return actor.role === "SUPERADMIN" || actor.legacyRole === "SUPERADMIN" || actor.permissions.includes("*");
}

function isFinance(actor: GeneralExpenseActor) {
  return actor.team === "FINANCE" ||
    actor.secondaryTeam === "FINANCE" ||
    normalizeComparableText(actor.legacyTeam) === "finanzas" ||
    normalizeComparableText(actor.secondaryLegacyTeam) === "finanzas" ||
    normalizeComparableText(actor.specificRole) === "finanzas" ||
    normalizeComparableText(actor.secondarySpecificRole) === "finanzas";
}

function isAraceliLozano(actor: GeneralExpenseActor) {
  const normalizedEmail = normalizeComparableText(actor.email);
  const normalizedUsername = normalizeComparableText(actor.username);
  const normalizedDisplayName = normalizeComparableText(actor.displayName);
  return isFinance(actor) && (
    normalizedUsername === "araceli lozano" ||
    normalizedUsername === "araceli lozano escamilla" ||
    normalizedDisplayName === "araceli lozano" ||
    normalizedDisplayName === "araceli lozano escamilla" ||
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
    actor.secondaryTeam === "AUDIT" ||
    normalizeComparableText(actor.legacyTeam) === "auditoria" ||
    normalizeComparableText(actor.secondaryLegacyTeam) === "auditoria" ||
    normalizeComparableText(actor.specificRole) === "auditor" ||
    normalizeComparableText(actor.secondarySpecificRole) === "auditor"
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

const PAYROLL_MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

function getPayrollGrossCompensationMxn(entry: GeneralExpensePayrollEntry) {
  return roundPayrollNumber(
    entry.netSalaryMxn +
    entry.punctualityBonusMxn +
    entry.attendanceBonusMxn +
    entry.vacationPremiumMxn +
    entry.overtimeTotalMxn
  );
}

function getPayrollExpenseDistribution(entry: GeneralExpensePayrollEntry) {
  const sum = (
    entry.pctLitigation +
    entry.pctCorporateLabor +
    entry.pctSettlements +
    entry.pctFinancialLaw +
    entry.pctTaxCompliance
  );

  if (entry.generalExpense || Math.abs(sum - 100) > 0.0001) {
    return {
      generalExpense: true,
      pctLitigation: 20,
      pctCorporateLabor: 20,
      pctSettlements: 20,
      pctFinancialLaw: 20,
      pctTaxCompliance: 20
    };
  }

  return {
    generalExpense: false,
    pctLitigation: entry.pctLitigation,
    pctCorporateLabor: entry.pctCorporateLabor,
    pctSettlements: entry.pctSettlements,
    pctFinancialLaw: entry.pctFinancialLaw,
    pctTaxCompliance: entry.pctTaxCompliance
  };
}

function getPayrollScheduledPaymentDateKey(
  entry: { year: number; month: number; half: number },
  globalVacationDayRecords: PayrollGlobalVacationDayRecord[]
) {
  const targetDate = entry.half === 1
    ? `${entry.year}-${padDatePart(entry.month)}-25`
    : (() => {
      const nextMonth = getNextMonth(entry.year, entry.month);
      return `${nextMonth.year}-${padDatePart(nextMonth.month)}-10`;
    })();
  const globalVacationDateKeys = new Set(
    globalVacationDayRecords.flatMap(getGlobalVacationDayDateKeys)
  );

  let candidate = targetDate;
  for (let attempts = 0; attempts < 370; attempts += 1) {
    const weekday = dateKeyToUtcDate(candidate).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !globalVacationDateKeys.has(candidate)) {
      return candidate;
    }
    candidate = addDateKey(candidate, -1);
  }

  throw new AppError(
    500,
    "GENERAL_EXPENSE_PAYROLL_PAYMENT_DATE_NOT_FOUND",
    "No fue posible encontrar un dia habil para registrar el pago de la Nomina."
  );
}

function getPayrollGeneratedExpenseData(
  entry: GeneralExpensePayrollEntry,
  globalVacationDayRecords: PayrollGlobalVacationDayRecord[]
) {
  const distribution = getPayrollExpenseDistribution(entry);
  const halfLabel = entry.half === 1 ? "Primera quincena" : "Segunda quincena";
  const monthLabel = PAYROLL_MONTH_NAMES[entry.month - 1] ?? `Mes ${entry.month}`;
  const employeeName = entry.employeeName.trim() || "Colaborador sin nombre";
  const paidAt = parseDateOnly(getPayrollScheduledPaymentDateKey(entry, globalVacationDayRecords));

  return {
    year: entry.year,
    month: entry.month,
    detail: `Nómina - ${employeeName} - ${halfLabel} - ${monthLabel} ${entry.year}`,
    amountMxn: normalizeMoney(getPayrollGrossCompensationMxn(entry)),
    countsTowardLimit: false,
    team: DEFAULT_TEAM,
    generalExpense: distribution.generalExpense,
    expenseWithoutTeam: false,
    pctLitigation: new Prisma.Decimal(distribution.pctLitigation),
    pctCorporateLabor: new Prisma.Decimal(distribution.pctCorporateLabor),
    pctSettlements: new Prisma.Decimal(distribution.pctSettlements),
    pctFinancialLaw: new Prisma.Decimal(distribution.pctFinancialLaw),
    pctTaxCompliance: new Prisma.Decimal(distribution.pctTaxCompliance),
    paymentMethod: DEFAULT_PAYMENT_METHOD,
    bank: PAYROLL_GENERATED_BANK,
    hasVat: false,
    hasWithholdings: false,
    recurring: false,
    approvedByEmrt: true,
    paidByEmrtAt: null,
    emrtReimbursementPending: false,
    paid: true,
    paidAt,
    payrollNetDepositMxn: new Prisma.Decimal(roundPayrollNumber(entry.netDepositMxn))
  };
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
    const punctualityBonusMxn = entry.punctualityBonusExcluded ? 0 : monthlyBonusMxn;
    const attendanceBonusMxn = entry.attendanceBonusExcluded ? 0 : monthlyBonusMxn;

    return {
      ...entry,
      punctualityBonusMxn,
      attendanceBonusMxn,
      netDepositMxn: getPayrollNetDepositMxn(entry, punctualityBonusMxn, attendanceBonusMxn)
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

function getVacationDaysInDateRange(event: PayrollVacationEventRecord, startDate: string, endDate: string) {
  const dateKeys = getVacationEventDateKeys(event);
  const dateKeysInRange = dateKeys.filter((dateKey) => dateKey >= startDate && dateKey <= endDate);
  if (dateKeysInRange.length === 0) {
    return 0;
  }

  const recordedDays = Number(event.days ?? 0);
  if (recordedDays > 0 && dateKeys.length > 0 && Math.abs(recordedDays - dateKeys.length) > 0.01) {
    return dateKeysInRange.length * (recordedDays / dateKeys.length);
  }

  return dateKeysInRange.length;
}

function getGlobalVacationDayDateKeys(day: PayrollGlobalVacationDayRecord) {
  const explicitDates = getVacationDateKeysFromJson(day.vacationDates);
  if (explicitDates.length > 0) {
    return explicitDates;
  }

  const startDate = toDateInput(day.date);
  const days = Number(day.days ?? 0);
  if (startDate && Number.isInteger(days) && days > 1 && days <= 31) {
    return Array.from({ length: days }, (_, index) => addDateKey(startDate, index));
  }

  return startDate ? [startDate] : [];
}

function getGlobalVacationDayDaysInDateRange(day: PayrollGlobalVacationDayRecord, startDate: string, endDate: string) {
  const dateKeys = getGlobalVacationDayDateKeys(day);
  const dateKeysInRange = dateKeys.filter((dateKey) => dateKey >= startDate && dateKey <= endDate);
  if (dateKeysInRange.length === 0) {
    return 0;
  }

  const recordedDays = Number(day.days ?? 0);
  if (recordedDays > 0 && dateKeys.length > 0 && Math.abs(recordedDays - dateKeys.length) > 0.01) {
    return dateKeysInRange.length * (recordedDays / dateKeys.length);
  }

  return dateKeysInRange.length;
}

function getRecordedVacationDaysInDateRange(
  laborFile: NonNullable<StoredGeneralExpensePayrollEntry["laborFile"]>,
  globalVacationDayRecords: PayrollGlobalVacationDayRecord[],
  startDate: string,
  endDate: string,
  employmentStartedAt: string,
  employmentEndedAt?: string
) {
  const vacationEvents = laborFile.vacationEvents.filter((event) =>
    event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION"
  );
  const globalVacationEvents = vacationEvents.filter((event) => event.eventType === "GLOBAL_VACATION");
  const vacationEventDays = vacationEvents.reduce(
    (total, event) => total + getVacationDaysInDateRange(event, startDate, endDate),
    0
  );
  const globalVacationDays = globalVacationDayRecords
    .filter((day) => {
      const date = toDateInput(day.date);
      return date >= employmentStartedAt &&
        (!employmentEndedAt || date <= employmentEndedAt) &&
        !globalVacationEvents.some((event) =>
          event.globalVacationDayId === day.id || toDateInput(event.startDate) === date
        );
    })
    .reduce((total, day) => total + getGlobalVacationDayDaysInDateRange(day, startDate, endDate), 0);

  return vacationEventDays + globalVacationDays;
}

function getRecordedVacationDaysInOptionalDateRange(
  laborFile: NonNullable<StoredGeneralExpensePayrollEntry["laborFile"]>,
  globalVacationDayRecords: PayrollGlobalVacationDayRecord[],
  startDate: string,
  endDate: string,
  employmentStartedAt: string,
  employmentEndedAt?: string
) {
  if (!startDate || !endDate || startDate > endDate) {
    return 0;
  }

  return getRecordedVacationDaysInDateRange(
    laborFile,
    globalVacationDayRecords,
    startDate,
    endDate,
    employmentStartedAt,
    employmentEndedAt
  );
}

function getManualAdvanceVacationDaysForPeriod(
  laborFile: NonNullable<StoredGeneralExpensePayrollEntry["laborFile"]>,
  startDate: string,
  endDate: string
) {
  return laborFile.vacationEvents
    .filter((event) =>
      event.eventType === "PREVIOUS_YEAR_PENDING" &&
      toDateInput(event.startDate) === startDate &&
      toDateInput(event.endDate) === endDate
    )
    .reduce((total, event) => total + Math.max(0, -Number(event.days ?? 0)), 0);
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

  private getOrganizationId() {
    return getCurrentOrganizationIdOrDefault();
  }

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
        advanceVacationDaysPaymentEligible: false,
        advanceVacationDaysPreviousPeriods: 0,
        advanceVacationDaysCurrentPeriod: 0,
        vacationDaysPaidPreviousPeriods: 0,
        vacationDaysPaidAdvanceCurrentPeriod: 0
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
    const period = getPayrollPeriodDateRange(record.year, record.month, record.half === 2 ? 2 : 1);
    const advanceVacationPremiumPaymentDate = vacationSummary.completedYears > 0
      ? vacationSummary.currentYearStartDate
      : addYearsToDateKey(hireDate, 1);
    const advanceVacationStartDate = vacationSummary.completedYears > 0
      ? vacationSummary.previousYearStartDate
      : hireDate;
    const advanceVacationEndDate = vacationSummary.completedYears > 0
      ? vacationSummary.previousYearEndDate
      : addDateKey(advanceVacationPremiumPaymentDate, -1);
    const recordedAdvanceVacationDays = getRecordedVacationDaysInDateRange(
      laborFile,
      globalVacationDayRecords,
      advanceVacationStartDate,
      advanceVacationEndDate,
      hireDate,
      employmentEndedAt
    );
    const previousPeriodsEndDate = minDateKey(advanceVacationEndDate, addDateKey(period.startDate, -1));
    const currentPeriodStartDate = maxDateKey(advanceVacationStartDate, period.startDate);
    const currentPeriodEndDate = minDateKey(advanceVacationEndDate, period.endDate);
    const recordedAdvanceVacationDaysPreviousPeriods = getRecordedVacationDaysInOptionalDateRange(
      laborFile,
      globalVacationDayRecords,
      advanceVacationStartDate,
      previousPeriodsEndDate,
      hireDate,
      employmentEndedAt
    );
    const recordedAdvanceVacationDaysCurrentPeriod = getRecordedVacationDaysInOptionalDateRange(
      laborFile,
      globalVacationDayRecords,
      currentPeriodStartDate,
      currentPeriodEndDate,
      hireDate,
      employmentEndedAt
    );
    const manualAdvanceVacationDays = getManualAdvanceVacationDaysForPeriod(
      laborFile,
      advanceVacationStartDate,
      advanceVacationEndDate
    );
    const isAdvanceVacationPaymentInPeriod = advanceVacationPremiumPaymentDate >= period.startDate &&
      advanceVacationPremiumPaymentDate <= period.endDate;
    const manualAdvanceVacationRemainder = Math.max(0, manualAdvanceVacationDays - recordedAdvanceVacationDays);
    const rawAdvanceVacationDaysPreviousPeriods = isAdvanceVacationPaymentInPeriod
      ? roundPayrollNumber(recordedAdvanceVacationDaysPreviousPeriods + manualAdvanceVacationRemainder)
      : 0;
    const rawAdvanceVacationDaysCurrentPeriod = isAdvanceVacationPaymentInPeriod
      ? roundPayrollNumber(recordedAdvanceVacationDaysCurrentPeriod)
      : 0;
    const rawAdvanceVacationDays = roundPayrollNumber(
      rawAdvanceVacationDaysPreviousPeriods + rawAdvanceVacationDaysCurrentPeriod
    );
    const paidCutoffDate = toDateInput(laborFile.advanceVacationDaysPaidCutoffDate);
    const paidBalance = paidCutoffDate && paidCutoffDate === advanceVacationPremiumPaymentDate
      ? roundPayrollNumber(Number(laborFile.advanceVacationDaysPaidBalance ?? 0))
      : 0;
    const paidPreviousPeriods = paidBalance > 0
      ? roundPayrollNumber(Number(laborFile.advanceVacationDaysPaidPrevious ?? paidBalance))
      : 0;
    const paidCurrentPeriod = paidBalance > 0
      ? roundPayrollNumber(Number(laborFile.advanceVacationDaysPaidCurrent ?? 0))
      : 0;
    const advanceVacationDays = roundPayrollNumber(Math.max(0, rawAdvanceVacationDays - paidBalance));
    const advanceVacationDaysPaymentEligible = Boolean(
      advanceVacationPremiumPaymentDate &&
      isAdvanceVacationPaymentInPeriod &&
      getMexicoCityDateKey() >= advanceVacationPremiumPaymentDate &&
      rawAdvanceVacationDays > 0
    );
    const advanceVacationDaysPaid = rawAdvanceVacationDays > 0 && paidBalance >= rawAdvanceVacationDays;

    return {
      rawAdvanceVacationDays,
      advanceVacationDays,
      advanceVacationPremiumPaymentDate: rawAdvanceVacationDays > 0
        ? advanceVacationPremiumPaymentDate
        : undefined,
      advanceVacationDaysPaid,
      advanceVacationDaysPaymentEligible,
      advanceVacationDaysPreviousPeriods: rawAdvanceVacationDaysPreviousPeriods,
      advanceVacationDaysCurrentPeriod: rawAdvanceVacationDaysCurrentPeriod,
      vacationDaysPaidPreviousPeriods: advanceVacationDaysPaid ? paidPreviousPeriods : 0,
      vacationDaysPaidAdvanceCurrentPeriod: advanceVacationDaysPaid ? paidCurrentPeriod : 0
    };
  }

  private async listPayrollGlobalVacationDayRecords() {
    const organizationId = this.getOrganizationId();
    return this.prisma.laborGlobalVacationDay.findMany({
      where: { organizationId },
      select: PAYROLL_GLOBAL_VACATION_DAY_SELECT,
      orderBy: [{ date: "asc" }]
    });
  }

  private async mapPayrollEntryWithSalaryRi(
    record: StoredGeneralExpensePayrollEntry,
    globalVacationDayRecords: PayrollGlobalVacationDayRecord[]
  ) {
    const vacationTotals = this.getPayrollVacationTotals(record);
    const advanceVacationData = this.getPayrollAdvanceVacationData(record, globalVacationDayRecords);
    const regularVacationDaysCurrentPeriod = roundPayrollNumber(Math.max(
      0,
      vacationTotals.vacationDays - advanceVacationData.advanceVacationDaysCurrentPeriod
    ));
    const vacationDaysPaidCurrentPeriod = roundPayrollNumber(
      regularVacationDaysCurrentPeriod + advanceVacationData.vacationDaysPaidAdvanceCurrentPeriod
    );
    const vacationDaysPaidPreviousPeriods = advanceVacationData.vacationDaysPaidPreviousPeriods;
    const vacationDays = roundPayrollNumber(vacationDaysPaidPreviousPeriods + vacationDaysPaidCurrentPeriod);
    const dailySalaryMxn = Number(record.laborFile?.dailySalaryMxn ?? record.dailySalaryMxn ?? 0);
    const mapped = mapGeneralExpensePayrollEntry({
      ...record,
      ...advanceVacationData,
      vacationDaysPaidPreviousPeriods,
      vacationDaysPaidCurrentPeriod,
      vacationDays,
      vacationPremiumMxn: roundPayrollNumber(vacationDays * dailySalaryMxn * PAYROLL_VACATION_PREMIUM_RATE)
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

  private async mapPayrollEntryWithMonthlyBonuses(
    record: StoredGeneralExpensePayrollEntry,
    preloadedGlobalVacationDayRecords?: PayrollGlobalVacationDayRecord[]
  ) {
    const organizationId = this.getOrganizationId();
    const [records, globalVacationDayRecords] = await Promise.all([
      this.prisma.generalExpensePayrollEntry.findMany({
        where: { organizationId, year: record.year, month: record.month },
        include: PAYROLL_ENTRY_INCLUDE,
        orderBy: [{ half: "asc" }, { createdAt: "asc" }]
      }),
      preloadedGlobalVacationDayRecords ?? this.listPayrollGlobalVacationDayRecords()
    ]);
    const mapped = await this.mapPayrollEntriesWithMonthlyBonuses(records, globalVacationDayRecords);
    return mapped.find((entry) => entry.id === record.id) ?? applyPayrollMonthlyBonusCalculations([
      await this.mapPayrollEntryWithSalaryRi(record, globalVacationDayRecords)
    ])[0];
  }

  private async upsertPayrollGeneratedExpense(
    tx: Prisma.TransactionClient,
    entry: GeneralExpensePayrollEntry,
    globalVacationDayRecords: PayrollGlobalVacationDayRecord[]
  ) {
    const organizationId = this.getOrganizationId();
    const data = getPayrollGeneratedExpenseData(entry, globalVacationDayRecords);

    return tx.generalExpense.upsert({
      where: { payrollEntryId: entry.id },
      create: {
        organizationId,
        payrollEntryId: entry.id,
        ...data
      },
      update: data
    });
  }

  private async reconcileApprovedPayrollExpenses(year: number, month: number, onlyOutdated = false) {
    const organizationId = this.getOrganizationId();
    let payrollEntryIdsToReconcile: Set<string> | null = null;
    let preloadedGlobalVacationDayRecords: PayrollGlobalVacationDayRecord[] | null = null;

    if (onlyOutdated) {
      const [approvedPayrollExpenses, globalVacationDayRecords] = await Promise.all([
        this.prisma.generalExpensePayrollEntry.findMany({
          where: {
            organizationId,
            year,
            month,
            finalPaymentApprovedByEmrt: true
          },
          select: {
            id: true,
            year: true,
            month: true,
            half: true,
            generalExpense: true,
            pctLitigation: true,
            pctCorporateLabor: true,
            pctSettlements: true,
            pctFinancialLaw: true,
            pctTaxCompliance: true,
            registeredExpense: {
              select: {
                team: true,
                generalExpense: true,
                expenseWithoutTeam: true,
                pctLitigation: true,
                pctCorporateLabor: true,
                pctSettlements: true,
                pctFinancialLaw: true,
                pctTaxCompliance: true,
                paymentMethod: true,
                bank: true,
                paid: true,
                paidAt: true
              }
            }
          }
        }),
        this.listPayrollGlobalVacationDayRecords()
      ]);
      preloadedGlobalVacationDayRecords = globalVacationDayRecords;

      payrollEntryIdsToReconcile = new Set(
        approvedPayrollExpenses
          .filter((entry) => {
            const expectedPaymentDate = getPayrollScheduledPaymentDateKey(entry, globalVacationDayRecords);
            return (
              !entry.registeredExpense ||
              entry.registeredExpense.team !== DEFAULT_TEAM ||
              entry.registeredExpense.generalExpense !== entry.generalExpense ||
              entry.registeredExpense.expenseWithoutTeam ||
              Number(entry.registeredExpense.pctLitigation) !== Number(entry.pctLitigation) ||
              Number(entry.registeredExpense.pctCorporateLabor) !== Number(entry.pctCorporateLabor) ||
              Number(entry.registeredExpense.pctSettlements) !== Number(entry.pctSettlements) ||
              Number(entry.registeredExpense.pctFinancialLaw) !== Number(entry.pctFinancialLaw) ||
              Number(entry.registeredExpense.pctTaxCompliance) !== Number(entry.pctTaxCompliance) ||
              entry.registeredExpense.paymentMethod !== DEFAULT_PAYMENT_METHOD ||
              entry.registeredExpense.bank !== PAYROLL_GENERATED_BANK ||
              !entry.registeredExpense.paid ||
              toDateInput(entry.registeredExpense.paidAt) !== expectedPaymentDate
            );
          })
          .map(({ id }) => id)
      );

      if (payrollEntryIdsToReconcile.size === 0) {
        return;
      }
    }

    const [records, globalVacationDayRecords] = await Promise.all([
      this.prisma.generalExpensePayrollEntry.findMany({
        where: { organizationId, year, month },
        include: PAYROLL_ENTRY_INCLUDE,
        orderBy: [{ half: "asc" }, { createdAt: "asc" }]
      }),
      preloadedGlobalVacationDayRecords ?? this.listPayrollGlobalVacationDayRecords()
    ]);
    const approvedEntries = (await this.mapPayrollEntriesWithMonthlyBonuses(records, globalVacationDayRecords))
      .filter((entry) => (
        entry.finalPaymentApprovedByEmrt &&
        (!payrollEntryIdsToReconcile || payrollEntryIdsToReconcile.has(entry.id))
      ));

    if (approvedEntries.length === 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const entry of approvedEntries) {
        const distribution = getPayrollExpenseDistribution(entry);
        const requiresEqualDistributionNormalization = distribution.generalExpense && (
          !entry.generalExpense ||
          Math.abs(entry.pctLitigation - 20) > 0.0001 ||
          Math.abs(entry.pctCorporateLabor - 20) > 0.0001 ||
          Math.abs(entry.pctSettlements - 20) > 0.0001 ||
          Math.abs(entry.pctFinancialLaw - 20) > 0.0001 ||
          Math.abs(entry.pctTaxCompliance - 20) > 0.0001
        );
        if (requiresEqualDistributionNormalization) {
          await tx.generalExpensePayrollEntry.update({
            where: { id: entry.id, organizationId },
            data: {
              generalExpense: true,
              pctLitigation: new Prisma.Decimal(20),
              pctCorporateLabor: new Prisma.Decimal(20),
              pctSettlements: new Prisma.Decimal(20),
              pctFinancialLaw: new Prisma.Decimal(20),
              pctTaxCompliance: new Prisma.Decimal(20)
            }
          });
        }

        await this.upsertPayrollGeneratedExpense(tx, entry, globalVacationDayRecords);
      }
    });
  }

  public async list(year: number, month: number) {
    assertMonth(month);
    const organizationId = this.getOrganizationId();

    await this.reconcileApprovedPayrollExpenses(year, month, true);

    const records = await this.prisma.generalExpense.findMany({
      where: { organizationId, year, month },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return records.map(mapGeneralExpense);
  }

  public async listEmrtAcknowledgements(year: number, month: number) {
    assertMonth(month);
    const organizationId = this.getOrganizationId();

    const records = await this.prisma.generalExpenseEmrtAcknowledgement.findMany({
      where: { organizationId, year, month },
      orderBy: [{ paidByEmrtDate: "asc" }, { createdAt: "asc" }]
    });

    return records.map(mapGeneralExpenseEmrtAcknowledgement);
  }

  public async updateEmrtAcknowledgement(
    date: string,
    payload: GeneralExpenseEmrtAcknowledgementUpdateRecord,
    actor: GeneralExpenseActor
  ): Promise<GeneralExpenseEmrtDailyAcknowledgement> {
    const dateKey = parseDateKey(date);
    const period = getYearMonthFromDateKey(dateKey);
    await assertCommissionPeriodUnlocked(this.prisma, period.year, period.month);
    const payloadKeys = Object.keys(payload);

    if (payloadKeys.length !== 1) {
      throw new AppError(400, "GENERAL_EXPENSE_EMRT_ACK_INVALID_PAYLOAD", "Update exactly one acknowledgement flag at a time.");
    }

    if (hasOwn(payload, "receivedByAle")) {
      if (!isAraceliLozano(actor)) {
        throw new AppError(403, "GENERAL_EXPENSE_EMRT_ACK_ALE_FORBIDDEN", "Only Araceli Lozano Escamilla can update the ALE receipt flag.");
      }

      return payload.receivedByAle
        ? this.markEmrtAcknowledgementReceivedByAle(dateKey)
        : this.unmarkEmrtAcknowledgementReceivedByAle(dateKey);
    }

    if (hasOwn(payload, "paidByEmrt")) {
      if (!isSuperadmin(actor) || !isEduardoRusconi(actor)) {
        throw new AppError(403, "GENERAL_EXPENSE_EMRT_ACK_EMRT_FORBIDDEN", "Only Eduardo Rusconi can update the EMRT payment confirmation.");
      }

      return payload.paidByEmrt
        ? this.markEmrtAcknowledgementPaidByEmrt(dateKey)
        : this.unmarkEmrtAcknowledgementPaidByEmrt(dateKey);
    }

    throw new AppError(400, "GENERAL_EXPENSE_EMRT_ACK_EMPTY_PAYLOAD", "No acknowledgement flag was provided.");
  }

  public async create(payload: GeneralExpenseCreateRecord = {}) {
    const now = new Date();
    const year = payload.year ?? now.getFullYear();
    const month = payload.month ?? now.getMonth() + 1;
    assertMonth(month);
    await assertCommissionPeriodUnlocked(this.prisma, year, month);
    const organizationId = this.getOrganizationId();

    const record = await this.prisma.generalExpense.create({
      data: {
        organizationId,
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
        hasWithholdings: DEFAULT_HAS_WITHHOLDINGS,
        recurring: false,
        approvedByEmrt: false,
        paidByEmrtAt: null,
        emrtReimbursementPending: false,
        reviewedByJnls: false,
        paid: false,
        paidAt: null
      }
    });

    return mapGeneralExpense(record);
  }

  public async update(expenseId: string, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor) {
    const current = await this.findOrThrow(expenseId);
    await assertCommissionPeriodUnlocked(this.prisma, current.year, current.month);
    await this.assertFieldAccess(current, payload, actor);

    const data = this.buildUpdatePayload(current, payload);
    const record = await this.prisma.generalExpense.update({
      where: { id: expenseId, organizationId: this.getOrganizationId() },
      data
    });

    return mapGeneralExpense(record);
  }

  public async delete(expenseId: string) {
    const current = await this.findOrThrow(expenseId);
    await assertCommissionPeriodUnlocked(this.prisma, current.year, current.month);
    if (current.approvedByEmrt) {
      throw new AppError(400, "GENERAL_EXPENSE_APPROVED_LOCKED", "Approved expenses cannot be deleted.");
    }

    const currentDateKey = toDateInput(current.paidByEmrtAt);
    const acknowledgement = currentDateKey ? await this.findEmrtAcknowledgementByDate(currentDateKey) : null;
    if (acknowledgement?.receivedByAle) {
      throw new AppError(400, "GENERAL_EXPENSE_EMRT_ACK_LOCKED", "This expense belongs to a day already received by ALE and cannot be deleted.");
    }

    await this.prisma.generalExpense.deleteMany({
      where: {
        id: expenseId,
        organizationId: this.getOrganizationId()
      }
    });
  }

  public async copyRecurringToNextMonth(year: number, month: number) {
    assertMonth(month);
    const organizationId = this.getOrganizationId();

    const { year: targetYear, month: targetMonth } = getNextMonth(year, month);
    await assertCommissionPeriodUnlocked(this.prisma, year, month);
    await assertCommissionPeriodUnlocked(this.prisma, targetYear, targetMonth);
    const recurringRows = await this.prisma.generalExpense.findMany({
      where: {
        organizationId,
        year,
        month,
        recurring: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    if (recurringRows.length === 0) {
      return { year: targetYear, month: targetMonth, copied: 0 };
    }

    const result = await this.prisma.generalExpense.createMany({
      data: recurringRows.map((row) => ({
        organizationId,
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
        hasWithholdings: normalizeHasWithholdings(
          row.paymentMethod as GeneralExpense["paymentMethod"],
          row.hasWithholdings,
          DEFAULT_HAS_WITHHOLDINGS
        ),
        recurring: true,
        approvedByEmrt: false,
        paidByEmrtAt: null,
        emrtReimbursementPending: false,
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
    const organizationId = this.getOrganizationId();
    const records = await this.prisma.laborFile.findMany({
      where: { organizationId },
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
    const organizationId = this.getOrganizationId();

    const [records, globalVacationDayRecords] = await Promise.all([
      this.prisma.generalExpensePayrollEntry.findMany({
        where: { organizationId, year, month },
        include: PAYROLL_ENTRY_INCLUDE,
        orderBy: [{ half: "asc" }, { createdAt: "asc" }]
      }),
      this.listPayrollGlobalVacationDayRecords()
    ]);

    return this.mapPayrollEntriesWithMonthlyBonuses(records, globalVacationDayRecords);
  }

  public async copyPayrollToNextMonth(year: number, month: number) {
    assertMonth(month);
    const organizationId = this.getOrganizationId();

    const { year: targetYear, month: targetMonth } = getNextMonth(year, month);
    await assertCommissionPeriodUnlocked(this.prisma, year, month);
    await assertCommissionPeriodUnlocked(this.prisma, targetYear, targetMonth);
    const [sourceRows, existingTargetRows] = await Promise.all([
      this.prisma.generalExpensePayrollEntry.findMany({
        where: { organizationId, year, month },
        orderBy: [{ half: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.generalExpensePayrollEntry.count({
        where: { organizationId, year: targetYear, month: targetMonth }
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
          organizationId,
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
          punctualityBonusExcluded: row.punctualityBonusExcluded,
          attendanceBonusExcluded: row.attendanceBonusExcluded,
          absenceDays: new Prisma.Decimal(0),
          overtimeHours: new Prisma.Decimal(0),
          overtimeDetail: "",
          generalExpense: row.generalExpense,
          pctLitigation: row.pctLitigation,
          pctCorporateLabor: row.pctCorporateLabor,
          pctSettlements: row.pctSettlements,
          pctFinancialLaw: row.pctFinancialLaw,
          pctTaxCompliance: row.pctTaxCompliance,
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
    await assertCommissionPeriodUnlocked(this.prisma, year, month);
    const organizationId = this.getOrganizationId();
    const laborFile = payload.laborFileId ? await this.findPayrollLaborFileOrThrow(payload.laborFileId) : null;
    const dailySalaryMxn = Number(laborFile?.dailySalaryMxn ?? 0);
    const bonusMxn = 0;

    const record = await this.prisma.generalExpensePayrollEntry.create({
      data: {
        organizationId,
        year,
        month,
        half,
        laborFileId: laborFile?.id ?? null,
        employeeName: laborFile?.employeeName ?? "",
        isPartTime: false,
        dailySalaryMxn: normalizeMoney(dailySalaryMxn),
        grossSalaryMxn: normalizeMoney(getPayrollGrossSalaryMxn(dailySalaryMxn)),
        punctualityBonusMxn: normalizeMoney(bonusMxn),
        attendanceBonusMxn: normalizeMoney(bonusMxn),
        punctualityBonusExcluded: false,
        attendanceBonusExcluded: false,
        absenceDays: new Prisma.Decimal(0),
        overtimeHours: new Prisma.Decimal(0),
        overtimeDetail: "",
        generalExpense: false,
        pctLitigation: new Prisma.Decimal(0),
        pctCorporateLabor: new Prisma.Decimal(0),
        pctSettlements: new Prisma.Decimal(0),
        pctFinancialLaw: new Prisma.Decimal(0),
        pctTaxCompliance: new Prisma.Decimal(0),
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
    await assertCommissionPeriodUnlocked(this.prisma, current.year, current.month);
    this.assertPayrollFieldAccess(current, payload, actor);

    const organizationId = this.getOrganizationId();
    const approvalGlobalVacationDayRecords = payload.finalPaymentApprovedByEmrt === true
      ? await this.listPayrollGlobalVacationDayRecords()
      : null;
    const payrollSnapshot = payload.finalPaymentApprovedByEmrt === true
      ? await this.mapPayrollEntryWithMonthlyBonuses(current, approvalGlobalVacationDayRecords ?? undefined)
      : null;
    const { data, laborFileUpdate } = await this.buildPayrollUpdatePayload(current, payload);
    const record = await this.prisma.$transaction(async (tx) => {
      if (laborFileUpdate && current.laborFileId) {
        await tx.laborFile.update({
          where: { id: current.laborFileId, organizationId },
          data: laborFileUpdate
        });
      }

      const updated = await tx.generalExpensePayrollEntry.update({
        where: { id: payrollEntryId, organizationId },
        data,
        include: PAYROLL_ENTRY_INCLUDE
      });

      if (payload.finalPaymentApprovedByEmrt === true && payrollSnapshot && approvalGlobalVacationDayRecords) {
        await this.upsertPayrollGeneratedExpense(tx, payrollSnapshot, approvalGlobalVacationDayRecords);
      }

      if (payload.finalPaymentApprovedByEmrt === false) {
        await tx.generalExpense.deleteMany({
          where: { payrollEntryId, organizationId }
        });
      }

      return updated;
    });

    await this.reconcileApprovedPayrollExpenses(current.year, current.month);

    return this.mapPayrollEntryWithMonthlyBonuses(record);
  }

  public async deletePayrollEntry(payrollEntryId: string) {
    const current = await this.findPayrollEntryOrThrow(payrollEntryId);
    await assertCommissionPeriodUnlocked(this.prisma, current.year, current.month);
    if (current.finalPaymentApprovedByEmrt) {
      throw new AppError(400, "GENERAL_EXPENSE_PAYROLL_FINAL_PAYMENT_LOCKED", "La fila ya fue autorizada por EMRT y no puede borrarse.");
    }

    await this.prisma.generalExpensePayrollEntry.deleteMany({
      where: {
        id: payrollEntryId,
        organizationId: this.getOrganizationId()
      }
    });
  }

  private async findOrThrow(expenseId: string) {
    const record = await this.prisma.generalExpense.findFirst({
      where: {
        id: expenseId,
        organizationId: this.getOrganizationId()
      }
    });

    if (!record) {
      throw new AppError(404, "GENERAL_EXPENSE_NOT_FOUND", "The requested expense does not exist.");
    }

    return record;
  }

  private async findPayrollEntryOrThrow(payrollEntryId: string) {
    const record = await this.prisma.generalExpensePayrollEntry.findFirst({
      where: {
        id: payrollEntryId,
        organizationId: this.getOrganizationId()
      },
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

    const laborFile = await this.prisma.laborFile.findFirst({
      where: {
        id: normalizedLaborFileId,
        organizationId: this.getOrganizationId()
      },
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

  private async findEmrtAcknowledgementByDate(dateKey: string) {
    const organizationId = this.getOrganizationId();
    const { year, month } = getYearMonthFromDateKey(dateKey);
    const paidByEmrtDate = parseDateOnly(dateKey);

    return this.prisma.generalExpenseEmrtAcknowledgement.findUnique({
      where: {
        organizationId_year_month_paidByEmrtDate: {
          organizationId,
          year,
          month,
          paidByEmrtDate: paidByEmrtDate as Date
        }
      }
    });
  }

  private async buildEmrtAcknowledgementSnapshot(dateKey: string) {
    const organizationId = this.getOrganizationId();
    const { year, month } = getYearMonthFromDateKey(dateKey);
    const paidByEmrtDate = parseDateOnly(dateKey) as Date;
    const expenses = await this.prisma.generalExpense.findMany({
      where: {
        organizationId,
        year,
        month,
        approvedByEmrt: true,
        paidByEmrtAt: paidByEmrtDate
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    if (expenses.length === 0) {
      throw new AppError(400, "GENERAL_EXPENSE_EMRT_ACK_EMPTY_DAY", "No EMRT cash expenses were found for this date.");
    }

    const items = expenses.map((expense, index) => ({
      index: index + 1,
      id: expense.id,
      detail: (expense.detail || "Gasto sin detalle").trim(),
      amountMxn: roundPayrollNumber(Number(expense.amountMxn || 0)),
      approvedByEmrt: expense.approvedByEmrt,
      paidByEmrtAt: toDateInput(expense.paidByEmrtAt),
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString()
    }));
    const totalMxn = roundPayrollNumber(items.reduce((sum, item) => sum + item.amountMxn, 0));
    const expenseIds = items.map((item) => item.id);
    const summaryMessage = [
      `Entrego a Araceli la suma de ${formatMxn(totalMxn)} y el resumen:`,
      "",
      `Gastos pagados por EMRT el ${formatDateKeyDisplay(dateKey)}:`,
      ...items.map((item) => `${item.index}. ${item.detail}`)
    ].join("\n");
    const snapshotData = {
      version: 1,
      paidByEmrtDate: dateKey,
      totalMxn,
      expenseIds,
      items
    };
    const snapshotHash = createHash("sha256")
      .update(JSON.stringify(snapshotData))
      .digest("hex");

    return {
      year,
      month,
      paidByEmrtDate,
      totalMxn,
      summaryMessage,
      expenseIds,
      snapshotData,
      snapshotHash
    };
  }

  private async markEmrtAcknowledgementReceivedByAle(dateKey: string) {
    const organizationId = this.getOrganizationId();
    const snapshot = await this.buildEmrtAcknowledgementSnapshot(dateKey);
    const existing = await this.findEmrtAcknowledgementByDate(dateKey);
    const now = new Date();

    if (existing?.paidByEmrt) {
      return mapGeneralExpenseEmrtAcknowledgement(existing);
    }

    const record = await this.prisma.generalExpenseEmrtAcknowledgement.upsert({
      where: {
        organizationId_year_month_paidByEmrtDate: {
          organizationId,
          year: snapshot.year,
          month: snapshot.month,
          paidByEmrtDate: snapshot.paidByEmrtDate
        }
      },
      create: {
        organizationId,
        year: snapshot.year,
        month: snapshot.month,
        paidByEmrtDate: snapshot.paidByEmrtDate,
        totalMxn: normalizeMoney(snapshot.totalMxn),
        summaryMessage: snapshot.summaryMessage,
        expenseIds: snapshot.expenseIds,
        snapshotData: snapshot.snapshotData,
        snapshotHash: snapshot.snapshotHash,
        receivedByAle: true,
        receivedByAleAt: now,
        paidByEmrt: false,
        paidByEmrtAt: null
      },
      update: {
        totalMxn: normalizeMoney(snapshot.totalMxn),
        summaryMessage: snapshot.summaryMessage,
        expenseIds: snapshot.expenseIds,
        snapshotData: snapshot.snapshotData,
        snapshotHash: snapshot.snapshotHash,
        receivedByAle: true,
        receivedByAleAt: existing?.receivedByAleAt ?? now
      }
    });

    return mapGeneralExpenseEmrtAcknowledgement(record);
  }

  private async unmarkEmrtAcknowledgementReceivedByAle(dateKey: string) {
    const existing = await this.findEmrtAcknowledgementByDate(dateKey);
    if (!existing) {
      throw new AppError(404, "GENERAL_EXPENSE_EMRT_ACK_NOT_FOUND", "The daily EMRT acknowledgement does not exist.");
    }

    if (existing.paidByEmrt) {
      throw new AppError(400, "GENERAL_EXPENSE_EMRT_ACK_PAID_LOCKED", "EMRT already confirmed this payment. Uncheck EMRT before changing ALE receipt.");
    }

    const record = await this.prisma.generalExpenseEmrtAcknowledgement.update({
      where: { id: existing.id, organizationId: this.getOrganizationId() },
      data: {
        receivedByAle: false,
        receivedByAleAt: null
      }
    });

    return mapGeneralExpenseEmrtAcknowledgement(record);
  }

  private async markEmrtAcknowledgementPaidByEmrt(dateKey: string) {
    const existing = await this.findEmrtAcknowledgementByDate(dateKey);
    if (!existing?.receivedByAle) {
      throw new AppError(400, "GENERAL_EXPENSE_EMRT_ACK_ALE_REQUIRED", "ALE must mark the payment as received before EMRT can confirm it.");
    }

    const record = await this.prisma.generalExpenseEmrtAcknowledgement.update({
      where: { id: existing.id, organizationId: this.getOrganizationId() },
      data: {
        paidByEmrt: true,
        paidByEmrtAt: existing.paidByEmrtAt ?? new Date()
      }
    });

    return mapGeneralExpenseEmrtAcknowledgement(record);
  }

  private async unmarkEmrtAcknowledgementPaidByEmrt(dateKey: string) {
    const existing = await this.findEmrtAcknowledgementByDate(dateKey);
    if (!existing) {
      throw new AppError(404, "GENERAL_EXPENSE_EMRT_ACK_NOT_FOUND", "The daily EMRT acknowledgement does not exist.");
    }

    const record = await this.prisma.generalExpenseEmrtAcknowledgement.update({
      where: { id: existing.id, organizationId: this.getOrganizationId() },
      data: {
        paidByEmrt: false,
        paidByEmrtAt: null
      }
    });

    return mapGeneralExpenseEmrtAcknowledgement(record);
  }

  private async assertEmrtAcknowledgementLocks(current: StoredGeneralExpense, payload: GeneralExpenseUpdateRecord) {
    const currentDateKey = toDateInput(current.paidByEmrtAt);
    const targetDateKey = hasOwn(payload, "paidByEmrtAt") && payload.paidByEmrtAt
      ? parseDateKey(payload.paidByEmrtAt)
      : "";
    const currentAcknowledgement = currentDateKey ? await this.findEmrtAcknowledgementByDate(currentDateKey) : null;

    if (
      currentAcknowledgement?.receivedByAle &&
      LOCKED_AFTER_ALE_RECEIPT_FIELDS.some((field) => hasOwn(payload, field))
    ) {
      throw new AppError(
        400,
        "GENERAL_EXPENSE_EMRT_ACK_LOCKED",
        "This expense belongs to a day already received by ALE. Columns up to the EMRT payment date are locked."
      );
    }

    if (targetDateKey && targetDateKey !== currentDateKey) {
      const targetAcknowledgement = await this.findEmrtAcknowledgementByDate(targetDateKey);
      if (targetAcknowledgement?.receivedByAle) {
        throw new AppError(
          400,
          "GENERAL_EXPENSE_EMRT_ACK_TARGET_DATE_LOCKED",
          "This EMRT payment date already has an ALE receipt. Uncheck the daily receipt before assigning more expenses to it."
        );
      }
    }
  }

  private async assertFieldAccess(current: StoredGeneralExpense, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor) {
    await this.assertEmrtAcknowledgementLocks(current, payload);

    if (
      (current.payrollEntryId || current.projectorCommissionId) &&
      SOURCE_MANAGED_EXPENSE_FIELDS.some((field) => hasOwn(payload, field))
    ) {
      const sourceLabel = current.payrollEntryId ? "Nómina" : "Comisiones";
      throw new AppError(
        400,
        "GENERAL_EXPENSE_SOURCE_MANAGED",
        `Este gasto proviene de ${sourceLabel}. El monto y su distribución solo pueden modificarse desde su módulo de origen.`
      );
    }

    if (
      current.payrollEntryId &&
      PAYROLL_MANAGED_PAYMENT_FIELDS.some((field) => hasOwn(payload, field))
    ) {
      throw new AppError(
        400,
        "GENERAL_EXPENSE_PAYROLL_PAYMENT_MANAGED",
        "El estado y la fecha de pago de la Nomina se calculan automaticamente desde la quincena."
      );
    }

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

    if (hasOwn(payload, "emrtReimbursementPending")) {
      const nextPaymentMethod = hasOwn(payload, "paymentMethod")
        ? normalizePaymentMethod(payload.paymentMethod)
        : (current.paymentMethod as GeneralExpense["paymentMethod"]);

      if (!isSuperadmin(actor) || !isEduardoRusconi(actor)) {
        throw new AppError(403, "GENERAL_EXPENSE_EMRT_REIMBURSEMENT_FORBIDDEN", "Only Eduardo Rusconi can update the EMRT reimbursement flag.");
      }

      if (Boolean(payload.emrtReimbursementPending) && nextPaymentMethod !== "Transferencia") {
        throw new AppError(
          400,
          "GENERAL_EXPENSE_EMRT_REIMBURSEMENT_PAYMENT_METHOD",
          "The EMRT reimbursement flag only applies to transfer expenses."
        );
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

    if (hasOwn(payload, "hasWithholdings") || hasOwn(payload, "paymentMethod")) {
      const nextHasWithholdings = hasOwn(payload, "hasWithholdings")
        ? normalizeHasWithholdings(nextPaymentMethod, payload.hasWithholdings, current.hasWithholdings)
        : normalizeHasWithholdings(nextPaymentMethod, current.hasWithholdings, current.hasWithholdings);
      data.hasWithholdings = nextHasWithholdings;
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
      const nextApprovedByEmrt = Boolean(payload.approvedByEmrt);
      data.approvedByEmrt = nextApprovedByEmrt;
      if (!nextApprovedByEmrt) {
        data.paidByEmrtAt = null;
      }
    }

    if (hasOwn(payload, "paidByEmrtAt")) {
      data.paidByEmrtAt = parseDateOnly(payload.paidByEmrtAt);
    }

    if (hasOwn(payload, "emrtReimbursementPending")) {
      data.emrtReimbursementPending = Boolean(payload.emrtReimbursementPending);
    } else if (hasOwn(payload, "paymentMethod") && nextPaymentMethod !== "Transferencia") {
      data.emrtReimbursementPending = false;
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

    if (hasOwn(payload, "finalPaymentApprovedByEmrt") && !isFinalApprovalOnlyPatch) {
      throw new AppError(
        400,
        "GENERAL_EXPENSE_PAYROLL_FINAL_PAYMENT_PATCH_CONFLICT",
        "La autorización final de Nómina debe actualizarse por separado."
      );
    }

    if (current.finalPaymentApprovedByEmrt && payloadKeys.length > 0 && !isFinalApprovalOnlyPatch) {
      throw new AppError(400, "GENERAL_EXPENSE_PAYROLL_FINAL_PAYMENT_LOCKED", "La fila ya fue autorizada por EMRT y no admite cambios.");
    }

    if (hasOwn(payload, "payrollStampedByAraceli") && !isAraceliLozano(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_PAYROLL_STAMP_FORBIDDEN", "Solo Araceli Lozano del equipo de Finanzas puede verificar el timbrado de nómina.");
    }

    if (hasOwn(payload, "finalPaymentApprovedByEmrt") && !isSuperadmin(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_PAYROLL_FINAL_PAYMENT_APPROVE_FORBIDDEN", "Only superadmin can approve the final payroll payment.");
    }

    if (
      payload.finalPaymentApprovedByEmrt === false &&
      current.registeredExpense &&
      current.registeredExpense.reviewedByJnls
    ) {
      throw new AppError(
        400,
        "GENERAL_EXPENSE_PAYROLL_REGISTERED_EXPENSE_PROCESSED",
        "No se puede desaprobar la Nomina porque su gasto ya fue revisado por JNLS en Registro. Revierte primero ese estado."
      );
    }

    if (hasOwn(payload, "reviewedByJnls")) {
      if (!canReviewJnls(actor)) {
        throw new AppError(403, "GENERAL_EXPENSE_PAYROLL_REVIEW_FORBIDDEN", "Only the audit team can update the JNLS approval flag.");
      }
    }

    if (payload.finalPaymentApprovedByEmrt === true) {
      const nextGeneralExpense = hasOwn(payload, "generalExpense")
        ? Boolean(payload.generalExpense)
        : current.generalExpense;
      const distributionSum = nextGeneralExpense
        ? 100
        : (
          (hasOwn(payload, "pctLitigation") ? clampPercentage(payload.pctLitigation) : Number(current.pctLitigation)) +
          (hasOwn(payload, "pctCorporateLabor") ? clampPercentage(payload.pctCorporateLabor) : Number(current.pctCorporateLabor)) +
          (hasOwn(payload, "pctSettlements") ? clampPercentage(payload.pctSettlements) : Number(current.pctSettlements)) +
          (hasOwn(payload, "pctFinancialLaw") ? clampPercentage(payload.pctFinancialLaw) : Number(current.pctFinancialLaw)) +
          (hasOwn(payload, "pctTaxCompliance") ? clampPercentage(payload.pctTaxCompliance) : Number(current.pctTaxCompliance))
        );

      if (Math.abs(distributionSum - 100) > 0.0001) {
        throw new AppError(
          400,
          "GENERAL_EXPENSE_PAYROLL_DISTRIBUTION_INCOMPLETE",
          "La distribución de la nómina entre equipos debe sumar 100% antes de autorizar el pago."
        );
      }
    }
  }

  private async buildPayrollUpdatePayload(
    current: StoredGeneralExpensePayrollEntry,
    payload: GeneralExpensePayrollUpdateRecord
  ): Promise<PayrollUpdateBuildResult> {
    const data: Prisma.GeneralExpensePayrollEntryUpdateInput = {};
    let laborFileUpdate: Prisma.LaborFileUpdateInput | undefined;
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

    if (hasOwn(payload, "generalExpense")) {
      data.generalExpense = Boolean(payload.generalExpense);
      if (payload.generalExpense) {
        data.pctLitigation = new Prisma.Decimal(20);
        data.pctCorporateLabor = new Prisma.Decimal(20);
        data.pctSettlements = new Prisma.Decimal(20);
        data.pctFinancialLaw = new Prisma.Decimal(20);
        data.pctTaxCompliance = new Prisma.Decimal(20);
      }
    }

    const nextGeneralExpense = hasOwn(payload, "generalExpense")
      ? Boolean(payload.generalExpense)
      : current.generalExpense;

    if (!nextGeneralExpense) {
      if (hasOwn(payload, "pctLitigation")) {
        data.pctLitigation = new Prisma.Decimal(clampPercentage(payload.pctLitigation));
      }

      if (hasOwn(payload, "pctCorporateLabor")) {
        data.pctCorporateLabor = new Prisma.Decimal(clampPercentage(payload.pctCorporateLabor));
      }

      if (hasOwn(payload, "pctSettlements")) {
        data.pctSettlements = new Prisma.Decimal(clampPercentage(payload.pctSettlements));
      }

      if (hasOwn(payload, "pctFinancialLaw")) {
        data.pctFinancialLaw = new Prisma.Decimal(clampPercentage(payload.pctFinancialLaw));
      }

      if (hasOwn(payload, "pctTaxCompliance")) {
        data.pctTaxCompliance = new Prisma.Decimal(clampPercentage(payload.pctTaxCompliance));
      }
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

    if (hasOwn(payload, "punctualityBonusExcluded")) {
      data.punctualityBonusExcluded = Boolean(payload.punctualityBonusExcluded);
    }

    if (hasOwn(payload, "attendanceBonusExcluded")) {
      data.attendanceBonusExcluded = Boolean(payload.attendanceBonusExcluded);
    }

    if (hasOwn(payload, "advanceVacationDaysPaid")) {
      if (!current.laborFile) {
        throw new AppError(
          400,
          "GENERAL_EXPENSE_PAYROLL_ADVANCE_VACATION_WITHOUT_LABOR_FILE",
          "La fila debe estar vinculada a un expediente laboral para marcar estos días como pagados."
        );
      }

      if (hasOwn(payload, "laborFileId")) {
        throw new AppError(
          400,
          "GENERAL_EXPENSE_PAYROLL_ADVANCE_VACATION_PATCH_CONFLICT",
          "Actualiza primero el colaborador y luego marca los días disfrutados por adelantado como pagados."
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
            "Los días disfrutados por adelantado solo pueden pagarse cuando llegue la fecha de corte correspondiente."
          );
        }

        laborFileUpdate = {
          advanceVacationDaysPaidBalance: normalizeHours(advanceVacationData.rawAdvanceVacationDays),
          advanceVacationDaysPaidCutoffDate: parseDateOnly(advanceVacationData.advanceVacationPremiumPaymentDate),
          advanceVacationDaysPaidPrevious: normalizeHours(advanceVacationData.advanceVacationDaysPreviousPeriods),
          advanceVacationDaysPaidCurrent: normalizeHours(advanceVacationData.advanceVacationDaysCurrentPeriod)
        };
      } else {
        laborFileUpdate = {
          advanceVacationDaysPaidBalance: normalizeHours(0),
          advanceVacationDaysPaidCutoffDate: null,
          advanceVacationDaysPaidPrevious: normalizeHours(0),
          advanceVacationDaysPaidCurrent: normalizeHours(0)
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

    return { data, laborFileUpdate };
  }
}
