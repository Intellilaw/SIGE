import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiGet } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID } from "./task-dashboard-config";
import { LEGACY_TASK_MODULE_BY_ID } from "./task-legacy-config";
const TIMEFRAMES = [
    { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
    { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
    { id: "manana", label: "Tareas manana", colorClass: "is-tomorrow" },
    { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];
function normalizeText(value) {
    return (value ?? "").trim();
}
function normalizeComparableText(value) {
    return normalizeText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s*\/\s*/g, "/");
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function getLocalDateInput(offset = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function getEffectiveClientNumber(matter, clients) {
    if (!matter) {
        return "";
    }
    const normalizedName = normalizeComparableText(matter.clientName);
    const match = clients.find((client) => normalizeComparableText(client.name) === normalizedName);
    return match?.clientNumber ?? normalizeText(matter.clientNumber);
}
function matchesResponsible(taskResponsible, member, sharedResponsibleAliases) {
    const normalizedResponsible = normalizeComparableText(taskResponsible);
    const memberAliases = member.aliases.map((alias) => normalizeComparableText(alias));
    const sharedAliases = sharedResponsibleAliases.map((alias) => normalizeComparableText(alias));
    return memberAliases.includes(normalizedResponsible) || sharedAliases.includes(normalizedResponsible);
}
function belongsToTimeframe(input, timeframe) {
    const today = getLocalDateInput();
    const tomorrow = getLocalDateInput(1);
    if (timeframe === "anteriores") {
        return input.state === "closed";
    }
    if (input.state === "closed") {
        return false;
    }
    if (timeframe === "hoy") {
        return !input.date || input.date <= today;
    }
    if (timeframe === "manana") {
        return input.date === tomorrow;
    }
    return input.date > tomorrow;
}
function isVerificationComplete(term) {
    const values = Object.values(term.verification);
    return values.length > 0 && values.every((value) => ["si", "sí", "yes"].includes(value.toLowerCase()));
}
export function TasksTeamPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const visibleModules = getVisibleExecutionModules(user);
    const dashboardConfig = module ? TASK_DASHBOARD_CONFIG_BY_MODULE_ID[module.moduleId] : undefined;
    const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
    const [clients, setClients] = useState([]);
    const [matters, setMatters] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [trackingRecords, setTrackingRecords] = useState([]);
    const [terms, setTerms] = useState([]);
    const [additionalTasks, setAdditionalTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedView, setExpandedView] = useState(null);
    const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
    useEffect(() => {
        if (!module || !canAccess) {
            return;
        }
        const currentModule = module;
        async function loadDashboard() {
            setLoading(true);
            try {
                const [loadedClients, loadedMatters, loadedTasks, loadedTracking, loadedTerms, loadedAdditional] = await Promise.all([
                    apiGet("/clients"),
                    apiGet("/matters"),
                    apiGet(`/tasks/items?moduleId=${currentModule.moduleId}`),
                    apiGet(`/tasks/tracking-records?moduleId=${currentModule.moduleId}`),
                    apiGet(`/tasks/terms?moduleId=${currentModule.moduleId}`),
                    apiGet(`/tasks/additional?moduleId=${currentModule.moduleId}`)
                ]);
                setClients(loadedClients);
                setMatters(loadedMatters.filter((matter) => matter.responsibleTeam === currentModule.team));
                setTasks(loadedTasks);
                setTrackingRecords(loadedTracking);
                setTerms(loadedTerms);
                setAdditionalTasks(loadedAdditional);
            }
            finally {
                setLoading(false);
            }
        }
        void loadDashboard();
    }, [canAccess, module]);
    const matterLookup = useMemo(() => {
        const map = new Map();
        matters.forEach((matter) => {
            const keys = [normalizeText(matter.id), normalizeText(matter.matterNumber)].filter(Boolean);
            keys.forEach((key) => map.set(key, matter));
        });
        return map;
    }, [matters]);
    const tableLookup = useMemo(() => new Map(legacyConfig?.tables.map((table) => [table.slug, table]) ?? []), [legacyConfig]);
    const trackLabels = useMemo(() => new Map(module?.definition.tracks.map((track) => [track.id, track.label]) ?? []), [module]);
    function buildTaskItemRows(member, timeframe) {
        return tasks
            .filter((task) => matchesResponsible(task.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? []))
            .filter((task) => belongsToTimeframe({
            state: task.state === "COMPLETED" ? "closed" : "open",
            date: toDateInput(task.dueDate)
        }, timeframe))
            .map((task) => {
            const matter = matterLookup.get(normalizeText(task.matterId)) ??
                matterLookup.get(normalizeText(task.matterNumber));
            const dueDate = toDateInput(task.dueDate);
            const completionDate = toDateInput(task.updatedAt) || dueDate;
            const highlighted = task.state !== "COMPLETED" && (!task.subject || !task.responsible || !dueDate || dueDate <= getLocalDateInput());
            return {
                taskId: `item-${task.id}`,
                clientNumber: getEffectiveClientNumber(matter, clients),
                clientName: matter?.clientName || task.clientName || "-",
                subject: matter?.subject || task.subject || "-",
                specificProcess: matter?.specificProcess || "-",
                taskLabel: task.subject || trackLabels.get(task.trackId) || task.trackId,
                typeLabel: task.state === "COMPLETED" ? "Completada" : highlighted ? "Vencida / incompleta" : "Fecha compromiso",
                displayDate: task.state === "COMPLETED" ? completionDate : dueDate,
                originLabel: trackLabels.get(task.trackId) || task.trackId,
                originPath: `/app/tasks/${slug}`,
                highlighted
            };
        });
    }
    function buildTrackingRows(member, timeframe) {
        return trackingRecords
            .filter((record) => matchesResponsible(record.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? []))
            .filter((record) => belongsToTimeframe({
            state: record.status === "presentado" ? "closed" : "open",
            date: toDateInput(record.dueDate || record.termDate)
        }, timeframe))
            .map((record) => {
            const table = tableLookup.get(record.tableCode);
            const dueDate = toDateInput(record.dueDate || record.termDate);
            const highlighted = record.status !== "presentado" && (!record.taskName || !record.responsible || (table?.showDateColumn !== false && !dueDate) || Boolean(dueDate && dueDate <= getLocalDateInput()));
            return {
                taskId: `tracking-${record.id}`,
                clientNumber: record.clientNumber || "-",
                clientName: record.clientName || "-",
                subject: record.subject || "-",
                specificProcess: record.specificProcess || "-",
                taskLabel: record.taskName || record.eventName || table?.title || "Tarea",
                typeLabel: record.status === "presentado" ? "Completada" : table?.autoTerm ? "Termino / seguimiento" : highlighted ? "Vencida / incompleta" : "Seguimiento",
                displayDate: record.status === "presentado" ? toDateInput(record.completedAt || record.updatedAt) : dueDate,
                originLabel: table?.title ?? record.sourceTable,
                originPath: `/app/tasks/${slug}/${record.tableCode}`,
                highlighted
            };
        });
    }
    function buildTermRows(member, timeframe) {
        return terms
            .filter((term) => matchesResponsible(term.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? []))
            .filter((term) => belongsToTimeframe({
            state: term.status === "concluida" ? "closed" : "open",
            date: toDateInput(term.termDate || term.dueDate)
        }, timeframe))
            .map((term) => {
            const dueDate = toDateInput(term.termDate || term.dueDate);
            const highlighted = term.status !== "concluida" && (!term.responsible || !dueDate || dueDate <= getLocalDateInput() || !isVerificationComplete(term));
            return {
                taskId: `term-${term.id}`,
                clientNumber: term.clientNumber || "-",
                clientName: term.clientName || "-",
                subject: term.subject || "-",
                specificProcess: term.specificProcess || "-",
                taskLabel: `${term.recurring ? "[Recurrente] " : ""}${term.eventName}`,
                typeLabel: "Termino",
                displayDate: dueDate,
                originLabel: term.recurring ? "Terminos recurrentes" : "Terminos",
                originPath: `/app/tasks/${slug}/${term.recurring ? "terminos-recurrentes" : "terminos"}`,
                highlighted
            };
        });
    }
    function buildAdditionalRows(member, timeframe) {
        return additionalTasks
            .filter((task) => matchesResponsible(task.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? []) ||
            matchesResponsible(task.responsible2 ?? "", member, dashboardConfig?.sharedResponsibleAliases ?? []))
            .filter((task) => belongsToTimeframe({
            state: task.status === "concluida" ? "closed" : "open",
            date: toDateInput(task.dueDate)
        }, timeframe))
            .map((task) => {
            const dueDate = toDateInput(task.dueDate);
            const highlighted = task.status !== "concluida" && (!task.task || !task.responsible || !dueDate || dueDate < getLocalDateInput());
            return {
                taskId: `additional-${task.id}`,
                clientNumber: "-",
                clientName: "-",
                subject: "-",
                specificProcess: "-",
                taskLabel: task.task,
                typeLabel: task.status === "concluida" ? "Completada" : "Tarea adicional",
                displayDate: dueDate,
                originLabel: "Tareas adicionales",
                originPath: `/app/tasks/${slug}/adicionales`,
                highlighted
            };
        });
    }
    function buildRows(member, timeframe) {
        return [
            ...buildTaskItemRows(member, timeframe),
            ...buildTrackingRows(member, timeframe),
            ...buildTermRows(member, timeframe),
            ...buildAdditionalRows(member, timeframe)
        ].sort((left, right) => left.displayDate.localeCompare(right.displayDate));
    }
    if (!module || !canAccess || !legacyConfig) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-team-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate("/app/tasks"), children: "Volver" }), _jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", style: { color: module.color }, children: module.icon }), _jsx("div", { children: _jsx("h2", { children: module.label }) })] })] }), _jsx("p", { className: "muted", children: "Modulo de tareas separado por equipo: distribuidor, tablas de seguimiento, terminos y tareas adicionales." }), _jsxs("div", { className: "tasks-legacy-toolbar", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/distribuidor`), children: "Distribuidor de tareas" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/terminos`), children: "Terminos" }), legacyConfig.hasRecurringTerms ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/terminos-recurrentes`), children: "Terminos recurrentes" })) : null, _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/adicionales`), children: "Tareas adicionales" })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Vista diaria del equipo" }), _jsxs("span", { children: [dashboardConfig?.members.length ?? 0, " integrantes"] })] }), _jsx("p", { className: "muted tasks-team-board-copy", children: "Cada integrante conserva sus ventanas de trabajo: realizadas, hoy, manana y posteriores. El rojo indica faltantes, terminos sin verificacion o fechas vencidas." }), _jsx("div", { className: "tasks-team-member-list", children: (dashboardConfig?.members ?? []).map((member) => {
                            const isExpanded = expandedView?.memberId === member.id;
                            const rows = isExpanded && expandedView ? buildRows(member, expandedView.timeframe) : [];
                            return (_jsxs("article", { className: "tasks-team-member-card", children: [_jsxs("div", { className: "tasks-team-member-head", children: [_jsx("h3", { children: member.name }), _jsx("span", { children: member.id })] }), _jsx("div", { className: "tasks-team-timeframes", children: TIMEFRAMES.map((timeframe) => {
                                            const isActive = expandedView?.memberId === member.id && expandedView.timeframe === timeframe.id;
                                            return (_jsx("button", { type: "button", className: `tasks-team-timeframe-button ${timeframe.colorClass} ${isActive ? "is-active" : ""}`, onClick: () => setExpandedView((current) => current?.memberId === member.id && current?.timeframe === timeframe.id
                                                    ? null
                                                    : { memberId: member.id, timeframe: timeframe.id }), children: timeframe.label }, timeframe.id));
                                        }) }), isExpanded && expandedView ? (_jsxs("div", { className: "tasks-team-timeframe-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: TIMEFRAMES.find((timeframe) => timeframe.id === expandedView.timeframe)?.label ?? "Detalle" }), _jsxs("span", { children: [rows.length, " tareas"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table tasks-dashboard-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Tabla de Origen" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "centered-inline-message", children: "Cargando tareas..." }) })) : rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "centered-inline-message", children: "No hay tareas en esta categoria." }) })) : (rows.map((row) => (_jsxs("tr", { className: row.highlighted ? "tasks-dashboard-row-overdue" : undefined, children: [_jsx("td", { children: row.clientNumber || "-" }), _jsx("td", { children: row.clientName }), _jsx("td", { children: row.subject }), _jsx("td", { children: row.specificProcess }), _jsx("td", { className: row.highlighted ? "tasks-dashboard-title-overdue" : undefined, children: row.taskLabel }), _jsx("td", { children: _jsx("span", { className: `tasks-dashboard-type-pill ${row.typeLabel === "Completada" ? "is-completed" : row.highlighted ? "is-overdue" : "is-pending"}`, children: row.typeLabel }) }), _jsx("td", { children: row.displayDate || "-" }), _jsx("td", { children: row.originLabel }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => navigate(row.originPath), children: "Ir a tabla" }) })] }, row.taskId)))) })] }) })] })) : null] }, member.id));
                        }) })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Tablas de seguimiento" }), _jsxs("span", { children: [legacyConfig.tables.length, " tablas"] })] }), _jsx("div", { className: "tasks-table-card-grid", children: legacyConfig.tables.map((table) => (_jsxs("button", { type: "button", className: "tasks-table-card", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/${table.slug}`), children: [_jsx("strong", { children: table.title }), _jsx("span", { children: table.sourceTable })] }, table.slug))) })] })] }));
}
