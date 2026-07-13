import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { deriveEffectivePermissions } from "@sige/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge } from "../rusconi-intelligence/RusconiIntelligenceBadge";
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
];
const PCT_DRAFT_FIELDS = [
    "pctLitigation",
    "pctCorporateLabor",
    "pctSettlements",
    "pctFinancialLaw",
    "pctTaxCompliance"
];
const PAYMENT_METHOD_OPTIONS = ["Transferencia", "Efectivo"];
const BANK_OPTIONS = ["Banamex", "HSBC"];
const PAYROLL_MONEY_FIELDS = [
    "isrWithholdingMxn",
    "imssWithholdingMxn",
    "employmentSubsidyMxn",
    "infonavitCreditMxn"
];
const PAYROLL_DAILY_SALARY_RI_CONNECTION_ID = "RI-003";
const PAYROLL_BONUS_RATE = 0.1;
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function normalizeComparableText(value) {
    return (value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[._]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function hasPermission(permissions, permission) {
    return Boolean(permissions?.includes("*") || permissions?.includes(permission));
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function formatDateDisplay(value) {
    const inputValue = toDateInput(value);
    if (!inputValue) {
        return "-";
    }
    const [year, month, day] = inputValue.split("-");
    return `${day}/${month}/${year}`;
}
function formatDateTimeDisplay(value) {
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
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function formatPayrollDays(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("es-MX", {
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2
    }).format(numeric);
}
function formatEditableNumber(value) {
    return Number.isFinite(value) ? String(value) : "0";
}
function formatEditableMoney(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return "0";
    }
    return new Intl.NumberFormat("es-MX", {
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2
    }).format(numeric);
}
function formatMoneyDraftValue(value) {
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
function parseMoneyInput(value) {
    const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
    const numeric = Number(normalized || 0);
    return Number.isFinite(numeric) ? numeric : 0;
}
function isPayrollMoneyField(field) {
    return PAYROLL_MONEY_FIELDS.includes(field);
}
function getPayrollDailySalaryRiValidation(entry, employeeOption) {
    if (!entry.laborFileId) {
        return {
            status: "mismatch",
            label: "No verificado",
            detail: "Sin expediente laboral vinculado."
        };
    }
    const payrollDailySalary = Number(entry.dailySalaryMxn || 0);
    const laborFileDailySalary = Number(employeeOption?.dailySalaryMxn ?? entry.laborFileDailySalaryMxn ?? entry.dailySalaryMxn ?? 0);
    if (!payrollDailySalary || !laborFileDailySalary || Math.abs(payrollDailySalary - laborFileDailySalary) > 0.05) {
        return {
            status: "mismatch",
            label: "No coincide",
            detail: "No coincide con el salario diario de Expedientes Laborales."
        };
    }
    const riVerified = Boolean(employeeOption?.dailySalaryRiVerified ?? entry.dailySalaryRiVerified);
    if (!riVerified) {
        return {
            status: "mismatch",
            label: "No verificado",
            detail: employeeOption?.dailySalaryRiVerificationDetail ??
                entry.dailySalaryRiVerificationDetail ??
                "El salario de Expedientes Laborales aun no esta verificado contra contrato."
        };
    }
    return {
        status: "match",
        label: "Verificado",
        detail: "Coincide con Expedientes Laborales y el contrato laboral."
    };
}
function clampPercentage(value) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.min(100, Math.max(0, numeric));
}
function getMonthName(month) {
    return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}
function getTodayInput() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function isFinanceUser(input) {
    return input.team === "FINANCE" ||
        input.secondaryTeam === "FINANCE" ||
        normalizeComparableText(input.legacyTeam) === "finanzas" ||
        normalizeComparableText(input.secondaryLegacyTeam) === "finanzas" ||
        normalizeComparableText(input.specificRole) === "finanzas" ||
        normalizeComparableText(input.secondarySpecificRole) === "finanzas";
}
function isAraceliLozano(input) {
    const normalizedEmail = normalizeComparableText(input.email);
    const normalizedUsername = normalizeComparableText(input.username);
    const normalizedDisplayName = normalizeComparableText(input.displayName);
    return isFinanceUser(input) && (normalizedUsername === "araceli lozano" ||
        normalizedUsername === "araceli lozano escamilla" ||
        normalizedDisplayName === "araceli lozano" ||
        normalizedDisplayName === "araceli lozano escamilla" ||
        normalizedEmail.startsWith("araceli lozano") ||
        normalizedEmail.startsWith("araceli.lozano"));
}
function isEduardoRusconi(input) {
    return (normalizeComparableText(input.username) === "eduardo rusconi" ||
        normalizeComparableText(input.displayName) === "eduardo rusconi" ||
        (input.email ?? "").toLowerCase().startsWith("eduardo.rusconi"));
}
function canReviewJnls(input) {
    return (input.role !== "SUPERADMIN" &&
        input.legacyRole !== "SUPERADMIN" &&
        (input.team === "AUDIT" ||
            input.secondaryTeam === "AUDIT" ||
            normalizeComparableText(input.legacyTeam) === "auditoria" ||
            normalizeComparableText(input.secondaryLegacyTeam) === "auditoria" ||
            normalizeComparableText(input.specificRole) === "auditor" ||
            normalizeComparableText(input.secondarySpecificRole) === "auditor") &&
        Boolean(input.permissions?.includes("general-expenses:jnls-approval:write")));
}
function getIvaAmount(expense) {
    if (expense.paymentMethod === "Efectivo" || !expense.hasVat) {
        return null;
    }
    const amount = Number(expense.amountMxn || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }
    return amount * 0.16;
}
function getWithholdingAmounts(expense) {
    const rawAmount = Number(expense.amountMxn || 0);
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
    const ivaAmount = getIvaAmount(expense) ?? 0;
    const hasActiveWithholdings = expense.paymentMethod === "Transferencia" && expense.hasWithholdings;
    const vatWithholding = hasActiveWithholdings ? ivaAmount * (2 / 3) : null;
    const isrWithholding = hasActiveWithholdings ? amount * 0.1 : null;
    const netPayment = Math.max(0, amount + ivaAmount - (vatWithholding ?? 0) - (isrWithholding ?? 0));
    return {
        vatWithholding,
        isrWithholding,
        netPayment
    };
}
function getDistributionPct(expense) {
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
function distributeExpense(expense) {
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
    }
    else {
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
function isRowIncomplete(expense) {
    if (!expense.detail || expense.detail.trim() === "")
        return true;
    if (!expense.amountMxn || Number(expense.amountMxn) === 0)
        return true;
    if (!expense.expenseWithoutTeam && !expense.generalExpense) {
        const { sum } = getDistributionPct(expense);
        if (sum !== 100)
            return true;
    }
    if (!expense.paymentMethod)
        return true;
    if (expense.paymentMethod === "Transferencia" && !expense.bank)
        return true;
    if (!expense.approvedByEmrt)
        return true;
    if (!expense.reviewedByJnls)
        return true;
    if (!expense.paid)
        return true;
    if (!expense.paidAt)
        return true;
    return false;
}
function buildEmrtSummaryMessage(date, items, total) {
    return [
        `Entrego a Araceli la suma de ${formatCurrency(total)} y el resumen:`,
        "",
        `Gastos pagados por EMRT el ${formatDateDisplay(date)}:`,
        ...items.map((item, index) => `${index + 1}. ${(item.detail || "Gasto sin detalle").trim()}`)
    ].join("\n");
}
function replaceExpense(items, updated) {
    return items.map((item) => (item.id === updated.id ? updated : item));
}
function replaceEmrtAcknowledgement(items, updated) {
    const next = items.some((item) => item.id === updated.id)
        ? items.map((item) => (item.id === updated.id ? updated : item))
        : [...items, updated];
    return next.sort((left, right) => toDateInput(left.paidByEmrtDate).localeCompare(toDateInput(right.paidByEmrtDate)));
}
function applyOptimisticEmrtAcknowledgementPatch(acknowledgement, patch) {
    const nowIso = new Date().toISOString();
    const next = {
        ...acknowledgement,
        updatedAt: nowIso
    };
    if (Object.prototype.hasOwnProperty.call(patch, "receivedByAle")) {
        next.receivedByAle = Boolean(patch.receivedByAle);
        next.receivedByAleAt = patch.receivedByAle ? next.receivedByAleAt ?? nowIso : undefined;
        if (!patch.receivedByAle) {
            next.paidByEmrt = false;
            next.paidByEmrtAt = undefined;
        }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "paidByEmrt")) {
        next.paidByEmrt = Boolean(patch.paidByEmrt);
        next.paidByEmrtAt = patch.paidByEmrt ? next.paidByEmrtAt ?? nowIso : undefined;
    }
    return next;
}
function mergeRecordsPreservingOrder(current, incoming) {
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
        .sort((left, right) => (left.orderIndex - right.orderIndex ||
        left.incomingIndex - right.incomingIndex))
        .map(({ item }) => item);
}
function replacePayrollEntry(items, updated) {
    return applyPayrollCalculationsToEntries(items.map((item) => (item.id === updated.id ? updated : item)));
}
function getPayrollGrossSalaryMxn(entry) {
    return Number(entry.dailySalaryMxn || 0) * 15;
}
function getPayrollAbsenceDiscountMxn(entry) {
    return Number(entry.dailySalaryMxn || 0) * Number(entry.absenceDays || 0);
}
function getPayrollBonusMxn(netSalaryMxn) {
    return Math.round(Math.max(0, (Number.isFinite(netSalaryMxn) ? netSalaryMxn : 0) * PAYROLL_BONUS_RATE) * 100) / 100;
}
function getPayrollEmployeeBonusKey(entry) {
    if (entry.laborFileId) {
        return `labor:${entry.laborFileId}`;
    }
    const normalizedName = normalizeComparableText(entry.employeeName);
    return normalizedName ? `name:${normalizedName}` : `entry:${entry.id}`;
}
function applyPayrollCalculations(entry, monthlyNetSalaryMxn = entry.half === 2 ? Number(entry.netSalaryMxn || 0) : 0) {
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
    const payrollWithholdingsMxn = (Number(entry.isrWithholdingMxn || 0) +
        Number(entry.imssWithholdingMxn || 0) +
        Number(entry.infonavitCreditMxn || 0));
    const netDepositMxn = (netSalaryMxn +
        punctualityBonusMxn +
        attendanceBonusMxn +
        vacationPremiumMxn +
        overtimeTotalMxn +
        Number(entry.employmentSubsidyMxn || 0) -
        payrollWithholdingsMxn);
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
function applyPayrollCalculationsToEntries(entries) {
    const monthlyNetSalaryByEmployee = new Map();
    entries.forEach((entry) => {
        const grossSalaryMxn = getPayrollGrossSalaryMxn(entry);
        const absenceDiscountMxn = getPayrollAbsenceDiscountMxn(entry);
        const netSalaryMxn = grossSalaryMxn - absenceDiscountMxn;
        const key = getPayrollEmployeeBonusKey(entry);
        monthlyNetSalaryByEmployee.set(key, (monthlyNetSalaryByEmployee.get(key) ?? 0) + netSalaryMxn);
    });
    return entries.map((entry) => applyPayrollCalculations(entry, monthlyNetSalaryByEmployee.get(getPayrollEmployeeBonusKey(entry)) ?? 0));
}
function applyLocalPatch(expense, patch) {
    const next = {
        ...expense,
        ...patch
    };
    if (Object.prototype.hasOwnProperty.call(patch, "bank") && patch.bank == null) {
        next.bank = undefined;
    }
    if (patch.paymentMethod === "Efectivo") {
        next.hasVat = false;
        next.bank = undefined;
        next.hasWithholdings = false;
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
function getApprovedByEmrtPatch(approvedByEmrt) {
    return approvedByEmrt
        ? { approvedByEmrt }
        : { approvedByEmrt, paidByEmrtAt: null };
}
function applyPayrollLocalPatch(entry, patch) {
    const next = {
        ...entry,
        ...patch,
        laborFileId: patch.laborFileId === null ? undefined : patch.laborFileId ?? entry.laborFileId
    };
    return applyPayrollCalculations(next);
}
export function GeneralExpensesPage() {
    const { user } = useAuth();
    const now = new Date();
    const expensePatchSequenceRef = useRef({});
    const payrollPatchSequenceRef = useRef({});
    const emrtAcknowledgementPatchSequenceRef = useRef({});
    const expenseRowRefs = useRef(new Map());
    const [activeTab, setActiveTab] = useState("registro");
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [records, setRecords] = useState([]);
    const [emrtAcknowledgements, setEmrtAcknowledgements] = useState([]);
    const [payrollEntries, setPayrollEntries] = useState([]);
    const [payrollEmployeeOptions, setPayrollEmployeeOptions] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [payrollDrafts, setPayrollDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingEmrtAcknowledgements, setLoadingEmrtAcknowledgements] = useState(true);
    const [loadingPayroll, setLoadingPayroll] = useState(true);
    const [loadingPayrollEmployees, setLoadingPayrollEmployees] = useState(true);
    const [commissionPeriodLocked, setCommissionPeriodLocked] = useState(false);
    const [commissionPeriodLockCount, setCommissionPeriodLockCount] = useState(0);
    const [errorMessage, setErrorMessage] = useState(null);
    const [deletingPayrollEntryId, setDeletingPayrollEntryId] = useState(null);
    const [pendingScrollExpenseId, setPendingScrollExpenseId] = useState(null);
    const effectivePermissions = useMemo(() => user ? deriveEffectivePermissions({
        legacyRole: user.legacyRole,
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
    const canWrite = !commissionPeriodLocked && hasPermission(effectivePermissions, "general-expenses:write");
    const canApprove = !commissionPeriodLocked && Boolean(user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN");
    const canStampPayroll = !commissionPeriodLocked && Boolean(user && isAraceliLozano({
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
    const canPay = !commissionPeriodLocked && Boolean(user && isFinanceUser({
        team: user.team,
        legacyTeam: user.legacyTeam,
        secondaryTeam: user.secondaryTeam,
        secondaryLegacyTeam: user.secondaryLegacyTeam,
        specificRole: user.specificRole,
        secondarySpecificRole: user.secondarySpecificRole
    }));
    const canEditEmrtDate = !commissionPeriodLocked && Boolean(user && isEduardoRusconi({ username: user.username, displayName: user.displayName, email: user.email }));
    const canEditEmrtReimbursement = canApprove && canEditEmrtDate;
    const canReceiveEmrtCashAsAle = canStampPayroll;
    const canConfirmEmrtCashPayment = canApprove && canEditEmrtDate;
    const canReviewJnlsFlag = !commissionPeriodLocked && Boolean(user && canReviewJnls({
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
    const emrtAcknowledgementsByDate = useMemo(() => new Map(emrtAcknowledgements.map((acknowledgement) => [
        toDateInput(acknowledgement.paidByEmrtDate),
        acknowledgement
    ])), [emrtAcknowledgements]);
    function getEmrtAcknowledgementForExpense(expense) {
        const dateKey = toDateInput(expense.paidByEmrtAt);
        return dateKey ? emrtAcknowledgementsByDate.get(dateKey) : undefined;
    }
    function isExpensePreEmrtLocked(expense) {
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
            const [response, periodLock] = await Promise.all([
                apiGet(`/general-expenses?year=${selectedYear}&month=${selectedMonth}`),
                apiGet(`/commissions/period-lock?year=${selectedYear}&month=${selectedMonth}`)
            ]);
            setRecords((current) => mergeRecordsPreservingOrder(current, response));
            setCommissionPeriodLocked(periodLock.locked);
            setCommissionPeriodLockCount(periodLock.confirmedByEmrtCount);
            setDrafts({});
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
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
            const response = await apiGet(`/general-expenses/emrt-acknowledgements?year=${selectedYear}&month=${selectedMonth}`);
            setEmrtAcknowledgements(response);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
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
            const response = await apiGet(`/general-expenses/payroll?year=${selectedYear}&month=${selectedMonth}`);
            setPayrollEntries(applyPayrollCalculationsToEntries(response));
            setPayrollDrafts({});
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
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
            const response = await apiGet("/general-expenses/payroll-employees");
            setPayrollEmployeeOptions(response);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
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
            const firstEditableField = row.querySelector("textarea:not(:disabled), input:not([type='checkbox']):not(:disabled), select:not(:disabled)");
            firstEditableField?.focus({ preventScroll: true });
            setPendingScrollExpenseId(null);
        });
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [activeTab, pendingScrollExpenseId, records]);
    function setDraft(expenseId, field, value) {
        setDrafts((current) => ({
            ...current,
            [expenseId]: {
                ...current[expenseId],
                [field]: value
            }
        }));
    }
    function clearDraft(expenseId, field) {
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
    function clearDraftFields(expenseId, fields) {
        fields.forEach((field) => clearDraft(expenseId, field));
    }
    function setPayrollDraft(entryId, field, value) {
        setPayrollDrafts((current) => ({
            ...current,
            [entryId]: {
                ...current[entryId],
                [field]: value
            }
        }));
    }
    function clearPayrollDraft(entryId, field) {
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
    function updateExpenseLocal(expenseId, patch) {
        setRecords((items) => items.map((item) => (item.id === expenseId ? applyLocalPatch(item, patch) : item)));
    }
    function updatePayrollEntryLocal(entryId, patch) {
        setPayrollEntries((items) => applyPayrollCalculationsToEntries(items.map((item) => (item.id === entryId ? applyPayrollLocalPatch(item, patch) : item))));
    }
    async function persistExpensePatch(expenseId, payload, localPatch = payload) {
        const canApplyPrivilegedPatch = ((Object.prototype.hasOwnProperty.call(payload, "approvedByEmrt") && canApprove) ||
            (Object.prototype.hasOwnProperty.call(payload, "paidByEmrtAt") && canEditEmrtDate) ||
            (Object.prototype.hasOwnProperty.call(payload, "emrtReimbursementPending") && canEditEmrtReimbursement) ||
            (Object.prototype.hasOwnProperty.call(payload, "reviewedByJnls") && canReviewJnlsFlag) ||
            (Object.prototype.hasOwnProperty.call(payload, "paid") && canPay));
        if (!canWrite && !canApplyPrivilegedPatch) {
            return;
        }
        updateExpenseLocal(expenseId, localPatch);
        const requestSequence = (expensePatchSequenceRef.current[expenseId] ?? 0) + 1;
        expensePatchSequenceRef.current[expenseId] = requestSequence;
        try {
            const updated = await apiPatch(`/general-expenses/${expenseId}`, payload);
            if (expensePatchSequenceRef.current[expenseId] !== requestSequence) {
                return;
            }
            setRecords((items) => replaceExpense(items, updated));
        }
        catch (error) {
            if (expensePatchSequenceRef.current[expenseId] !== requestSequence) {
                return;
            }
            setErrorMessage(toErrorMessage(error));
            await loadRecords();
        }
    }
    async function persistEmrtAcknowledgement(date, payload) {
        const payloadKeys = Object.keys(payload);
        if (payloadKeys.length !== 1) {
            return;
        }
        const requestSequence = (emrtAcknowledgementPatchSequenceRef.current[date] ?? 0) + 1;
        emrtAcknowledgementPatchSequenceRef.current[date] = requestSequence;
        setEmrtAcknowledgements((items) => {
            const current = items.find((item) => toDateInput(item.paidByEmrtDate) === date);
            return current ? replaceEmrtAcknowledgement(items, applyOptimisticEmrtAcknowledgementPatch(current, payload)) : items;
        });
        try {
            const updated = await apiPatch(`/general-expenses/emrt-acknowledgements/${date}`, payload);
            if (emrtAcknowledgementPatchSequenceRef.current[date] !== requestSequence) {
                return;
            }
            setEmrtAcknowledgements((items) => replaceEmrtAcknowledgement(items, updated));
        }
        catch (error) {
            if (emrtAcknowledgementPatchSequenceRef.current[date] !== requestSequence) {
                return;
            }
            setErrorMessage(toErrorMessage(error));
            await loadEmrtAcknowledgements();
            await loadRecords();
        }
    }
    async function flushDraftField(expenseId, field) {
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
        await persistExpensePatch(expenseId, { [field]: numericValue }, { [field]: numericValue });
    }
    async function persistPayrollPatch(entryId, payload, localPatch = payload) {
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
            const updated = await apiPatch(`/general-expenses/payroll/${entryId}`, payload);
            if (payrollPatchSequenceRef.current[entryId] !== requestSequence) {
                return;
            }
            setPayrollEntries((items) => replacePayrollEntry(items, updated));
        }
        catch (error) {
            if (payrollPatchSequenceRef.current[entryId] !== requestSequence) {
                return;
            }
            setErrorMessage(toErrorMessage(error));
            await loadPayrollEntries();
        }
    }
    async function flushPayrollDraftField(entryId, field) {
        const rawValue = payrollDrafts[entryId]?.[field];
        if (rawValue === undefined) {
            return;
        }
        clearPayrollDraft(entryId, field);
        if (field === "overtimeDetail") {
            await persistPayrollPatch(entryId, { [field]: rawValue }, { [field]: rawValue });
            return;
        }
        const numericValue = Math.max(0, isPayrollMoneyField(field) ? parseMoneyInput(rawValue) : Number(rawValue || 0));
        await persistPayrollPatch(entryId, { [field]: numericValue }, { [field]: numericValue });
    }
    async function handleAddRow() {
        if (!canWrite) {
            return;
        }
        try {
            const created = await apiPost("/general-expenses", {
                year: selectedYear,
                month: selectedMonth
            });
            setActiveTab("registro");
            setPendingScrollExpenseId(created.id);
            setRecords((items) => [...items, created]);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleAddPayrollEntry(half) {
        if (!canWrite) {
            return;
        }
        try {
            const created = await apiPost("/general-expenses/payroll", {
                year: selectedYear,
                month: selectedMonth,
                half
            });
            setPayrollEntries((items) => applyPayrollCalculationsToEntries([...items, created]));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleDelete(expense) {
        if (!canWrite || expense.approvedByEmrt || isExpensePreEmrtLocked(expense)) {
            return;
        }
        if (!window.confirm("Eliminar este gasto?")) {
            return;
        }
        try {
            await apiDelete(`/general-expenses/${expense.id}`);
            setRecords((items) => items.filter((item) => item.id !== expense.id));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleDeletePayrollEntry(entry) {
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
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadPayrollEntries();
        }
        finally {
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
            const result = await apiPost("/general-expenses/copy-to-next-month", {
                year: selectedYear,
                month: selectedMonth
            });
            window.alert(`${result.copied} gastos copiados exitosamente a ${getMonthName(result.month)}.`);
            if (window.confirm("Ir al mes siguiente?")) {
                setSelectedYear(result.year);
                setSelectedMonth(result.month);
            }
        }
        catch (error) {
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
        const confirmed = window.confirm(`Copiar ${payrollEntries.length} registros de nómina de ${getMonthName(selectedMonth)}/${selectedYear} a ${getMonthName(targetMonth)}/${targetYear}?\n\n` +
            "Se copiarán empleados, salarios, bonos, retenciones, subsidio e Infonavit. Las faltas, horas extra y autorizaciones EMRT se reiniciarán para evitar pagos accidentales.");
        if (!confirmed) {
            return;
        }
        try {
            const result = await apiPost("/general-expenses/payroll/copy-to-next-month", {
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
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    function handleDistributionModeChange(expense, field, checked) {
        if (!canWrite || expense.approvedByEmrt || isExpensePreEmrtLocked(expense)) {
            return;
        }
        const payload = checked
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
    function handlePaidByEmrtDateChange(expense, nextDate) {
        if (nextDate && emrtAcknowledgementsByDate.get(nextDate)?.receivedByAle) {
            setErrorMessage("Ese dia ya fue marcado como recibido por ALE. Desmarca el acuse diario antes de asignar mas gastos.");
            return;
        }
        void persistExpensePatch(expense.id, { paidByEmrtAt: nextDate });
    }
    const totals = useMemo(() => records.reduce((accumulator, expense) => {
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
    }, {
        totalAmount: 0,
        totalLimit: 0,
        withoutTeam: 0,
        litigation: 0,
        corporateLabor: 0,
        settlements: 0,
        financialLaw: 0,
        taxCompliance: 0,
        totalPaid: 0
    }), [records]);
    const emrtDailyTotals = useMemo(() => {
        const grouped = records.reduce((accumulator, expense) => {
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
    const emrtGrandTotal = useMemo(() => emrtDailyTotals.reduce((sum, item) => sum + item.total, 0), [emrtDailyTotals]);
    const payrollEntriesByHalf = useMemo(() => ({
        1: payrollEntries.filter((entry) => entry.half === 1),
        2: payrollEntries.filter((entry) => entry.half === 2)
    }), [payrollEntries]);
    const payrollNetDepositTotalMxn = useMemo(() => payrollEntries.reduce((total, entry) => total + Number(entry.netDepositMxn || 0), 0), [payrollEntries]);
    const registeredExpensesTotalMxn = totals.totalAmount + payrollNetDepositTotalMxn;
    const payrollEmployeeOptionsById = useMemo(() => new Map(payrollEmployeeOptions.map((option) => [option.laborFileId, option])), [payrollEmployeeOptions]);
    function handlePayrollEmployeeChange(entry, laborFileId) {
        const selectedEmployee = payrollEmployeeOptionsById.get(laborFileId);
        const localPatch = selectedEmployee
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
    function handlePayrollPartTimeChange(entry, isPartTime) {
        if (!isPartTime) {
            clearPayrollDraft(entry.id, "overtimeDetail");
        }
        void persistPayrollPatch(entry.id, isPartTime ? { isPartTime } : { isPartTime, overtimeDetail: "" }, isPartTime ? { isPartTime } : { isPartTime, overtimeDetail: "" });
    }
    function renderPayrollBonusCell(entry, amountMxn, excludedField, bonusLabel) {
        const excluded = Boolean(entry[excludedField]);
        const disabled = !canWrite || entry.finalPaymentApprovedByEmrt || entry.half !== 2;
        const title = entry.half !== 2
            ? "Los bonos se pagan en la segunda quincena."
            : excluded
                ? `${bonusLabel} excluido del pago.`
                : "Se paga al 100% en la segunda quincena; cada bono es 10% del salario neto mensual.";
        return (_jsxs("div", { className: `general-expense-payroll-bonus-cell ${excluded ? "is-excluded" : ""}`, children: [_jsx("div", { className: "general-expense-readonly-cell", title: title, children: formatCurrency(amountMxn) }), _jsxs("label", { className: `general-expense-inline-checkbox general-expense-payroll-bonus-exclusion ${disabled ? "is-disabled" : ""}`, children: [_jsx("input", { type: "checkbox", checked: excluded, onChange: (event) => void persistPayrollPatch(entry.id, { [excludedField]: event.target.checked }, { [excludedField]: event.target.checked }), disabled: disabled, title: title }), _jsx("span", { children: "Excluir" })] })] }));
    }
    function renderPayrollMoneyInput(entry, field) {
        return (_jsxs("div", { className: "general-expense-currency-input", children: [_jsx("span", { "aria-hidden": "true", children: "$" }), _jsx("input", { className: "general-expense-input general-expense-number-input", type: "text", inputMode: "decimal", value: payrollDrafts[entry.id]?.[field] ?? formatEditableMoney(Number(entry[field] || 0)), onChange: (event) => setPayrollDraft(entry.id, field, formatMoneyDraftValue(event.target.value)), onBlur: () => void flushPayrollDraftField(entry.id, field), disabled: !canWrite || entry.finalPaymentApprovedByEmrt })] }));
    }
    function renderPayrollNumberInput(entry, field) {
        return (_jsx("input", { className: "general-expense-input general-expense-number-input", type: "number", min: "0", step: "0.01", value: payrollDrafts[entry.id]?.[field] ?? formatEditableNumber(Number(entry[field] || 0)), onChange: (event) => setPayrollDraft(entry.id, field, event.target.value), onBlur: () => void flushPayrollDraftField(entry.id, field), disabled: !canWrite || entry.finalPaymentApprovedByEmrt }));
    }
    function renderPayrollTable(half, title) {
        const rows = payrollEntriesByHalf[half];
        const netDepositTotalMxn = rows.reduce((total, entry) => total + Number(entry.netDepositMxn || 0), 0);
        return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: title }), _jsx("button", { type: "button", className: "primary-button", onClick: () => void handleAddPayrollEntry(half), disabled: !canWrite, children: "+ Agregar fila" })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper general-expense-payroll-table-wrapper", children: _jsxs("table", { className: "lead-table general-expense-payroll-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nombre del colaborador" }), _jsx("th", { children: "Medio tiempo" }), _jsx("th", { children: "Salario diario" }), _jsx("th", { children: "Salario bruto" }), _jsx("th", { children: "Faltas" }), _jsx("th", { children: "Salario neto" }), _jsx("th", { children: "D\u00EDas disfrutados por adelantado" }), _jsx("th", { children: "Fecha en la que se pagar\u00E1 la prima vacacional" }), _jsx("th", { children: "Pagar esta quincena" }), _jsx("th", { children: "D\u00EDas pagados correspondientes a quincenas anteriores" }), _jsx("th", { children: "D\u00EDas pagados correspondientes a esta quincena" }), _jsx("th", { children: "Total de d\u00EDas cuya prima vacacional es pagada esta quincena" }), _jsx("th", { children: "Prima vacacional" }), _jsx("th", { children: "Bono de puntualidad" }), _jsx("th", { children: "Bono de asistencia" }), _jsx("th", { children: "Horas extras (valor)" }), _jsx("th", { children: "N\u00FAmero de horas extras" }), _jsx("th", { children: "Total horas extras" }), _jsx("th", { children: "Detalle de horas extras" }), _jsx("th", { children: "Retenciones ISR" }), _jsx("th", { children: "Retenciones IMSS" }), _jsx("th", { children: "Subsidio al empleo" }), _jsx("th", { children: "Credito Infonavit" }), _jsx("th", { children: "Dep\u00F3sito neto" }), _jsx("th", { children: "Confirmo que la n\u00F3mina est\u00E1 timbrada (ALE)" }), _jsx("th", { children: "Pago autorizado EMRT" }), _jsx("th", { children: "Aprobado por JNLS" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loadingPayroll ? (_jsx("tr", { children: _jsx("td", { colSpan: 28, className: "centered-inline-message", children: "Cargando n\u00F3mina..." }) })) : rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 28, className: "centered-inline-message", children: "Sin registros de n\u00F3mina en esta quincena." }) })) : (_jsxs(_Fragment, { children: [rows.map((entry) => {
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
                                                return (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("select", { className: "general-expense-input general-expense-payroll-employee-input", value: entry.laborFileId ?? "", onChange: (event) => handlePayrollEmployeeChange(entry, event.target.value), disabled: !canWrite || loadingPayrollEmployees || entry.finalPaymentApprovedByEmrt, children: [_jsx("option", { value: "", children: entry.laborFileId || !entry.employeeName ? "Seleccionar empleado" : `${entry.employeeName} (sin expediente)` }), entry.laborFileId && !payrollEmployeeOptionsById.has(entry.laborFileId) ? (_jsx("option", { value: entry.laborFileId, children: entry.employeeName || "Empleado seleccionado" })) : null, payrollEmployeeOptions.map((option) => (_jsx("option", { value: option.laborFileId, children: option.employeeName }, option.laborFileId)))] }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: entry.isPartTime, onChange: (event) => handlePayrollPartTimeChange(entry, event.target.checked), disabled: !canWrite || entry.finalPaymentApprovedByEmrt, title: "Marcar si el empleado es de medio tiempo." }) }), _jsx("td", { children: _jsxs("div", { className: `general-expense-readonly-cell general-expense-payroll-ri-salary is-${dailySalaryValidation.status}`, children: [_jsxs("span", { className: "general-expense-payroll-ri-salary-main", children: [_jsx(RusconiIntelligenceBadge, { connectionId: PAYROLL_DAILY_SALARY_RI_CONNECTION_ID, label: "Gastos generales / Nomina / Salario diario" }), _jsx("span", { children: formatCurrency(entry.dailySalaryMxn) })] }), _jsx("span", { "aria-label": dailySalaryValidation.label, className: `general-expense-payroll-ri-icon is-${dailySalaryValidation.status}`, role: "img", title: dailySalaryValidation.detail })] }) }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell", children: formatCurrency(entry.grossSalaryMxn) }) }), _jsx("td", { children: renderPayrollNumberInput(entry, "absenceDays") }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell is-payroll-net-salary", title: `Salario bruto menos faltas: ${formatCurrency(entry.grossSalaryMxn)} - ${formatCurrency(entry.absenceDiscountMxn)}`, children: formatCurrency(entry.netSalaryMxn) }) }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell general-expense-payroll-days-cell general-expense-payroll-advance-cell", title: "D\u00EDas disfrutados antes del aniversario laboral que generan prima vacacional en esta fecha de corte.", children: formatPayrollDays(entry.advanceVacationDays) }) }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell general-expense-payroll-date-cell", title: "Fecha de corte en la que se adquiere el derecho para pagar la prima vacacional de estos d\u00EDas.", children: advanceVacationPaymentDate }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: entry.advanceVacationDaysPaid, onChange: (event) => void persistPayrollPatch(entry.id, { advanceVacationDaysPaid: event.target.checked }, {
                                                                    advanceVacationDaysPaid: event.target.checked,
                                                                    advanceVacationDays: event.target.checked ? 0 : entry.advanceVacationDays
                                                                }), disabled: !canToggleAdvanceVacationPaid, title: advanceVacationPaidTitle }) }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell general-expense-payroll-days-cell", title: "D\u00EDas adelantados cuya prima se paga ahora y que corresponden a quincenas anteriores.", children: formatPayrollDays(entry.vacationDaysPaidPreviousPeriods) }) }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell general-expense-payroll-days-cell", title: "D\u00EDas de vacaciones cuya prima se paga ahora y que corresponden a esta quincena.", children: formatPayrollDays(entry.vacationDaysPaidCurrentPeriod) }) }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell general-expense-payroll-days-cell", title: "D\u00EDas de vacaciones aprobadas con PDF firmado en esta quincena.", children: formatPayrollDays(entry.vacationDays) }) }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell", title: "Prima calculada desde el total de d\u00EDas pagados esta quincena.", children: formatCurrency(entry.vacationPremiumMxn) }) }), _jsx("td", { children: renderPayrollBonusCell(entry, entry.punctualityBonusMxn, "punctualityBonusExcluded", "Bono de puntualidad") }), _jsx("td", { children: renderPayrollBonusCell(entry, entry.attendanceBonusMxn, "attendanceBonusExcluded", "Bono de asistencia") }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell", children: formatCurrency(entry.overtimeHourlyRateMxn) }) }), _jsx("td", { children: renderPayrollNumberInput(entry, "overtimeHours") }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell", children: formatCurrency(entry.overtimeTotalMxn) }) }), _jsx("td", { children: entry.isPartTime ? (_jsx("textarea", { className: "general-expense-input general-expense-payroll-detail-input", value: payrollDrafts[entry.id]?.overtimeDetail ?? entry.overtimeDetail, onChange: (event) => setPayrollDraft(entry.id, "overtimeDetail", event.target.value), onBlur: () => void flushPayrollDraftField(entry.id, "overtimeDetail"), rows: 2, disabled: !canWrite || entry.finalPaymentApprovedByEmrt })) : null }), _jsx("td", { children: renderPayrollMoneyInput(entry, "isrWithholdingMxn") }), _jsx("td", { children: renderPayrollMoneyInput(entry, "imssWithholdingMxn") }), _jsx("td", { children: renderPayrollMoneyInput(entry, "employmentSubsidyMxn") }), _jsx("td", { children: renderPayrollMoneyInput(entry, "infonavitCreditMxn") }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell is-payroll-total", children: formatCurrency(entry.netDepositMxn) }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: entry.payrollStampedByAraceli, onChange: (event) => void persistPayrollPatch(entry.id, { payrollStampedByAraceli: event.target.checked }), disabled: !canStampPayroll || entry.finalPaymentApprovedByEmrt }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: entry.finalPaymentApprovedByEmrt, onChange: (event) => void persistPayrollPatch(entry.id, { finalPaymentApprovedByEmrt: event.target.checked }), disabled: !canApprove }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: entry.reviewedByJnls, onChange: (event) => void persistPayrollPatch(entry.id, { reviewedByJnls: event.target.checked }), disabled: !canReviewJnlsFlag || entry.finalPaymentApprovedByEmrt }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "danger-button general-expense-delete-button", onClick: () => void handleDeletePayrollEntry(entry), disabled: !canWrite || entry.finalPaymentApprovedByEmrt || Boolean(deletingPayrollEntryId), title: entry.finalPaymentApprovedByEmrt ? "La fila ya fue autorizada por EMRT y no puede borrarse." : "Borrar fila de nómina", children: deletingPayrollEntryId === entry.id ? "Borrando..." : "Borrar" }) })] }, entry.id));
                                            }), _jsxs("tr", { className: "general-expense-payroll-total-row", children: [_jsx("td", { colSpan: 21, children: "Total pago neto de la quincena" }), _jsx("td", { children: _jsx("div", { className: "general-expense-readonly-cell is-payroll-total", children: formatCurrency(netDepositTotalMxn) }) }), _jsx("td", { colSpan: 4 })] })] })) })] }) }) })] }));
    }
    return (_jsxs("section", { className: "page-stack general-expenses-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Gastos" }), _jsx("div", { children: _jsx("h2", { children: "Gastos generales" }) })] }), _jsx("p", { className: "muted", children: "Registro mensual de gastos, distribucion por equipo, bloqueo por aprobaciones y resumen diario de gastos pagados por EMRT." })] }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "leads-tabs", role: "tablist", "aria-label": "Vistas de gastos generales", children: [_jsx("button", { type: "button", className: `lead-tab ${activeTab === "registro" ? "is-active" : ""}`, onClick: () => setActiveTab("registro"), children: "1. Registro" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "payroll" ? "is-active" : ""}`, onClick: () => setActiveTab("payroll"), children: "2. N\u00F3mina" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "emrt" ? "is-active" : ""}`, onClick: () => setActiveTab("emrt"), children: "3. Pagado por EMRT" })] }) }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, commissionPeriodLocked ? (_jsxs("div", { className: "message-banner commissions-period-lock-banner", children: ["Periodo cerrado por ", commissionPeriodLockCount, " confirmacion", commissionPeriodLockCount === 1 ? "" : "es", " de EMRT en Totales de comisiones. Reabre todas para modificar Gastos generales o Nomina."] })) : null, _jsxs("section", { className: "panel general-expenses-toolbar", children: [_jsxs("div", { className: "general-expenses-filters", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "A\u00F1o" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: YEAR_OPTIONS.map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthName, index) => (_jsx("option", { value: index + 1, children: monthName }, monthName))) })] })] }), _jsxs("div", { className: "general-expenses-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => activeTab === "payroll" ? void loadPayrollEntries() : void loadRecords(), children: "Refrescar" }), activeTab === "registro" ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => void handleCopyToNextMonth(), disabled: !canWrite, children: "Copiar a mes siguiente" }), _jsx("button", { type: "button", className: "primary-button", onClick: () => void handleAddRow(), disabled: !canWrite, children: "+ Agregar Gasto" })] })) : activeTab === "payroll" ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => void handleCopyPayrollToNextMonth(), disabled: !canWrite, children: "Copiar n\u00F3mina al mes siguiente" })) : null] })] }), activeTab === "registro" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "panel", children: _jsxs("div", { className: "general-expense-summary-grid", children: [_jsxs("article", { className: "general-expense-summary-card is-total", children: [_jsx("span", { children: "Total gastos registrados" }), _jsx("strong", { children: formatCurrency(registeredExpensesTotalMxn) })] }), _jsxs("article", { className: "general-expense-summary-card is-limit", children: [_jsx("span", { children: "Total l\u00EDmite" }), _jsx("strong", { children: formatCurrency(totals.totalLimit) })] }), _jsxs("article", { className: "general-expense-summary-card is-paid", children: [_jsx("span", { children: "Total pagado" }), _jsx("strong", { children: formatCurrency(totals.totalPaid) })] }), _jsxs("article", { className: "general-expense-summary-card is-pending", children: [_jsx("span", { children: "Pendiente de pago" }), _jsx("strong", { children: formatCurrency(totals.totalAmount - totals.totalPaid) })] })] }) }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Registro mensual" }), _jsxs("span", { children: [records.length, " registros"] })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper general-expense-table-wrapper", children: _jsxs("table", { className: "lead-table general-expense-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No." }), _jsx("th", { className: "general-expense-detail-column", children: "Detalle de Gasto" }), _jsx("th", { children: "Monto" }), _jsx("th", { children: "IVA" }), _jsx("th", { className: "general-expense-withholding-column", children: "Ret. IVA" }), _jsx("th", { className: "general-expense-withholding-column", children: "Ret ISR" }), _jsx("th", { className: "general-expense-net-payment-column", children: "Pago neto" }), _jsx("th", { children: "\u00BFCuenta para l\u00EDmite?" }), _jsx("th", { children: "Suma L\u00EDmite" }), _jsx("th", { children: "Gasto general" }), _jsx("th", { children: "Gasto sin equipo" }), DISTRIBUTION_FIELDS.map((field) => (_jsx("th", { children: field.label }, field.key))), _jsx("th", { children: "SUM %" }), _jsx("th", { children: "M\u00E9todo" }), _jsx("th", { children: "Banco" }), _jsx("th", { children: "Gasto Recurrente" }), _jsx("th", { children: "Aprobado EMRT" }), _jsx("th", { children: "Fecha pagado por EMRT" }), _jsx("th", { className: "general-expense-emrt-reimbursement-column", children: "Reembolso pendiente a favor de EMRT" }), _jsx("th", { children: "Aprobado por JNLS" }), _jsx("th", { children: "\u00BFPagado a receptor final?" }), _jsx("th", { children: "Fecha Pago" }), _jsx("th", { children: "Sin equipo" }), _jsx("th", { children: "Litigio" }), _jsx("th", { children: "Corporativo" }), _jsx("th", { children: "Convenios" }), _jsx("th", { children: "Financiero" }), _jsx("th", { children: "Fiscal" }), _jsx("th", { children: "Total Pagado" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 34, className: "centered-inline-message", children: "Cargando gastos..." }) })) : records.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 34, className: "centered-inline-message", children: "No hay gastos registrados en este mes." }) })) : ((() => {
                                                        let runningLimit = 0;
                                                        return records.map((expense, index) => {
                                                            if (expense.countsTowardLimit) {
                                                                runningLimit += Number(expense.amountMxn || 0);
                                                            }
                                                            const distribution = distributeExpense(expense);
                                                            const ivaAmount = getIvaAmount(expense);
                                                            const { vatWithholding, isrWithholding, netPayment } = getWithholdingAmounts(expense);
                                                            const { sum } = getDistributionPct(expense);
                                                            const preEmrtLocked = isExpensePreEmrtLocked(expense);
                                                            const protectedFieldDisabled = !canWrite || expense.approvedByEmrt || preEmrtLocked;
                                                            const pctDisabled = protectedFieldDisabled || expense.generalExpense || expense.expenseWithoutTeam;
                                                            const vatCheckboxDisabled = protectedFieldDisabled || expense.paymentMethod !== "Transferencia";
                                                            const withholdingsCheckboxDisabled = protectedFieldDisabled || expense.paymentMethod !== "Transferencia";
                                                            const rowIncomplete = isRowIncomplete(expense);
                                                            const draftAmount = drafts[expense.id]?.amountMxn ?? formatEditableMoney(Number(expense.amountMxn || 0));
                                                            return (_jsxs("tr", { ref: (node) => {
                                                                    if (node) {
                                                                        expenseRowRefs.current.set(expense.id, node);
                                                                        return;
                                                                    }
                                                                    expenseRowRefs.current.delete(expense.id);
                                                                }, className: [
                                                                    rowIncomplete ? "general-expense-row-danger" : "",
                                                                    preEmrtLocked ? "general-expense-row-acknowledged" : ""
                                                                ].filter(Boolean).join(" ") || undefined, children: [_jsx("td", { className: "general-expense-row-index", children: index + 1 }), _jsx("td", { className: "general-expense-detail-column", children: _jsx("textarea", { className: "general-expense-input general-expense-textarea", value: drafts[expense.id]?.detail ?? expense.detail ?? "", onChange: (event) => setDraft(expense.id, "detail", event.target.value), onBlur: () => void flushDraftField(expense.id, "detail"), rows: 2, disabled: protectedFieldDisabled }) }), _jsxs("td", { children: [_jsxs("div", { className: "general-expense-currency-input", children: [_jsx("span", { "aria-hidden": "true", children: "$" }), _jsx("input", { className: "general-expense-input general-expense-number-input", type: "text", inputMode: "decimal", value: draftAmount, onChange: (event) => setDraft(expense.id, "amountMxn", formatMoneyDraftValue(event.target.value)), onBlur: () => void flushDraftField(expense.id, "amountMxn"), disabled: protectedFieldDisabled })] }), _jsxs("div", { className: "general-expense-amount-options", children: [_jsxs("label", { className: `general-expense-inline-checkbox ${vatCheckboxDisabled ? "is-disabled" : ""}`, children: [_jsx("input", { type: "checkbox", checked: expense.paymentMethod === "Transferencia" && expense.hasVat, onChange: (event) => void persistExpensePatch(expense.id, { hasVat: event.target.checked }), disabled: vatCheckboxDisabled }), _jsx("span", { children: "Con IVA" })] }), _jsxs("label", { className: `general-expense-inline-checkbox ${withholdingsCheckboxDisabled ? "is-disabled" : ""}`, children: [_jsx("input", { type: "checkbox", checked: expense.paymentMethod === "Transferencia" && expense.hasWithholdings, onChange: (event) => void persistExpensePatch(expense.id, { hasWithholdings: event.target.checked }), disabled: withholdingsCheckboxDisabled }), _jsx("span", { children: "Retenciones" })] })] })] }), _jsx("td", { children: _jsx("div", { className: `general-expense-readonly-cell ${expense.paymentMethod === "Efectivo" ? "is-disabled" : ""}`, children: ivaAmount !== null ? formatCurrency(ivaAmount) : "-" }) }), _jsx("td", { className: "general-expense-withholding-column", children: _jsx("div", { className: `general-expense-readonly-cell ${vatWithholding === null ? "is-disabled" : ""}`, children: vatWithholding !== null ? formatCurrency(vatWithholding) : "-" }) }), _jsx("td", { className: "general-expense-withholding-column", children: _jsx("div", { className: `general-expense-readonly-cell ${isrWithholding === null ? "is-disabled" : ""}`, children: isrWithholding !== null ? formatCurrency(isrWithholding) : "-" }) }), _jsx("td", { className: "general-expense-net-payment-column", children: _jsx("div", { className: "general-expense-readonly-cell is-net-payment", children: formatCurrency(netPayment) }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.countsTowardLimit, onChange: (event) => void persistExpensePatch(expense.id, { countsTowardLimit: event.target.checked }), disabled: protectedFieldDisabled }) }), _jsx("td", { className: `general-expense-limit-cell ${expense.countsTowardLimit ? "is-active" : ""}`, children: expense.countsTowardLimit ? formatCurrency(runningLimit) : "-" }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.generalExpense, onChange: (event) => handleDistributionModeChange(expense, "generalExpense", event.target.checked), disabled: protectedFieldDisabled }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.expenseWithoutTeam, onChange: (event) => handleDistributionModeChange(expense, "expenseWithoutTeam", event.target.checked), disabled: protectedFieldDisabled }) }), DISTRIBUTION_FIELDS.map((field) => (_jsx("td", { children: _jsxs("div", { className: "general-expense-percent-field", children: [_jsx("input", { className: "general-expense-input general-expense-percent-input", type: "number", min: "0", max: "100", step: "0.01", value: drafts[expense.id]?.[field.key] ?? formatEditableNumber(Number(expense[field.key] || 0)), onChange: (event) => setDraft(expense.id, field.key, event.target.value), onBlur: () => void flushDraftField(expense.id, field.key), disabled: pctDisabled }), _jsx("span", { children: "%" })] }) }, `${expense.id}-${field.key}`))), _jsx("td", { className: `general-expense-percent-sum ${sum === 100 ? "is-valid" : "is-invalid"}`, children: expense.expenseWithoutTeam ? "" : `${sum}%` }), _jsx("td", { children: _jsx("select", { className: "general-expense-input", value: expense.paymentMethod, onChange: (event) => {
                                                                                const nextMethod = event.target.value;
                                                                                const payload = nextMethod === "Efectivo"
                                                                                    ? { paymentMethod: nextMethod, bank: null, hasVat: false, hasWithholdings: false }
                                                                                    : { paymentMethod: nextMethod };
                                                                                void persistExpensePatch(expense.id, payload);
                                                                            }, disabled: protectedFieldDisabled, children: PAYMENT_METHOD_OPTIONS.map((method) => (_jsx("option", { value: method, children: method }, method))) }) }), _jsx("td", { children: _jsxs("select", { className: "general-expense-input", value: expense.bank ?? "", onChange: (event) => void persistExpensePatch(expense.id, {
                                                                                bank: (event.target.value || null)
                                                                            }), disabled: protectedFieldDisabled || expense.paymentMethod !== "Transferencia", children: [_jsx("option", { value: "", children: "Seleccionar..." }), BANK_OPTIONS.map((bank) => (_jsx("option", { value: bank, children: bank }, bank)))] }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.recurring, onChange: (event) => void persistExpensePatch(expense.id, { recurring: event.target.checked }), disabled: protectedFieldDisabled }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.approvedByEmrt, onChange: (event) => {
                                                                                const patch = getApprovedByEmrtPatch(event.target.checked);
                                                                                void persistExpensePatch(expense.id, { approvedByEmrt: event.target.checked }, patch);
                                                                            }, disabled: !canApprove || preEmrtLocked }) }), _jsx("td", { children: expense.paymentMethod === "Efectivo" && expense.approvedByEmrt ? (_jsxs("div", { className: "general-expense-date-stack", children: [_jsx("input", { className: "general-expense-input", type: "date", value: toDateInput(expense.paidByEmrtAt), onChange: (event) => handlePaidByEmrtDateChange(expense, event.target.value || null), disabled: !canEditEmrtDate || preEmrtLocked }), _jsx("button", { type: "button", className: "general-expense-inline-button", onClick: () => handlePaidByEmrtDateChange(expense, getTodayInput()), disabled: !canEditEmrtDate || preEmrtLocked, children: "Hoy" })] })) : null }), _jsx("td", { className: "general-expense-checkbox-cell general-expense-emrt-reimbursement-column", children: _jsx("input", { type: "checkbox", checked: expense.paymentMethod === "Transferencia" && expense.emrtReimbursementPending, onChange: (event) => void persistExpensePatch(expense.id, { emrtReimbursementPending: event.target.checked }), disabled: !canEditEmrtReimbursement || expense.paymentMethod !== "Transferencia" }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.reviewedByJnls, onChange: (event) => void persistExpensePatch(expense.id, { reviewedByJnls: event.target.checked }), disabled: !canReviewJnlsFlag }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.paid, onChange: (event) => void persistExpensePatch(expense.id, { paid: event.target.checked }), disabled: !canPay }) }), _jsx("td", { children: _jsx("input", { className: "general-expense-input", type: "date", value: toDateInput(expense.paidAt), onChange: (event) => void persistExpensePatch(expense.id, { paidAt: event.target.value || null }), disabled: !canWrite }) }), _jsx("td", { className: "general-expense-money-cell", children: distribution.withoutTeam > 0 ? formatCurrency(distribution.withoutTeam) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.litigation > 0 ? formatCurrency(distribution.litigation) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.corporateLabor > 0 ? formatCurrency(distribution.corporateLabor) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.settlements > 0 ? formatCurrency(distribution.settlements) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.financialLaw > 0 ? formatCurrency(distribution.financialLaw) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.taxCompliance > 0 ? formatCurrency(distribution.taxCompliance) : "-" }), _jsx("td", { className: "general-expense-money-cell is-total", children: distribution.totalPaid > 0 ? formatCurrency(distribution.totalPaid) : "-" }), _jsx("td", { children: _jsx("button", { type: "button", className: "danger-button general-expense-delete-button", onClick: () => void handleDelete(expense), disabled: !canWrite || expense.approvedByEmrt || preEmrtLocked, children: "Borrar" }) })] }, expense.id));
                                                        });
                                                    })()), !loading && records.length > 0 ? (_jsxs("tr", { className: "general-expense-totals-row", children: [_jsx("td", { colSpan: 26, children: "Totales distribuidos:" }), _jsx("td", { children: formatCurrency(totals.withoutTeam) }), _jsx("td", { children: formatCurrency(totals.litigation) }), _jsx("td", { children: formatCurrency(totals.corporateLabor) }), _jsx("td", { children: formatCurrency(totals.settlements) }), _jsx("td", { children: formatCurrency(totals.financialLaw) }), _jsx("td", { children: formatCurrency(totals.taxCompliance) }), _jsx("td", { className: "is-total", children: formatCurrency(totals.totalPaid) }), _jsx("td", {})] })) : null] })] }) }) })] })] })) : activeTab === "payroll" ? (_jsxs("div", { className: "general-expense-payroll-stack", children: [renderPayrollTable(1, "Primera quincena (pagada el día 25)"), renderPayrollTable(2, "Segunda quincena (pagada el día 10 del siguiente mes)")] })) : (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "general-expense-emrt-total-card", children: [_jsx("span", { children: "Total pagado por Eduardo Rusconi (mes actual)" }), _jsx("strong", { children: formatCurrency(emrtGrandTotal) })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table general-expense-emrt-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Fecha pagado por EMRT" }), _jsx("th", { children: "Total pagado" })] }) }), _jsx("tbody", { children: loading || loadingEmrtAcknowledgements ? (_jsx("tr", { children: _jsx("td", { colSpan: 2, className: "centered-inline-message", children: "Cargando resumen EMRT..." }) })) : emrtDailyTotals.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 2, className: "centered-inline-message", children: "Sin gastos con fecha pagada por EMRT en este mes." }) })) : (emrtDailyTotals.map((item) => {
                                            const acknowledgement = item.acknowledgement;
                                            const receivedByAle = Boolean(acknowledgement?.receivedByAle);
                                            const paidByEmrt = Boolean(acknowledgement?.paidByEmrt);
                                            return (_jsxs("tr", { className: "general-expense-emrt-row", children: [_jsxs("td", { children: [_jsx("div", { className: "general-expense-emrt-date", children: formatDateDisplay(item.date) }), _jsx("textarea", { className: "general-expense-emrt-textarea", readOnly: true, value: item.summaryMessage }), _jsxs("div", { className: "general-expense-emrt-acknowledgement-controls", children: [_jsxs("label", { className: `general-expense-inline-checkbox ${paidByEmrt || !canReceiveEmrtCashAsAle ? "is-disabled" : ""}`, children: [_jsx("input", { type: "checkbox", checked: receivedByAle, onChange: (event) => void persistEmrtAcknowledgement(item.date, { receivedByAle: event.target.checked }), disabled: !canReceiveEmrtCashAsAle || paidByEmrt }), _jsx("span", { children: "Recibido por ALE" })] }), _jsxs("label", { className: `general-expense-inline-checkbox ${!receivedByAle || !canConfirmEmrtCashPayment ? "is-disabled" : ""}`, children: [_jsx("input", { type: "checkbox", checked: paidByEmrt, onChange: (event) => void persistEmrtAcknowledgement(item.date, { paidByEmrt: event.target.checked }), disabled: !canConfirmEmrtCashPayment || !receivedByAle }), _jsx("span", { children: "Pagado por EMRT" })] })] }), _jsxs("div", { className: "general-expense-emrt-acknowledgement-meta", children: [acknowledgement?.receivedByAleAt ? (_jsxs("span", { children: ["Recibido por ALE: ", formatDateTimeDisplay(acknowledgement.receivedByAleAt)] })) : null, acknowledgement?.paidByEmrtAt ? (_jsxs("span", { children: ["Pagado por EMRT: ", formatDateTimeDisplay(acknowledgement.paidByEmrtAt)] })) : null] })] }), _jsx("td", { className: "general-expense-emrt-total", children: formatCurrency(item.total) })] }, item.date));
                                        })) })] }) }) })] }))] }));
}
