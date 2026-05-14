import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
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
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function formatEditableNumber(value) {
    return Number.isFinite(value) ? String(value) : "0";
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
    return input.team === "FINANCE" || normalizeComparableText(input.legacyTeam) === "finanzas";
}
function isEduardoRusconi(input) {
    return (normalizeComparableText(input.username) === "eduardo rusconi" ||
        normalizeComparableText(input.displayName) === "eduardo rusconi" ||
        (input.email ?? "").toLowerCase().startsWith("eduardo.rusconi"));
}
function isJaelLopez(input) {
    return ((input.email ?? "").toLowerCase() === "jael.lopez@calculadora.app" ||
        normalizeComparableText(input.username) === "jael lopez" ||
        normalizeComparableText(input.displayName) === "jael lopez" ||
        (input.shortName ?? "").trim().toUpperCase() === "JNLS");
}
function canReviewJnls(input) {
    return (input.role === "AUDITOR" || normalizeComparableText(input.specificRole) === "auditor") && isJaelLopez(input);
}
function getIvaAmount(expense) {
    if (expense.paymentMethod === "Efectivo") {
        return null;
    }
    const amount = Number(expense.amountMxn || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }
    return amount * 0.16;
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
async function copyTextToClipboard(text) {
    if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const temporaryTextArea = document.createElement("textarea");
    temporaryTextArea.value = text;
    temporaryTextArea.setAttribute("readonly", "");
    temporaryTextArea.style.position = "absolute";
    temporaryTextArea.style.left = "-9999px";
    document.body.appendChild(temporaryTextArea);
    temporaryTextArea.select();
    document.execCommand("copy");
    document.body.removeChild(temporaryTextArea);
}
function replaceExpense(items, updated) {
    return items.map((item) => (item.id === updated.id ? updated : item));
}
function applyLocalPatch(expense, patch) {
    const next = {
        ...expense,
        ...patch
    };
    if (Object.prototype.hasOwnProperty.call(patch, "bank") && patch.bank == null) {
        next.bank = undefined;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "paidByEmrtAt") && !patch.paidByEmrtAt) {
        next.paidByEmrtAt = undefined;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "paidAt") && !patch.paidAt) {
        next.paidAt = undefined;
    }
    return next;
}
export function GeneralExpensesPage() {
    const { user } = useAuth();
    const now = new Date();
    const [activeTab, setActiveTab] = useState("registro");
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [records, setRecords] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [copiedSummaryDate, setCopiedSummaryDate] = useState("");
    const canRead = hasPermission(user?.permissions, "general-expenses:read") || hasPermission(user?.permissions, "general-expenses:write");
    const canWrite = hasPermission(user?.permissions, "general-expenses:write");
    const canApprove = Boolean(user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN");
    const canPay = Boolean(user && isFinanceUser({ team: user.team, legacyTeam: user.legacyTeam }));
    const canEditEmrtDate = Boolean(user && isEduardoRusconi({ username: user.username, displayName: user.displayName, email: user.email }));
    const canReviewJnlsFlag = Boolean(user && canReviewJnls({
        role: user.role,
        specificRole: user.specificRole,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        shortName: user.shortName
    }));
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
            const response = await apiGet(`/general-expenses?year=${selectedYear}&month=${selectedMonth}`);
            setRecords(response);
            setDrafts({});
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadRecords();
    }, [canRead, selectedMonth, selectedYear]);
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
    function updateExpenseLocal(expenseId, patch) {
        setRecords((items) => items.map((item) => (item.id === expenseId ? applyLocalPatch(item, patch) : item)));
    }
    async function persistExpensePatch(expenseId, payload, localPatch = payload) {
        updateExpenseLocal(expenseId, localPatch);
        try {
            const updated = await apiPatch(`/general-expenses/${expenseId}`, payload);
            setRecords((items) => replaceExpense(items, updated));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
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
            ? Math.max(0, Number(rawValue || 0))
            : clampPercentage(Number(rawValue || 0));
        await persistExpensePatch(expenseId, { [field]: numericValue }, { [field]: numericValue });
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
            setRecords((items) => [...items, created]);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleDelete(expense) {
        if (!canWrite || expense.approvedByEmrt) {
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
    function handleDistributionModeChange(expense, field, checked) {
        if (!canWrite || expense.approvedByEmrt) {
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
    async function handleCopySummary(summaryMessage, date) {
        try {
            await copyTextToClipboard(summaryMessage);
            setCopiedSummaryDate(date);
            window.setTimeout(() => {
                setCopiedSummaryDate((current) => (current === date ? "" : current));
            }, 2000);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
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
            .map(([date, data]) => ({
            date,
            total: data.total,
            items: data.items,
            summaryMessage: buildEmrtSummaryMessage(date, data.items, data.total)
        }))
            .sort((left, right) => left.date.localeCompare(right.date));
    }, [records]);
    const emrtGrandTotal = useMemo(() => emrtDailyTotals.reduce((sum, item) => sum + item.total, 0), [emrtDailyTotals]);
    return (_jsxs("section", { className: "page-stack general-expenses-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Gastos" }), _jsx("div", { children: _jsx("h2", { children: "Gastos generales" }) })] }), _jsx("p", { className: "muted", children: "Registro mensual de gastos, distribucion por equipo, bloqueo por aprobaciones y resumen diario de gastos pagados por EMRT." })] }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "leads-tabs", role: "tablist", "aria-label": "Vistas de gastos generales", children: [_jsx("button", { type: "button", className: `lead-tab ${activeTab === "registro" ? "is-active" : ""}`, onClick: () => setActiveTab("registro"), children: "1. Registro" }), _jsx("button", { type: "button", className: `lead-tab ${activeTab === "emrt" ? "is-active" : ""}`, onClick: () => setActiveTab("emrt"), children: "2. Pagado por EMRT" })] }) }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel general-expenses-toolbar", children: [_jsxs("div", { className: "general-expenses-filters", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "A\u00F1o" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: YEAR_OPTIONS.map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthName, index) => (_jsx("option", { value: index + 1, children: monthName }, monthName))) })] })] }), _jsxs("div", { className: "general-expenses-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => void loadRecords(), children: "Refrescar" }), activeTab === "registro" ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => void handleCopyToNextMonth(), disabled: !canWrite, children: "Copiar a mes siguiente" }), _jsx("button", { type: "button", className: "primary-button", onClick: () => void handleAddRow(), disabled: !canWrite, children: "+ Agregar Gasto" })] })) : null] })] }), activeTab === "registro" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "panel", children: _jsxs("div", { className: "general-expense-summary-grid", children: [_jsxs("article", { className: "general-expense-summary-card is-total", children: [_jsx("span", { children: "Total gastos registrados" }), _jsx("strong", { children: formatCurrency(totals.totalAmount) })] }), _jsxs("article", { className: "general-expense-summary-card is-limit", children: [_jsx("span", { children: "Total l\u00EDmite" }), _jsx("strong", { children: formatCurrency(totals.totalLimit) })] }), _jsxs("article", { className: "general-expense-summary-card is-paid", children: [_jsx("span", { children: "Total pagado" }), _jsx("strong", { children: formatCurrency(totals.totalPaid) })] }), _jsxs("article", { className: "general-expense-summary-card is-pending", children: [_jsx("span", { children: "Pendiente de pago" }), _jsx("strong", { children: formatCurrency(totals.totalAmount - totals.totalPaid) })] })] }) }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Registro mensual" }), _jsxs("span", { children: [records.length, " registros"] })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper general-expense-table-wrapper", children: _jsxs("table", { className: "lead-table general-expense-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No." }), _jsx("th", { children: "Detalle de Gasto" }), _jsx("th", { children: "Monto" }), _jsx("th", { children: "IVA" }), _jsx("th", { children: "\u00BFCuenta para l\u00EDmite?" }), _jsx("th", { children: "Suma L\u00EDmite" }), _jsx("th", { children: "Gasto general" }), _jsx("th", { children: "Gasto sin equipo" }), DISTRIBUTION_FIELDS.map((field) => (_jsx("th", { children: field.label }, field.key))), _jsx("th", { children: "SUM %" }), _jsx("th", { children: "M\u00E9todo" }), _jsx("th", { children: "Banco" }), _jsx("th", { children: "Gasto Recurrente" }), _jsx("th", { children: "Aprobado EMRT" }), _jsx("th", { children: "Fecha pagado por EMRT" }), _jsx("th", { children: "Aprobado por JNLS" }), _jsx("th", { children: "\u00BFPagado a receptor final?" }), _jsx("th", { children: "Fecha Pago" }), _jsx("th", { children: "Sin equipo" }), _jsx("th", { children: "Litigio" }), _jsx("th", { children: "Corporativo" }), _jsx("th", { children: "Convenios" }), _jsx("th", { children: "Financiero" }), _jsx("th", { children: "Fiscal" }), _jsx("th", { children: "Total Pagado" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 30, className: "centered-inline-message", children: "Cargando gastos..." }) })) : records.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 30, className: "centered-inline-message", children: "No hay gastos registrados en este mes." }) })) : ((() => {
                                                        let runningLimit = 0;
                                                        return records.map((expense, index) => {
                                                            if (expense.countsTowardLimit) {
                                                                runningLimit += Number(expense.amountMxn || 0);
                                                            }
                                                            const distribution = distributeExpense(expense);
                                                            const ivaAmount = getIvaAmount(expense);
                                                            const { sum } = getDistributionPct(expense);
                                                            const pctDisabled = !canWrite || expense.approvedByEmrt || expense.generalExpense || expense.expenseWithoutTeam;
                                                            const rowIncomplete = isRowIncomplete(expense);
                                                            const draftAmount = drafts[expense.id]?.amountMxn ?? formatEditableNumber(Number(expense.amountMxn || 0));
                                                            return (_jsxs("tr", { className: rowIncomplete ? "general-expense-row-danger" : undefined, children: [_jsx("td", { className: "general-expense-row-index", children: index + 1 }), _jsx("td", { children: _jsx("textarea", { className: "general-expense-input general-expense-textarea", value: drafts[expense.id]?.detail ?? expense.detail ?? "", onChange: (event) => setDraft(expense.id, "detail", event.target.value), onBlur: () => void flushDraftField(expense.id, "detail"), rows: 2, disabled: !canWrite || expense.approvedByEmrt }) }), _jsx("td", { children: _jsx("input", { className: "general-expense-input general-expense-number-input", type: "number", min: "0", step: "0.01", value: draftAmount, onChange: (event) => setDraft(expense.id, "amountMxn", event.target.value), onBlur: () => void flushDraftField(expense.id, "amountMxn"), disabled: !canWrite || expense.approvedByEmrt }) }), _jsx("td", { children: _jsx("div", { className: `general-expense-readonly-cell ${expense.paymentMethod === "Efectivo" ? "is-disabled" : ""}`, children: ivaAmount !== null ? formatCurrency(ivaAmount) : "-" }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.countsTowardLimit, onChange: (event) => void persistExpensePatch(expense.id, { countsTowardLimit: event.target.checked }), disabled: !canWrite || expense.approvedByEmrt }) }), _jsx("td", { className: `general-expense-limit-cell ${expense.countsTowardLimit ? "is-active" : ""}`, children: expense.countsTowardLimit ? formatCurrency(runningLimit) : "-" }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.generalExpense, onChange: (event) => handleDistributionModeChange(expense, "generalExpense", event.target.checked), disabled: !canWrite || expense.approvedByEmrt }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.expenseWithoutTeam, onChange: (event) => handleDistributionModeChange(expense, "expenseWithoutTeam", event.target.checked), disabled: !canWrite || expense.approvedByEmrt }) }), DISTRIBUTION_FIELDS.map((field) => (_jsx("td", { children: _jsxs("div", { className: "general-expense-percent-field", children: [_jsx("input", { className: "general-expense-input general-expense-percent-input", type: "number", min: "0", max: "100", step: "0.01", value: drafts[expense.id]?.[field.key] ?? formatEditableNumber(Number(expense[field.key] || 0)), onChange: (event) => setDraft(expense.id, field.key, event.target.value), onBlur: () => void flushDraftField(expense.id, field.key), disabled: pctDisabled }), _jsx("span", { children: "%" })] }) }, `${expense.id}-${field.key}`))), _jsx("td", { className: `general-expense-percent-sum ${sum === 100 ? "is-valid" : "is-invalid"}`, children: expense.expenseWithoutTeam ? "" : `${sum}%` }), _jsx("td", { children: _jsx("select", { className: "general-expense-input", value: expense.paymentMethod, onChange: (event) => {
                                                                                const nextMethod = event.target.value;
                                                                                const localPatch = nextMethod === "Efectivo"
                                                                                    ? { paymentMethod: nextMethod, bank: null }
                                                                                    : { paymentMethod: nextMethod };
                                                                                void persistExpensePatch(expense.id, localPatch, localPatch);
                                                                            }, disabled: !canWrite || expense.approvedByEmrt, children: PAYMENT_METHOD_OPTIONS.map((method) => (_jsx("option", { value: method, children: method }, method))) }) }), _jsx("td", { children: _jsxs("select", { className: "general-expense-input", value: expense.bank ?? "", onChange: (event) => void persistExpensePatch(expense.id, {
                                                                                bank: (event.target.value || null)
                                                                            }), disabled: !canWrite || expense.approvedByEmrt || expense.paymentMethod !== "Transferencia", children: [_jsx("option", { value: "", children: "Seleccionar..." }), BANK_OPTIONS.map((bank) => (_jsx("option", { value: bank, children: bank }, bank)))] }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.recurring, onChange: (event) => void persistExpensePatch(expense.id, { recurring: event.target.checked }), disabled: !canWrite || expense.approvedByEmrt }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.approvedByEmrt, onChange: (event) => void persistExpensePatch(expense.id, { approvedByEmrt: event.target.checked }), disabled: !canApprove }) }), _jsx("td", { children: _jsxs("div", { className: "general-expense-date-stack", children: [_jsx("input", { className: "general-expense-input", type: "date", value: toDateInput(expense.paidByEmrtAt), onChange: (event) => void persistExpensePatch(expense.id, { paidByEmrtAt: event.target.value || null }), disabled: !canEditEmrtDate || expense.paymentMethod !== "Efectivo" }), _jsx("button", { type: "button", className: "general-expense-inline-button", onClick: () => void persistExpensePatch(expense.id, { paidByEmrtAt: getTodayInput() }), disabled: !canEditEmrtDate || expense.paymentMethod !== "Efectivo", children: "Hoy" })] }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.reviewedByJnls, onChange: (event) => void persistExpensePatch(expense.id, { reviewedByJnls: event.target.checked }), disabled: !canReviewJnlsFlag || expense.approvedByEmrt }) }), _jsx("td", { className: "general-expense-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: expense.paid, onChange: (event) => void persistExpensePatch(expense.id, { paid: event.target.checked }), disabled: !canPay }) }), _jsx("td", { children: _jsx("input", { className: "general-expense-input", type: "date", value: toDateInput(expense.paidAt), onChange: (event) => void persistExpensePatch(expense.id, { paidAt: event.target.value || null }), disabled: !canWrite }) }), _jsx("td", { className: "general-expense-money-cell", children: distribution.withoutTeam > 0 ? formatCurrency(distribution.withoutTeam) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.litigation > 0 ? formatCurrency(distribution.litigation) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.corporateLabor > 0 ? formatCurrency(distribution.corporateLabor) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.settlements > 0 ? formatCurrency(distribution.settlements) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.financialLaw > 0 ? formatCurrency(distribution.financialLaw) : "-" }), _jsx("td", { className: "general-expense-money-cell is-accent", children: distribution.taxCompliance > 0 ? formatCurrency(distribution.taxCompliance) : "-" }), _jsx("td", { className: "general-expense-money-cell is-total", children: distribution.totalPaid > 0 ? formatCurrency(distribution.totalPaid) : "-" }), _jsx("td", { children: _jsx("button", { type: "button", className: "danger-button general-expense-delete-button", onClick: () => void handleDelete(expense), disabled: !canWrite || expense.approvedByEmrt, children: "Borrar" }) })] }, expense.id));
                                                        });
                                                    })()), !loading && records.length > 0 ? (_jsxs("tr", { className: "general-expense-totals-row", children: [_jsx("td", { colSpan: 22, children: "Totales distribuidos:" }), _jsx("td", { children: formatCurrency(totals.withoutTeam) }), _jsx("td", { children: formatCurrency(totals.litigation) }), _jsx("td", { children: formatCurrency(totals.corporateLabor) }), _jsx("td", { children: formatCurrency(totals.settlements) }), _jsx("td", { children: formatCurrency(totals.financialLaw) }), _jsx("td", { children: formatCurrency(totals.taxCompliance) }), _jsx("td", { className: "is-total", children: formatCurrency(totals.totalPaid) }), _jsx("td", {})] })) : null] })] }) }) })] })] })) : (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "general-expense-emrt-total-card", children: [_jsx("span", { children: "Total pagado por Eduardo Rusconi (mes actual)" }), _jsx("strong", { children: formatCurrency(emrtGrandTotal) })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table general-expense-emrt-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Fecha pagado por EMRT" }), _jsx("th", { children: "Total pagado" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 2, className: "centered-inline-message", children: "Cargando resumen EMRT..." }) })) : emrtDailyTotals.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 2, className: "centered-inline-message", children: "Sin gastos con fecha pagada por EMRT en este mes." }) })) : (emrtDailyTotals.map((item) => (_jsxs("tr", { className: "general-expense-emrt-row", children: [_jsxs("td", { children: [_jsx("div", { className: "general-expense-emrt-date", children: formatDateDisplay(item.date) }), _jsxs("div", { className: "general-expense-emrt-copy-block", children: [_jsx("div", { children: _jsx("strong", { children: "Mensaje copiable para Telegram" }) }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => void handleCopySummary(item.summaryMessage, item.date), children: copiedSummaryDate === item.date ? "Copiado" : "Copiar mensaje" })] }), _jsx("textarea", { className: "general-expense-emrt-textarea", readOnly: true, value: item.summaryMessage })] }), _jsx("td", { className: "general-expense-emrt-total", children: formatCurrency(item.total) })] }, item.date)))) })] }) }) })] }))] }));
}
