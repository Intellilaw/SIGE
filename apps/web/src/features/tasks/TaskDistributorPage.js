import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { EXECUTION_MODULE_BY_SLUG } from "../execution/execution-config";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
import { encodeCatalogTarget, findLegacyTableByAnyName, getCatalogTargetEntries, getTableDisplayName, makeCatalogTargetEntry } from "./task-distribution-utils";
function normalize(value) {
    return (value ?? "").trim();
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function getRowDate(record) {
    return toDateInput(record.dueDate || record.termDate);
}
function isCompletedRecord(table, record) {
    if (record.status === "presentado" || record.status === "concluida") {
        return true;
    }
    return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}
function isTrackingRecordRed(table, record) {
    if (isCompletedRecord(table, record)) {
        return false;
    }
    const dueDate = getRowDate(record);
    const requiresDate = table?.showDateColumn !== false;
    return !record.taskName || !record.responsible || (requiresDate && !dueDate) || (Boolean(dueDate) && dueDate <= todayInput());
}
function getStageLabel(table, record) {
    if (!table) {
        return record.status;
    }
    if (table.mode === "workflow") {
        return table.tabs.find((tab) => Number(tab.stage) === Number(record.workflowStage || 1))?.label ?? "Etapa pendiente";
    }
    return table.tabs.find((tab) => tab.status === record.status)?.label ?? record.status;
}
function getLinkedTerm(terms, record) {
    return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}
export function TaskDistributorPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const [activeTab, setActiveTab] = useState("active");
    const [events, setEvents] = useState([]);
    const [history, setHistory] = useState([]);
    const [trackingRecords, setTrackingRecords] = useState([]);
    const [terms, setTerms] = useState([]);
    const [catalogName, setCatalogName] = useState("");
    const [catalogEntries, setCatalogEntries] = useState([]);
    const [editingCatalogId, setEditingCatalogId] = useState(null);
    const [clientSearch, setClientSearch] = useState("");
    const [loading, setLoading] = useState(true);
    async function loadDistributor() {
        if (!moduleConfig) {
            return;
        }
        setLoading(true);
        try {
            const [loadedEvents, loadedHistory, loadedTrackingRecords, loadedTerms] = await Promise.all([
                apiGet(`/tasks/distribution-events?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/distributions?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/terms?moduleId=${moduleConfig.moduleId}`)
            ]);
            setEvents(loadedEvents);
            setHistory(loadedHistory);
            setTrackingRecords(loadedTrackingRecords);
            setTerms(loadedTerms);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadDistributor();
    }, [moduleConfig]);
    const tableBySlug = useMemo(() => new Map(moduleConfig?.tables.map((table) => [table.slug, table]) ?? []), [moduleConfig]);
    const trackingById = useMemo(() => new Map(trackingRecords.map((record) => [record.id, record])), [trackingRecords]);
    function resolveHistoryRecord(item, tableValue, index, usedIds) {
        if (!moduleConfig) {
            return undefined;
        }
        const table = findLegacyTableByAnyName(moduleConfig, tableValue);
        const possibleKeys = [
            `${table?.slug ?? tableValue}_${index}`,
            `${table?.sourceTable ?? tableValue}_${index}`,
            `${tableValue}_${index}`,
            table?.slug,
            table?.sourceTable,
            tableValue
        ].filter((key) => Boolean(key));
        for (const key of possibleKeys) {
            const recordId = item.createdIds[key];
            const record = recordId ? trackingById.get(recordId) : undefined;
            if (record && !usedIds.has(record.id)) {
                usedIds.add(record.id);
                return record;
            }
        }
        const expectedName = normalize(item.eventNamesPerTable[index] || item.eventName);
        const record = trackingRecords.find((candidate) => {
            if (usedIds.has(candidate.id)) {
                return false;
            }
            const sameTable = candidate.tableCode === table?.slug || candidate.sourceTable === table?.sourceTable || candidate.tableCode === tableValue || candidate.sourceTable === tableValue;
            const sameMatter = candidate.matterId === item.matterId ||
                candidate.matterNumber === item.matterNumber ||
                candidate.matterIdentifier === item.matterIdentifier;
            const sameTask = !expectedName || candidate.taskName === expectedName || candidate.eventName === item.eventName;
            return sameTable && sameMatter && sameTask;
        });
        if (record) {
            usedIds.add(record.id);
        }
        return record;
    }
    function historyHasOpenRecords(item) {
        const usedIds = new Set();
        return item.targetTables.some((targetTable, index) => {
            const record = resolveHistoryRecord(item, targetTable, index, usedIds);
            const table = record ? tableBySlug.get(record.tableCode) : findLegacyTableByAnyName(moduleConfig, targetTable);
            return Boolean(record && !record.deletedAt && !isCompletedRecord(table, record));
        });
    }
    const activeHistory = useMemo(() => {
        const query = normalize(clientSearch).toLowerCase();
        return history
            .filter(historyHasOpenRecords)
            .filter((item) => !query || normalize(item.clientName).toLowerCase().includes(query));
    }, [clientSearch, history, moduleConfig, tableBySlug, trackingById, trackingRecords]);
    function resetCatalogForm() {
        setCatalogName("");
        setCatalogEntries([]);
        setEditingCatalogId(null);
    }
    function startCatalogEdit(event) {
        if (!moduleConfig) {
            return;
        }
        setEditingCatalogId(event.id);
        setCatalogName(event.name);
        setCatalogEntries(getCatalogTargetEntries(event, moduleConfig));
    }
    function addCatalogEntry(table) {
        setCatalogEntries((current) => [
            ...current,
            makeCatalogTargetEntry(table, catalogName || table.title)
        ]);
    }
    function removeCatalogEntry(table) {
        setCatalogEntries((current) => {
            const index = current.map((entry) => entry.tableSlug).lastIndexOf(table.slug);
            if (index < 0) {
                return current;
            }
            return current.filter((_, entryIndex) => entryIndex !== index);
        });
    }
    async function saveCatalogEvent() {
        if (!moduleConfig || !catalogName.trim() || catalogEntries.length === 0) {
            return;
        }
        const payload = {
            moduleId: moduleConfig.moduleId,
            name: catalogName.trim(),
            targetTables: catalogEntries.map((entry) => encodeCatalogTarget({
                tableSlug: entry.tableSlug,
                taskName: entry.taskName.trim() || catalogName.trim()
            })),
            defaultTaskName: catalogName.trim()
        };
        if (editingCatalogId) {
            const updated = await apiPatch(`/tasks/distribution-events/${editingCatalogId}`, payload);
            setEvents((current) => current.map((event) => event.id === editingCatalogId ? updated : event));
        }
        else {
            const created = await apiPost("/tasks/distribution-events", payload);
            setEvents((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
        }
        resetCatalogForm();
    }
    async function deleteCatalogEvent(event) {
        if (!window.confirm(`Eliminar la tarea configurada "${event.name}"?`)) {
            return;
        }
        await apiDelete(`/tasks/distribution-events/${event.id}`);
        setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
        if (editingCatalogId === event.id) {
            resetCatalogForm();
        }
    }
    async function patchRecord(record, patch) {
        const updated = await apiPatch(`/tasks/tracking-records/${record.id}`, patch);
        if (!updated) {
            return;
        }
        setTrackingRecords((current) => current.map((candidate) => candidate.id === record.id ? updated : candidate));
        const linkedTerm = getLinkedTerm(terms, record);
        if (linkedTerm && ("dueDate" in patch || "termDate" in patch || "responsible" in patch || "status" in patch || "deletedAt" in patch)) {
            setTerms((current) => current.map((term) => term.id === linkedTerm.id
                ? {
                    ...term,
                    dueDate: patch.dueDate === undefined ? term.dueDate : patch.dueDate ?? undefined,
                    termDate: patch.termDate === undefined ? term.termDate : patch.termDate ?? undefined,
                    responsible: patch.responsible === undefined ? term.responsible : patch.responsible,
                    status: patch.status === undefined ? term.status : patch.status,
                    deletedAt: patch.deletedAt === undefined ? term.deletedAt : patch.deletedAt ?? undefined
                }
                : term));
        }
    }
    async function handleDateChange(record, table, value) {
        await patchRecord(record, {
            dueDate: value || null,
            termDate: table?.termManagedDate ? value || null : record.termDate ?? null
        });
    }
    async function handleAdvance(record, table) {
        if (table?.mode === "workflow") {
            const finalStage = table.tabs.length;
            const nextStage = Math.min((record.workflowStage || 1) + 1, finalStage);
            await patchRecord(record, {
                workflowStage: nextStage,
                status: nextStage >= finalStage ? "presentado" : "pendiente",
                completedAt: nextStage >= finalStage ? new Date().toISOString() : undefined
            });
            return;
        }
        await patchRecord(record, {
            status: "presentado",
            completedAt: new Date().toISOString()
        });
    }
    async function handleStepBack(record, table) {
        await patchRecord(record, {
            workflowStage: table?.mode === "workflow" ? Math.max(1, (record.workflowStage || 1) - 1) : record.workflowStage,
            status: "pendiente",
            completedAt: null
        });
    }
    async function handleReopen(record, table) {
        await patchRecord(record, {
            status: "pendiente",
            completedAt: null,
            workflowStage: table?.mode === "workflow" ? Math.max(1, table.tabs.length - 1) : record.workflowStage
        });
    }
    async function handleDeleteRecord(record) {
        if (!window.confirm("Quitar este registro de seguimiento?")) {
            return;
        }
        await apiDelete(`/tasks/tracking-records/${record.id}`);
        setTrackingRecords((current) => current.filter((candidate) => candidate.id !== record.id));
        setTerms((current) => current.filter((term) => term.id !== record.termId && term.sourceRecordId !== record.id));
    }
    async function handleDeleteDistribution(item) {
        if (!window.confirm(`Quitar todos los registros activos de "${item.eventName}"?`)) {
            return;
        }
        const usedIds = new Set();
        const records = item.targetTables
            .map((targetTable, index) => resolveHistoryRecord(item, targetTable, index, usedIds))
            .filter((record) => Boolean(record));
        await Promise.all(records.map((record) => apiDelete(`/tasks/tracking-records/${record.id}`)));
        setTrackingRecords((current) => current.filter((record) => !records.some((deleted) => deleted.id === record.id)));
        setTerms((current) => current.filter((term) => !records.some((record) => term.id === record.termId || term.sourceRecordId === record.id)));
    }
    if (!moduleConfig) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "execution-page-topline", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }) }), _jsxs("h2", { children: ["Distribuidor de tareas (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "La pesta\u00F1a de tareas activas es la fuente operativa: sus registros alimentan las tablas de seguimiento y el modulo de ejecucion. La configuracion conserva el catalogo usado por el Selector de Tareas." })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "tasks-legacy-tabs tasks-distributor-tabs", children: [_jsx("button", { type: "button", className: activeTab === "active" ? "is-active" : "", onClick: () => setActiveTab("active"), children: "Tareas activas" }), _jsx("button", { type: "button", className: activeTab === "config" ? "is-active" : "", onClick: () => setActiveTab("config"), children: "Configuraci\u00F3n" })] }), activeTab === "active" ? (_jsxs("div", { className: "tasks-distributor-active", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsxs("h2", { children: ["Tareas activas (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Registro de tareas distribuidas. Editar aqui actualiza la informacion que se ve en seguimiento y ejecucion." })] }), _jsxs("span", { children: [activeHistory.length, " activas"] })] }), _jsxs("div", { className: "tasks-legacy-toolbar", children: [_jsx("input", { className: "tasks-legacy-input tasks-distributor-search", value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Buscar cliente..." }), executionModule ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/execution/${executionModule.slug}`), children: "Ir a Ejecuci\u00F3n" })) : null] }), _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: "data-table tasks-legacy-table tasks-distributor-active-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Tablas / tareas" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "centered-inline-message", children: "Cargando tareas activas..." }) })) : activeHistory.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "centered-inline-message", children: "No hay tareas activas en este equipo." }) })) : (activeHistory.map((item) => {
                                                const usedIds = new Set();
                                                return (_jsxs("tr", { children: [_jsx("td", { children: item.clientNumber || "-" }), _jsx("td", { children: item.clientName || "-" }), _jsx("td", { children: item.subject || "-" }), _jsx("td", { children: _jsx("span", { className: "tasks-legacy-process-pill", children: item.specificProcess || "N/A" }) }), _jsx("td", { children: item.matterIdentifier || item.matterNumber || "-" }), _jsxs("td", { children: [_jsx("strong", { children: item.eventName }), _jsx("span", { className: "tasks-distributor-date", children: item.createdAt.slice(0, 10) }), _jsx("button", { type: "button", className: "danger-button tasks-distributor-small-button", onClick: () => void handleDeleteDistribution(item), children: "Borrar todo" })] }), _jsx("td", { children: _jsx("div", { className: "tasks-active-target-list", children: item.targetTables.map((targetTable, index) => {
                                                                    const record = resolveHistoryRecord(item, targetTable, index, usedIds);
                                                                    const table = record ? tableBySlug.get(record.tableCode) : findLegacyTableByAnyName(moduleConfig, targetTable);
                                                                    const completed = record ? isCompletedRecord(table, record) : false;
                                                                    const danger = record ? isTrackingRecordRed(table, record) : true;
                                                                    const canStepBack = Boolean(record && table?.mode === "workflow" && !completed && (record.workflowStage || 1) > 1);
                                                                    return (_jsxs("article", { className: `tasks-active-target-card ${danger ? "is-danger" : completed ? "is-completed" : ""}`, children: [_jsxs("div", { className: "tasks-active-target-head", children: [_jsxs("div", { children: [_jsx("strong", { children: record?.taskName || item.eventNamesPerTable[index] || item.eventName }), _jsx("span", { children: table?.title ?? getTableDisplayName(moduleConfig, targetTable) }), record ? _jsx("small", { children: getStageLabel(table, record) }) : _jsx("small", { children: "Registro no encontrado" })] }), record && table ? (_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/${table.slug}`), children: "Ir" })) : null] }), record ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "tasks-active-target-fields", children: [_jsx("input", { className: "tasks-legacy-input", value: record.taskName, onChange: (event) => void patchRecord(record, { taskName: event.target.value }), "aria-label": "Nombre de la tarea" }), _jsx("input", { className: "tasks-legacy-input", value: record.responsible, onChange: (event) => void patchRecord(record, { responsible: event.target.value }), "aria-label": "Responsable" }), table?.showDateColumn === false ? null : (_jsx("input", { className: "tasks-legacy-input", type: "date", value: getRowDate(record), onChange: (event) => void handleDateChange(record, table, event.target.value), "aria-label": table?.dateLabel ?? "Fecha" }))] }), _jsxs("div", { className: "tasks-legacy-actions", children: [completed ? (_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => void handleReopen(record, table), children: "Reabrir" })) : (_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => void handleAdvance(record, table), children: table?.mode === "workflow" ? "Avanzar" : "Completar" })), canStepBack ? (_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => void handleStepBack(record, table), children: "Regresar" })) : null, _jsx("button", { type: "button", className: "danger-button tasks-distributor-small-button", onClick: () => void handleDeleteRecord(record), children: "Quitar" })] })] })) : null] }, `${item.id}-${targetTable}-${index}`));
                                                                }) }) })] }, item.id));
                                            })) })] }) })] })) : (_jsxs("div", { className: "tasks-distributor-config", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Gesti\u00F3n de Cat\u00E1logo de Tareas" }), _jsx("p", { className: "muted", children: "Define la tarea maestra y cuantas filas debe crear en cada tabla de seguimiento, igual que el catalogo de Intranet." })] }), _jsxs("span", { children: [events.length, " configuradas"] })] }), _jsxs("div", { className: "tasks-distributor-config-layout", children: [_jsxs("article", { className: "tasks-distributor-card", children: [_jsxs("label", { children: ["Nombre de la Tarea", _jsx("input", { className: "tasks-legacy-input", value: catalogName, onChange: (event) => setCatalogName(event.target.value), placeholder: "Ej. Desahogar prevenci\u00F3n" })] }), _jsx("div", { className: "tasks-distributor-table-count-grid", children: moduleConfig.tables.map((table) => {
                                                    const entries = catalogEntries.filter((entry) => entry.tableSlug === table.slug);
                                                    return (_jsxs("div", { className: "tasks-distributor-table-count-card", children: [_jsxs("div", { className: "tasks-distributor-target-head", children: [_jsx("strong", { children: table.title }), _jsxs("div", { className: "tasks-distributor-count-controls", children: [_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => removeCatalogEntry(table), children: "-" }), _jsx("span", { children: entries.length }), _jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => addCatalogEntry(table), children: "+" })] })] }), entries.length > 0 ? (_jsx("div", { className: "tasks-distributor-entry-name-list", children: entries.map((entry) => (_jsx("input", { className: "tasks-legacy-input", value: entry.taskName, onChange: (event) => setCatalogEntries((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, taskName: event.target.value } : candidate)), placeholder: "Nombre para esta tabla" }, entry.id))) })) : null] }, table.slug));
                                                }) }), _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => void saveCatalogEvent(), disabled: !catalogName.trim() || catalogEntries.length === 0, children: editingCatalogId ? "Guardar cambios" : "Guardar tarea" }), editingCatalogId ? (_jsx("button", { type: "button", className: "secondary-button", onClick: resetCatalogForm, children: "Cancelar" })) : null] })] }), _jsxs("article", { className: "tasks-distributor-card", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Cat\u00E1logo guardado" }), _jsx("span", { children: events.length })] }), _jsx("div", { className: "tasks-distributor-event-list", children: events.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Aun no hay tareas configuradas." })) : (events.map((event) => {
                                                    const entries = getCatalogTargetEntries(event, moduleConfig);
                                                    return (_jsxs("div", { className: "tasks-distributor-event-row tasks-distributor-catalog-row", children: [_jsxs("div", { children: [_jsx("strong", { children: event.name }), _jsxs("span", { children: [entries.length, " destino", entries.length === 1 ? "" : "s"] }), _jsx("div", { className: "tasks-legacy-chip-list", children: entries.map((entry) => (_jsxs("span", { children: [getTableDisplayName(moduleConfig, entry.tableSlug), ": ", entry.taskName] }, entry.id))) })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => startCatalogEdit(event), children: "Configurar" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => void deleteCatalogEvent(event), children: "Eliminar" })] }, event.id));
                                                })) })] })] })] }))] })] }));
}
