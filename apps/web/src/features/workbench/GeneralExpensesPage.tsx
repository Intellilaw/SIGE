import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveEffectivePermissions,
  type GeneralExpense,
  type GeneralExpenseEmrtDailyAcknowledgement,
  type GeneralExpensePayrollEmployeeOption,
  type GeneralExpensePayrollEntry,
  type LegacyAccessRole
} from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge } from "../rusconi-intelligence/RusconiIntelligenceBadge";

type ActiveTab = "registro" | "payroll" | "emrt";
type ExpenseDraftField =
  | "detail"
  | "amountMxn"
  | "pctLitigation"
  | "pctCorporateLabor"
  | "pctSettlements"
  | "pctFinancialLaw"
  | "pctTaxCompliance";

type ExpenseDraftMap = Record<string, Partial<Record<ExpenseDraftField, string>>>;

type PayrollDraftField =
  | "absenceDays"
  | "overtimeHours"
  | "overtimeDetail"
  | "isrWithholdingMxn"
  | "imssWithholdingMxn"
  | "employmentSubsidyMxn"
  | "infonavitCreditMxn";

type PayrollDraftMap = Record<string, Partial<Record<PayrollDraftField, string>>>;

type GeneralExpensePatchPayload = {
  detail?: string;
  amountMxn?: number;
  countsTowardLimit?: boolean;
  team?: GeneralExpense["team"];
  generalExpense?: boolean;
  expenseWithoutTeam?: boolean;
  pctLitigation?: number;
  pctCorporateLabor?: number;
  pctSettlements?: number;
  pctFinancialLaw?: number;
  pctTaxCompliance?: number;
  paymentMethod?: GeneralExpense["paymentMethod"];
  bank?: GeneralExpense["bank"] | null;
  hasVat?: boolean;
  recurring?: boolean;
  approvedByEmrt?: boolean;
  paidByEmrtAt?: string | null;
  emrtReimbursementPending?: boolean;
  reviewedByJnls?: boolean;
  paid?: boolean;
  paidAt?: string | null;
};

type CopyNextMonthResult = {
  year: number;
  month: number;
  copied: number;
};

type EmrtAcknowledgementPatchPayload = {
  receivedByAle?: boolean;
  paidByEmrt?: boolean;
};

type PayrollPatchPayload = {
  laborFileId?: string | null;
  isPartTime?: boolean;
  grossSalaryMxn?: number;
  absenceDays?: number;
  overtimeHours?: number;
  overtimeDetail?: string;
  isrWithholdingMxn?: number;
  imssWithholdingMxn?: number;
  employmentSubsidyMxn?: number;
  infonavitCreditMxn?: number;
  punctualityBonusExcluded?: boolean;
  attendanceBonusExcluded?: boolean;
  advanceVacationDaysPaid?: boolean;
  payrollStampedByAraceli?: boolean;
  finalPaymentApprovedByEmrt?: boolean;
  reviewedByJnls?: boolean;
};

type PayrollLocalPatchPayload = PayrollPatchPayload & Partial<Pick<
  GeneralExpensePayrollEntry,
  | "employeeName"
  | "dailySalaryMxn"
  | "laborFileDailySalaryMxn"
  | "dailySalaryRiVerified"
  | "dailySalaryRiVerificationDetail"
  | "advanceVacationDays"
>>;

const YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
const MONTH_NAMES = [
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
const DISTRIBUTION_FIELDS = [
  { key: "pctLitigation", label: "% Litigio" },
  { key: "pctCorporateLabor", label: "% Corp-Lab" },
  { key: "pctSettlements", label: "% Convenios" },
  { key: "pctFinancialLaw", label: "% Der Fin" },
  { key: "pctTaxCompliance", label: "% Compl Fis" }
] as const;
const PCT_DRAFT_FIELDS: ExpenseDraftField[] = [
  "pctLitigation",
  "pctCorporateLabor",
  "pctSettlements",
  "pctFinancialLaw",
  "pctTaxCompliance"
];
const PAYMENT_METHOD_OPTIONS: GeneralExpense["paymentMethod"][] = ["Transferencia", "Efectivo"];
const BANK_OPTIONS: NonNullable<GeneralExpense["bank"]>[] = ["Banamex", "HSBC"];
const PAYROLL_MONEY_FIELDS = [
  "isrWithholdingMxn",
  "imssWithholdingMxn",
  "employmentSubsidyMxn",
  "infonavitCreditMxn"
] as const;
const PAYROLL_DAILY_SALARY_RI_CONNECTION_ID = "RI-003";
const PAYROLL_BONUS_RATE = 0.1;

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
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

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes("*") || permissions?.includes(permission));
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDateDisplay(value?: string | null) {
  const inputValue = toDateInput(value);
  if (!inputValue) {
    return "-";
  }

  const [year, month, day] = inputValue.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTimeDisplay(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatDateDisplay(value);
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatPayrollDays(value: number) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2
  }).format(numeric);
}

function formatEditableNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function formatEditableMoney(value: number) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0";
  }

  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2
  }).format(numeric);
}

function formatMoneyDraftValue(value: string) {
  const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const hasDecimalPoint = normalized.includes(".");
  const [rawInteger = "", ...rawDecimalParts] = normalized.split(".");
  const integerDigits = rawInteger.replace(/^0+(?=\d)/, "");
  const decimalDigits = rawDecimalParts.join("").slice(0, 2);
  const formattedInteger = integerDigits
    ? new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Number(integerDigits))
    : "";

  if (!formattedInteger && hasDecimalPoint) {
    return `0.${decimalDigits}`;
  }

  if (!formattedInteger) {
    return "";
  }

  return hasDecimalPoint ? `${formattedInteger}.${decimalDigits}` : formattedInteger;
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const numeric = Number(normalized || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isPayrollMoneyField(field: PayrollDraftField): field is (typeof PAYROLL_MONEY_FIELDS)[number] {
  return (PAYROLL_MONEY_FIELDS as readonly PayrollDraftField[]).includes(field);
}

function getPayrollDailySalaryRiValidation(
  entry: GeneralExpensePayrollEntry,
  employeeOption?: GeneralExpensePayrollEmployeeOption
) {
  if (!entry.laborFileId) {
    return {
      status: "mismatch" as const,
      label: "No verificado",
      detail: "Sin expediente laboral vinculado."
    };
  }

  const payrollDailySalary = Number(entry.dailySalaryMxn || 0);
  const laborFileDailySalary = Number(employeeOption?.dailySalaryMxn ?? entry.laborFileDailySalaryMxn ?? entry.dailySalaryMxn ?? 0);

  if (!payrollDailySalary || !laborFileDailySalary || Math.abs(payrollDailySalary - laborFileDailySalary) > 0.05) {
    return {
      status: "mismatch" as const,
      label: "No coincide",
      detail: "No coincide con el salario diario de Expedientes Laborales."
    };
  }

  const riVerified = Boolean(employeeOption?.dailySalaryRiVerified ?? entry.dailySalaryRiVerified);
  if (!riVerified) {
    return {
      status: "mismatch" as const,
      label: "No verificado",
      detail: employeeOption?.dailySalaryRiVerificationDetail ??
        entry.dailySalaryRiVerificationDetail ??
        "El salario de Expedientes Laborales aun no esta verificado contra contrato."
    };
  }

  return {
    status: "match" as const,
    label: "Verificado",
    detail: "Coincide con Expedientes Laborales y el contrato laboral."
  };
}

function clampPercentage(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numeric));
}

function getMonthName(month: number) {
  return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}

function getTodayInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isFinanceUser(input: {
  team?: string;
  legacyTeam?: string;
  secondaryTeam?: string;
  secondaryLegacyTeam?: string;
  specificRole?: string;
  secondarySpecificRole?: string;
}) {
  return input.team === "FINANCE" ||
    input.secondaryTeam === "FINANCE" ||
    normalizeComparableText(input.legacyTeam) === "finanzas" ||
    normalizeComparableText(input.secondaryLegacyTeam) === "finanzas" ||
    normalizeComparableText(input.specificRole) === "finanzas" ||
    normalizeComparableText(input.secondarySpecificRole) === "finanzas";
}

function isAraceliLozano(input: {
  username?: string;
  displayName?: string;
  email?: string;
  team?: string;
  legacyTeam?: string;
  secondaryTeam?: string;
  secondaryLegacyTeam?: string;
  specificRole?: string;
  secondarySpecificRole?: string;
}) {
  const normalizedEmail = normalizeComparableText(input.email);
  const normalizedUsername = normalizeComparableText(input.username);
  const normalizedDisplayName = normalizeComparableText(input.displayName);
  return isFinanceUser(input) && (
    normalizedUsername === "araceli lozano" ||
    normalizedUsername === "araceli lozano escamilla" ||
    normalizedDisplayName === "araceli lozano" ||
    normalizedDisplayName === "araceli lozano escamilla" ||
    normalizedEmail.startsWith("araceli lozano") ||
    normalizedEmail.startsWith("araceli.lozano")
  );
}

function isEduardoRusconi(input: {
  username?: string;
  displayName?: string;
  email?: string;
}) {
  return (
    normalizeComparableText(input.username) === "eduardo rusconi" ||
    normalizeComparableText(input.displayName) === "eduardo rusconi" ||
    (input.email ?? "").toLowerCase().startsWith("eduardo.rusconi")
  );
}

