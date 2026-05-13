import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "../../api/http-client";
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
function formatEditableNumber(value) {
    return Number.isFinite(value) ? String(value) : "0";
}
function getMonthName(month) {
    return MONTH_NAMES[month - 1] ?? `Mes ${month}`;
}
function getIncomeTotal(record) {
    return Number(record.paidThisMonthMxn || 0) + Number(record.payment2Mxn || 0) + Number(record.payment3Mxn || 0);
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
    const [financeRecords, setFinanceRecords] = useState([]);
    const [generalExpenses, setGeneralExpenses] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [draftExpectedExpense, setDraftExpectedExpense] = useState("0");
    const [editingExpectedExpense, setEditingExpectedExpense] = useState(false);
    const [draftNotes, setDraftNotes] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingSnapshots, setLoadingSnapshots] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const canWrite = canWriteModule(user, "budget-planning");
    async function loadOverview() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const overview = await apiGet(`/budget-planning?year=${selectedYear}&month=${selectedMonth}`);
            setPlan(overview.plan);
            setFinanceRecords(overview.financeRecords);
            setGeneralExpenses(overview.generalExpenses);
            setDraftExpectedExpense(formatEditableNumber(overview.plan.expectedExpenseMxn));
            setDraftNotes(overview.plan.notes ?? "");
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
            return;
        }
        try {
            const updated = await apiPatch(`/budget-planning?year=${selectedYear}&month=${selectedMonth}`, patch);
            setPlan(updated);
            setDraftExpectedExpense(formatEditableNumber(updated.expectedExpenseMxn));
            setDraftNotes(updated.notes ?? "");
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadOverview();
        }
    }
    const totals = useMemo(() => {
        const actualIncomeMxn = financeRecords.reduce((sum, record) => sum + getIncomeTotal(record), 0);
        const actualExpenseMxn = generalExpenses.reduce((sum, expense) => sum + Number(expense.amountMxn || 0), 0);
        const expectedIncomeMxn = plan?.expectedIncomeMxn ?? 0;
        const expectedExpenseMxn = plan?.expectedExpenseMxn ?? 0;
        const expectedResultMxn = expectedIncomeMxn - expectedExpenseMxn;
        const actualResultMxn = actualIncomeMxn - actualExpenseMxn;
        return {
            expectedIncomeMxn,
            expectedExpenseMxn,
            actualIncomeMxn,
            actualExpenseMxn,
            expectedResultMxn,
            actualResultMxn,
            incomeProgress: getProgressPercent(actualIncomeMxn, expectedIncomeMxn),
            expenseProgress: getProgressPercent(actualExpenseMxn, expectedExpenseMxn)
        };
    }, [financeRecords, generalExpenses, plan]);
    const expectedResultTone = totals.expectedResultMxn >= 0 ? "is-positive" : "is-negative";
    const actualResultTone = totals.actualResultMxn >= 0 ? "is-positive" : "is-negative";
    return (_jsxs("section", { className: "page-stack budget-planning-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u{1F4CB}" }), _jsx("div", { children: _jsxs("h2", { children: ["Planeaci", "\u00f3", "n presupuestal"] }) })] }), _jsx("p", { className: "muted", children: "Vista mensual para comparar ingresos y gastos esperados contra lo reportado en Finanzas y Gastos generales." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsx("section", { className: "panel", children: _jsxs("div", { className: "finance-toolbar", children: [_jsxs("div", { className: "finance-toolbar-group", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: YEAR_OPTIONS.map((year) => _jsx("option", { value: year, children: year }, year)) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => _jsx("option", { value: month, children: getMonthName(month) }, month)) })] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => activeTab === "snapshots" ? void loadSnapshots() : void loadOverview(), children: "Actualizar" })] }) }), _jsx("section", { className: "panel finance-tabs-panel", children: _jsxs("div", { className: "finance-tabs", children: [_jsx("button", { className: `finance-tab ${activeTab === "current" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("current"), children: "Mes en curso" }), _jsxs("button", { className: `finance-tab ${activeTab === "snapshots" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("snapshots"), children: ["Estampas hist", "\u00f3", "ricas"] })] }) }), activeTab === "current" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "budget-control-grid", children: [_jsxs("article", { className: "budget-comparison-card", children: [_jsxs("div", { className: "budget-card-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Ingresos sin IVA" }), _jsx("span", { children: "Finanzas" })] }), _jsxs("strong", { children: [Math.round(totals.incomeProgress), "%"] })] }), _jsxs("div", { className: "budget-pair-grid", children: [_jsxs("div", { className: "budget-reported-field budget-readonly-field", children: [_jsx("span", { children: "Esperados" }), _jsx("strong", { children: formatCurrency(totals.expectedIncomeMxn) })] }), _jsxs("div", { className: "budget-reported-field", children: [_jsx("span", { children: "Reportados" }), _jsx("strong", { children: formatCurrency(totals.actualIncomeMxn) })] })] }), _jsx("div", { className: "budget-progress-track", children: _jsx("div", { className: "budget-progress-fill income", style: { width: `${totals.incomeProgress}%` } }) })] }), _jsxs("article", { className: "budget-comparison-card", children: [_jsxs("div", { className: "budget-card-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Egresos sin IVA" }), _jsx("span", { children: "Gastos generales" })] }), _jsxs("strong", { children: [Math.round(totals.expenseProgress), "%"] })] }), _jsxs("div", { className: "budget-pair-grid", children: [_jsxs("label", { className: "form-field budget-expected-field", children: [_jsx("span", { children: "Esperados" }), _jsx("input", { type: "text", inputMode: "decimal", value: editingExpectedExpense ? draftExpectedExpense : formatCurrency(Number(draftExpectedExpense || 0)), disabled: !canWrite, onFocus: () => setEditingExpectedExpense(true), onChange: (event) => setDraftExpectedExpense(event.target.value), onBlur: () => {
                                                            setEditingExpectedExpense(false);
                                                            void persistPlanPatch({ expectedExpenseMxn: Math.max(0, Number(draftExpectedExpense || 0)) });
                                                        } })] }), _jsxs("div", { className: "budget-reported-field", children: [_jsx("span", { children: "Reportados" }), _jsx("strong", { children: formatCurrency(totals.actualExpenseMxn) })] })] }), _jsx("div", { className: "budget-progress-track", children: _jsx("div", { className: "budget-progress-fill expense", style: { width: `${totals.expenseProgress}%` } }) })] }), _jsxs("article", { className: "budget-result-comparison-card", children: [_jsx("div", { className: "budget-card-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Resultado financiero" }), _jsx("span", { children: "Esperado vs real" })] }) }), _jsxs("div", { className: "budget-result-pair", children: [_jsxs("div", { className: `budget-result-value ${expectedResultTone}`, children: [_jsx("span", { children: "Esperado" }), _jsx("strong", { children: formatCurrency(totals.expectedResultMxn) })] }), _jsxs("div", { className: `budget-result-value ${actualResultTone}`, children: [_jsx("span", { children: "Real" }), _jsx("strong", { children: formatCurrency(totals.actualResultMxn) })] })] }), _jsxs("small", { children: ["Diferencia: ", formatCurrency(totals.actualResultMxn - totals.expectedResultMxn)] })] })] }), _jsxs("section", { className: "panel budget-notes-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Notas de ", getMonthName(selectedMonth), " ", selectedYear] }), _jsx("span", { children: loading ? "Cargando..." : "En tiempo real" })] }), _jsxs("label", { className: "form-field budget-notes-field", children: [_jsx("span", { children: "Notas del mes" }), _jsx("textarea", { value: draftNotes, disabled: !canWrite, onChange: (event) => setDraftNotes(event.target.value), onBlur: () => void persistPlanPatch({ notes: draftNotes }), rows: 3 })] })] })] })) : (_jsxs("section", { className: "panel budget-snapshots-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Estampas anteriores a ", getMonthName(selectedMonth), " ", selectedYear] }), _jsx("span", { children: loadingSnapshots ? "Cargando..." : `${snapshots.length} estampas` })] }), _jsx("div", { className: "budget-snapshot-grid", children: loadingSnapshots ? (_jsx("p", { className: "muted", children: "Cargando estampas historicas..." })) : snapshots.length === 0 ? (_jsx("p", { className: "muted", children: "Aun no hay meses anteriores con planeacion o movimientos para estampar." })) : (snapshots.map((snapshot) => {
                            const snapshotExpectedTone = snapshot.expectedResultMxn >= 0 ? "is-positive" : "is-negative";
                            const snapshotActualTone = snapshot.actualResultMxn >= 0 ? "is-positive" : "is-negative";
                            return (_jsxs("article", { className: "budget-snapshot-card", children: [_jsx("div", { className: "budget-card-head", children: _jsxs("div", { children: [_jsxs("h3", { children: [getMonthName(snapshot.month), " ", snapshot.year] }), _jsxs("span", { children: ["Estampa congelada el ", new Date(snapshot.createdAt).toLocaleDateString("es-MX")] })] }) }), _jsxs("div", { className: "budget-snapshot-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: "Ingresos esperados" }), _jsx("strong", { children: formatCurrency(snapshot.expectedIncomeMxn) })] }), _jsxs("div", { children: [_jsx("span", { children: "Ingresos reportados" }), _jsx("strong", { children: formatCurrency(snapshot.actualIncomeMxn) })] }), _jsxs("div", { children: [_jsx("span", { children: "Egresos esperados" }), _jsx("strong", { children: formatCurrency(snapshot.expectedExpenseMxn) })] }), _jsxs("div", { children: [_jsx("span", { children: "Egresos reportados" }), _jsx("strong", { children: formatCurrency(snapshot.actualExpenseMxn) })] })] }), _jsxs("div", { className: "budget-result-pair", children: [_jsxs("div", { className: `budget-result-value ${snapshotExpectedTone}`, children: [_jsx("span", { children: "Resultado esperado" }), _jsx("strong", { children: formatCurrency(snapshot.expectedResultMxn) })] }), _jsxs("div", { className: `budget-result-value ${snapshotActualTone}`, children: [_jsx("span", { children: "Resultado real" }), _jsx("strong", { children: formatCurrency(snapshot.actualResultMxn) })] })] }), _jsxs("small", { children: [snapshot.financeRecordCount, " ingresos y ", snapshot.generalExpenseCount, " egresos reportados"] }), snapshot.notes ? _jsx("p", { className: "muted", children: snapshot.notes }) : null] }, snapshot.id));
                        })) })] }))] }));
}
