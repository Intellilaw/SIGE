import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { EXECUTION_MODULE_BY_SLUG } from "../execution/execution-config";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function toMatterLabel(matter) {
    return `${matter.matterNumber} | ${matter.clientName} | ${matter.subject}`;
}
function makeTarget(table, taskName = "Tarea") {
    return {
        id: `${table.slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        tableSlug: table.slug,
        taskName,
        dueDate: table.showDateColumn === false ? "" : todayInput(),
        termDate: table.autoTerm ? todayInput() : "",
        reportedMonth: ""
    };
}
export function TaskDistributorPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const [matters, setMatters] = useState([]);
    const [events, setEvents] = useState([]);
    const [history, setHistory] = useState([]);
    const [selectedMatterId, setSelectedMatterId] = useState("");
    const [selectedEventId, setSelectedEventId] = useState("");
    const [eventName, setEventName] = useState("");
    const [targets, setTargets] = useState([]);
    const [catalogName, setCatalogName] = useState("");
    const [catalogDefaultTaskName, setCatalogDefaultTaskName] = useState("");
    const [catalogTables, setCatalogTables] = useState([]);
    const [editingCatalogId, setEditingCatalogId] = useState(null);
    const [loading, setLoading] = useState(true);
    async function loadDistributor() {
        if (!moduleConfig || !executionModule) {
            return;
        }
        setLoading(true);
        try {
            const [loadedMatters, loadedEvents, loadedHistory] = await Promise.all([
                apiGet("/matters"),
                apiGet(`/tasks/distribution-events?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/distributions?moduleId=${moduleConfig.moduleId}`)
            ]);
            setMatters(loadedMatters.filter((matter) => matter.responsibleTeam === executionModule.team && !matter.deletedAt));
            setEvents(loadedEvents);
            setHistory(loadedHistory);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadDistributor();
    }, [moduleConfig, executionModule]);
    const selectedMatter = useMemo(() => matters.find((matter) => matter.id === selectedMatterId), [matters, selectedMatterId]);
    const tableBySlug = useMemo(() => new Map(moduleConfig?.tables.map((table) => [table.slug, table]) ?? []), [moduleConfig]);
    function applyEvent(eventId) {
        setSelectedEventId(eventId);
        const selected = events.find((event) => event.id === eventId);
        if (!selected || !moduleConfig) {
            return;
        }
        setEventName(selected.name);
        setTargets(selected.targetTables
            .map((tableSlug) => moduleConfig.tables.find((table) => table.slug === tableSlug))
            .filter((table) => Boolean(table))
            .map((table) => makeTarget(table, selected.defaultTaskName || selected.name)));
    }
    async function saveCatalogEvent() {
        if (!moduleConfig || !catalogName.trim()) {
            return;
        }
        const payload = {
            moduleId: moduleConfig.moduleId,
            name: catalogName.trim(),
            targetTables: catalogTables,
            defaultTaskName: catalogDefaultTaskName || null
        };
        if (editingCatalogId) {
            const updated = await apiPatch(`/tasks/distribution-events/${editingCatalogId}`, payload);
            setEvents((current) => current.map((event) => event.id === editingCatalogId ? updated : event));
        }
        else {
            const created = await apiPost("/tasks/distribution-events", payload);
            setEvents((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
        }
        setCatalogName("");
        setCatalogDefaultTaskName("");
        setCatalogTables([]);
        setEditingCatalogId(null);
    }
    async function deleteCatalogEvent(event) {
        await apiDelete(`/tasks/distribution-events/${event.id}`);
        setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
        if (selectedEventId === event.id) {
            setSelectedEventId("");
            setEventName("");
            setTargets([]);
        }
    }
    async function distribute() {
        if (!moduleConfig || !selectedMatter || targets.length === 0 || !eventName.trim()) {
            return;
        }
        const created = await apiPost("/tasks/distributions", {
            moduleId: moduleConfig.moduleId,
            matterId: selectedMatter.id,
            matterNumber: selectedMatter.matterNumber,
            clientNumber: selectedMatter.clientNumber ?? null,
            clientName: selectedMatter.clientName,
            subject: selectedMatter.subject,
            specificProcess: selectedMatter.specificProcess ?? null,
            matterIdentifier: selectedMatter.matterIdentifier ?? null,
            eventName,
            responsible: moduleConfig.defaultResponsible,
            targets: targets.map((target) => {
                const table = tableBySlug.get(target.tableSlug);
                return {
                    tableCode: target.tableSlug,
                    sourceTable: table?.sourceTable ?? target.tableSlug,
                    tableLabel: table?.title ?? target.tableSlug,
                    taskName: target.taskName || eventName,
                    dueDate: target.dueDate || null,
                    termDate: target.termDate || target.dueDate || null,
                    status: "pendiente",
                    workflowStage: 1,
                    reportedMonth: target.reportedMonth || null,
                    createTerm: Boolean(table?.autoTerm),
                    data: {
                        distributedFrom: "tasks-distributor",
                        tableTitle: table?.title
                    }
                };
            })
        });
        setHistory((current) => [created, ...current]);
        setTargets([]);
        setEventName("");
        setSelectedEventId("");
    }
    if (!moduleConfig) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "execution-page-topline", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }) }), _jsxs("h2", { children: ["Distribuidor de tareas (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Crea registros en tablas de seguimiento y, cuando aplica, crea el termino maestro enlazado con `sourceTable/sourceRecordId`, igual que el flujo critico de Intranet." })] }), _jsxs("section", { className: "panel tasks-distributor-grid", children: [_jsxs("article", { className: "tasks-distributor-card", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "1. Catalogo de tareas" }), _jsxs("span", { children: [events.length, " configuradas"] })] }), _jsxs("label", { children: ["Nombre de tarea", _jsx("input", { className: "tasks-legacy-input", value: catalogName, onChange: (event) => setCatalogName(event.target.value) })] }), _jsxs("label", { children: ["Nombre por defecto en tablas", _jsx("input", { className: "tasks-legacy-input", value: catalogDefaultTaskName, onChange: (event) => setCatalogDefaultTaskName(event.target.value) })] }), _jsx("div", { className: "tasks-distributor-table-picker", children: moduleConfig.tables.map((table) => (_jsxs("label", { className: "tasks-distributor-checkbox", children: [_jsx("input", { type: "checkbox", checked: catalogTables.includes(table.slug), onChange: (event) => setCatalogTables((current) => event.target.checked
                                                ? [...current, table.slug]
                                                : current.filter((tableSlug) => tableSlug !== table.slug)) }), _jsx("span", { children: table.title })] }, table.slug))) }), _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => void saveCatalogEvent(), children: editingCatalogId ? "Guardar cambios" : "Guardar tarea" }), editingCatalogId ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => { setEditingCatalogId(null); setCatalogName(""); setCatalogDefaultTaskName(""); setCatalogTables([]); }, children: "Cancelar" })) : null] }), _jsx("div", { className: "tasks-distributor-event-list", children: events.map((event) => (_jsxs("div", { className: "tasks-distributor-event-row", children: [_jsxs("div", { children: [_jsx("strong", { children: event.name }), _jsxs("span", { children: [event.targetTables.length, " tablas"] })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => {
                                                setEditingCatalogId(event.id);
                                                setCatalogName(event.name);
                                                setCatalogDefaultTaskName(event.defaultTaskName ?? "");
                                                setCatalogTables(event.targetTables);
                                            }, children: "Configurar" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => void deleteCatalogEvent(event), children: "Eliminar" })] }, event.id))) })] }), _jsxs("article", { className: "tasks-distributor-card", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "2. Enviar a seguimiento" }), _jsxs("span", { children: [targets.length, " destinos"] })] }), _jsxs("label", { children: ["Asunto origen", _jsxs("select", { className: "tasks-legacy-input", value: selectedMatterId, onChange: (event) => setSelectedMatterId(event.target.value), children: [_jsx("option", { value: "", children: "Selecciona un asunto" }), matters.map((matter) => _jsx("option", { value: matter.id, children: toMatterLabel(matter) }, matter.id))] })] }), _jsxs("label", { children: ["Tarea configurada", _jsxs("select", { className: "tasks-legacy-input", value: selectedEventId, onChange: (event) => applyEvent(event.target.value), children: [_jsx("option", { value: "", children: "Selecciona una tarea guardada" }), events.map((event) => _jsx("option", { value: event.id, children: event.name }, event.id))] })] }), _jsxs("label", { children: ["Nombre del evento a distribuir", _jsx("input", { className: "tasks-legacy-input", value: eventName, onChange: (event) => setEventName(event.target.value) })] }), _jsxs("label", { children: ["Agregar tabla manualmente", _jsxs("select", { className: "tasks-legacy-input", value: "", onChange: (event) => {
                                            const table = moduleConfig.tables.find((candidate) => candidate.slug === event.target.value);
                                            if (table) {
                                                setTargets((current) => [...current, makeTarget(table, eventName || "Tarea")]);
                                            }
                                        }, children: [_jsx("option", { value: "", children: "Selecciona tabla" }), moduleConfig.tables.map((table) => _jsx("option", { value: table.slug, children: table.title }, table.slug))] })] }), _jsx("div", { className: "tasks-distributor-target-list", children: targets.map((target) => {
                                    const table = tableBySlug.get(target.tableSlug);
                                    return (_jsxs("div", { className: "tasks-distributor-target-card", children: [_jsxs("div", { className: "tasks-distributor-target-head", children: [_jsx("strong", { children: table?.title ?? target.tableSlug }), _jsx("button", { type: "button", className: "danger-button", onClick: () => setTargets((current) => current.filter((candidate) => candidate.id !== target.id)), children: "Quitar" })] }), _jsxs("label", { children: ["Tarea en esta tabla", _jsx("input", { className: "tasks-legacy-input", value: target.taskName, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate)) })] }), table?.showDateColumn === false ? null : (_jsxs("label", { children: [table?.dateLabel ?? "Fecha limite", _jsx("input", { className: "tasks-legacy-input", type: "date", value: target.dueDate, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, dueDate: event.target.value } : candidate)) })] })), table?.autoTerm ? (_jsxs("label", { children: ["Fecha de termino", _jsx("input", { className: "tasks-legacy-input", type: "date", value: target.termDate, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, termDate: event.target.value } : candidate)) })] })) : null, table?.showReportedPeriod ? (_jsxs("label", { children: [table.reportedPeriodLabel ?? "Mes reportado", _jsx("input", { className: "tasks-legacy-input", type: "month", value: target.reportedMonth, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate)) })] })) : null] }, target.id));
                                }) }), _jsx("button", { type: "button", className: "primary-action-button", disabled: loading || !selectedMatter || targets.length === 0 || !eventName.trim(), onClick: () => void distribute(), children: "Distribuir tareas" })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Historial del distribuidor" }), _jsxs("span", { children: [history.length, " movimientos"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table tasks-legacy-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Fecha" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Evento" }), _jsx("th", { children: "Tablas destino" }), _jsx("th", { children: "Created IDs" })] }) }), _jsx("tbody", { children: history.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "centered-inline-message", children: "Aun no hay movimientos del distribuidor." }) })) : (history.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.createdAt.slice(0, 10) }), _jsx("td", { children: item.clientName || "-" }), _jsx("td", { children: item.subject || "-" }), _jsx("td", { children: item.eventName }), _jsx("td", { children: item.targetTables.join(", ") }), _jsx("td", { children: _jsxs("code", { children: [Object.keys(item.createdIds).length, " enlaces"] }) })] }, item.id)))) })] }) })] })] }));
}
