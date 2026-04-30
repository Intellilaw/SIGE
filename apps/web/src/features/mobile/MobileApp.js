import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import { getCatalogTargetEntries, getTableDisplayName } from "../tasks/task-distribution-utils";
import { LEGACY_TASK_MODULE_BY_ID } from "../tasks/task-legacy-config";
function normalizeText(value) {
    return (value ?? "").trim();
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
function toErrorMessage(error) {
    return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
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
function sortByDate(items) {
    return [...items].sort((left, right) => (toDateInput(left.dueDate ?? left.termDate) || left.createdAt || "").localeCompare(toDateInput(right.dueDate ?? right.termDate) || right.createdAt || ""));
}
function getRecordDate(record) {
    return toDateInput(record.dueDate ?? record.termDate);
}
function getRecordTitle(record) {
    if ("taskName" in record && normalizeText(record.taskName)) {
        return record.taskName;
    }
    if ("pendingTaskLabel" in record) {
        return record.pendingTaskLabel || record.eventName || record.subject || "Tarea";
    }
    return record.eventName || record.subject || "Tarea";
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
    if (loading) {
        return _jsx("div", { className: "mobile-centered", children: "Cargando SIGE..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/intranet-login", replace: true });
    }
    return (_jsxs("div", { className: "mobile-app-shell", children: [_jsxs("header", { className: "mobile-topbar", children: [_jsxs("div", { children: [_jsx("strong", { children: "SIGE movil" }), _jsx("span", { children: user.displayName })] }), _jsx("button", { type: "button", onClick: logout, children: "Salir" })] }), _jsx("main", { className: "mobile-content", children: _jsx(Outlet, {}) }), _jsxs("nav", { className: "mobile-tabbar", "aria-label": "Navegacion movil", children: [_jsx(NavLink, { to: "/mobile", end: true, children: "Inicio" }), _jsx(NavLink, { to: "/mobile/execution", children: "Ejecucion" }), _jsx(NavLink, { to: "/mobile/tracking", children: "Seguimiento" }), _jsx(NavLink, { to: "/app", children: "Web" })] })] }));
}
export function MobileHomePage() {
    const { user } = useAuth();
    const visibleModules = getVisibleExecutionModules(user);
    return (_jsxs("section", { className: "mobile-stack", children: [_jsxs("div", { className: "mobile-hero", children: [_jsx("p", { className: "mobile-eyebrow", children: "Operacion diaria" }), _jsx("h1", { children: "Crear tareas y revisar seguimiento" }), _jsx("p", { children: "Entrada rapida al modulo de ejecucion y a las tablas del manager de tareas." })] }), _jsxs("div", { className: "mobile-action-grid", children: [_jsx(Link, { className: "mobile-primary-action", to: "/mobile/execution", children: "Crear tarea de ejecucion" }), _jsx(Link, { className: "mobile-secondary-action", to: "/mobile/tracking", children: "Consultar tablas" })] }), _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Tus equipos" }), _jsx("span", { children: visibleModules.length })] }), _jsx("div", { className: "mobile-card-list", children: visibleModules.map((module) => (_jsxs(Link, { className: "mobile-module-card", to: `/mobile/execution/${module.slug}`, children: [_jsx("strong", { children: module.label }), _jsx("span", { children: module.description })] }, module.moduleId))) })] })] }));
}
export function MobileExecutionIndexPage() {
    const { user } = useAuth();
    const visibleModules = getVisibleExecutionModules(user);
    if (visibleModules.length === 1 && user?.team !== "CLIENT_RELATIONS" && user?.team !== "ADMIN" && user?.role !== "SUPERADMIN") {
        return _jsx(Navigate, { to: `/mobile/execution/${visibleModules[0].slug}`, replace: true });
    }
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: "Ejecucion", subtitle: "Selecciona el equipo para crear tareas desde asuntos activos." }), _jsx("div", { className: "mobile-card-list", children: visibleModules.map((module) => (_jsxs(Link, { className: "mobile-module-card", to: `/mobile/execution/${module.slug}`, children: [_jsx("strong", { children: module.label }), _jsx("span", { children: module.shortLabel })] }, module.moduleId))) })] }));
}
function MobilePageTitle({ title, subtitle }) {
    return (_jsxs("header", { className: "mobile-page-title", children: [_jsx("h1", { children: title }), subtitle ? _jsx("p", { children: subtitle }) : null] }));
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
    const [targets, setTargets] = useState([]);
    const [responsible, setResponsible] = useState(user?.shortName || module?.defaultResponsible || "");
    const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
    const [submitting, setSubmitting] = useState(false);
    const selectedMatter = useMemo(() => matters.find((matter) => matter.id === selectedMatterId) ?? null, [matters, selectedMatterId]);
    const selectedEvent = useMemo(() => events.find((event) => event.id === selectedEventId) ?? null, [events, selectedEventId]);
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
        setResponsible(user?.shortName || module?.defaultResponsible || "");
    }, [module?.moduleId, user?.shortName]);
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
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: currentModule.label, subtitle: "Crea tareas y revisa pendientes ligados al asunto." }), errorMessage ? _jsx("div", { className: "mobile-alert mobile-alert-error", children: errorMessage }) : null, successMessage ? _jsx("div", { className: "mobile-alert mobile-alert-success", children: successMessage }) : null, _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Buscar asunto" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Cliente, asunto, ID..." })] }), _jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Asuntos" }), _jsx("span", { children: filteredMatters.length })] }), _jsx("div", { className: "mobile-card-list", children: loading ? (_jsx("div", { className: "mobile-empty", children: "Cargando asuntos..." })) : filteredMatters.length === 0 ? (_jsx("div", { className: "mobile-empty", children: "No hay asuntos para esta busqueda." })) : (filteredMatters.map((matter) => {
                            const pendingCount = records.filter((record) => recordBelongsToMatter(record, matter)).filter(isPendingRecord).length +
                                terms.filter((term) => recordBelongsToMatter(term, matter)).filter(isPendingRecord).length;
                            return (_jsxs("button", { type: "button", className: `mobile-matter-card${matter.id === selectedMatterId ? " is-selected" : ""}`, onClick: () => {
                                    setSelectedMatterId(matter.id);
                                    setSuccessMessage(null);
                                }, children: [_jsx("strong", { children: matter.clientName || "Sin cliente" }), _jsx("span", { children: matter.subject || "Sin asunto" }), _jsxs("small", { children: [getEffectiveClientNumber(matter, clients) || "S/N", " | ", matter.matterIdentifier || matter.matterNumber || "Sin ID", " | ", pendingCount, " pendientes"] })] }, matter.id));
                        })) })] }), selectedMatter ? (_jsxs("section", { className: "mobile-section mobile-form-panel", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Nueva tarea" }), _jsx("span", { children: selectedMatter.clientName })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Selector de tareas" }), _jsxs("select", { value: selectedEventId, onChange: (event) => handleEventChange(event.target.value), children: [_jsx("option", { value: "", children: "Seleccionar..." }), events.map((event) => (_jsx("option", { value: event.id, children: event.name }, event.id)))] })] }), _jsxs("div", { className: "mobile-two-fields", children: [_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Responsable" }), _jsx("input", { value: responsible, onChange: (event) => setResponsible(event.target.value) })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: dueDate, onChange: (event) => setDueDate(event.target.value) })] })] }), targets.length > 0 ? (_jsx("div", { className: "mobile-target-list", children: targets.map((target) => {
                            const table = currentLegacyConfig.tables.find((candidate) => candidate.slug === target.tableSlug);
                            return (_jsxs("article", { className: "mobile-target-card", children: [_jsxs("div", { children: [_jsx("strong", { children: getTableDisplayName(currentLegacyConfig, target.tableSlug) }), _jsx("button", { type: "button", onClick: () => setTargets((current) => current.filter((candidate) => candidate.id !== target.id)), children: "Quitar" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Nombre del registro" }), _jsx("input", { value: target.taskName, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate)) })] }), table?.showReportedPeriod ? (_jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: table.reportedPeriodLabel ?? "Periodo reportado" }), _jsx("input", { type: "month", value: target.reportedMonth, onChange: (event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate)) })] })) : null] }, target.id));
                        }) })) : null, _jsx("button", { type: "button", className: "mobile-submit", disabled: submitting || !selectedEvent || targets.length === 0 || !dueDate, onClick: () => void handleSubmit(), children: submitting ? "Enviando..." : "Enviar al manager de tareas" })] })) : null, selectedMatter ? (_jsxs("section", { className: "mobile-section", children: [_jsxs("div", { className: "mobile-section-head", children: [_jsx("h2", { children: "Pendientes del asunto" }), _jsx("span", { children: matterRecords.length + matterTerms.length })] }), _jsx(MobileRecordList, { records: [...matterRecords, ...matterTerms], legacyConfig: currentLegacyConfig, histories: histories })] })) : null] }));
}
export function MobileTrackingIndexPage() {
    const { user } = useAuth();
    const visibleModules = getVisibleExecutionModules(user);
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
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx(MobilePageTitle, { title: module.label, subtitle: "Tablas de seguimiento disponibles." }), _jsx("div", { className: "mobile-card-list", children: legacyConfig.tables.map((table) => (_jsxs(Link, { className: "mobile-table-link", to: `/mobile/tracking/${module.slug}/${table.slug}`, children: [_jsx("strong", { children: table.title }), _jsx("span", { children: table.dateLabel })] }, table.slug))) })] }));
}
export function MobileTrackingTablePage() {
    const { slug, tableId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
    const table = legacyConfig?.tables.find((candidate) => candidate.slug === tableId);
    const visibleModules = getVisibleExecutionModules(user);
    const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
    const [records, setRecords] = useState([]);
    const [histories, setHistories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [search, setSearch] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    useEffect(() => {
        if (!module || !table || !canAccess) {
            return;
        }
        async function loadRecords() {
            setLoading(true);
            setErrorMessage(null);
            try {
                const [loadedRecords, loadedHistories] = await Promise.all([
                    apiGet(`/tasks/tracking-records?moduleId=${module.moduleId}&tableCode=${table.slug}`),
                    apiGet(`/tasks/distributions?moduleId=${module.moduleId}`)
                ]);
                setRecords(loadedRecords);
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
    }, [module?.moduleId, table?.slug, canAccess]);
    if (!module || !legacyConfig || !table || !canAccess) {
        return _jsx(Navigate, { to: "/mobile/tracking", replace: true });
    }
    const visibleRecords = sortByDate(records)
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
    return (_jsxs("section", { className: "mobile-stack", children: [_jsx("button", { type: "button", className: "mobile-back-button", onClick: () => navigate(`/mobile/tracking/${module.slug}`), children: "Volver a tablas" }), _jsx(MobilePageTitle, { title: table.title, subtitle: table.dateLabel }), errorMessage ? _jsx("div", { className: "mobile-alert mobile-alert-error", children: errorMessage }) : null, _jsxs("div", { className: "mobile-segmented", children: [_jsx("button", { type: "button", className: statusFilter === "pending" ? "is-active" : "", onClick: () => setStatusFilter("pending"), children: "Pendientes" }), _jsx("button", { type: "button", className: statusFilter === "done" ? "is-active" : "", onClick: () => setStatusFilter("done"), children: "Concluidas" })] }), _jsxs("label", { className: "mobile-field", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Cliente, tarea, ID..." })] }), loading ? (_jsx("div", { className: "mobile-empty", children: "Cargando registros..." })) : (_jsx(MobileRecordList, { records: visibleRecords, legacyConfig: legacyConfig, histories: histories }))] }));
}
function MobileRecordList({ records, legacyConfig, histories }) {
    if (records.length === 0) {
        return _jsx("div", { className: "mobile-empty", children: "No hay registros para mostrar." });
    }
    const historyTaskNames = new Map();
    histories.forEach((history) => {
        Object.entries(history.createdIds ?? {}).forEach(([key, id]) => {
            const match = key.match(/_(\d+)$/);
            const index = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;
            const taskName = Number.isNaN(index) ? "" : history.eventNamesPerTable[index] ?? "";
            if (taskName) {
                historyTaskNames.set(String(id), taskName);
            }
        });
    });
    return (_jsx("div", { className: "mobile-card-list", children: records.map((record) => {
            const title = historyTaskNames.get(record.id) || getRecordTitle(record);
            const tableLabel = "tableCode" in record ? getTableDisplayName(legacyConfig, record.tableCode) : "Terminos";
            return (_jsxs("article", { className: `mobile-record-card${isRecordOverdue(record) ? " is-overdue" : ""}`, children: [_jsxs("div", { className: "mobile-record-card-head", children: [_jsx("strong", { children: title }), _jsx("span", { children: getRecordStatusLabel(record.status) })] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "Cliente" }), _jsx("dd", { children: record.clientName || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Asunto" }), _jsx("dd", { children: record.subject || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Tabla" }), _jsx("dd", { children: tableLabel })] }), _jsxs("div", { children: [_jsx("dt", { children: "Responsable" }), _jsx("dd", { children: record.responsible || "-" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Fecha" }), _jsx("dd", { children: getRecordDate(record) || "-" })] }), "reportedMonth" in record && record.reportedMonth ? (_jsxs("div", { children: [_jsx("dt", { children: "Periodo" }), _jsx("dd", { children: record.reportedMonth })] })) : null] })] }, record.id));
        }) }));
}