function canReviewJnls(input: {
  role?: string;
  legacyRole?: string;
  team?: string;
  legacyTeam?: string;
  secondaryTeam?: string;
  secondaryLegacyTeam?: string;
  specificRole?: string;
  secondarySpecificRole?: string;
  permissions?: string[];
}) {
  return (
    input.role !== "SUPERADMIN" &&
    input.legacyRole !== "SUPERADMIN" &&
    (
      input.team === "AUDIT" ||
      input.secondaryTeam === "AUDIT" ||
      normalizeComparableText(input.legacyTeam) === "auditoria" ||
      normalizeComparableText(input.secondaryLegacyTeam) === "auditoria" ||
      normalizeComparableText(input.specificRole) === "auditor" ||
      normalizeComparableText(input.secondarySpecificRole) === "auditor"
    ) &&
    Boolean(input.permissions?.includes("general-expenses:jnls-approval:write"))
  );
}

function getIvaAmount(expense: GeneralExpense) {
  if (expense.paymentMethod === "Efectivo" || !expense.hasVat) {
    return null;
  }

  const amount = Number(expense.amountMxn || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount * 0.16;
}

function getDistributionPct(expense: GeneralExpense) {
  const pctLitigation = Number(expense.pctLitigation || 0);
  const pctCorporateLabor = Number(expense.pctCorporateLabor || 0);
  const pctSettlements = Number(expense.pctSettlements || 0);
  const pctFinancialLaw = Number(expense.pctFinancialLaw || 0);
  const pctTaxCompliance = Number(expense.pctTaxCompliance || 0);

  return {
    pctLitigation,
    pctCorporateLabor,
    pctSettlements,
    pctFinancialLaw,
    pctTaxCompliance,
    sum: pctLitigation + pctCorporateLabor + pctSettlements + pctFinancialLaw + pctTaxCompliance
  };
}

function distributeExpense(expense: GeneralExpense) {
  const result = {
    withoutTeam: 0,
    litigation: 0,
    corporateLabor: 0,
    settlements: 0,
    financialLaw: 0,
    taxCompliance: 0,
    totalPaid: 0
  };

  if (!expense.paid || !expense.paidAt) {
    return result;
  }

  const amount = Number(expense.amountMxn || 0);
  if (expense.expenseWithoutTeam) {
    result.withoutTeam = amount;
    result.totalPaid = amount;
    return result;
  }

  if (expense.generalExpense) {
    const split = amount / 5;
    result.litigation = split;
    result.corporateLabor = split;
    result.settlements = split;
    result.financialLaw = split;
    result.taxCompliance = split;
    result.totalPaid = amount;
    return result;
  }

  const distribution = getDistributionPct(expense);
  if (distribution.sum > 0) {
    result.litigation = amount * (distribution.pctLitigation / 100);
    result.corporateLabor = amount * (distribution.pctCorporateLabor / 100);
    result.settlements = amount * (distribution.pctSettlements / 100);
    result.financialLaw = amount * (distribution.pctFinancialLaw / 100);
    result.taxCompliance = amount * (distribution.pctTaxCompliance / 100);
    if (distribution.sum < 100) {
      result.withoutTeam = amount * ((100 - distribution.sum) / 100);
    }
  } else {
    switch (expense.team) {
      case "General": {
        const split = amount / 5;
        result.litigation = split;
        result.corporateLabor = split;
        result.settlements = split;
        result.financialLaw = split;
        result.taxCompliance = split;
        break;
      }
      case "Litigio":
        result.litigation = amount;
        break;
      case "Corporativo y laboral":
        result.corporateLabor = amount;
        break;
      case "Convenios":
        result.settlements = amount;
        break;
      case "Der Financiero":
        result.financialLaw = amount;
        break;
      case "Compliance Fiscal":
        result.taxCompliance = amount;
        break;
      case "Sin equipo":
      default:
        result.withoutTeam = amount;
        break;
    }
  }

  result.totalPaid = amount;
  return result;
}

function isRowIncomplete(expense: GeneralExpense) {
  if (!expense.detail || expense.detail.trim() === "") return true;
  if (!expense.amountMxn || Number(expense.amountMxn) === 0) return true;
  if (!expense.expenseWithoutTeam && !expense.generalExpense) {
    const { sum } = getDistributionPct(expense);
    if (sum !== 100) return true;
  }
  if (!expense.paymentMethod) return true;
  if (expense.paymentMethod === "Transferencia" && !expense.bank) return true;
  if (!expense.approvedByEmrt) return true;
  if (!expense.reviewedByJnls) return true;
  if (!expense.paid) return true;
  if (!expense.paidAt) return true;
  return false;
}

function buildEmrtSummaryMessage(date: string, items: GeneralExpense[], total: number) {
  return [
    `Entrego a Araceli la suma de ${formatCurrency(total)} y el resumen:`,
    "",
    `Gastos pagados por EMRT el ${formatDateDisplay(date)}:`,
    ...items.map((item, index) => `${index + 1}. ${(item.detail || "Gasto sin detalle").trim()}`)
  ].join("\n");
}

function replaceExpense(items: GeneralExpense[], updated: GeneralExpense) {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function replaceEmrtAcknowledgement(
  items: GeneralExpenseEmrtDailyAcknowledgement[],
  updated: GeneralExpenseEmrtDailyAcknowledgement
) {
  const next = items.some((item) => item.id === updated.id)
    ? items.map((item) => (item.id === updated.id ? updated : item))
    : [...items, updated];

  return next.sort((left, right) => toDateInput(left.paidByEmrtDate).localeCompare(toDateInput(right.paidByEmrtDate)));
}

function mergeRecordsPreservingOrder(current: GeneralExpense[], incoming: GeneralExpense[]) {
  if (current.length === 0) {
    return incoming;
  }

  const currentOrder = new Map(current.map((item, index) => [item.id, index]));
  return incoming
    .map((item, incomingIndex) => ({
      item,
      incomingIndex,
      orderIndex: currentOrder.get(item.id) ?? Number.MAX_SAFE_INTEGER
    }))
    .sort((left, right) => (
      left.orderIndex - right.orderIndex ||
      left.incomingIndex - right.incomingIndex
    ))
    .map(({ item }) => item);
}

function replacePayrollEntry(items: GeneralExpensePayrollEntry[], updated: GeneralExpensePayrollEntry) {
  return applyPayrollCalculationsToEntries(items.map((item) => (item.id === updated.id ? updated : item)));
}

function getPayrollGrossSalaryMxn(entry: Pick<GeneralExpensePayrollEntry, "dailySalaryMxn">) {
  return Number(entry.dailySalaryMxn || 0) * 15;
}

function getPayrollAbsenceDiscountMxn(entry: Pick<GeneralExpensePayrollEntry, "dailySalaryMxn" | "absenceDays">) {
  return Number(entry.dailySalaryMxn || 0) * Number(entry.absenceDays || 0);
}

function getPayrollBonusMxn(netSalaryMxn: number) {
  return Math.round(Math.max(0, (Number.isFinite(netSalaryMxn) ? netSalaryMxn : 0) * PAYROLL_BONUS_RATE) * 100) / 100;
}

function getPayrollEmployeeBonusKey(entry: GeneralExpensePayrollEntry) {
  if (entry.laborFileId) {
    return `labor:${entry.laborFileId}`;
  }

  const normalizedName = normalizeComparableText(entry.employeeName);
  return normalizedName ? `name:${normalizedName}` : `entry:${entry.id}`;
}

function applyPayrollCalculations(
  entry: GeneralExpensePayrollEntry,
  monthlyNetSalaryMxn = entry.half === 2 ? Number(entry.netSalaryMxn || 0) : 0
): GeneralExpensePayrollEntry {
  const grossSalaryMxn = getPayrollGrossSalaryMxn(entry);
  const overtimeHourlyRateMxn = (Number(entry.dailySalaryMxn || 0) / 8) * 2;
  const overtimeTotalMxn = overtimeHourlyRateMxn * Number(entry.overtimeHours || 0);
  const vacationPremiumMxn = Number(entry.vacationPremiumMxn || 0);
  const absenceDiscountMxn = getPayrollAbsenceDiscountMxn(entry);
  const netSalaryMxn = grossSalaryMxn - absenceDiscountMxn;
  const monthlyBonusMxn = entry.half === 2 ? getPayrollBonusMxn(monthlyNetSalaryMxn) : 0;
  const punctualityBonusExcluded = Boolean(entry.punctualityBonusExcluded);
  const attendanceBonusExcluded = Boolean(entry.attendanceBonusExcluded);
  const punctualityBonusMxn = punctualityBonusExcluded ? 0 : monthlyBonusMxn;
  const attendanceBonusMxn = attendanceBonusExcluded ? 0 : monthlyBonusMxn;
  const payrollWithholdingsMxn = (
    Number(entry.isrWithholdingMxn || 0) +
    Number(entry.imssWithholdingMxn || 0) +
    Number(entry.infonavitCreditMxn || 0)
  );
  const netDepositMxn = (
    netSalaryMxn +
    punctualityBonusMxn +
    attendanceBonusMxn +
    vacationPremiumMxn +
    overtimeTotalMxn +
    Number(entry.employmentSubsidyMxn || 0) -
    payrollWithholdingsMxn
  );

  return {
    ...entry,
    grossSalaryMxn,
    punctualityBonusMxn,
    attendanceBonusMxn,
    punctualityBonusExcluded,
    attendanceBonusExcluded,
    absenceDiscountMxn,
    netSalaryMxn,
    overtimeHourlyRateMxn,
    overtimeTotalMxn,
    netDepositMxn
  };
}

function applyPayrollCalculationsToEntries(entries: GeneralExpensePayrollEntry[]) {
  const monthlyNetSalaryByEmployee = new Map<string, number>();

  entries.forEach((entry) => {
    const grossSalaryMxn = getPayrollGrossSalaryMxn(entry);
    const absenceDiscountMxn = getPayrollAbsenceDiscountMxn(entry);
    const netSalaryMxn = grossSalaryMxn - absenceDiscountMxn;
    const key = getPayrollEmployeeBonusKey(entry);
    monthlyNetSalaryByEmployee.set(key, (monthlyNetSalaryByEmployee.get(key) ?? 0) + netSalaryMxn);
  });

  return entries.map((entry) => applyPayrollCalculations(
    entry,
    monthlyNetSalaryByEmployee.get(getPayrollEmployeeBonusKey(entry)) ?? 0
  ));
}

function applyLocalPatch(expense: GeneralExpense, patch: GeneralExpensePatchPayload): GeneralExpense {
  const next: GeneralExpense = {
    ...expense,
    ...(patch as Partial<GeneralExpense>)
  };

  if (Object.prototype.hasOwnProperty.call(patch, "bank") && patch.bank == null) {
    next.bank = undefined;
  }

  if (patch.paymentMethod === "Efectivo") {
    next.hasVat = false;
    next.bank = undefined;
    next.emrtReimbursementPending = false;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "paidByEmrtAt") && !patch.paidByEmrtAt) {
    next.paidByEmrtAt = undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "paidAt") && !patch.paidAt) {
    next.paidAt = undefined;
  }

  return next;
}

