import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canWriteModule } from "../auth/permissions";
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
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function parseEditableMoney(value) {
    const normalized = value.replace(/[$,\s]/g, "");
    const numeric = Number(normalized || 0);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
let expenseBreakdownDraftRowSequence = 0;
function createExpenseBreakdownDraftRow(concept = "", amountMxn = 0) {
    expenseBreakdownDraftRowSequence += 1;
    return {
        id: `expense-breakdown-draft-${expenseBreakdownDraftRowSequence}`,
        concept,
        amountMxn: formatCurrency(amountMxn)
    };
}
function toExpenseBreakdownDraft(items) {
    return items.map((item) => createExpenseBreakdownDraftRow(item.concept, item.amountMxn));
}
function normalizeExpenseBreakdownDraft(rows) {
    return rows
        .map((row) => ({
        concept: row.concept.trim(),
        amountMxn: parseEditableMoney(row.amountMxn)
    }))
        .filter((row) => row.concept.length > 0 || row.amountMxn > 0);
}
function getMonthName(month) {
    return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}
function getIncomeTotal(record) {
    const primaryPaymentMxn = record.paymentDate1 && (record.paymentMethod === "T" || record.paymentMethod === "E_RECEIVED")
        ? Number(record.paidThisMonthMxn || 0)
        : 0;
    const payment2Mxn = record.paymentDate2 && (record.paymentMethod2 === "T" || record.paymentMethod2 === "E_RECEIVED")
        ? Number(record.payment2Mxn || 0)
        : 0;
    const payment3Mxn = record.paymentDate3 && (record.paymentMethod3 === "T" || record.paymentMethod3 === "E_RECEIVED")
        ? Number(record.payment3Mxn || 0)
        : 0;
    return primaryPaymentMxn + payment2Mxn + payment3Mxn;
}
function getExpectedIncomeThisMonth(record) {
    return Number(record.conceptFeesMxn || 0);
}
function getProgressPercent(actual, expected) {
    if (expected <= 0) {
        return actual > 0 ? 100 : 0;
    }
    return Math.min(100, Math.max(0, (actual / expected) * 100));
}
export function BudgetPlanningPage() {
    const { user } = useAuth();
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [activeTab, setActiveTab] = useState("current");
    const [plan, setPlan] = useState(null);
    const [expectedExpenseBreakdown, setExpectedExpenseBreakdown] = useState([]);
    const [draftExpenseBreakdown, setDraftExpenseBreakdown] = useState([]);
    const [financeRecords, setFinanceRecords] = useState([]);
    const [generalExpenses, setGeneralExpenses] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [expenseBreakdownOpen, setExpenseBreakdownOpen] = useState(false);
    const [savingExpenseBreakdown, setSavingExpenseBreakdown] = useState(false);
    const [draftNotes, setDraftNotes] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingSnapshots, setLoadingSnapshots] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const canWrite = canWriteModule(user, "budget-planning");
    function applyOverview(overview) {
        setPlan(overview.plan);
        setExpectedExpenseBreakdown(overview.expectedExpenseBreakdown);
        setDraftExpenseBreakdown(toExpenseBreakdownDraft(overview.expectedExpenseBreakdown));
        setFinanceRecords(overview.financeRecords);
        setGeneralExpenses(overview.generalExpenses);
        setDraftNotes(overview.plan.notes ?? "");
    }
    async function loadOverview() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const overview = await apiGet(`/budget-planning?year=${selectedYear}&month=${selectedMonth}`);
            applyOverview(overview);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    async function loadSnapshots() {
        setLoadingSnapshots(true);
        setErrorMessage(null);
        try {
            const response = await apiGet(`/budget-planning/snapshots?year=${selectedYear}&month=${selectedMonth}`);
            setSnapshots(response);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoadingSnapshots(false);
        }
    }
    useEffect(() => {
        if (activeTab === "snapshots") {
            void loadSnapshots();
            return;
        }
        void loadOverview();
    }, [activeTab, selectedMonth, selectedYear]);
    async function persistPlanPatch(patch) {
        if (!canWrite) {
            return false;
        }
        try {
            const overview = await apiPatch(`/budget-planning?year=${selectedYear}&month=${selectedMonth}`, patch);
            applyOverview(overview);
            return true;
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadOverview();
            return false;
        }
    }
    function openExpenseBreakdown() {
        setDraftExpenseBreakdown(expectedExpenseBreakdown.length > 0
            ? toExpenseBreakdownDraft(expectedExpenseBreakdown)
            : [createExpenseBreakdownDraftRow()]);
        setExpenseBreakdownOpen(true);
    }
    function updateDraftExpenseBreakdownRow(index, patch) {
        setDraftExpenseBreakdown((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    }
    function addDraftExpenseBreakdownRow() {
        setDraftExpenseBreakdown((current) => [...current, createExpenseBreakdownDraftRow()]);
    }
    function removeDraftExpenseBreakdownRow(index) {
        setDraftExpenseBreakdown((current) => current.filter((_, rowIndex) => rowIndex !== index));
    }
    async function saveExpenseBreakdown() {
        setSavingExpenseBreakdown(true);
        try {
            const saved = await persistPlanPatch({ expectedExpenseBreakdown: normalizeExpenseBreakdownDraft(draftExpenseBreakdown) });
            if (saved) {
                setExpenseBreakdownOpen(false);
            }
        }
        finally {
            setSavingExpenseBreakdown(false);
        }
    }
    async function copyExpenseBreakdownToNextMonth() {
        if (!canWrite) {
            return;
        }
        setSavingExpenseBreakdown(true);
        try {
            const saved = await persistPlanPatch({ expectedExpenseBreakdown: normalizeExpenseBreakdownDraft(draftExpenseBreakdown) });
            if (!saved) {
                return;
            }
            const result = await apiPost("/budget-planning/expense-breakdown/copy-to-next-month", {
                year: selectedYear,
                month: selectedMonth
            });
            window.alert(`Se copiaron ${result.copied} filas a ${getMonthName(result.month)} ${result.year}.`);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setSavingExpenseBreakdown(false);
        }
    }
    const totals = useMemo(() => {
        const actualIncomeMxn = financeRecords.reduce((sum, record) => sum + getIncomeTotal(record), 0);
        const actualExpenseMxn = generalExpenses.reduce((sum, expense) => sum + Number(expense.amountMxn || 0), 0);
        const expectedIncomeMxn = financeRecords.reduce((sum, record) => sum + getExpectedIncomeThisMonth(record), 0);
        const expectedHighProbabilityIncomeMxn = financeRecords.reduce((sum, record) => sum + (record.highCollectionProbability ? getExpectedIncomeThisMonth(record) : 0), 0);
        const expectedLowProbabilityIncomeMxn = financeRecords.reduce((sum, record) => sum + (record.lowCollectionProbability ? getExpectedIncomeThisMonth(record) : 0), 0);
        const expectedExpenseMxn = plan?.expectedExpenseMxn ?? 0;
        const expectedResultMxn = expectedHighProbabilityIncomeMxn - expectedExpenseMxn;
        const actualResultMxn = actualIncomeMxn - actualExpenseMxn;
        return {
            expectedIncomeMxn,
            expectedHighProbabilityIncomeMxn,
            expectedLowProbabilityIncomeMxn,
            expectedExpenseMxn,
            actualIncomeMxn,
            actualExpenseMxn,
            expectedResultMxn,
            actualResultMxn,
            incomeProgress: getProgressPercent(actualIncomeMxn, expectedIncomeMxn),
            expenseProgress: getProgressPercent(actualExpenseMxn, expectedExpenseMxn)
        };
    }, [financeRecords, generalExpenses, plan]);
    const draftExpenseBreakdownTotal = useMemo(() => normalizeExpenseBreakdownDraft(draftExpenseBreakdown).reduce((sum, row) => sum + row.amountMxn, 0), [draftExpenseBreakdown]);
    const expectedResultTone = totals.expectedResultMxn >= 0 ? "is-positive" : "is-negative";
    const actualResultTone = totals.actualResultMxn >= 0 ? "is-positive" : "is-negative";
    return (_jsxs("section", { className: "page-stack budget-planning-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u{1F4CB}" }), _jsx("div", { children: _jsxs("h2", { children: ["Planeaci", "\u00f3", "n presupuestal"] }) })] }), _jsx("p", { className: "muted", children: "Vista mensual para comparar ingresos y gastos esperados contra lo reportado en Finanzas y Gastos generales." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsx("section", { className: "panel", children: _jsxs("div", { className: "finance-toolbar", children: [_jsxs("div", { className: "finance-toolbar-group", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: YEAR_OPTIONS.map((year) => _jsx("option", { value: year, children: year }, year)) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => _jsx("option", { value: month, children: getMonthName(month) }, month)) })] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => activeTab === "snapshots" ? void loadSnapshots() : void loadOverview(), children: "Actualizar" })] }) }), _jsx("section", { className: "panel finance-tabs-panel", children: _jsxs("div", { className: "finance-tabs", children: [_jsx("button", { className: `finance-tab ${activeTab === "current" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("current"), children: "Mes en curso" }), _jsxs("button", { className: `finance-tab ${activeTab === "snapshots" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("snapshots"), children: ["Estampas hist", "\u00f3", "ricas"] })] }) }), activeTab === "current" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "budget-control-grid", children: [_jsxs("article", { className: "budget-comparison-card", children: [_jsxs("div", { className: "budget-card-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Ingresos sin IVA" }), _jsx("span", { children: "Finanzas" })] }), _jsxs("strong", { children: [Math.round(totals.incomeProgress), "%"] })] }), _jsxs("div", { className: "budget-pair-grid budget-income-grid", children: [_jsxs("div", { className: "budget-reported-field budget-readonly-field", children: [_jsx("span", { children: "Esperados total" }), _jsx("strong", { children: formatCurrency(totals.expectedIncomeMxn) })] }), _jsxs("div", { className: "budget-reported-field", children: [_jsx("span", { children: "Reportados" }), _jsx("strong", { children: formatCurrency(totals.actualIncomeMxn) })] }), _jsxs("div", { className: "budget-reported-field budget-readonly-field", children: [_jsx("span", { children: "Alta prob." }), _jsx("strong", { children: formatCurrency(totals.expectedHighProbabilityIncomeMxn) })] }), _jsxs("div", { className: "budget-reported-field budget-readonly-field", children: [_jsx("span", { children: "Baja prob." }), _jsx("strong", { children: formatCurrency(totals.expectedLowProbabilityIncomeMxn) })] })] }), _jsx("div", { className: "budget-progress-track", children: _jsx("div", { className: "budget-progress-fill income", style: { width: `${totals.incomeProgress}%` } }) })] }), _jsxs("article", { className: "budget-comparison-card", children: [_jsxs("div", { className: "budget-card-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Egresos sin IVA" }), _jsx("span", { children: "Gastos generales" })] }), _jsxs("strong", { children: [Math.round(totals.expenseProgress), "%"] })] }), _jsxs("div", { className: "budget-pair-grid", children: [_jsxs("div", { className: "budget-reported-field budget-expected-expense-field", children: [_jsx("span", { children: "Esperados" }), _jsx("strong", { children: formatCurrency(totals.expectedExpenseMxn) }), _jsx("button", { className: "secondary-button budget-breakdown-button", type: "button", onClick: openExpenseBreakdown, children: "Entrar a desglose" })] }), _jsxs("div", { className: "budget-reported-field", children: [_jsx("span", { children: "Reportados" }), _jsx("strong", { children: formatCurrency(totals.actualExpenseMxn) })] })] }), _jsx("div", { className: "budget-progress-track", children: _jsx("div", { className: "budget-progress-fill expense", style: { width: `${totals.expenseProgress}%` } }) })] }), _jsxs("article", { className: "budget-result-comparison-card", children: [_jsx("div", { className: "budget-card-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Resultado financiero" }), _jsx("span", { children: "Esperado vs real" })] }) }), _jsxs("div", { className: "budget-result-pair", children: [_jsxs("div", { className: `budget-result-value ${expectedResultTone}`, children: [_jsx("span", { children: "Esperado alta" }), _jsx("strong", { children: formatCurrency(totals.expectedResultMxn) })] }), _jsxs("div", { className: `budget-result-value ${actualResultTone}`, children: [_jsx("span", { children: "Real" }), _jsx("strong", { children: formatCurrency(totals.actualResultMxn) })] })] }), _jsxs("small", { children: ["Diferencia: ", formatCurrency(totals.actualResultMxn - totals.expectedResultMxn)] })] })] }), _jsxs("section", { className: "panel budget-notes-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Notas de ", getMonthName(selectedMonth), " ", selectedYear] }), _jsx("span", { children: loading ? "Cargando..." : "En tiempo real" })] }), _jsxs("label", { className: "form-field budget-notes-field", children: [_jsx("span", { children: "Notas del mes" }), _jsx("textarea", { value: draftNotes, disabled: !canWrite, onChange: (event) => setDraftNotes(event.target.value), onBlur: () => void persistPlanPatch({ notes: draftNotes }), rows: 3 })] })] })] })) : (_jsxs("section", { className: "panel budget-snapshots-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Estampas anteriores a ", getMonthName(selectedMonth), " ", selectedYear] }), _jsx("span", { children: loadingSnapshots ? "Cargando..." : `${snapshots.length} estampas` })] }), _jsx("div", { className: "budget-snapshot-grid", children: loadingSnapshots ? (_jsx("p", { className: "muted", children: "Cargando estampas historicas..." })) : snapshots.length === 0 ? (_jsx("p", { className: "muted", children: "Aun no hay meses anteriores con planeacion o movimientos para estampar." })) : (snapshots.map((snapshot) => {
                            const snapshotExpectedTone = snapshot.expectedResultMxn >= 0 ? "is-positive" : "is-negative";
                            const snapshotActualTone = snapshot.actualResultMxn >= 0 ? "is-positive" : "is-negative";
                            return (_jsxs("article", { className: "budget-snapshot-card", children: [_jsx("div", { className: "budget-card-head", children: _jsxs("div", { children: [_jsxs("h3", { children: [getMonthName(snapshot.month), " ", snapshot.year] }), _jsxs("span", { children: ["Estampa congelada el ", new Date(snapshot.createdAt).toLocaleDateString("es-MX")] })] }) }), _jsxs("div", { className: "budget-snapshot-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: "Ingresos esperados" }), _jsx("strong", { children: formatCurrency(snapshot.expectedIncomeMxn) })] }), _jsxs("div", { children: [_jsx("span", { children: "Ingresos reportados" }), _jsx("strong", { children: formatCurrency(snapshot.actualIncomeMxn) })] }), _jsxs("div", { children: [_jsx("span", { children: "Egresos esperados" }), _jsx("strong", { children: formatCurrency(snapshot.expectedExpenseMxn) })] }), _jsxs("div", { children: [_jsx("span", { children: "Egresos reportados" }), _jsx("strong", { children: formatCurrency(snapshot.actualExpenseMxn) })] })] }), _jsxs("div", { className: "budget-result-pair", children: [_jsxs("div", { className: `budget-result-value ${snapshotExpectedTone}`, children: [_jsx("span", { children: "Resultado esperado" }), _jsx("strong", { children: formatCurrency(snapshot.expectedResultMxn) })] }), _jsxs("div", { className: `budget-result-value ${snapshotActualTone}`, children: [_jsx("span", { children: "Resultado real" }), _jsx("strong", { children: formatCurrency(snapshot.actualResultMxn) })] })] }), _jsxs("small", { children: [snapshot.financeRecordCount, " ingresos y ", snapshot.generalExpenseCount, " egresos reportados"] }), snapshot.notes ? _jsx("p", { className: "muted", children: snapshot.notes }) : null] }, snapshot.id));
                        })) })] })), expenseBreakdownOpen ? (_jsx("div", { className: "finance-modal-backdrop", role: "presentation", onClick: () => setExpenseBreakdownOpen(false), children: _jsxs("div", { className: "finance-modal finance-modal-wide budget-expense-breakdown-modal", role: "dialog", "aria-modal": "true", "aria-label": "Desglose de egresos esperados", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "finance-modal-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Desglose de egresos esperados" }), _jsxs("span", { children: [getMonthName(selectedMonth), " ", selectedYear] })] }), _jsx("strong", { children: formatCurrency(draftExpenseBreakdownTotal) })] }), _jsxs("div", { className: "budget-breakdown-toolbar", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: addDraftExpenseBreakdownRow, disabled: !canWrite || savingExpenseBreakdown, children: "Agregar fila" }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void copyExpenseBreakdownToNextMonth(), disabled: !canWrite || savingExpenseBreakdown, children: "Copiar a mes siguiente" })] }), _jsx("div", { className: "budget-breakdown-table-wrap", children: _jsxs("table", { className: "budget-breakdown-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Concepto" }), _jsx("th", { children: "Monto sin IVA" }), _jsx("th", { children: "Accion" })] }) }), _jsx("tbody", { children: draftExpenseBreakdown.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "centered-inline-message", children: "Sin filas." }) })) : (draftExpenseBreakdown.map((row, index) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { className: "finance-input", value: row.concept, disabled: !canWrite || savingExpenseBreakdown, onChange: (event) => updateDraftExpenseBreakdownRow(index, { concept: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input budget-breakdown-amount-input", inputMode: "decimal", value: row.amountMxn, disabled: !canWrite || savingExpenseBreakdown, onChange: (event) => updateDraftExpenseBreakdownRow(index, { amountMxn: event.target.value }), onBlur: (event) => updateDraftExpenseBreakdownRow(index, { amountMxn: formatCurrency(parseEditableMoney(event.target.value)) }) }) }), _jsx("td", { children: _jsx("button", { className: "danger-button", type: "button", onClick: () => removeDraftExpenseBreakdownRow(index), disabled: !canWrite || savingExpenseBreakdown, children: "Eliminar fila" }) })] }, row.id)))) })] }) }), _jsxs("div", { className: "finance-modal-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => setExpenseBreakdownOpen(false), disabled: savingExpenseBreakdown, children: "Cancelar" }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void saveExpenseBreakdown(), disabled: !canWrite || savingExpenseBreakdown, children: "Guardar desglose" })] })] }) })) : null] }));
}
