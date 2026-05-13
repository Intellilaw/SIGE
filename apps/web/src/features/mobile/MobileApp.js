import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { APP_VERSION_LABEL, APP_VERSION_TEXT, TEAM_OPTIONS } from "@sige/contracts";
import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import { findLegacyTableByAnyName, getCatalogTargetEntries, getTableDisplayName } from "../tasks/task-distribution-utils";
import { buildDistributionHistoryTaskNameMap, hasMeaningfulTaskLabel, isTrackingTermEnabled, resolveHistoryTaskName, resolveTrackingTaskName, usesPresentationAndTermDates } from "../tasks/task-display-utils";
import { LEGACY_TASK_MODULE_BY_ID } from "../tasks/task-legacy-config";
const MOBILE_LEAD_CHANNELS = [
    { value: "WHATSAPP", label: "WhatsApp" },
    { value: "TELEGRAM", label: "Telegram" },
    { value: "WECHAT", label: "WeChat" },
    { value: "EMAIL", label: "Email" },
    { value: "PHONE", label: "Telefono" }
];
const TERMS_TABLE_ID = "terminos";
const RECURRING_TERMS_TABLE_ID = "terminos-recurrentes";
const MOBILE_GENERAL_EXPENSE_TEAMS = [
    { value: "Litigio", label: "Litigio" },
    { value: "Corporativo y laboral", label: "Corporativo y laboral" },
    { value: "Convenios", label: "Convenios" },
    { value: "Der Financiero", label: "Der Financiero" },
    { value: "Compliance Fiscal", label: "Compliance Fiscal" }
];
const MOBILE_GENERAL_EXPENSE_BANKS = ["Banamex", "HSBC"];
function normalizeText(value) {
    return (value ?? "").trim();
}
function normalizeResponsibleOption(value) {
    return normalizeText(value).toUpperCase();
}
function splitResponsibleOptions(value) {
    return normalizeText(value)
        .split(/[\/,;]/)
        .map(normalizeResponsibleOption)
        .filter(Boolean);
}
function dedupeResponsibleOptions(values) {
    return Array.from(new Set(values.map(normalizeResponsibleOption).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function getDefaultResponsibleOption(userShortName, moduleDefaultResponsible) {
    return normalizeResponsibleOption(userShortName) || splitResponsibleOptions(moduleDefaultResponsible)[0] || "";
}
function normalizeComparableText(value) {
    return normalizeText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localDateInput(offset = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addBusinessDays(baseDate, amount) {
    const next = new Date(baseDate);
    let remaining = amount;
    while (remaining > 0) {
        next.setDate(next.getDate() + 1);
        const day = next.getDay();
        if (day !== 0 && day !== 6) {
            remaining -= 1;
        }
    }
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}
function initialLeadForm() {
    return {
        clientName: "",
        prospectName: "",
        subject: "",
        amountMxn: "",
        communicationChannel: "WHATSAPP",
        nextInteractionLabel: "Dar seguimiento",
        nextInteraction: addBusinessDays(new Date(), 1),
        notes: ""
    };
}
function initialFinanceForm() {
    return {
        clientNumber: "",
        clientName: "",
        quoteNumber: "",
        matterType: "ONE_TIME",
        subject: "",
        responsibleTeam: "",
        totalMatterMxn: "",
        workingConcepts: "",
        conceptFeesMxn: "",
        previousPaymentsMxn: "",
        paidThisMonthMxn: "",
        paymentDate1: todayInput(),
        expenseNotes1: "",
        expenseAmount1Mxn: "",
        nextPaymentDate: "",
        nextPaymentNotes: "",
        financeComments: ""
    };
}
function initialGeneralExpenseForm() {
    return {
        detail: "",
        amountMxn: "",
        countsTowardLimit: false,
        distributionMode: "general",
        team: "Litigio",
        paymentMethod: "Transferencia",
        bank: "Banamex",
        recurring: false
    };
}
function toErrorMessage(error) {
    return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
}
function hasMobilePermission(user, permission) {
    return Boolean(user?.permissions.includes("*") || user?.permissions.includes(permission));
}
function canReadMobileFinances(user) {
    return canReadModule(user, "finances");
}
function canWriteMobileFinances(user) {
    return canWriteModule(user, "finances");
}
function canReadMobileLeads(user) {
    return canReadModule(user, "lead-tracking");
}
function canReadMobileGeneralExpenses(user) {
    return canReadModule(user, "general-expenses");
}
function canWriteMobileGeneralExpenses(user) {
    return canWriteModule(user, "general-expenses");
}
function canReadMobileExecution(user) {
    return canReadModule(user, "execution");
}
function parseMoneyInput(value) {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function getMonthName(month) {
    return [
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
    ][month - 1] ?? String(month);
}
function getTeamLabel(team) {
    return TEAM_OPTIONS.find((option) => option.key === team)?.label ?? "-";
}
function getFinanceMatterTypeLabel(type) {
    return type === "RETAINER" ? "Iguala" : "Unico";
}
function formatDateList(values) {
    const dates = values.map(toDateInput).filter(Boolean);
    return dates.length > 0 ? dates.join(" / ") : "-";
}
function getGeneralExpenseDistributionPatch(form) {
    if (form.distributionMode === "general") {
        return {
            team: "General",
            generalExpense: true,
            expenseWithoutTeam: false
        };
    }
    if (form.distributionMode === "without-team") {
        return {
            team: "Sin equipo",
            generalExpense: false,
            expenseWithoutTeam: true
        };
    }
    return {
        team: form.team,
        generalExpense: false,
        expenseWithoutTeam: false,
        pctLitigation: form.team === "Litigio" ? 100 : 0,
        pctCorporateLabor: form.team === "Corporativo y laboral" ? 100 : 0,
        pctSettlements: form.team === "Convenios" ? 100 : 0,
        pctFinancialLaw: form.team === "Der Financiero" ? 100 : 0,
        pctTaxCompliance: form.team === "Compliance Fiscal" ? 100 : 0
    };
}
function getGeneralExpenseDistributionLabel(expense) {
    if (expense.generalExpense) {
        return "Gasto general";
    }
    if (expense.expenseWithoutTeam) {
        return "Sin equipo";
    }
    return expense.team || "Sin equipo";
}
function getEffectiveClientNumber(matter, clients) {
    const normalizedName = normalizeComparableText(matter.clientName);
    const match = clients.find((client) => normalizeComparableText(client.name) === normalizedName);
    return match?.clientNumber ?? normalizeText(matter.clientNumber);
}
function getMatterRecordKeys(matter) {
    return new Set([matter.id, matter.matterNumber, matter.matterIdentifier].map(normalizeText).filter(Boolean));
}
function recordBelongsToMatter(record, matter) {
    const keys = getMatterRecordKeys(matter);
    return keys.has(normalizeText(record.matterId)) ||
        keys.has(normalizeText(record.matterNumber)) ||
        keys.has(normalizeText(record.matterIdentifier));
}
function isPendingRecord(record) {
    return record.status === "pendiente" && !record.deletedAt;
}
function isCompletedStatus(status) {
    return status === "presentado" || status === "concluida";
}
function sortByDate(items) {
    return [...items].sort((left, right) => (toDateInput(left.dueDate ?? left.termDate) || left.createdAt || "").localeCompare(toDateInput(right.dueDate ?? right.termDate) || right.createdAt || ""));
}
function getRecordDate(record) {
    return toDateInput(record.dueDate ?? record.termDate);
}
function getRecordTitle(record) {
    if ("taskName" in record && hasMeaningfulTaskLabel(record.taskName)) {
        return record.taskName;
    }
    if ("pendingTaskLabel" in record) {
        return hasMeaningfulTaskLabel(record.pendingTaskLabel) ? record.pendingTaskLabel : record.eventName || record.subject || "Tarea";
    }
    return record.eventName || record.subject || "Tarea";
}
function findTrackingTable(moduleConfig, record) {
    return findLegacyTableByAnyName(moduleConfig, record.tableCode)
        ?? findLegacyTableByAnyName(moduleConfig, record.sourceTable);
}
function isCompletedTrackingRecord(table, record) {
    if (isCompletedStatus(record.status)) {
        return true;
    }
    return Boolean(table && table.mode === "workflow" && record.workflowStage >= table.tabs.length);
}
function trackingRecordMatchesTable(moduleConfig, record, table) {
    return findTrackingTable(moduleConfig, record)?.slug === table.slug;
}
function getManagerTermDate(table, record) {
    const explicitTerm = toDateInput(record.termDate);
    if (usesPresentationAndTermDates(table)) {
        return isTrackingTermEnabled(record, table) ? explicitTerm : "";
    }
    if (explicitTerm) {
        return explicitTerm;
    }
    if (table && !usesPresentationAndTermDates(table) && (table.autoTerm || table.termManagedDate)) {
        return toDateInput(record.dueDate);
    }
    return "";
}
function isManagerTermRecord(moduleConfig, record) {
    const table = findTrackingTable(moduleConfig, record);
    if (!table) {
        return false;
    }
    if (usesPresentationAndTermDates(table)) {
        return !isCompletedTrackingRecord(table, record) && isTrackingTermEnabled(record, table);
    }
    return !isCompletedTrackingRecord(table, record)
        && Boolean(getManagerTermDate(table, record))
        && Boolean(table.autoTerm || table.termManagedDate);
}
function getLinkedTerm(terms, record) {
    return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}
function termFromTrackingRecord(moduleConfig, record, linkedTerm) {
    const table = findTrackingTable(moduleConfig, record);
    const taskName = resolveTrackingTaskName(record, table, undefined, record.eventName);
    return {
        ...(linkedTerm ?? {
            id: `manager-term-${record.id}`,
            verification: {},
            data: record.data,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        }),
        moduleId: record.moduleId,
        sourceTable: record.sourceTable,
        sourceRecordId: record.id,
        matterId: record.matterId,
        matterNumber: record.matterNumber,
        clientNumber: record.clientNumber,
        clientName: record.clientName,
        subject: record.subject,
        specificProcess: record.specificProcess,
        matterIdentifier: record.matterIdentifier,
        eventName: taskName || record.eventName || "Termino",
        pendingTaskLabel: taskName || undefined,
        responsible: record.responsible,
        dueDate: record.dueDate,
        termDate: getManagerTermDate(table, record),
        status: record.status,
        recurring: false,
        reportedMonth: record.reportedMonth,
        deletedAt: record.deletedAt
    };
}
function buildVisibleTerms(moduleConfig, terms, records, recurring) {
    if (recurring) {
        return terms.filter((term) => term.recurring && !term.deletedAt);
    }
    return records
        .filter((record) => isManagerTermRecord(moduleConfig, record))
        .map((record) => termFromTrackingRecord(moduleConfig, record, getLinkedTerm(terms, record)));
}
function getRecordStatusLabel(status) {
    if (status === "presentado" || status === "concluida") {
        return "Concluida";
    }
    return "Pendiente";
}
function isRecordOverdue(record) {
    const dueDate = getRecordDate(record);
    return isPendingRecord(record) && Boolean(dueDate) && dueDate <= todayInput();
}
function buildDistributionPayload(module, legacyConfig, matter, clients, eventName, responsible, dueDate, targets) {
    return {
        moduleId: module.moduleId,
        matterId: matter.id,
        matterNumber: matter.matterNumber,
        clientNumber: getEffectiveClientNumber(matter, clients),
        clientName: matter.clientName || "Sin cliente",
        subject: matter.subject || "",
        specificProcess: matter.specificProcess ?? null,
        matterIdentifier: matter.matterIdentifier ?? null,
        eventName,
        responsible,
        targets: targets.map((target) => {
            const table = legacyConfig.tables.find((candidate) => candidate.slug === target.tableSlug);
            const taskName = target.taskName.trim() || table?.title || eventName;
            return {
                tableCode: target.tableSlug,
                sourceTable: table?.sourceTable ?? target.tableSlug,
                tableLabel: table?.title ?? target.tableSlug,
                taskName,
                dueDate,
                termDate: table?.autoTerm ? dueDate : null,
                status: "pendiente",
                workflowStage: 1,
                reportedMonth: target.reportedMonth || null,
                createTerm: Boolean(table?.autoTerm),
                data: {
                    source: "mobile-execution",
                    tableTitle: table?.title,
                    activeSource: "mobile"
                }
            };
        })
    };
}
export function MobileProtectedLayout() {
    const { user, loading, logout } = useAuth();
    const showLeads = canReadMobileLeads(user);
    const showFinances = canReadMobileFinances(user);
    const showGeneralExpenses = canReadMobileGeneralExpenses(user);
    const showExecution = canReadMobileExecution(user);
    if (loading) {
        return _jsx("div", { className: "mobile-centered", children: "Cargando SIGE..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/intranet-login?redirect=/mobile", replace: true });
    }
    return (_jsxs("div", { className: "mobile-app-shell", children: [_jsxs("header", { className: "mobile-topbar", children: [_jsxs("div", { children: [_jsxs("strong", { children: ["SIGE movil ", _jsx("span", { className: "mobile-topbar-version", children: APP_VERSION_LABEL })] }), _jsx("span", { children: user.displayName })] }), _jsx("button", { type: "button", onClick: logout, children: "Salir" })] }), _jsx("main", { className: "mobile-content", children: _jsx(Outlet, {}) }), _jsxs("nav", { className: "mobile-tabbar", "aria-label": "Navegacion movil", children: [_jsx(NavLink, { to: "/mobile", end: true, children: "Inicio" }), showLeads ? _jsx(NavLink, { to: "/mobile/leads", children: "Leads" }) : null, showFinances ? _jsx(NavLink, { to: "/mobile/finances", children: "Finanzas" }) : null, showGeneralExpenses ? _jsx(NavLink, { to: "/mobile/general-expenses", children: "Gastos" }) : null, showExecution ? _jsx(NavLink, { to: "/mobile/execution", children: "Ejecucion" }) : null, showExecution ? _jsx(NavLink, { to: "/mobile/tracking", children: "Seguimiento" }) : null] })] }));
}
export function MobileHomePage() {
    const { user } = useAuth();
    const showLeads = canReadMobileLeads(user);
    const showFinances = canReadMobileFinances(user);
    const showGeneralExpenses = canReadMobileGeneralExpenses(user);
    const showExecution = canReadMobileExecution(user);
    return (_jsx("section", { className: "mobile-stack", children: _jsxs("div", { className: "mobile-action-grid", children: [showLeads ? (_jsx(Link, { className: "mobile-home-action", to: "/mobile/leads", children: "Leads" })) : null, showFinances ? (_jsx(Link, { className: "mobile-home-action", to: "/mobile/finances", children: "Finanzas" })) : null, showGeneralExpenses ? (_jsx(Link, { className: "mobile-home-action", to: "/mobile/general-expenses", children: "Gastos generales" })) : null, showExecution ? (_jsx(Link, { className: "mobile-home-action", to: "/mobile/execution", children: "Crear tarea" })) : null, showExecution ? (_jsx(Link, { className: "mobile-home-action", to: "/mobile/tracking", children: "Ver seguimiento" })) : null] }) }));
}
export function MobileLeadsPage() {
    const { user } = useAuth();
    const [form, setForm] = useState(() => initialLeadForm());
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const canRead = canReadMobileLeads(user);
    const canWrite = canWriteModule(user, "lead-tracking");
    const visibleLeads = useMemo(() => {
        const query = normalizeComparableText(search);
        const sorted = [...leads].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
        if (!query) {
            return sorted;
        }
        return sorted.filter((lead) => normalizeComparableText([
            lead.clientName,
            lead.prospectName,
            lead.subject,
            lead.nextInteractionLabel,
            lead.notes
        ].join(" ")).includes(query));
    }, [leads, search]);
    async function loadLeads() {
        setLoading(true);
        setErrorMessage(null);
        try {
            setLeads(await apiGet("/leads"));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!canRead) {
            setLoading(false);
            return;
        }
        void loadLeads();
    }, [canRead]);
    function updateField(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
        setSuccessMessage(null);
    }
    async function handleSubmit(event) {
        event.preventDefault();
        if (!canWrite) {
            return;
        }
        const clientName = normalizeText(form.clientName);
        const prospectName = normalizeText(form.prospectName);
        const subject = normalizeText(form.subject);
        if (!clientName && !prospectName) {
            setErrorMessage("Captura cliente o prospecto.");
            return;
        }
        if (!subject) {
            setErrorMessage("Captura el asunto del lead.");
            return;
        }
        setSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            const created = await apiPost("/leads", {});
            const updated = await apiPatch(`/leads/${created.id}`, {
                clientId: null,
                clientName,
                prospectName: prospectName || null,
                commissionAssignee: null,
                quoteId: null,
                quoteNumber: null,
                subject,
                amountMxn: Number(form.amountMxn || 0),
                communicationChannel: form.communicationChannel,
                lastInteractionLabel: "Captura movil",
                lastInteraction: todayInput(),
                nextInteractionLabel: normalizeText(form.nextInteractionLabel) || null,
                nextInteraction: toDateInput(form.nextInteraction) || null,
                notes: normalizeText(form.notes) || null
            });
            setLeads((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
            setForm(initialLeadForm());
            setSuccessMessage("Lead agregado.");
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setSubmitting(false);
        }
    }
    if (!canRead) {
        return _jsx(Navigate, { to: "/mobile", replace: true });
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Leads", subtitle: "Captura rapida y consulta de leads activos." }), errorMessage ? _jsx("div", { className: "mobile-alert mobile-alert-error", children: errorMessage }) : null, successMessage ? _jsx("div", { className: "mobile-alert mobile-alert-success", children: successMessage }) : null, _jsxs("form", { className: "mobile-section mobile-form-panel", onSubmit: (event) => void handleSubmit(event), children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Nuevo lead" }), _jsx("span", { children: "Movil" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Cliente" }), _jsx("input", { value: form.clientName, onChange: (event) => updateField("clientName", event.target.value), placeholder: "Nombre del cliente" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Prospecto" }), _jsx("input", { value: form.prospectName, onChange: (event) => updateField("prospectName", event.target.value), placeholder: "Si todavia no es cliente" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Asunto" }), _jsx("input", { value: form.subject, onChange: (event) => updateField("subject", event.target.value), placeholder: "Que necesita" })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Monto" }), _jsx("input", { inputMode: "decimal", value: form.amountMxn, onChange: (event) => updateField("amountMxn", event.target.value), placeholder: "0" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Canal" }), _jsx("select", { value: form.communicationChannel, onChange: (event) => updateField("communicationChannel", event.target.value), children: MOBILE_LEAD_CHANNELS.map((channel) => (_jsx("option", { value: channel.value, children: channel.label }, channel.value))) })] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Siguiente accion" }), _jsx("input", { value: form.nextInteractionLabel, onChange: (event) => updateField("nextInteractionLabel", event.target.value) })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: form.nextInteraction, onChange: (event) => updateField("nextInteraction", event.target.value) })] })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Notas" }), _jsx("textarea", { value: form.notes, onChange: (event) => updateField("notes", event.target.value), placeholder: "Contexto breve", rows: 3 })] }), _jsx("button", { className: "mobile-submit", type: "submit", disabled: submitting || !canWrite, children: submitting ? "Guardando..." : "Guardar lead" })] }), _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Leads activos" }), _jsx("span", { children: visibleLeads.length })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Cliente, prospecto, asunto..." })] }), loading ? (_jsx("div", { className: "mobile-empty", children: "Cargando leads..." })) : visibleLeads.length === 0 ? (_jsx("div", { className: "mobile-empty", children: "No hay leads para mostrar." })) : (_jsx("div", { className: "mobile-card-list", children: visibleLeads.map((lead) => (_jsxs("article", { className: "mobile-lead-card", children: [_jsxs("div", { className: "mobile-lead-card-head", children: [_jsx("strong", { children: lead.clientName || lead.prospectName || "Sin nombre" }), _jsx("span", { children: MOBILE_LEAD_CHANNELS.find((channel) => channel.value === lead.communicationChannel)?.label ?? lead.communicationChannel })] }), _jsx("p", { children: lead.subject || "Sin asunto" }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "Siguiente" }), _jsx("dd", { children: lead.nextInteractionLabel || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Fecha" }), _jsx("dd", { children: toDateInput(lead.nextInteraction) || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Monto" }), _jsx("dd", { children: Number(lead.amountMxn || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) })] })] })] }, lead.id))) }))] })] }));
}
export function MobileFinancesPage() {
    const { user } = useAuth();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const canRead = canReadMobileFinances(user);
    const canWrite = canWriteMobileFinances(user);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [form, setForm] = useState(() => initialFinanceForm());
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const monthTotals = useMemo(() => {
        return records.reduce((totals, record) => {
            const income = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;
            const expenses = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
            return {
                income: totals.income + income,
                expenses: totals.expenses + expenses,
                pending: totals.pending + Math.max(record.conceptFeesMxn - record.previousPaymentsMxn - income, 0)
            };
        }, { income: 0, expenses: 0, pending: 0 });
    }, [records]);
    const visibleRecords = useMemo(() => {
        const query = normalizeComparableText(search);
        const sorted = [...records].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
        if (!query) {
            return sorted;
        }
        return sorted.filter((record) => normalizeComparableText([
            record.clientNumber,
            record.clientName,
            record.quoteNumber,
            record.subject,
            record.workingConcepts,
            record.nextPaymentNotes,
            record.financeComments
        ].join(" ")).includes(query));
    }, [records, search]);
    async function loadFinanceRecords(year = selectedYear, month = selectedMonth) {
        setLoading(true);
        setErrorMessage(null);
        try {
            setRecords(await apiGet(`/finances/records?year=${year}&month=${month}`));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!canRead) {
            setLoading(false);
            return;
        }
        void loadFinanceRecords();
    }, [canRead, selectedMonth, selectedYear]);
    function updateField(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
        setSuccessMessage(null);
    }
    async function handleSubmit(event) {
        event.preventDefault();
        const clientName = normalizeText(form.clientName);
        const subject = normalizeText(form.subject);
        const paidThisMonthMxn = parseMoneyInput(form.paidThisMonthMxn);
        const conceptFeesMxn = parseMoneyInput(form.conceptFeesMxn) || paidThisMonthMxn;
        const totalMatterMxn = parseMoneyInput(form.totalMatterMxn) || conceptFeesMxn || paidThisMonthMxn;
        const expenseAmount1Mxn = parseMoneyInput(form.expenseAmount1Mxn);
        if (!clientName) {
            setErrorMessage("Captura el cliente.");
            return;
        }
        if (!subject) {
            setErrorMessage("Captura el asunto o concepto.");
            return;
        }
        if (!canWrite) {
            setErrorMessage("Tu usuario no tiene permiso para agregar entradas de Finanzas.");
            return;
        }
        setSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            const created = await apiPost("/finances/records", {
                year: selectedYear,
                month: selectedMonth,
                clientNumber: normalizeText(form.clientNumber) || null,
                clientName,
                quoteNumber: normalizeText(form.quoteNumber) || null,
                matterType: form.matterType,
                subject,
                contractSignedStatus: "NOT_REQUIRED",
                responsibleTeam: form.responsibleTeam || null,
                totalMatterMxn,
                workingConcepts: normalizeText(form.workingConcepts) || subject,
                conceptFeesMxn,
                previousPaymentsMxn: parseMoneyInput(form.previousPaymentsMxn),
                nextPaymentDate: toDateInput(form.nextPaymentDate) || null,
                nextPaymentNotes: normalizeText(form.nextPaymentNotes) || null,
                paidThisMonthMxn,
                paymentDate1: paidThisMonthMxn > 0 ? toDateInput(form.paymentDate1) || todayInput() : null,
                expenseNotes1: normalizeText(form.expenseNotes1) || null,
                expenseAmount1Mxn,
                financeComments: normalizeText(form.financeComments) || "Captura movil"
            });
            setRecords((items) => [created, ...items.filter((item) => item.id !== created.id)]);
            setForm(initialFinanceForm());
            setSuccessMessage("Entrada agregada a Finanzas.");
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setSubmitting(false);
        }
    }
    if (!canRead) {
        return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Finanzas", subtitle: "Captura rapida de entradas del mes." }), _jsx("div", { className: "mobile-alert mobile-alert-error", children: "Tu usuario no tiene permiso para ver Finanzas." })] }));
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Finanzas", subtitle: "Agrega entradas del mes desde el celular." }), errorMessage ? _jsx("div", { className: "mobile-alert mobile-alert-error", children: errorMessage }) : null, successMessage ? _jsx("div", { className: "mobile-alert mobile-alert-success", children: successMessage }) : null, _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Periodo" }), _jsxs("span", { children: [getMonthName(selectedMonth), " ", selectedYear] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (_jsx("option", { value: month, children: getMonthName(month) }, month))) })] })] }), _jsxs("div", { className: "mobile-finance-summary-grid", children: [_jsxs("article", { children: [_jsx("span", { children: "Cobrado" }), _jsx("strong", { children: formatCurrency(monthTotals.income) })] }), _jsxs("article", { children: [_jsx("span", { children: "Gastos" }), _jsx("strong", { children: formatCurrency(monthTotals.expenses) })] }), _jsxs("article", { children: [_jsx("span", { children: "Pendiente" }), _jsx("strong", { children: formatCurrency(monthTotals.pending) })] })] })] }), _jsxs("form", { className: "mobile-section mobile-form-panel", onSubmit: (event) => void handleSubmit(event), children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Nueva entrada" }), _jsx("span", { children: "Finanzas" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Cliente" }), _jsx("input", { value: form.clientName, onChange: (event) => updateField("clientName", event.target.value), placeholder: "Nombre del cliente" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Asunto o concepto" }), _jsx("input", { value: form.subject, onChange: (event) => updateField("subject", event.target.value), placeholder: "Que se esta cobrando" })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "No. cliente" }), _jsx("input", { value: form.clientNumber, onChange: (event) => updateField("clientNumber", event.target.value), placeholder: "Opcional" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "No. cotizacion" }), _jsx("input", { value: form.quoteNumber, onChange: (event) => updateField("quoteNumber", event.target.value), placeholder: "Opcional" })] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Tipo" }), _jsxs("select", { value: form.matterType, onChange: (event) => updateField("matterType", event.target.value), children: [_jsx("option", { value: "ONE_TIME", children: "Unico" }), _jsx("option", { value: "RETAINER", children: "Iguala" })] })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Equipo" }), _jsxs("select", { value: form.responsibleTeam, onChange: (event) => updateField("responsibleTeam", event.target.value), children: [_jsx("option", { value: "", children: "Sin equipo" }), TEAM_OPTIONS.map((option) => (_jsx("option", { value: option.key, children: option.label }, option.key)))] })] })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Conceptos trabajando" }), _jsx("textarea", { value: form.workingConcepts, onChange: (event) => updateField("workingConcepts", event.target.value), placeholder: "Descripcion breve", rows: 2 })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Total asunto" }), _jsx("input", { inputMode: "decimal", value: form.totalMatterMxn, onChange: (event) => updateField("totalMatterMxn", event.target.value), placeholder: "0" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Honorarios" }), _jsx("input", { inputMode: "decimal", value: form.conceptFeesMxn, onChange: (event) => updateField("conceptFeesMxn", event.target.value), placeholder: "0" })] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Pagos previos" }), _jsx("input", { inputMode: "decimal", value: form.previousPaymentsMxn, onChange: (event) => updateField("previousPaymentsMxn", event.target.value), placeholder: "0" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Cobrado ahora" }), _jsx("input", { inputMode: "decimal", value: form.paidThisMonthMxn, onChange: (event) => updateField("paidThisMonthMxn", event.target.value), placeholder: "0" })] })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Fecha de pago" }), _jsx("input", { type: "date", value: form.paymentDate1, onChange: (event) => updateField("paymentDate1", event.target.value) })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Gasto" }), _jsx("input", { inputMode: "decimal", value: form.expenseAmount1Mxn, onChange: (event) => updateField("expenseAmount1Mxn", event.target.value), placeholder: "0" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Detalle gasto" }), _jsx("input", { value: form.expenseNotes1, onChange: (event) => updateField("expenseNotes1", event.target.value), placeholder: "Opcional" })] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Proximo pago" }), _jsx("input", { type: "date", value: form.nextPaymentDate, onChange: (event) => updateField("nextPaymentDate", event.target.value) })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Detalle" }), _jsx("input", { value: form.nextPaymentNotes, onChange: (event) => updateField("nextPaymentNotes", event.target.value), placeholder: "Opcional" })] })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Comentarios" }), _jsx("textarea", { value: form.financeComments, onChange: (event) => updateField("financeComments", event.target.value), placeholder: "Notas para Finanzas", rows: 3 })] }), _jsx("button", { className: "mobile-submit", type: "submit", disabled: submitting || !canWrite, children: submitting ? "Guardando..." : "Guardar entrada" })] }), _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Entradas del mes" }), _jsx("span", { children: visibleRecords.length })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Cliente, asunto, cotizacion..." })] }), loading ? (_jsx("div", { className: "mobile-empty", children: "Cargando Finanzas..." })) : visibleRecords.length === 0 ? (_jsx("div", { className: "mobile-empty", children: "No hay entradas para este periodo." })) : (_jsx("div", { className: "mobile-card-list", children: visibleRecords.map((record) => {
                            const income = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;
                            const expenses = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
                            return (_jsxs("article", { className: "mobile-record-card mobile-finance-card", children: [_jsxs("div", { className: "mobile-record-card-head", children: [_jsx("strong", { children: record.clientName || "Sin cliente" }), _jsx("span", { children: getFinanceMatterTypeLabel(record.matterType) })] }), _jsx("p", { children: record.subject || "Sin asunto" }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "Cobrado" }), _jsx("dd", { children: formatCurrency(income) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Gastos" }), _jsx("dd", { children: formatCurrency(expenses) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Pago" }), _jsx("dd", { children: formatDateList([record.paymentDate1, record.paymentDate2, record.paymentDate3]) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Equipo" }), _jsx("dd", { children: getTeamLabel(record.responsibleTeam) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Cotizacion" }), _jsx("dd", { children: record.quoteNumber || "-" })] })] })] }, record.id));
                        }) }))] })] }));
}
export function MobileGeneralExpensesPage() {
    const { user } = useAuth();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const canRead = canReadMobileGeneralExpenses(user);
    const canWrite = canWriteMobileGeneralExpenses(user);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [form, setForm] = useState(() => initialGeneralExpenseForm());
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const monthTotals = useMemo(() => {
        return records.reduce((totals, expense) => {
            const amount = Number(expense.amountMxn || 0);
            return {
                total: totals.total + amount,
                limit: totals.limit + (expense.countsTowardLimit ? amount : 0),
                paid: totals.paid + (expense.paid ? amount : 0)
            };
        }, { total: 0, limit: 0, paid: 0 });
    }, [records]);
    const visibleRecords = useMemo(() => {
        const query = normalizeComparableText(search);
        const sorted = [...records].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
        if (!query) {
            return sorted;
        }
        return sorted.filter((expense) => normalizeComparableText([
            expense.detail,
            expense.team,
            expense.paymentMethod,
            expense.bank,
            getGeneralExpenseDistributionLabel(expense)
        ].join(" ")).includes(query));
    }, [records, search]);
    async function loadGeneralExpenses(year = selectedYear, month = selectedMonth) {
        setLoading(true);
        setErrorMessage(null);
        try {
            setRecords(await apiGet(`/general-expenses?year=${year}&month=${month}`));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!canRead) {
            setLoading(false);
            return;
        }
        void loadGeneralExpenses();
    }, [canRead, selectedMonth, selectedYear]);
    function updateField(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
        setSuccessMessage(null);
    }
    async function handleSubmit(event) {
        event.preventDefault();
        const detail = normalizeText(form.detail);
        const amountMxn = parseMoneyInput(form.amountMxn);
        if (!detail) {
            setErrorMessage("Captura el detalle del gasto.");
            return;
        }
        if (amountMxn <= 0) {
            setErrorMessage("Captura un monto mayor a cero.");
            return;
        }
        if (!canWrite) {
            setErrorMessage("Tu usuario no tiene permiso para agregar gastos generales.");
            return;
        }
        setSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            const created = await apiPost("/general-expenses", {
                year: selectedYear,
                month: selectedMonth
            });
            const patch = {
                detail,
                amountMxn,
                countsTowardLimit: form.countsTowardLimit,
                paymentMethod: form.paymentMethod,
                bank: form.paymentMethod === "Transferencia" ? form.bank || "Banamex" : null,
                recurring: form.recurring,
                ...getGeneralExpenseDistributionPatch(form)
            };
            const updated = await apiPatch(`/general-expenses/${created.id}`, patch);
            setRecords((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
            setForm(initialGeneralExpenseForm());
            setSuccessMessage("Gasto agregado.");
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setSubmitting(false);
        }
    }
    if (!canRead) {
        return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Gastos generales", subtitle: "Captura rapida de gastos del mes." }), _jsx("div", { className: "mobile-alert mobile-alert-error", children: "Tu usuario no tiene permiso para ver Gastos generales." })] }));
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Gastos generales", subtitle: "Agrega gastos del mes desde el celular." }), errorMessage ? _jsx("div", { className: "mobile-alert mobile-alert-error", children: errorMessage }) : null, successMessage ? _jsx("div", { className: "mobile-alert mobile-alert-success", children: successMessage }) : null, _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Periodo" }), _jsxs("span", { children: [getMonthName(selectedMonth), " ", selectedYear] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (_jsx("option", { value: month, children: getMonthName(month) }, month))) })] })] }), _jsxs("div", { className: "mobile-finance-summary-grid", children: [_jsxs("article", { children: [_jsx("span", { children: "Total" }), _jsx("strong", { children: formatCurrency(monthTotals.total) })] }), _jsxs("article", { children: [_jsx("span", { children: "Limite" }), _jsx("strong", { children: formatCurrency(monthTotals.limit) })] }), _jsxs("article", { children: [_jsx("span", { children: "Pagado" }), _jsx("strong", { children: formatCurrency(monthTotals.paid) })] })] })] }), _jsxs("form", { className: "mobile-section mobile-form-panel", onSubmit: (event) => void handleSubmit(event), children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Nuevo gasto" }), _jsx("span", { children: "Movil" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Detalle" }), _jsx("textarea", { value: form.detail, onChange: (event) => updateField("detail", event.target.value), placeholder: "Concepto del gasto", rows: 3 })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Monto" }), _jsx("input", { inputMode: "decimal", value: form.amountMxn, onChange: (event) => updateField("amountMxn", event.target.value), placeholder: "0" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Metodo" }), _jsxs("select", { value: form.paymentMethod, onChange: (event) => updateField("paymentMethod", event.target.value), children: [_jsx("option", { value: "Transferencia", children: "Transferencia" }), _jsx("option", { value: "Efectivo", children: "Efectivo" })] })] })] }), form.paymentMethod === "Transferencia" ? (_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Banco" }), _jsx("select", { value: form.bank, onChange: (event) => updateField("bank", event.target.value), children: MOBILE_GENERAL_EXPENSE_BANKS.map((bank) => (_jsx("option", { value: bank, children: bank }, bank))) })] })) : null, _jsxs("div", { className: "mobile-segmented mobile-three-segmented", children: [_jsx("button", { type: "button", className: form.distributionMode === "general" ? "is-active" : "", onClick: () => updateField("distributionMode", "general"), children: "General" }), _jsx("button", { type: "button", className: form.distributionMode === "without-team" ? "is-active" : "", onClick: () => updateField("distributionMode", "without-team"), children: "Sin equipo" }), _jsx("button", { type: "button", className: form.distributionMode === "team" ? "is-active" : "", onClick: () => updateField("distributionMode", "team"), children: "Equipo" })] }), form.distributionMode === "team" ? (_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Equipo" }), _jsx("select", { value: form.team, onChange: (event) => updateField("team", event.target.value), children: MOBILE_GENERAL_EXPENSE_TEAMS.map((team) => (_jsx("option", { value: team.value, children: team.label }, team.value))) })] })) : null, _jsxs("div", { className: "mobile-checkbox-list", children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: form.countsTowardLimit, onChange: (event) => updateField("countsTowardLimit", event.target.checked) }), _jsx("span", { children: "Cuenta para limite" })] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: form.recurring, onChange: (event) => updateField("recurring", event.target.checked) }), _jsx("span", { children: "Gasto recurrente" })] })] }), _jsx("button", { className: "mobile-submit", type: "submit", disabled: submitting || !canWrite, children: submitting ? "Guardando..." : "Guardar gasto" })] }), _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Gastos del mes" }), _jsx("span", { children: visibleRecords.length })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Detalle, equipo, banco..." })] }), loading ? (_jsx("div", { className: "mobile-empty", children: "Cargando gastos..." })) : visibleRecords.length === 0 ? (_jsx("div", { className: "mobile-empty", children: "No hay gastos para este periodo." })) : (_jsx("div", { className: "mobile-card-list", children: visibleRecords.map((expense) => (_jsxs("article", { className: "mobile-record-card mobile-expense-card", children: [_jsxs("div", { className: "mobile-record-card-head", children: [_jsx("strong", { children: expense.detail || "Sin detalle" }), _jsx("span", { children: expense.paid ? "Pagado" : "Pendiente" })] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "Monto" }), _jsx("dd", { children: formatCurrency(expense.amountMxn) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Tipo" }), _jsx("dd", { children: getGeneralExpenseDistributionLabel(expense) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Metodo" }), _jsxs("dd", { children: [expense.paymentMethod, expense.bank ? ` / ${expense.bank}` : ""] })] }), _jsxs("div", { children: [_jsx("dt", { children: "Limite" }), _jsx("dd", { children: expense.countsTowardLimit ? "Si" : "No" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Recurrente" }), _jsx("dd", { children: expense.recurring ? "Si" : "No" })] })] })] }, expense.id))) }))] })] }));
}
export function MobileExecutionIndexPage() {
    const { user } = useAuth();
    const visibleModules = getVisibleExecutionModules(user);
    if (!canReadMobileExecution(user)) {
        return _jsx(Navigate, { to: "/mobile", replace: true });
    }
    if (visibleModules.length === 1 && user?.team !== "CLIENT_RELATIONS" && user?.team !== "ADMIN" && user?.role !== "SUPERADMIN") {
        return _jsx(Navigate, { to: `/mobile/execution/${visibleModules[0].slug}`, replace: true });
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Ejecucion", subtitle: "Selecciona el equipo para crear tareas desde asuntos activos." }), _jsx("div", { className: "mobile-card-list", children: visibleModules.map((module) => (_jsxs(Link, { className: "mobile-module-card", to: `/mobile/execution/${module.slug}`, children: [_jsx("strong", { children: module.label }), _jsx("span", { children: module.shortLabel })] }, module.moduleId))) })] }));
}
function MobilePageTitle({ title, subtitle }) {
    return (_jsxs("header", { className: "mobile-page-title", children: [_jsx("h1", { children: title }), subtitle ? _jsx("p", { children: subtitle }) : null] }));
}
function MobileMatterSummary({ matter, clientNumber }) {
    return (_jsxs("article", { className: "mobile-matter-summary", "aria-label": "Resumen del asunto seleccionado", children: [_jsxs("div", { className: "mobile-matter-summary-head", children: [_jsxs("div", { children: [_jsx("span", { children: "Asunto seleccionado" }), _jsx("strong", { children: matter.clientName || "Cliente sin nombre" })] }), _jsx("span", { children: matter.matterIdentifier || matter.matterNumber || "Sin ID" })] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "ID Asunto" }), _jsx("dd", { children: matter.matterIdentifier || matter.matterNumber || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "No. Cliente" }), _jsx("dd", { children: clientNumber || matter.clientNumber || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Cliente" }), _jsx("dd", { children: matter.clientName || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Asunto / Expediente" }), _jsx("dd", { children: matter.subject || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Proceso especifico" }), _jsx("dd", { children: matter.specificProcess || "-" })] })] })] }));
}
export function MobileExecutionTeamPage() {
    const { slug } = useParams();
    const { user } = useAuth();
    const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
    const visibleModules = getVisibleExecutionModules(user);
    const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
    const [clients, setClients] = useState([]);
    const [matters, setMatters] = useState([]);
    const [records, setRecords] = useState([]);
    const [terms, setTerms] = useState([]);
    const [events, setEvents] = useState([]);
    const [histories, setHistories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [search, setSearch] = useState("");
    const [selectedMatterId, setSelectedMatterId] = useState(null);
    const [selectedEventId, setSelectedEventId] = useState("");
    const [eventSearch, setEventSearch] = useState("");
    const [eventSearchOpen, setEventSearchOpen] = useState(false);
    const [targets, setTargets] = useState([]);
    const [responsible, setResponsible] = useState(getDefaultResponsibleOption(user?.shortName, module?.defaultResponsible));
    const [responsibleOptions, setResponsibleOptions] = useState([]);
    const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
    const [submitting, setSubmitting] = useState(false);
    const eventSearchRef = useRef(null);
    const selectedMatter = useMemo(() => matters.find((matter) => matter.id === selectedMatterId) ?? null, [matters, selectedMatterId]);
    const selectedEvent = useMemo(() => events.find((event) => event.id === selectedEventId) ?? null, [events, selectedEventId]);
    const filteredEvents = useMemo(() => {
        const query = normalizeComparableText(eventSearch);
        if (!query) {
            return events;
        }
        return events.filter((event) => normalizeComparableText(event.name).includes(query));
    }, [eventSearch, events]);
    const fallbackResponsibleOptions = useMemo(() => splitResponsibleOptions(module?.defaultResponsible), [module?.defaultResponsible]);
    const moduleResponsibleOptions = useMemo(() => dedupeResponsibleOptions([
        ...responsibleOptions,
        ...fallbackResponsibleOptions,
        user?.shortName,
        responsible
    ]), [fallbackResponsibleOptions, responsible, responsibleOptions, user?.shortName]);
    async function loadModuleData() {
        if (!module) {
            return;
        }
        setLoading(true);
        setErrorMessage(null);
        try {
            const [loadedClients, loadedMatters, loadedRecords, loadedTerms, loadedEvents, loadedHistories] = await Promise.all([
                apiGet("/clients"),
                apiGet("/matters"),
                apiGet(`/tasks/tracking-records?moduleId=${module.moduleId}`),
                apiGet(`/tasks/terms?moduleId=${module.moduleId}`),
                apiGet(`/tasks/distribution-events?moduleId=${module.moduleId}`),
                apiGet(`/tasks/distributions?moduleId=${module.moduleId}`)
            ]);
            setClients(loadedClients);
            setMatters(loadedMatters.filter((matter) => matter.responsibleTeam === module.team));
            setRecords(loadedRecords);
            setTerms(loadedTerms);
            setEvents(loadedEvents);
            setHistories(loadedHistories);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (module && canAccess) {
            void loadModuleData();
        }
    }, [module?.moduleId, canAccess]);
    useEffect(() => {
        setResponsible(getDefaultResponsibleOption(user?.shortName, module?.defaultResponsible));
    }, [module?.moduleId, user?.shortName]);
    useEffect(() => {
        if (!module || !canAccess) {
            setResponsibleOptions([]);
            return;
        }
        let cancelled = false;
        const team = module.team;
        const fallbackOptions = splitResponsibleOptions(module.defaultResponsible);
        async function loadResponsibleOptions() {
            try {
                const loaded = await apiGet(`/users/team-short-names?team=${encodeURIComponent(team)}`);
                const nextOptions = dedupeResponsibleOptions([...loaded, ...fallbackOptions, user?.shortName]);
                if (!cancelled) {
                    setResponsibleOptions(nextOptions.length > 0 ? nextOptions : fallbackOptions);
                }
            }
            catch {
                if (!cancelled) {
                    setResponsibleOptions(dedupeResponsibleOptions([...fallbackOptions, user?.shortName]));
                }
            }
        }
        void loadResponsibleOptions();
        return () => {
            cancelled = true;
        };
    }, [canAccess, module?.moduleId, module?.team, module?.defaultResponsible, user?.shortName]);
    useEffect(() => {
        if (!eventSearchOpen) {
            return;
        }
        function handlePointerDown(event) {
            if (!eventSearchRef.current?.contains(event.target)) {
                setEventSearchOpen(false);
            }
        }
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setEventSearchOpen(false);
            }
        }
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [eventSearchOpen]);
    if (!module || !legacyConfig || !canAccess) {
        return _jsx(Navigate, { to: "/mobile/execution", replace: true });
    }
    const currentModule = module;
    const currentLegacyConfig = legacyConfig;
    const filteredMatters = matters.filter((matter) => {
        const query = normalizeComparableText(search);
        if (!query) {
            return true;
        }
        return normalizeComparableText([
            matter.clientName,
            matter.subject,
            matter.specificProcess,
            matter.matterIdentifier,
            matter.matterNumber,
            getEffectiveClientNumber(matter, clients)
        ].join(" ")).includes(query);
    });
    const matterRecords = selectedMatter
        ? sortByDate(records.filter((record) => recordBelongsToMatter(record, selectedMatter)).filter(isPendingRecord))
        : [];
    const matterTerms = selectedMatter
        ? sortByDate(terms.filter((term) => recordBelongsToMatter(term, selectedMatter)).filter(isPendingRecord))
        : [];
    function handleEventChange(eventId) {
        const nextEvent = events.find((event) => event.id === eventId);
        setSelectedEventId(eventId);
        setEventSearch(nextEvent?.name ?? "");
        setEventSearchOpen(false);
        setSuccessMessage(null);
        setTargets(nextEvent
            ? getCatalogTargetEntries(nextEvent, currentLegacyConfig).map((target) => ({ ...target, reportedMonth: "" }))
            : []);
    }
    async function handleSubmit() {
        if (!selectedMatter || !selectedEvent || targets.length === 0) {
            return;
        }
        setSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            await apiPost("/tasks/distributions", buildDistributionPayload(currentModule, currentLegacyConfig, selectedMatter, clients, selectedEvent.name, responsible.trim() || currentModule.defaultResponsible, dueDate, targets));
            setSelectedEventId("");
            setEventSearch("");
            setTargets([]);
            setSuccessMessage("Tarea enviada al manager de tareas.");
            await loadModuleData();
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setSubmitting(false);
        }
    }
    function renderSelectedMatterPanel() {
        if (!selectedMatter) {
            return null;
        }
        return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "mobile-section mobile-form-panel mobile-inline-task-panel", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Nueva tarea" }), _jsx("span", { children: selectedMatter.clientName })] }), _jsx(MobileMatterSummary, { matter: selectedMatter, clientNumber: getEffectiveClientNumber(selectedMatter, clients) }), _jsxs("label", { className: "mobile-field mobile-event-search-field", children: [_jsx("span", { children: "Selector de tareas" }), _jsxs("div", { className: "mobile-event-search", ref: eventSearchRef, children: [_jsx("input", { value: eventSearch, onChange: (event) => {
                                                setEventSearch(event.target.value);
                                                setEventSearchOpen(true);
                                                setSuccessMessage(null);
                                                if (selectedEventId) {
                                                    setSelectedEventId("");
                                                    setTargets([]);
                                                }
                                            }, onFocus: () => setEventSearchOpen(true), placeholder: "Buscar tarea...", autoComplete: "off" }), eventSearchOpen ? (_jsx("div", { className: "mobile-event-search-results", role: "listbox", children: filteredEvents.length === 0 ? (_jsx("div", { className: "mobile-event-search-empty", children: "No hay tareas con ese criterio." })) : (filteredEvents.map((event) => (_jsx("button", { type: "button", role: "option", "aria-selected": event.id === selectedEventId, onMouseDown: (mouseEvent) => {
                                                    mouseEvent.preventDefault();
                                                    handleEventChange(event.id);
                                                }, children: event.name }, event.id)))) })) : null] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Responsable" }), _jsxs("select", { value: responsible, onChange: (event) => setResponsible(event.target.value), children: [_jsx("option", { value: "", children: "Seleccionar responsable" }), moduleResponsibleOptions.map((option) => (_jsx("option", { value: option, children: option }, option)))] })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: dueDate, onChange: (event) => setDueDate(event.target.value) })] })] }), targets.length > 0 ? (_jsx("div", { className: "mobile-target-list", children: targets.map((target) => {
                                const table = currentLegacyConfig.tables.find((candidate) => candidate.slug === target.tableSlug);
                                return (_jsxs("article", { className: "mobile-target-card", children: [_jsxs("div", { children: [_jsx("strong", { children: getTableDisplayName(currentLegacyConfig, target.tableSlug) }), _jsx("button", { type: "button", onClick: () => setTargets((current) => current.filter((candidate) => candidate.id !== target.id)), children: "Quitar" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Nombre del registro" }), _jsx("input", { value: target.taskName, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate)) })] }), table?.showReportedPeriod ? (_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: table.reportedPeriodLabel ?? "Periodo reportado" }), _jsx("input", { type: "month", value: target.reportedMonth, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate)) })] })) : null] }, target.id));
                            }) })) : null, _jsx("button", { type: "button", className: "mobile-submit", disabled: submitting || !selectedEvent || targets.length === 0 || !dueDate, onClick: () => void handleSubmit(), children: submitting ? "Enviando..." : "Enviar al manager de tareas" })] }), _jsxs("section", { className: "mobile-section mobile-inline-pending-panel", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Pendientes del asunto" }), _jsx("span", { children: matterRecords.length + matterTerms.length })] }), _jsx(MobileRecordList, { records: [...matterRecords, ...matterTerms], legacyConfig: currentLegacyConfig, histories: histories })] })] }));
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: currentModule.label, subtitle: "Crea tareas y revisa pendientes ligados al asunto." }), errorMessage ? _jsx("div", { className: "mobile-alert mobile-alert-error", children: errorMessage }) : null, successMessage ? _jsx("div", { className: "mobile-alert mobile-alert-success", children: successMessage }) : null, _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Buscar asunto" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Cliente, asunto, ID..." })] }), _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Asuntos" }), _jsx("span", { children: filteredMatters.length })] }), _jsx("div", { className: "mobile-card-list", children: loading ? (_jsx("div", { className: "mobile-empty", children: "Cargando asuntos..." })) : filteredMatters.length === 0 ? (_jsx("div", { className: "mobile-empty", children: "No hay asuntos para esta busqueda." })) : (filteredMatters.map((matter) => {
                            const pendingCount = records.filter((record) => recordBelongsToMatter(record, matter)).filter(isPendingRecord).length +
                                terms.filter((term) => recordBelongsToMatter(term, matter)).filter(isPendingRecord).length;
                            return (_jsxs("div", { className: "mobile-matter-item", children: [_jsxs("button", { type: "button", className: `mobile-matter-card${matter.id === selectedMatterId ? " is-selected" : ""}`, onClick: () => {
                                            setSelectedMatterId(matter.id);
                                            setSuccessMessage(null);
                                        }, children: [_jsx("strong", { children: matter.clientName || "Sin cliente" }), _jsx("span", { children: matter.subject || "Sin asunto" }), _jsxs("small", { children: [getEffectiveClientNumber(matter, clients) || "S/N", " | ", matter.matterIdentifier || matter.matterNumber || "Sin ID", " | ", pendingCount, " pendientes"] })] }), matter.id === selectedMatterId ? renderSelectedMatterPanel() : null] }, matter.id));
                        })) })] })] }));
}
export function MobileTrackingIndexPage() {
    const { user } = useAuth();
    const visibleModules = getVisibleExecutionModules(user);
    if (!canReadMobileExecution(user)) {
        return _jsx(Navigate, { to: "/mobile", replace: true });
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Seguimiento", subtitle: "Consulta rapida de tablas del manager de tareas." }), _jsx("div", { className: "mobile-card-list", children: visibleModules.map((module) => (_jsxs(Link, { className: "mobile-module-card", to: `/mobile/tracking/${module.slug}`, children: [_jsx("strong", { children: module.label }), _jsx("span", { children: "Ver tablas" })] }, module.moduleId))) })] }));
}
export function MobileTrackingModulePage() {
    const { slug } = useParams();
    const { user } = useAuth();
    const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
    const visibleModules = getVisibleExecutionModules(user);
    const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
    if (!module || !legacyConfig || !canAccess) {
        return _jsx(Navigate, { to: "/mobile/tracking", replace: true });
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: module.label, subtitle: "Tablas de seguimiento disponibles." }), _jsxs("div", { className: "mobile-card-list", children: [_jsxs(Link, { className: "mobile-table-link mobile-table-link-featured", to: `/mobile/tracking/${module.slug}/${TERMS_TABLE_ID}`, children: [_jsx("strong", { children: "Terminos" }), _jsx("span", { children: "Tabla maestra de terminos activos" })] }), legacyConfig.hasRecurringTerms ? (_jsxs(Link, { className: "mobile-table-link mobile-table-link-featured", to: `/mobile/tracking/${module.slug}/${RECURRING_TERMS_TABLE_ID}`, children: [_jsx("strong", { children: "Terminos recurrentes" }), _jsx("span", { children: "Terminos periodicos del equipo" })] })) : null, legacyConfig.tables.map((table) => (_jsxs(Link, { className: "mobile-table-link", to: `/mobile/tracking/${module.slug}/${table.slug}`, children: [_jsx("strong", { children: table.title }), _jsx("span", { children: table.dateLabel })] }, table.slug)))] })] }));
}
export function MobileTrackingTablePage() {
    const { slug, tableId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
    const isTermsTable = tableId === TERMS_TABLE_ID || tableId === RECURRING_TERMS_TABLE_ID;
    const recurrentTermsMode = tableId === RECURRING_TERMS_TABLE_ID;
    const table = legacyConfig?.tables.find((candidate) => candidate.slug === tableId);
    const visibleModules = getVisibleExecutionModules(user);
    const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
    const [records, setRecords] = useState([]);
    const [terms, setTerms] = useState([]);
    const [histories, setHistories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [search, setSearch] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    useEffect(() => {
        if (!module || (!table && !isTermsTable) || !canAccess) {
            return;
        }
        async function loadRecords() {
            setLoading(true);
            setErrorMessage(null);
            try {
                const [loadedRecords, loadedTerms, loadedHistories] = await Promise.all([
                    apiGet(`/tasks/tracking-records?moduleId=${module.moduleId}`),
                    apiGet(`/tasks/terms?moduleId=${module.moduleId}`),
                    apiGet(`/tasks/distributions?moduleId=${module.moduleId}`)
                ]);
                setRecords(loadedRecords);
                setTerms(loadedTerms);
                setHistories(loadedHistories);
            }
            catch (error) {
                setErrorMessage(toErrorMessage(error));
            }
            finally {
                setLoading(false);
            }
        }
        void loadRecords();
    }, [module?.moduleId, table?.slug, tableId, canAccess, isTermsTable]);
    if (!module || !legacyConfig || (!table && !isTermsTable) || !canAccess) {
        return _jsx(Navigate, { to: "/mobile/tracking", replace: true });
    }
    const visibleTerms = isTermsTable
        ? sortByDate(buildVisibleTerms(legacyConfig, terms, records, recurrentTermsMode))
            .filter((term) => statusFilter === "pending" ? isPendingRecord(term) : !isPendingRecord(term))
            .filter((term) => {
            const query = normalizeComparableText(search);
            if (!query) {
                return true;
            }
            return normalizeComparableText([
                term.clientNumber,
                term.clientName,
                term.subject,
                term.specificProcess,
                term.matterIdentifier,
                term.pendingTaskLabel,
                term.eventName,
                term.responsible
            ].join(" ")).includes(query);
        })
        : [];
    const visibleRecords = sortByDate(records)
        .filter((record) => table ? trackingRecordMatchesTable(legacyConfig, record, table) : false)
        .filter((record) => statusFilter === "pending" ? isPendingRecord(record) : !isPendingRecord(record))
        .filter((record) => {
        const query = normalizeComparableText(search);
        if (!query) {
            return true;
        }
        return normalizeComparableText([
            record.clientNumber,
            record.clientName,
            record.subject,
            record.specificProcess,
            record.matterIdentifier,
            record.taskName,
            record.responsible
        ].join(" ")).includes(query);
    });
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx("button", { type: "button", className: "mobile-back-button", onClick: () => navigate(`/mobile/tracking/${module.slug}`), children: "Volver a tablas" }), _jsx(MobilePageTitle, { title: isTermsTable ? recurrentTermsMode ? "Terminos recurrentes" : "Terminos" : table?.title ?? "Seguimiento", subtitle: isTermsTable ? module.label : table?.dateLabel }), errorMessage ? _jsx("div", { className: "mobile-alert mobile-alert-error", children: errorMessage }) : null, _jsxs("div", { className: "mobile-segmented", children: [_jsx("button", { type: "button", className: statusFilter === "pending" ? "is-active" : "", onClick: () => setStatusFilter("pending"), children: "Pendientes" }), _jsx("button", { type: "button", className: statusFilter === "done" ? "is-active" : "", onClick: () => setStatusFilter("done"), children: "Concluidas" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Cliente, tarea, ID..." })] }), loading ? (_jsx("div", { className: "mobile-empty", children: "Cargando registros..." })) : (_jsx(MobileRecordList, { records: isTermsTable ? visibleTerms : visibleRecords, legacyConfig: legacyConfig, histories: histories }))] }));
}
function MobileRecordList({ records, legacyConfig, histories }) {
    if (records.length === 0) {
        return _jsx("div", { className: "mobile-empty", children: "No hay registros para mostrar." });
    }
    const historyTaskNames = new Map();
    buildDistributionHistoryTaskNameMap(histories).forEach((taskName, recordId) => {
        historyTaskNames.set(recordId, taskName);
    });
    return (_jsx("div", { className: "mobile-card-list", children: records.map((record) => {
            const table = "tableCode" in record ? findTrackingTable(legacyConfig, record) : undefined;
            const historyFallback = "tableCode" in record ? resolveHistoryTaskName(record, histories, table) : "";
            const title = "tableCode" in record
                ? resolveTrackingTaskName(record, table, historyTaskNames, historyFallback) || getRecordTitle(record)
                : getRecordTitle(record);
            const tableLabel = "tableCode" in record
                ? table?.title ?? getTableDisplayName(legacyConfig, record.tableCode)
                : "Terminos";
            return (_jsxs("article", { className: `mobile-record-card${isRecordOverdue(record) ? " is-overdue" : ""}`, children: [_jsxs("div", { className: "mobile-record-card-head", children: [_jsx("strong", { children: title }), _jsx("span", { children: getRecordStatusLabel(record.status) })] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "Cliente" }), _jsx("dd", { children: record.clientName || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Asunto" }), _jsx("dd", { children: record.subject || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Tabla" }), _jsx("dd", { children: tableLabel })] }), _jsxs("div", { children: [_jsx("dt", { children: "Responsable" }), _jsx("dd", { children: record.responsible || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Fecha" }), _jsx("dd", { children: getRecordDate(record) || "-" })] }), "reportedMonth" in record && record.reportedMonth ? (_jsxs("div", { children: [_jsx("dt", { children: "Periodo" }), _jsx("dd", { children: record.reportedMonth })] })) : null] })] }, record.id));
        }) }));
}