function getApprovedByEmrtPatch(approvedByEmrt: boolean): GeneralExpensePatchPayload {
  return approvedByEmrt
    ? { approvedByEmrt }
    : { approvedByEmrt, paidByEmrtAt: null };
}

function applyPayrollLocalPatch(
  entry: GeneralExpensePayrollEntry,
  patch: PayrollLocalPatchPayload
): GeneralExpensePayrollEntry {
  const next: GeneralExpensePayrollEntry = {
    ...entry,
    ...patch,
    laborFileId: patch.laborFileId === null ? undefined : patch.laborFileId ?? entry.laborFileId
  };

  return applyPayrollCalculations(next);
}

export function GeneralExpensesPage() {
  const { user } = useAuth();
  const now = new Date();
  const expensePatchSequenceRef = useRef<Record<string, number>>({});
  const payrollPatchSequenceRef = useRef<Record<string, number>>({});
  const expenseRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [activeTab, setActiveTab] = useState<ActiveTab>("registro");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<GeneralExpense[]>([]);
  const [emrtAcknowledgements, setEmrtAcknowledgements] = useState<GeneralExpenseEmrtDailyAcknowledgement[]>([]);
  const [payrollEntries, setPayrollEntries] = useState<GeneralExpensePayrollEntry[]>([]);
  const [payrollEmployeeOptions, setPayrollEmployeeOptions] = useState<GeneralExpensePayrollEmployeeOption[]>([]);
  const [drafts, setDrafts] = useState<ExpenseDraftMap>({});
  const [payrollDrafts, setPayrollDrafts] = useState<PayrollDraftMap>({});
  const [loading, setLoading] = useState(true);
  const [loadingEmrtAcknowledgements, setLoadingEmrtAcknowledgements] = useState(true);
  const [loadingPayroll, setLoadingPayroll] = useState(true);
  const [loadingPayrollEmployees, setLoadingPayrollEmployees] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingPayrollEntryId, setDeletingPayrollEntryId] = useState<string | null>(null);
  const [pendingScrollExpenseId, setPendingScrollExpenseId] = useState<string | null>(null);

  const effectivePermissions = useMemo(() => user ? deriveEffectivePermissions({
    legacyRole: user.legacyRole as LegacyAccessRole,
    team: user.team,
    legacyTeam: user.legacyTeam,
    secondaryTeam: user.secondaryTeam,
    secondaryLegacyTeam: user.secondaryLegacyTeam,
    specificRole: user.specificRole,
    secondarySpecificRole: user.secondarySpecificRole,
    permissions: user.permissions,
    isExternal: user.isExternal
  }) : [], [user]);
  const canRead = hasPermission(effectivePermissions, "general-expenses:read") || hasPermission(effectivePermissions, "general-expenses:write");
  const canWrite = hasPermission(effectivePermissions, "general-expenses:write");
  const canApprove = Boolean(user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN");
  const canStampPayroll = Boolean(user && isAraceliLozano({
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    team: user.team,
    legacyTeam: user.legacyTeam,
    secondaryTeam: user.secondaryTeam,
    secondaryLegacyTeam: user.secondaryLegacyTeam,
    specificRole: user.specificRole,
    secondarySpecificRole: user.secondarySpecificRole
  }));
  const canPay = Boolean(user && isFinanceUser({
    team: user.team,
    legacyTeam: user.legacyTeam,
    secondaryTeam: user.secondaryTeam,
    secondaryLegacyTeam: user.secondaryLegacyTeam,
    specificRole: user.specificRole,
    secondarySpecificRole: user.secondarySpecificRole
  }));
  const canEditEmrtDate = Boolean(user && isEduardoRusconi({ username: user.username, displayName: user.displayName, email: user.email }));
  const canEditEmrtReimbursement = canApprove && canEditEmrtDate;
  const canReceiveEmrtCashAsAle = canStampPayroll;
  const canConfirmEmrtCashPayment = canApprove && canEditEmrtDate;
  const canReviewJnlsFlag = Boolean(user && canReviewJnls({
    role: user.role,
    legacyRole: user.legacyRole,
    team: user.team,
    legacyTeam: user.legacyTeam,
    secondaryTeam: user.secondaryTeam,
    secondaryLegacyTeam: user.secondaryLegacyTeam,
    specificRole: user.specificRole,
    secondarySpecificRole: user.secondarySpecificRole,
    permissions: effectivePermissions
  }));

  const emrtAcknowledgementsByDate = useMemo(() => new Map(
    emrtAcknowledgements.map((acknowledgement): [string, GeneralExpenseEmrtDailyAcknowledgement] => [
      toDateInput(acknowledgement.paidByEmrtDate),
      acknowledgement
    ])
  ), [emrtAcknowledgements]);

  function getEmrtAcknowledgementForExpense(expense: GeneralExpense) {
    const dateKey = toDateInput(expense.paidByEmrtAt);
    return dateKey ? emrtAcknowledgementsByDate.get(dateKey) : undefined;
  }

  function isExpensePreEmrtLocked(expense: GeneralExpense) {
    return Boolean(getEmrtAcknowledgementForExpense(expense)?.receivedByAle);
  }

  async function loadRecords() {
    if (!canRead) {
      setRecords([]);
      setLoading(false);
      setErrorMessage("No tienes permisos para consultar Gastos generales.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiGet<GeneralExpense[]>(`/general-expenses?year=${selectedYear}&month=${selectedMonth}`);
      setRecords((current) => mergeRecordsPreservingOrder(current, response));
      setDrafts({});
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadEmrtAcknowledgements() {
    if (!canRead) {
      setEmrtAcknowledgements([]);
      setLoadingEmrtAcknowledgements(false);
      return;
    }

    setLoadingEmrtAcknowledgements(true);

    try {
      const response = await apiGet<GeneralExpenseEmrtDailyAcknowledgement[]>(
        `/general-expenses/emrt-acknowledgements?year=${selectedYear}&month=${selectedMonth}`
      );
      setEmrtAcknowledgements(response);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoadingEmrtAcknowledgements(false);
    }
  }

  async function loadPayrollEntries() {
    if (!canRead) {
      setPayrollEntries([]);
      setLoadingPayroll(false);
      return;
    }

    setLoadingPayroll(true);
    setErrorMessage(null);

    try {
      const response = await apiGet<GeneralExpensePayrollEntry[]>(`/general-expenses/payroll?year=${selectedYear}&month=${selectedMonth}`);
      setPayrollEntries(applyPayrollCalculationsToEntries(response));
      setPayrollDrafts({});
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoadingPayroll(false);
    }
  }

  async function loadPayrollEmployeeOptions() {
    if (!canRead) {
      setPayrollEmployeeOptions([]);
      setLoadingPayrollEmployees(false);
      return;
    }

    setLoadingPayrollEmployees(true);

    try {
      const response = await apiGet<GeneralExpensePayrollEmployeeOption[]>("/general-expenses/payroll-employees");
      setPayrollEmployeeOptions(response);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoadingPayrollEmployees(false);
    }
  }

  useEffect(() => {
    void loadRecords();
    void loadEmrtAcknowledgements();
  }, [canRead, selectedMonth, selectedYear]);

  useEffect(() => {
    void loadPayrollEntries();
  }, [canRead, selectedMonth, selectedYear]);

  useEffect(() => {
    void loadPayrollEmployeeOptions();
  }, [canRead]);

  useEffect(() => {
    if (activeTab !== "registro" || !pendingScrollExpenseId) {
      return;
    }

    if (!records.some((item) => item.id === pendingScrollExpenseId)) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const row = expenseRowRefs.current.get(pendingScrollExpenseId);
      if (!row) {
        return;
      }

      row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      const firstEditableField = row.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "textarea:not(:disabled), input:not([type='checkbox']):not(:disabled), select:not(:disabled)"
      );
      firstEditableField?.focus({ preventScroll: true });
      setPendingScrollExpenseId(null);
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [activeTab, pendingScrollExpenseId, records]);

  function setDraft(expenseId: string, field: ExpenseDraftField, value: string) {
    setDrafts((current) => ({
      ...current,
      [expenseId]: {
        ...current[expenseId],
        [field]: value
      }
    }));
  }

  function clearDraft(expenseId: string, field: ExpenseDraftField) {
    setDrafts((current) => {
      if (!current[expenseId]) {
        return current;
      }

      const nextFields = { ...current[expenseId] };
      delete nextFields[field];

      if (Object.keys(nextFields).length === 0) {
        const next = { ...current };
        delete next[expenseId];
        return next;
      }

      return {
        ...current,
        [expenseId]: nextFields
      };
    });
  }

  function clearDraftFields(expenseId: string, fields: ExpenseDraftField[]) {
    fields.forEach((field) => clearDraft(expenseId, field));
  }

  function setPayrollDraft(entryId: string, field: PayrollDraftField, value: string) {
    setPayrollDrafts((current) => ({
      ...current,
      [entryId]: {
        ...current[entryId],
        [field]: value
      }
    }));
  }

  function clearPayrollDraft(entryId: string, field: PayrollDraftField) {
    setPayrollDrafts((current) => {
      if (!current[entryId]) {
        return current;
      }

      const nextFields = { ...current[entryId] };
      delete nextFields[field];

      if (Object.keys(nextFields).length === 0) {
        const next = { ...current };
        delete next[entryId];
        return next;
      }

      return {
        ...current,
        [entryId]: nextFields
      };
    });
  }

  function updateExpenseLocal(expenseId: string, patch: GeneralExpensePatchPayload) {
    setRecords((items) => items.map((item) => (item.id === expenseId ? applyLocalPatch(item, patch) : item)));
  }

  function updatePayrollEntryLocal(entryId: string, patch: PayrollLocalPatchPayload) {
    setPayrollEntries((items) => applyPayrollCalculationsToEntries(
      items.map((item) => (item.id === entryId ? applyPayrollLocalPatch(item, patch) : item))
    ));
  }

  async function persistExpensePatch(
    expenseId: string,
    payload: GeneralExpensePatchPayload,
    localPatch: GeneralExpensePatchPayload = payload
  ) {
    const canApplyPrivilegedPatch = (
      (Object.prototype.hasOwnProperty.call(payload, "approvedByEmrt") && canApprove) ||
      (Object.prototype.hasOwnProperty.call(payload, "paidByEmrtAt") && canEditEmrtDate) ||
      (Object.prototype.hasOwnProperty.call(payload, "emrtReimbursementPending") && canEditEmrtReimbursement) ||
      (Object.prototype.hasOwnProperty.call(payload, "reviewedByJnls") && canReviewJnlsFlag) ||
      (Object.prototype.hasOwnProperty.call(payload, "paid") && canPay)
    );

    if (!canWrite && !canApplyPrivilegedPatch) {
      return;
    }

    updateExpenseLocal(expenseId, localPatch);
    const requestSequence = (expensePatchSequenceRef.current[expenseId] ?? 0) + 1;
    expensePatchSequenceRef.current[expenseId] = requestSequence;

    try {
      const updated = await apiPatch<GeneralExpense>(`/general-expenses/${expenseId}`, payload);
      if (expensePatchSequenceRef.current[expenseId] !== requestSequence) {
        return;
      }

      setRecords((items) => replaceExpense(items, updated));
    } catch (error) {
      if (expensePatchSequenceRef.current[expenseId] !== requestSequence) {
        return;
      }

      setErrorMessage(toErrorMessage(error));
      await loadRecords();
    }
  }

  async function persistEmrtAcknowledgement(date: string, payload: EmrtAcknowledgementPatchPayload) {
    const payloadKeys = Object.keys(payload);
    if (payloadKeys.length !== 1) {
      return;
    }

    try {
      const updated = await apiPatch<GeneralExpenseEmrtDailyAcknowledgement>(
        `/general-expenses/emrt-acknowledgements/${date}`,
        payload
      );
      setEmrtAcknowledgements((items) => replaceEmrtAcknowledgement(items, updated));
      await loadRecords();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadEmrtAcknowledgements();
      await loadRecords();
    }
  }

  async function flushDraftField(expenseId: string, field: ExpenseDraftField) {
    const rawValue = drafts[expenseId]?.[field];
    if (rawValue === undefined) {
      return;
    }

    clearDraft(expenseId, field);

    if (field === "detail") {
      await persistExpensePatch(expenseId, { detail: rawValue }, { detail: rawValue });
      return;
    }

    const numericValue = field === "amountMxn"
      ? Math.max(0, parseMoneyInput(rawValue))
      : clampPercentage(Number(rawValue || 0));

    await persistExpensePatch(
      expenseId,
      { [field]: numericValue } as GeneralExpensePatchPayload,
      { [field]: numericValue } as GeneralExpensePatchPayload
    );
  }

  async function persistPayrollPatch(
    entryId: string,
    payload: PayrollPatchPayload,
    localPatch: PayrollLocalPatchPayload = payload
  ) {
    const currentEntry = payrollEntries.find((entry) => entry.id === entryId);
    const payloadKeys = Object.keys(payload);
    const isFinalApprovalOnlyPatch = payloadKeys.length === 1 && Object.prototype.hasOwnProperty.call(payload, "finalPaymentApprovedByEmrt");

    if (currentEntry?.finalPaymentApprovedByEmrt && !isFinalApprovalOnlyPatch) {
      return;
    }

    const canApplyFinalApprovalPatch = Object.prototype.hasOwnProperty.call(payload, "finalPaymentApprovedByEmrt") && canApprove;
    const canApplyStampPatch = Object.prototype.hasOwnProperty.call(payload, "payrollStampedByAraceli") && canStampPayroll;
    const canApplyJnlsPatch = Object.prototype.hasOwnProperty.call(payload, "reviewedByJnls") && canReviewJnlsFlag;

    if (!canWrite && !canApplyFinalApprovalPatch && !canApplyStampPatch && !canApplyJnlsPatch) {
      return;
    }

    updatePayrollEntryLocal(entryId, localPatch);
    const requestSequence = (payrollPatchSequenceRef.current[entryId] ?? 0) + 1;
    payrollPatchSequenceRef.current[entryId] = requestSequence;

    try {
      const updated = await apiPatch<GeneralExpensePayrollEntry>(`/general-expenses/payroll/${entryId}`, payload);
      if (payrollPatchSequenceRef.current[entryId] !== requestSequence) {
        return;
      }

      setPayrollEntries((items) => replacePayrollEntry(items, updated));
    } catch (error) {
      if (payrollPatchSequenceRef.current[entryId] !== requestSequence) {
        return;
      }

      setErrorMessage(toErrorMessage(error));
      await loadPayrollEntries();
    }
  }

  async function flushPayrollDraftField(entryId: string, field: PayrollDraftField) {
    const rawValue = payrollDrafts[entryId]?.[field];
    if (rawValue === undefined) {
      return;
    }

    clearPayrollDraft(entryId, field);

    if (field === "overtimeDetail") {
      await persistPayrollPatch(entryId, { [field]: rawValue } as PayrollPatchPayload, { [field]: rawValue } as PayrollPatchPayload);
      return;
    }

    const numericValue = Math.max(0, isPayrollMoneyField(field) ? parseMoneyInput(rawValue) : Number(rawValue || 0));

    await persistPayrollPatch(
      entryId,
      { [field]: numericValue } as PayrollPatchPayload,
      { [field]: numericValue } as PayrollPatchPayload
    );
  }

  async function handleAddRow() {
    if (!canWrite) {
      return;
    }

    try {
      const created = await apiPost<GeneralExpense>("/general-expenses", {
        year: selectedYear,
        month: selectedMonth
      });
      setActiveTab("registro");
      setPendingScrollExpenseId(created.id);
      setRecords((items) => [...items, created]);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleAddPayrollEntry(half: GeneralExpensePayrollEntry["half"]) {
    if (!canWrite) {
      return;
    }

    try {
      const created = await apiPost<GeneralExpensePayrollEntry>("/general-expenses/payroll", {
        year: selectedYear,
        month: selectedMonth,
        half
      });
      setPayrollEntries((items) => applyPayrollCalculationsToEntries([...items, created]));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleDelete(expense: GeneralExpense) {
    if (!canWrite || expense.approvedByEmrt || isExpensePreEmrtLocked(expense)) {
      return;
    }

    if (!window.confirm("Eliminar este gasto?")) {
      return;
    }

    try {
      await apiDelete(`/general-expenses/${expense.id}`);
      setRecords((items) => items.filter((item) => item.id !== expense.id));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleDeletePayrollEntry(entry: GeneralExpensePayrollEntry) {
    if (!canWrite || entry.finalPaymentApprovedByEmrt || deletingPayrollEntryId) {
      return;
    }

    const employeeLabel = entry.employeeName || "esta fila";
    if (!window.confirm(`Eliminar la fila de nómina de ${employeeLabel}?`)) {
      return;
    }

    setDeletingPayrollEntryId(entry.id);

    try {
      await apiDelete(`/general-expenses/payroll/${entry.id}`);
      setPayrollEntries((items) => applyPayrollCalculationsToEntries(items.filter((item) => item.id !== entry.id)));
      setPayrollDrafts((current) => {
        if (!current[entry.id]) {
          return current;
        }

        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      delete payrollPatchSequenceRef.current[entry.id];
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadPayrollEntries();
    } finally {
      setDeletingPayrollEntryId(null);
    }
  }

  async function handleCopyToNextMonth() {
    if (!canWrite) {
      return;
    }

    const recurringRows = records.filter((item) => item.recurring);
    if (recurringRows.length === 0) {
      window.alert("No hay gastos marcados como recurrentes para copiar.");
      return;
    }

    const nextMonthDate = new Date(selectedYear, selectedMonth, 1);
    const targetYear = nextMonthDate.getFullYear();
    const targetMonth = nextMonthDate.getMonth() + 1;

    if (!window.confirm(`Copiar ${recurringRows.length} gastos recurrentes de ${getMonthName(selectedMonth)}/${selectedYear} a ${getMonthName(targetMonth)}/${targetYear}?`)) {
      return;
    }

    try {
      const result = await apiPost<CopyNextMonthResult>("/general-expenses/copy-to-next-month", {
        year: selectedYear,
        month: selectedMonth
      });

      window.alert(`${result.copied} gastos copiados exitosamente a ${getMonthName(result.month)}.`);
      if (window.confirm("Ir al mes siguiente?")) {
        setSelectedYear(result.year);
        setSelectedMonth(result.month);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleCopyPayrollToNextMonth() {
    if (!canWrite) {
      return;
    }

    if (payrollEntries.length === 0) {
      window.alert("No hay registros de nómina para copiar.");
      return;
    }

    const nextMonthDate = new Date(selectedYear, selectedMonth, 1);
    const targetYear = nextMonthDate.getFullYear();
    const targetMonth = nextMonthDate.getMonth() + 1;

    const confirmed = window.confirm(
      `Copiar ${payrollEntries.length} registros de nómina de ${getMonthName(selectedMonth)}/${selectedYear} a ${getMonthName(targetMonth)}/${targetYear}?\n\n` +
      "Se copiarán empleados, salarios, bonos, retenciones, subsidio e Infonavit. Las faltas, horas extra y autorizaciones EMRT se reiniciarán para evitar pagos accidentales."
    );
    if (!confirmed) {
      return;
    }

    try {
      const result = await apiPost<CopyNextMonthResult>("/general-expenses/payroll/copy-to-next-month", {
        year: selectedYear,
        month: selectedMonth
      });

      if (result.copied === 0) {
        window.alert("No se copiaron registros porque este mes no tiene nómina capturada.");
        return;
      }

      window.alert(`${result.copied} registros de nómina copiados exitosamente a ${getMonthName(result.month)}.`);
      if (window.confirm("Ir al mes siguiente?")) {
        setSelectedYear(result.year);
        setSelectedMonth(result.month);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleDistributionModeChange(
    expense: GeneralExpense,
    field: "generalExpense" | "expenseWithoutTeam",
    checked: boolean
  ) {
    if (!canWrite || expense.approvedByEmrt || isExpensePreEmrtLocked(expense)) {
      return;
    }

    const payload: GeneralExpensePatchPayload = checked
      ? field === "generalExpense"
        ? {
            generalExpense: true,
            expenseWithoutTeam: false,
            pctLitigation: 20,
            pctCorporateLabor: 20,
            pctSettlements: 20,
            pctFinancialLaw: 20,
            pctTaxCompliance: 20
          }
        : {
            generalExpense: false,
            expenseWithoutTeam: true,
            pctLitigation: 0,
            pctCorporateLabor: 0,
            pctSettlements: 0,
            pctFinancialLaw: 0,
            pctTaxCompliance: 0
          }
      : field === "generalExpense"
        ? { generalExpense: false }
        : { expenseWithoutTeam: false };

    clearDraftFields(expense.id, PCT_DRAFT_FIELDS);
    void persistExpensePatch(expense.id, payload);
  }

  function handlePaidByEmrtDateChange(expense: GeneralExpense, nextDate: string | null) {
    if (nextDate && emrtAcknowledgementsByDate.get(nextDate)?.receivedByAle) {
      setErrorMessage("Ese dia ya fue marcado como recibido por ALE. Desmarca el acuse diario antes de asignar mas gastos.");
      return;
    }

    void persistExpensePatch(expense.id, { paidByEmrtAt: nextDate });
  }

  const totals = useMemo(
    () =>
      records.reduce(
        (accumulator, expense) => {
          const distribution = distributeExpense(expense);
          return {
            totalAmount: accumulator.totalAmount + Number(expense.amountMxn || 0),
            totalLimit: accumulator.totalLimit + (expense.countsTowardLimit ? Number(expense.amountMxn || 0) : 0),
            withoutTeam: accumulator.withoutTeam + distribution.withoutTeam,
            litigation: accumulator.litigation + distribution.litigation,
            corporateLabor: accumulator.corporateLabor + distribution.corporateLabor,
            settlements: accumulator.settlements + distribution.settlements,
            financialLaw: accumulator.financialLaw + distribution.financialLaw,
            taxCompliance: accumulator.taxCompliance + distribution.taxCompliance,
            totalPaid: accumulator.totalPaid + distribution.totalPaid
          };
        },
        {
          totalAmount: 0,
          totalLimit: 0,
          withoutTeam: 0,
          litigation: 0,
          corporateLabor: 0,
          settlements: 0,
          financialLaw: 0,
          taxCompliance: 0,
          totalPaid: 0
        }
      ),
    [records]
  );

  const emrtDailyTotals = useMemo(() => {
    const grouped = records.reduce<Record<string, { total: number; items: GeneralExpense[] }>>((accumulator, expense) => {
      if (!expense.approvedByEmrt) {
        return accumulator;
      }

      const key = toDateInput(expense.paidByEmrtAt);
      if (!key) {
        return accumulator;
      }

      if (!accumulator[key]) {
        accumulator[key] = {
          total: 0,
          items: []
        };
      }

      accumulator[key].items.push(expense);
      accumulator[key].total += Number(expense.amountMxn || 0);
      return accumulator;
    }, {});

    return Object.entries(grouped)
      .map(([date, data]) => {
        const acknowledgement = emrtAcknowledgementsByDate.get(date);
        const useSnapshot = Boolean(acknowledgement?.receivedByAle);
        const total = useSnapshot ? Number(acknowledgement?.totalMxn || 0) : data.total;

        return {
          date,
          total,
          items: data.items,
          acknowledgement,
          summaryMessage: useSnapshot && acknowledgement
            ? acknowledgement.summaryMessage
            : buildEmrtSummaryMessage(date, data.items, data.total)
        };
      })
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [emrtAcknowledgementsByDate, records]);

  const emrtGrandTotal = useMemo(
    () => emrtDailyTotals.reduce((sum, item) => sum + item.total, 0),
    [emrtDailyTotals]
  );

  const payrollEntriesByHalf = useMemo(() => ({
    1: payrollEntries.filter((entry) => entry.half === 1),
    2: payrollEntries.filter((entry) => entry.half === 2)
  }), [payrollEntries]);

  const payrollNetDepositTotalMxn = useMemo(
    () => payrollEntries.reduce((total, entry) => total + Number(entry.netDepositMxn || 0), 0),
    [payrollEntries]
  );

  const registeredExpensesTotalMxn = totals.totalAmount + payrollNetDepositTotalMxn;

  const payrollEmployeeOptionsById = useMemo(() => new Map<string, GeneralExpensePayrollEmployeeOption>(
    payrollEmployeeOptions.map((option): [string, GeneralExpensePayrollEmployeeOption] => [option.laborFileId, option])
  ), [payrollEmployeeOptions]);

  function handlePayrollEmployeeChange(entry: GeneralExpensePayrollEntry, laborFileId: string) {
    const selectedEmployee = payrollEmployeeOptionsById.get(laborFileId);
    const localPatch: PayrollLocalPatchPayload = selectedEmployee
      ? {
          laborFileId,
          employeeName: selectedEmployee.employeeName,
          dailySalaryMxn: selectedEmployee.dailySalaryMxn,
          laborFileDailySalaryMxn: selectedEmployee.dailySalaryMxn,
          dailySalaryRiVerified: selectedEmployee.dailySalaryRiVerified,
          dailySalaryRiVerificationDetail: selectedEmployee.dailySalaryRiVerificationDetail
        }
      : {
          laborFileId: null,
          employeeName: "",
          dailySalaryMxn: 0,
          laborFileDailySalaryMxn: undefined,
          dailySalaryRiVerified: false,
          dailySalaryRiVerificationDetail: "Sin expediente laboral vinculado."
        };

    void persistPayrollPatch(entry.id, { laborFileId: selectedEmployee ? laborFileId : null }, localPatch);
  }

  function handlePayrollPartTimeChange(entry: GeneralExpensePayrollEntry, isPartTime: boolean) {
    if (!isPartTime) {
      clearPayrollDraft(entry.id, "overtimeDetail");
    }

    void persistPayrollPatch(
      entry.id,
      isPartTime ? { isPartTime } : { isPartTime, overtimeDetail: "" },
      isPartTime ? { isPartTime } : { isPartTime, overtimeDetail: "" }
    );
  }

  function renderPayrollBonusCell(
    entry: GeneralExpensePayrollEntry,
    amountMxn: number,
    excludedField: "punctualityBonusExcluded" | "attendanceBonusExcluded",
    bonusLabel: string
  ) {
    const excluded = Boolean(entry[excludedField]);
    const disabled = !canWrite || entry.finalPaymentApprovedByEmrt || entry.half !== 2;
    const title = entry.half !== 2
      ? "Los bonos se pagan en la segunda quincena."
      : excluded
        ? `${bonusLabel} excluido del pago.`
        : "Se paga al 100% en la segunda quincena; cada bono es 10% del salario neto mensual.";

    return (
      <div className={`general-expense-payroll-bonus-cell ${excluded ? "is-excluded" : ""}`}>
        <div className="general-expense-readonly-cell" title={title}>
          {formatCurrency(amountMxn)}
        </div>
        <label className={`general-expense-inline-checkbox general-expense-payroll-bonus-exclusion ${disabled ? "is-disabled" : ""}`}>
          <input
            type="checkbox"
            checked={excluded}
            onChange={(event) => void persistPayrollPatch(
              entry.id,
              { [excludedField]: event.target.checked } as PayrollPatchPayload,
              { [excludedField]: event.target.checked } as PayrollLocalPatchPayload
            )}
            disabled={disabled}
            title={title}
          />
          <span>Excluir</span>
        </label>
      </div>
    );
  }

  function renderPayrollMoneyInput(
    entry: GeneralExpensePayrollEntry,
    field: (typeof PAYROLL_MONEY_FIELDS)[number]
  ) {
    return (
      <div className="general-expense-currency-input">
        <span aria-hidden="true">$</span>
        <input
          className="general-expense-input general-expense-number-input"
          type="text"
          inputMode="decimal"
          value={payrollDrafts[entry.id]?.[field] ?? formatEditableMoney(Number(entry[field] || 0))}
          onChange={(event) => setPayrollDraft(entry.id, field, formatMoneyDraftValue(event.target.value))}
          onBlur={() => void flushPayrollDraftField(entry.id, field)}
          disabled={!canWrite || entry.finalPaymentApprovedByEmrt}
        />
      </div>
    );
  }

  function renderPayrollNumberInput(entry: GeneralExpensePayrollEntry, field: "absenceDays" | "overtimeHours") {
    return (
      <input
        className="general-expense-input general-expense-number-input"
        type="number"
        min="0"
        step="0.01"
        value={payrollDrafts[entry.id]?.[field] ?? formatEditableNumber(Number(entry[field] || 0))}
        onChange={(event) => setPayrollDraft(entry.id, field, event.target.value)}
        onBlur={() => void flushPayrollDraftField(entry.id, field)}
        disabled={!canWrite || entry.finalPaymentApprovedByEmrt}
      />
    );
  }

  function renderPayrollTable(half: GeneralExpensePayrollEntry["half"], title: string) {
    const rows = payrollEntriesByHalf[half];
    const netDepositTotalMxn = rows.reduce((total, entry) => total + Number(entry.netDepositMxn || 0), 0);

    return (
      <section className="panel">
        <div className="panel-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleAddPayrollEntry(half)}
            disabled={!canWrite}
          >
            + Agregar fila
          </button>
        </div>

        <div className="lead-table-shell">
          <div className="lead-table-wrapper general-expense-payroll-table-wrapper">
            <table className="lead-table general-expense-payroll-table">
              <thead>
                <tr>
                  <th>Nombre del colaborador</th>
                  <th>Medio tiempo</th>
                  <th>Salario diario</th>
                  <th>Salario bruto</th>
                  <th>Faltas</th>
                  <th>Salario neto</th>
                  <th>Días disfrutados por adelantado</th>
                  <th>Fecha en la que se pagará la prima vacacional</th>
                  <th>Días pagados</th>
                  <th>Días de vacaciones cuya prima vacacional es pagada esta quincena</th>
                  <th>Prima vacacional</th>
                  <th>Bono de puntualidad</th>
                  <th>Bono de asistencia</th>
                  <th>Horas extras (valor)</th>
                  <th>Número de horas extras</th>
                  <th>Total horas extras</th>
                  <th>Detalle de horas extras</th>
                  <th>Retenciones ISR</th>
                  <th>Retenciones IMSS</th>
                  <th>Subsidio al empleo</th>
                  <th>Credito Infonavit</th>
                  <th>Depósito neto</th>
                  <th>Confirmo que la nómina está timbrada (ALE)</th>
                  <th>Pago autorizado EMRT</th>
                  <th>Aprobado por JNLS</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loadingPayroll ? (
                  <tr>
                    <td colSpan={26} className="centered-inline-message">
                      Cargando nómina...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={26} className="centered-inline-message">
                      Sin registros de nómina en esta quincena.
                    </td>
                  </tr>
                ) : (
                  <>
                    {rows.map((entry) => {
                  const employeeOption = entry.laborFileId ? payrollEmployeeOptionsById.get(entry.laborFileId) : undefined;
                  const dailySalaryValidation = getPayrollDailySalaryRiValidation(entry, employeeOption);
                  const advanceVacationPaymentDate = formatDateDisplay(entry.advanceVacationPremiumPaymentDate);
                  const hasAdvanceVacationDays = Number(entry.advanceVacationDays || 0) > 0 || entry.advanceVacationDaysPaid;
                  const canToggleAdvanceVacationPaid = canWrite &&
                    hasAdvanceVacationDays &&
                    entry.advanceVacationDaysPaymentEligible &&
                    !entry.finalPaymentApprovedByEmrt;
                  const advanceVacationPaidTitle = !entry.advanceVacationPremiumPaymentDate
                    ? "Sin días disfrutados por adelantado."
                    : entry.advanceVacationDaysPaymentEligible
                      ? "Marcar cuando estos días ya fueron pagados."
                      : `Se habilita el ${advanceVacationPaymentDate}.`;

                  return (
                    <tr key={entry.id}>
                    <td>
                      <select
                        className="general-expense-input general-expense-payroll-employee-input"
                        value={entry.laborFileId ?? ""}
                        onChange={(event) => handlePayrollEmployeeChange(entry, event.target.value)}
                        disabled={!canWrite || loadingPayrollEmployees || entry.finalPaymentApprovedByEmrt}
                      >
                        <option value="">
                          {entry.laborFileId || !entry.employeeName ? "Seleccionar empleado" : `${entry.employeeName} (sin expediente)`}
                        </option>
                        {entry.laborFileId && !payrollEmployeeOptionsById.has(entry.laborFileId) ? (
                          <option value={entry.laborFileId}>{entry.employeeName || "Empleado seleccionado"}</option>
                        ) : null}
                        {payrollEmployeeOptions.map((option) => (
                          <option key={option.laborFileId} value={option.laborFileId}>
                            {option.employeeName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="general-expense-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={entry.isPartTime}
                        onChange={(event) => handlePayrollPartTimeChange(entry, event.target.checked)}
                        disabled={!canWrite || entry.finalPaymentApprovedByEmrt}
                        title="Marcar si el empleado es de medio tiempo."
                      />
                    </td>
                    <td>
                      <div className={`general-expense-readonly-cell general-expense-payroll-ri-salary is-${dailySalaryValidation.status}`}>
                        <span className="general-expense-payroll-ri-salary-main">
                          <RusconiIntelligenceBadge connectionId={PAYROLL_DAILY_SALARY_RI_CONNECTION_ID} label="Gastos generales / Nomina / Salario diario" />
                          <span>{formatCurrency(entry.dailySalaryMxn)}</span>
                        </span>
                        <span
                          aria-label={dailySalaryValidation.label}
                          className={`general-expense-payroll-ri-icon is-${dailySalaryValidation.status}`}
                          role="img"
                          title={dailySalaryValidation.detail}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="general-expense-readonly-cell">
                        {formatCurrency(entry.grossSalaryMxn)}
                      </div>
                    </td>
                    <td>{renderPayrollNumberInput(entry, "absenceDays")}</td>
                    <td>
                      <div
                        className="general-expense-readonly-cell is-payroll-net-salary"
                        title={`Salario bruto menos faltas: ${formatCurrency(entry.grossSalaryMxn)} - ${formatCurrency(entry.absenceDiscountMxn)}`}
                      >
                        {formatCurrency(entry.netSalaryMxn)}
                      </div>
                    </td>
                    <td>
                      <div
                        className="general-expense-readonly-cell general-expense-payroll-days-cell general-expense-payroll-advance-cell"
                        title="Días disfrutados antes del aniversario laboral que generan prima vacacional en esta fecha de corte."
                      >
                        {formatPayrollDays(entry.advanceVacationDays)}
                      </div>
                    </td>
                    <td>
                      <div
                        className="general-expense-readonly-cell general-expense-payroll-date-cell"
                        title="Fecha de corte en la que se adquiere el derecho para pagar la prima vacacional de estos días."
                      >
                        {advanceVacationPaymentDate}
                      </div>
                    </td>
                    <td className="general-expense-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={entry.advanceVacationDaysPaid}
                        onChange={(event) => void persistPayrollPatch(
                          entry.id,
                          { advanceVacationDaysPaid: event.target.checked },
                          {
                            advanceVacationDaysPaid: event.target.checked,
                            advanceVacationDays: event.target.checked ? 0 : entry.advanceVacationDays
                          }
                        )}
                        disabled={!canToggleAdvanceVacationPaid}
                        title={advanceVacationPaidTitle}
                      />
                    </td>
                    <td>
                      <div
                        className="general-expense-readonly-cell general-expense-payroll-days-cell"
                        title="Días de vacaciones aprobadas con PDF firmado en esta quincena."
                      >
                        {formatPayrollDays(entry.vacationDays)}
                      </div>
                    </td>
                    <td>
                      <div
                        className="general-expense-readonly-cell"
                        title="Prima calculada desde vacaciones aprobadas del expediente laboral."
                      >
                        {formatCurrency(entry.vacationPremiumMxn)}
                      </div>
                    </td>
                    <td>
                      {renderPayrollBonusCell(
                        entry,
                        entry.punctualityBonusMxn,
                        "punctualityBonusExcluded",
                        "Bono de puntualidad"
                      )}
                    </td>
                    <td>
                      {renderPayrollBonusCell(
                        entry,
                        entry.attendanceBonusMxn,
                        "attendanceBonusExcluded",
                        "Bono de asistencia"
                      )}
                    </td>
                    <td>
                      <div className="general-expense-readonly-cell">
                        {formatCurrency(entry.overtimeHourlyRateMxn)}
                      </div>
                    </td>
                    <td>{renderPayrollNumberInput(entry, "overtimeHours")}</td>
                    <td>
                      <div className="general-expense-readonly-cell">
                        {formatCurrency(entry.overtimeTotalMxn)}
                      </div>
                    </td>
                    <td>
                      {entry.isPartTime ? (
                        <textarea
                          className="general-expense-input general-expense-payroll-detail-input"
                          value={payrollDrafts[entry.id]?.overtimeDetail ?? entry.overtimeDetail}
                          onChange={(event) => setPayrollDraft(entry.id, "overtimeDetail", event.target.value)}
                          onBlur={() => void flushPayrollDraftField(entry.id, "overtimeDetail")}
                          rows={2}
                          disabled={!canWrite || entry.finalPaymentApprovedByEmrt}
                        />
                      ) : null}
                    </td>
                    <td>{renderPayrollMoneyInput(entry, "isrWithholdingMxn")}</td>
                    <td>{renderPayrollMoneyInput(entry, "imssWithholdingMxn")}</td>
                    <td>{renderPayrollMoneyInput(entry, "employmentSubsidyMxn")}</td>
                    <td>{renderPayrollMoneyInput(entry, "infonavitCreditMxn")}</td>
                    <td>
                      <div className="general-expense-readonly-cell is-payroll-total">
                        {formatCurrency(entry.netDepositMxn)}
                      </div>
                    </td>
                    <td className="general-expense-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={entry.payrollStampedByAraceli}
                        onChange={(event) => void persistPayrollPatch(entry.id, { payrollStampedByAraceli: event.target.checked })}
                        disabled={!canStampPayroll || entry.finalPaymentApprovedByEmrt}
                      />
                    </td>
                    <td className="general-expense-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={entry.finalPaymentApprovedByEmrt}
                        onChange={(event) => void persistPayrollPatch(entry.id, { finalPaymentApprovedByEmrt: event.target.checked })}
                        disabled={!canApprove}
                      />
                    </td>
                    <td className="general-expense-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={entry.reviewedByJnls}
                        onChange={(event) => void persistPayrollPatch(entry.id, { reviewedByJnls: event.target.checked })}
                        disabled={!canReviewJnlsFlag || entry.finalPaymentApprovedByEmrt}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger-button general-expense-delete-button"
                        onClick={() => void handleDeletePayrollEntry(entry)}
                        disabled={!canWrite || entry.finalPaymentApprovedByEmrt || Boolean(deletingPayrollEntryId)}
                        title={entry.finalPaymentApprovedByEmrt ? "La fila ya fue autorizada por EMRT y no puede borrarse." : "Borrar fila de nómina"}
                      >
                        {deletingPayrollEntryId === entry.id ? "Borrando..." : "Borrar"}
                      </button>
                    </td>
                    </tr>
                  );
                    })}
                    <tr className="general-expense-payroll-total-row">
                      <td colSpan={21}>Total pago neto de la quincena</td>
                      <td>
                        <div className="general-expense-readonly-cell is-payroll-total">
                          {formatCurrency(netDepositTotalMxn)}
                        </div>
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack general-expenses-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Gastos
          </span>
          <div>
            <h2>Gastos generales</h2>
          </div>
        </div>
        <p className="muted">
          Registro mensual de gastos, distribucion por equipo, bloqueo por aprobaciones y resumen diario de gastos
          pagados por EMRT.
        </p>
      </header>

      <section className="panel">
        <div className="leads-tabs" role="tablist" aria-label="Vistas de gastos generales">
          <button
            type="button"
            className={`lead-tab ${activeTab === "registro" ? "is-active" : ""}`}
            onClick={() => setActiveTab("registro")}
          >
            1. Registro
          </button>
          <button
            type="button"
            className={`lead-tab ${activeTab === "payroll" ? "is-active" : ""}`}
            onClick={() => setActiveTab("payroll")}
          >
            2. Nómina
          </button>
          <button
            type="button"
            className={`lead-tab ${activeTab === "emrt" ? "is-active" : ""}`}
            onClick={() => setActiveTab("emrt")}
          >
            3. Pagado por EMRT
          </button>
        </div>
      </section>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel general-expenses-toolbar">
        <div className="general-expenses-filters">
          <label className="form-field">
            <span>Año</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Mes</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              {MONTH_NAMES.map((monthName, index) => (
                <option key={monthName} value={index + 1}>
                  {monthName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="general-expenses-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => activeTab === "payroll" ? void loadPayrollEntries() : void loadRecords()}
          >
            Refrescar
          </button>
          {activeTab === "registro" ? (
            <>
              <button type="button" className="secondary-button" onClick={() => void handleCopyToNextMonth()} disabled={!canWrite}>
                Copiar a mes siguiente
              </button>
              <button type="button" className="primary-button" onClick={() => void handleAddRow()} disabled={!canWrite}>
                + Agregar Gasto
              </button>
            </>
          ) : activeTab === "payroll" ? (
            <button type="button" className="secondary-button" onClick={() => void handleCopyPayrollToNextMonth()} disabled={!canWrite}>
              Copiar nómina al mes siguiente
            </button>
          ) : null}
        </div>
      </section>

      {activeTab === "registro" ? (
        <>
          <section className="panel">
            <div className="general-expense-summary-grid">
              <article className="general-expense-summary-card is-total">
                <span>Total gastos registrados</span>
                <strong>{formatCurrency(registeredExpensesTotalMxn)}</strong>
              </article>
              <article className="general-expense-summary-card is-limit">
                <span>Total límite</span>
                <strong>{formatCurrency(totals.totalLimit)}</strong>
              </article>
              <article className="general-expense-summary-card is-paid">
                <span>Total pagado</span>
                <strong>{formatCurrency(totals.totalPaid)}</strong>
              </article>
              <article className="general-expense-summary-card is-pending">
                <span>Pendiente de pago</span>
                <strong>{formatCurrency(totals.totalAmount - totals.totalPaid)}</strong>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Registro mensual</h2>
              <span>{records.length} registros</span>
            </div>

            <div className="lead-table-shell">
              <div className="lead-table-wrapper general-expense-table-wrapper">
                <table className="lead-table general-expense-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Detalle de Gasto</th>
                      <th>Monto</th>
                      <th>IVA</th>
                      <th>¿Cuenta para límite?</th>
                      <th>Suma Límite</th>
                      <th>Gasto general</th>
                      <th>Gasto sin equipo</th>
                      {DISTRIBUTION_FIELDS.map((field) => (
                        <th key={field.key}>{field.label}</th>
                      ))}
                      <th>SUM %</th>
                      <th>Método</th>
                      <th>Banco</th>
                      <th>Gasto Recurrente</th>
                      <th>Aprobado EMRT</th>
                      <th>Fecha pagado por EMRT</th>
                      <th className="general-expense-emrt-reimbursement-column">Reembolso pendiente a favor de EMRT</th>
                      <th>Aprobado por JNLS</th>
                      <th>¿Pagado a receptor final?</th>
                      <th>Fecha Pago</th>
                      <th>Sin equipo</th>
                      <th>Litigio</th>
                      <th>Corporativo</th>
                      <th>Convenios</th>
                      <th>Financiero</th>
                      <th>Fiscal</th>
                      <th>Total Pagado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={31} className="centered-inline-message">
                          Cargando gastos...
                        </td>
                      </tr>
                    ) : records.length === 0 ? (
                      <tr>
                        <td colSpan={31} className="centered-inline-message">
                          No hay gastos registrados en este mes.
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        let runningLimit = 0;

                        return records.map((expense, index) => {
                          if (expense.countsTowardLimit) {
                            runningLimit += Number(expense.amountMxn || 0);
                          }

                          const distribution = distributeExpense(expense);
                          const ivaAmount = getIvaAmount(expense);
                          const { sum } = getDistributionPct(expense);
                          const preEmrtLocked = isExpensePreEmrtLocked(expense);
                          const protectedFieldDisabled = !canWrite || expense.approvedByEmrt || preEmrtLocked;
                          const pctDisabled = protectedFieldDisabled || expense.generalExpense || expense.expenseWithoutTeam;
                          const vatCheckboxDisabled = protectedFieldDisabled || expense.paymentMethod !== "Transferencia";
                          const rowIncomplete = isRowIncomplete(expense);
                          const draftAmount = drafts[expense.id]?.amountMxn ?? formatEditableMoney(Number(expense.amountMxn || 0));

                          return (
                            <tr
                              key={expense.id}
                              ref={(node) => {
                                if (node) {
                                  expenseRowRefs.current.set(expense.id, node);
                                  return;
                                }

                                expenseRowRefs.current.delete(expense.id);
                              }}
                              className={[
                                rowIncomplete ? "general-expense-row-danger" : "",
                                preEmrtLocked ? "general-expense-row-acknowledged" : ""
                              ].filter(Boolean).join(" ") || undefined}
                            >
                              <td className="general-expense-row-index">{index + 1}</td>
                              <td>
                                <textarea
                                  className="general-expense-input general-expense-textarea"
                                  value={drafts[expense.id]?.detail ?? expense.detail ?? ""}
                                  onChange={(event) => setDraft(expense.id, "detail", event.target.value)}
                                  onBlur={() => void flushDraftField(expense.id, "detail")}
                                  rows={2}
                                  disabled={protectedFieldDisabled}
                                />
                              </td>
                              <td>
                                <div className="general-expense-currency-input">
                                  <span aria-hidden="true">$</span>
                                  <input
                                    className="general-expense-input general-expense-number-input"
                                    type="text"
                                    inputMode="decimal"
                                    value={draftAmount}
                                    onChange={(event) => setDraft(expense.id, "amountMxn", formatMoneyDraftValue(event.target.value))}
                                    onBlur={() => void flushDraftField(expense.id, "amountMxn")}
                                    disabled={protectedFieldDisabled}
                                  />
                                </div>
                              </td>
                              <td>
                                <div className="general-expense-vat-stack">
                                  <div className={`general-expense-readonly-cell ${expense.paymentMethod === "Efectivo" ? "is-disabled" : ""}`}>
                                    {ivaAmount !== null ? formatCurrency(ivaAmount) : "-"}
                                  </div>
                                  {expense.paymentMethod === "Transferencia" ? (
                                    <label className={`general-expense-inline-checkbox ${vatCheckboxDisabled ? "is-disabled" : ""}`}>
                                      <input
                                        type="checkbox"
                                        checked={expense.hasVat}
                                        onChange={(event) => void persistExpensePatch(expense.id, { hasVat: event.target.checked })}
                                        disabled={vatCheckboxDisabled}
                                      />
                                      <span>Con IVA</span>
                                    </label>
                                  ) : null}
                                </div>
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.countsTowardLimit}
                                  onChange={(event) => void persistExpensePatch(expense.id, { countsTowardLimit: event.target.checked })}
                                  disabled={protectedFieldDisabled}
                                />
                              </td>
                              <td className={`general-expense-limit-cell ${expense.countsTowardLimit ? "is-active" : ""}`}>
                                {expense.countsTowardLimit ? formatCurrency(runningLimit) : "-"}
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.generalExpense}
                                  onChange={(event) => handleDistributionModeChange(expense, "generalExpense", event.target.checked)}
                                  disabled={protectedFieldDisabled}
                                />
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.expenseWithoutTeam}
                                  onChange={(event) => handleDistributionModeChange(expense, "expenseWithoutTeam", event.target.checked)}
                                  disabled={protectedFieldDisabled}
                                />
                              </td>
                              {DISTRIBUTION_FIELDS.map((field) => (
                                <td key={`${expense.id}-${field.key}`}>
                                  <div className="general-expense-percent-field">
                                    <input
                                      className="general-expense-input general-expense-percent-input"
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={drafts[expense.id]?.[field.key] ?? formatEditableNumber(Number(expense[field.key] || 0))}
                                      onChange={(event) => setDraft(expense.id, field.key, event.target.value)}
                                      onBlur={() => void flushDraftField(expense.id, field.key)}
                                      disabled={pctDisabled}
                                    />
                                    <span>%</span>
                                  </div>
                                </td>
                              ))}
                              <td className={`general-expense-percent-sum ${sum === 100 ? "is-valid" : "is-invalid"}`}>
                                {expense.expenseWithoutTeam ? "" : `${sum}%`}
                              </td>
                              <td>
                                <select
                                  className="general-expense-input"
                                  value={expense.paymentMethod}
                                  onChange={(event) => {
                                    const nextMethod = event.target.value as GeneralExpense["paymentMethod"];
                                    const payload = nextMethod === "Efectivo"
                                      ? { paymentMethod: nextMethod, bank: null, hasVat: false }
                                      : { paymentMethod: nextMethod };
                                    void persistExpensePatch(expense.id, payload);
                                  }}
                                  disabled={protectedFieldDisabled}
                                >
                                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                                    <option key={method} value={method}>
                                      {method}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="general-expense-input"
                                  value={expense.bank ?? ""}
                                  onChange={(event) => void persistExpensePatch(expense.id, {
                                    bank: (event.target.value || null) as GeneralExpense["bank"] | null
                                  })}
                                  disabled={protectedFieldDisabled || expense.paymentMethod !== "Transferencia"}
                                >
                                  <option value="">Seleccionar...</option>
                                  {BANK_OPTIONS.map((bank) => (
                                    <option key={bank} value={bank}>
                                      {bank}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.recurring}
                                  onChange={(event) => void persistExpensePatch(expense.id, { recurring: event.target.checked })}
                                  disabled={protectedFieldDisabled}
                                />
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.approvedByEmrt}
                                  onChange={(event) => {
                                    const patch = getApprovedByEmrtPatch(event.target.checked);
                                    void persistExpensePatch(expense.id, { approvedByEmrt: event.target.checked }, patch);
                                  }}
                                  disabled={!canApprove || preEmrtLocked}
                                />
                              </td>
                              <td>
                                {expense.paymentMethod === "Efectivo" && expense.approvedByEmrt ? (
                                  <div className="general-expense-date-stack">
                                    <input
                                      className="general-expense-input"
                                      type="date"
                                      value={toDateInput(expense.paidByEmrtAt)}
                                      onChange={(event) => handlePaidByEmrtDateChange(expense, event.target.value || null)}
                                      disabled={!canEditEmrtDate || preEmrtLocked}
                                    />
                                    <button
                                      type="button"
                                      className="general-expense-inline-button"
                                      onClick={() => handlePaidByEmrtDateChange(expense, getTodayInput())}
                                      disabled={!canEditEmrtDate || preEmrtLocked}
                                    >
                                      Hoy
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                              <td className="general-expense-checkbox-cell general-expense-emrt-reimbursement-column">
                                <input
                                  type="checkbox"
                                  checked={expense.paymentMethod === "Transferencia" && expense.emrtReimbursementPending}
                                  onChange={(event) => void persistExpensePatch(expense.id, { emrtReimbursementPending: event.target.checked })}
                                  disabled={!canEditEmrtReimbursement || expense.paymentMethod !== "Transferencia"}
                                />
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.reviewedByJnls}
                                  onChange={(event) => void persistExpensePatch(expense.id, { reviewedByJnls: event.target.checked })}
                                  disabled={!canReviewJnlsFlag}
                                />
                              </td>
                              <td className="general-expense-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={expense.paid}
                                  onChange={(event) => void persistExpensePatch(expense.id, { paid: event.target.checked })}
                                  disabled={!canPay}
                                />
                              </td>
                              <td>
                                <input
                                  className="general-expense-input"
                                  type="date"
                                  value={toDateInput(expense.paidAt)}
                                  onChange={(event) => void persistExpensePatch(expense.id, { paidAt: event.target.value || null })}
                                  disabled={!canWrite}
                                />
                              </td>
                              <td className="general-expense-money-cell">{distribution.withoutTeam > 0 ? formatCurrency(distribution.withoutTeam) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.litigation > 0 ? formatCurrency(distribution.litigation) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.corporateLabor > 0 ? formatCurrency(distribution.corporateLabor) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.settlements > 0 ? formatCurrency(distribution.settlements) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.financialLaw > 0 ? formatCurrency(distribution.financialLaw) : "-"}</td>
                              <td className="general-expense-money-cell is-accent">{distribution.taxCompliance > 0 ? formatCurrency(distribution.taxCompliance) : "-"}</td>
                              <td className="general-expense-money-cell is-total">{distribution.totalPaid > 0 ? formatCurrency(distribution.totalPaid) : "-"}</td>
                              <td>
                                <button
                                  type="button"
                                  className="danger-button general-expense-delete-button"
                                  onClick={() => void handleDelete(expense)}
                                  disabled={!canWrite || expense.approvedByEmrt || preEmrtLocked}
                                >
                                  Borrar
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()
                    )}
                    {!loading && records.length > 0 ? (
                      <tr className="general-expense-totals-row">
                        <td colSpan={23}>Totales distribuidos:</td>
                        <td>{formatCurrency(totals.withoutTeam)}</td>
                        <td>{formatCurrency(totals.litigation)}</td>
                        <td>{formatCurrency(totals.corporateLabor)}</td>
                        <td>{formatCurrency(totals.settlements)}</td>
                        <td>{formatCurrency(totals.financialLaw)}</td>
                        <td>{formatCurrency(totals.taxCompliance)}</td>
                        <td className="is-total">{formatCurrency(totals.totalPaid)}</td>
                        <td></td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : activeTab === "payroll" ? (
        <div className="general-expense-payroll-stack">
          {renderPayrollTable(1, "Primera quincena (pagada el día 25)")}
          {renderPayrollTable(2, "Segunda quincena (pagada el día 10 del siguiente mes)")}
        </div>
      ) : (
        <section className="panel">
          <div className="general-expense-emrt-total-card">
            <span>Total pagado por Eduardo Rusconi (mes actual)</span>
            <strong>{formatCurrency(emrtGrandTotal)}</strong>
          </div>
          <div className="lead-table-shell">
            <div className="lead-table-wrapper">
              <table className="lead-table general-expense-emrt-table">
                <thead>
                  <tr>
                    <th>Fecha pagado por EMRT</th>
                    <th>Total pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {loading || loadingEmrtAcknowledgements ? (
                    <tr>
                      <td colSpan={2} className="centered-inline-message">
                        Cargando resumen EMRT...
                      </td>
                    </tr>
                  ) : emrtDailyTotals.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="centered-inline-message">
                        Sin gastos con fecha pagada por EMRT en este mes.
                      </td>
                    </tr>
                  ) : (
                    emrtDailyTotals.map((item) => {
                      const acknowledgement = item.acknowledgement;
                      const receivedByAle = Boolean(acknowledgement?.receivedByAle);
                      const paidByEmrt = Boolean(acknowledgement?.paidByEmrt);

                      return (
                        <tr key={item.date} className="general-expense-emrt-row">
                          <td>
                            <div className="general-expense-emrt-date">{formatDateDisplay(item.date)}</div>
                            <textarea
                              className="general-expense-emrt-textarea"
                              readOnly
                              value={item.summaryMessage}
                            />
                            <div className="general-expense-emrt-acknowledgement-controls">
                              <label className={`general-expense-inline-checkbox ${paidByEmrt || !canReceiveEmrtCashAsAle ? "is-disabled" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={receivedByAle}
                                  onChange={(event) => void persistEmrtAcknowledgement(item.date, { receivedByAle: event.target.checked })}
                                  disabled={!canReceiveEmrtCashAsAle || paidByEmrt}
                                />
                                <span>Recibido por ALE</span>
                              </label>
                              <label className={`general-expense-inline-checkbox ${!receivedByAle || !canConfirmEmrtCashPayment ? "is-disabled" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={paidByEmrt}
                                  onChange={(event) => void persistEmrtAcknowledgement(item.date, { paidByEmrt: event.target.checked })}
                                  disabled={!canConfirmEmrtCashPayment || !receivedByAle}
                                />
                                <span>Pagado por EMRT</span>
                              </label>
                            </div>
                            <div className="general-expense-emrt-acknowledgement-meta">
                              {acknowledgement?.receivedByAleAt ? (
                                <span>Recibido por ALE: {formatDateTimeDisplay(acknowledgement.receivedByAleAt)}</span>
                              ) : null}
                              {acknowledgement?.paidByEmrtAt ? (
                                <span>Pagado por EMRT: {formatDateTimeDisplay(acknowledgement.paidByEmrtAt)}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="general-expense-emrt-total">{formatCurrency(item.total)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
