import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { ExecutionTaskPanel } from "./ExecutionTaskPanel";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "./execution-config";
const CHANNEL_LABELS = {
    WHATSAPP: "WhatsApp",
    TELEGRAM: "Telegram",
    WECHAT: "WeChat",
    EMAIL: "Correo-e",
    PHONE: "Telefono"
};
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
function toLocalDateInput(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function getChannelLabel(value) {
    return CHANNEL_LABELS[normalizeText(value)] ?? "WhatsApp";
}
function getEffectiveClientNumber(matter, clients) {
    const normalizedName = normalizeComparableText(matter.clientName);
    const match = clients.find((client) => normalizeComparableText(client.name) === normalizedName);
    return match?.clientNumber ?? normalizeText(matter.clientNumber);
}
function sortActiveMatters(items, clients) {
    return [...items].sort((left, right) => {
        const leftNumber = Number.parseInt(getEffectiveClientNumber(left, clients), 10);
        const rightNumber = Number.parseInt(getEffectiveClientNumber(right, clients), 10);
        if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
            return left.createdAt.localeCompare(right.createdAt);
        }
        if (Number.isNaN(leftNumber)) {
            return 1;
        }
        if (Number.isNaN(rightNumber)) {
            return -1;
        }
        if (leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return left.createdAt.localeCompare(right.createdAt);
    });
}
function sortDeletedMatters(items) {
    return [...items].sort((left, right) => (right.deletedAt ?? right.updatedAt).localeCompare(left.deletedAt ?? left.updatedAt));
}
function replaceMatter(items, updated) {
    return items.map((item) => (item.id === updated.id ? updated : item));
}
function getSortedTaskViews(tasks) {
    return tasks.slice().sort((left, right) => {
        const leftDate = toDateInput(left.dueDate);
        const rightDate = toDateInput(right.dueDate);
        if (!leftDate && !rightDate) {
            return left.id.localeCompare(right.id);
        }
        if (!leftDate) {
            return 1;
        }
        if (!rightDate) {
            return -1;
        }
        return leftDate.localeCompare(rightDate);
    });
}
function addTaskViewToMap(taskMap, keys, view) {
    keys.map(normalizeText).filter(Boolean).forEach((key) => {
        const current = taskMap.get(key) ?? [];
        current.push(view);
        taskMap.set(key, current);
    });
}
function mergeTaskMaps(...maps) {
    const merged = new Map();
    maps.forEach((taskMap) => {
        taskMap.forEach((tasks, key) => {
            merged.set(key, getSortedTaskViews([...(merged.get(key) ?? []), ...tasks]));
        });
    });
    return merged;
}
function buildMatterTaskMap(tasks, trackLabels, sourcePrefix, includeCompleted = false) {
    const taskMap = new Map();
    const filteredTasks = tasks
        .filter((task) => (includeCompleted ? true : task.state !== "COMPLETED"))
        .slice()
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    filteredTasks.forEach((task) => {
        const trackLabel = trackLabels.get(task.trackId) ?? task.trackId;
        const view = {
            ...task,
            trackLabel,
            sourceLabel: `${sourcePrefix}: ${trackLabel}`,
            sourceType: "task"
        };
        addTaskViewToMap(taskMap, [task.matterId ?? "", task.matterNumber ?? ""], view);
    });
    return taskMap;
}
function buildTrackingRecordTaskMap(records, trackLabels, sourcePrefix, includeCompleted = false) {
    const taskMap = new Map();
    const filteredRecords = records
        .filter((record) => (includeCompleted ? true : record.status === "pendiente" && !record.deletedAt))
        .slice()
        .sort((left, right) => {
        const leftDate = toDateInput(left.dueDate ?? left.termDate);
        const rightDate = toDateInput(right.dueDate ?? right.termDate);
        return leftDate.localeCompare(rightDate);
    });
    filteredRecords.forEach((record) => {
        const trackLabel = trackLabels.get(record.tableCode) ?? record.sourceTable ?? record.tableCode;
        const view = {
            id: record.id,
            moduleId: record.moduleId,
            trackId: record.tableCode,
            clientName: record.clientName,
            matterId: record.matterId,
            matterNumber: record.matterNumber,
            subject: record.taskName || record.eventName || record.subject || trackLabel,
            responsible: record.responsible,
            dueDate: record.dueDate ?? record.termDate ?? "",
            state: record.status === "pendiente" ? "PENDING" : "COMPLETED",
            recurring: Boolean(record.data?.recurring),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            trackLabel,
            sourceLabel: `${sourcePrefix}: ${trackLabel}`,
            sourceType: "tracking"
        };
        addTaskViewToMap(taskMap, [record.matterId ?? "", record.matterNumber ?? "", record.matterIdentifier ?? ""], view);
    });
    return taskMap;
}
function buildTermTaskMap(terms, sourcePrefix, includeCompleted = false) {
    const taskMap = new Map();
    const filteredTerms = terms
        .filter((term) => (includeCompleted ? true : term.status === "pendiente" && !term.deletedAt))
        .slice()
        .sort((left, right) => {
        const leftDate = toDateInput(left.dueDate ?? left.termDate);
        const rightDate = toDateInput(right.dueDate ?? right.termDate);
        return leftDate.localeCompare(rightDate);
    });
    filteredTerms.forEach((term) => {
        const trackLabel = "Terminos";
        const view = {
            id: term.id,
            moduleId: term.moduleId,
            trackId: "legacy-term",
            clientName: term.clientName,
            matterId: term.matterId,
            matterNumber: term.matterNumber,
            subject: term.pendingTaskLabel || term.eventName || term.subject || trackLabel,
            responsible: term.responsible,
            dueDate: term.dueDate ?? term.termDate ?? "",
            state: term.status === "pendiente" ? "PENDING" : "COMPLETED",
            recurring: Boolean(term.recurring),
            createdAt: term.createdAt,
            updatedAt: term.updatedAt,
            trackLabel,
            sourceLabel: `${sourcePrefix}: ${trackLabel}`,
            sourceType: "term"
        };
        addTaskViewToMap(taskMap, [term.matterId ?? "", term.matterNumber ?? "", term.matterIdentifier ?? ""], view);
    });
    return taskMap;
}
function buildMatterFallbackTask(matter, sourcePrefix) {
    if (!normalizeText(matter.nextAction)) {
        return null;
    }
    return {
        id: `matter-next-action-${matter.id}`,
        moduleId: matter.executionLinkedModule ?? sourcePrefix,
        trackId: "matter-next-action",
        clientName: matter.clientName,
        matterId: matter.id,
        matterNumber: matter.matterNumber,
        subject: matter.nextAction ?? "",
        responsible: matter.commissionAssignee ?? "",
        dueDate: matter.nextActionDueAt ?? "",
        state: "PENDING",
        recurring: false,
        trackLabel: matter.nextActionSource ?? "Asuntos Activos",
        sourceLabel: matter.nextActionSource ?? `${sourcePrefix}: Asuntos Activos`,
        isMatterFallback: true,
        sourceType: "matter"
    };
}
function getMatterTasks(matter, taskMap, sourcePrefix) {
    const linkedTasks = taskMap.get(normalizeText(matter.id)) ??
        taskMap.get(normalizeText(matter.matterNumber)) ??
        taskMap.get(normalizeText(matter.matterIdentifier)) ??
        [];
    if (linkedTasks.length > 0) {
        return linkedTasks;
    }
    const fallbackTask = buildMatterFallbackTask(matter, sourcePrefix);
    return fallbackTask ? [fallbackTask] : [];
}
function getNextBusinessDate() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    do {
        date.setDate(date.getDate() + 1);
    } while (date.getDay() === 0 || date.getDay() === 6);
    return toLocalDateInput(date);
}
function evaluateMatterRow(matter, clientNumber, tasks) {
    const missing = [];
    if (!clientNumber)
        missing.push("No. Cliente");
    if (!normalizeText(matter.clientName))
        missing.push("Cliente");
    if (!normalizeText(matter.quoteNumber))
        missing.push("No. Cotizacion");
    if (!normalizeText(matter.subject))
        missing.push("Asunto");
    if (!normalizeText(matter.matterIdentifier))
        missing.push("ID Asunto");
    if (!normalizeText(matter.communicationChannel))
        missing.push("Canal");
    if (!normalizeText(matter.milestone))
        missing.push("Hito conclusion");
    if (tasks.length === 0)
        missing.push("Sin siguientes tareas");
    const today = toLocalDateInput(new Date());
    const isOverdue = tasks.some((task) => {
        const dueDate = toDateInput(task.dueDate);
        return Boolean(dueDate) && dueDate <= today;
    });
    const nextBusinessDate = getNextBusinessDate();
    const isNextBusinessDay = !isOverdue && tasks.some((task) => toDateInput(task.dueDate) === nextBusinessDate);
    return {
        missing,
        isOverdue,
        isNextBusinessDay
    };
}
export function ExecutionTeamWorkspace({ backPath = "/app/execution", fallbackPath = "/app/execution", titlePrefix = "", description = "Replica funcional del tablero legado: asunto por asunto, siguientes tareas, resaltado rojo por faltantes o vencimientos y separacion completa por equipo.", showHero = true }) {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const visibleModules = getVisibleExecutionModules(user);
    const [activeMatters, setActiveMatters] = useState([]);
    const [deletedMatters, setDeletedMatters] = useState([]);
    const [clients, setClients] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [trackingRecords, setTrackingRecords] = useState([]);
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [clientSearch, setClientSearch] = useState("");
    const [panelMatter, setPanelMatter] = useState(null);
    const [panelMode, setPanelMode] = useState(null);
    const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
    useEffect(() => {
        if (!module || !canAccess) {
            return;
        }
        const currentModule = module;
        async function loadBoard() {
            setLoading(true);
            setErrorMessage(null);
            try {
                const [loadedMatters, loadedDeleted, loadedClients, loadedTasks, loadedTrackingRecords, loadedTerms] = await Promise.all([
                    apiGet("/matters"),
                    apiGet("/matters/recycle-bin"),
                    apiGet("/clients"),
                    apiGet(`/tasks/items?moduleId=${currentModule.moduleId}`),
                    apiGet(`/tasks/tracking-records?moduleId=${currentModule.moduleId}`),
                    apiGet(`/tasks/terms?moduleId=${currentModule.moduleId}`)
                ]);
                const teamMatters = loadedMatters.filter((matter) => matter.responsibleTeam === currentModule.team);
                const teamDeleted = loadedDeleted.filter((matter) => matter.responsibleTeam === currentModule.team);
                setClients(loadedClients);
                setTasks(loadedTasks);
                setTrackingRecords(loadedTrackingRecords);
                setTerms(loadedTerms);
                setActiveMatters(sortActiveMatters(teamMatters, loadedClients));
                setDeletedMatters(sortDeletedMatters(teamDeleted));
            }
            catch (error) {
                setErrorMessage(toErrorMessage(error));
            }
            finally {
                setLoading(false);
            }
        }
        void loadBoard();
    }, [module?.moduleId, module?.team, canAccess]);
    const trackLabels = useMemo(() => new Map(module?.definition.tracks.map((track) => [track.id, track.label]) ?? []), [module]);
    const sourcePrefix = module?.shortLabel ?? "Ejecucion";
    const activeTaskItemMap = useMemo(() => buildMatterTaskMap(tasks, trackLabels, sourcePrefix), [tasks, trackLabels, sourcePrefix]);
    const allTaskItemMap = useMemo(() => buildMatterTaskMap(tasks, trackLabels, sourcePrefix, true), [tasks, trackLabels, sourcePrefix]);
    const activeTrackingMap = useMemo(() => buildTrackingRecordTaskMap(trackingRecords, trackLabels, sourcePrefix), [trackingRecords, trackLabels, sourcePrefix]);
    const allTrackingMap = useMemo(() => buildTrackingRecordTaskMap(trackingRecords, trackLabels, sourcePrefix, true), [trackingRecords, trackLabels, sourcePrefix]);
    const activeTermMap = useMemo(() => buildTermTaskMap(terms, sourcePrefix), [terms, sourcePrefix]);
    const allTermMap = useMemo(() => buildTermTaskMap(terms, sourcePrefix, true), [terms, sourcePrefix]);
    const activeTaskMap = useMemo(() => mergeTaskMaps(activeTermMap, activeTrackingMap, activeTaskItemMap), [activeTermMap, activeTrackingMap, activeTaskItemMap]);
    const allTaskMap = useMemo(() => mergeTaskMaps(allTermMap, allTrackingMap, allTaskItemMap), [allTermMap, allTrackingMap, allTaskItemMap]);
    const searchQuery = normalizeComparableText(clientSearch);
    const filteredMatters = useMemo(() => activeMatters.filter((matter) => {
        if (!searchQuery) {
            return true;
        }
        return normalizeComparableText(matter.clientName).includes(searchQuery);
    }), [activeMatters, searchQuery]);
    const filteredDeletedMatters = useMemo(() => deletedMatters.filter((matter) => {
        if (!searchQuery) {
            return true;
        }
        return normalizeComparableText(matter.clientName).includes(searchQuery);
    }), [deletedMatters, searchQuery]);
    if (!module || !canAccess) {
        return _jsx(Navigate, { to: fallbackPath, replace: true });
    }
    function updateMatterLocal(matterId, updater) {
        const current = activeMatters.find((item) => item.id === matterId);
        if (!current) {
            return null;
        }
        const updated = updater({ ...current });
        setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
        return updated;
    }
    async function persistMatter(matterId, payload) {
        try {
            const updated = await apiPatch(`/matters/${matterId}`, payload);
            setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    function handleLocalChange(matterId, field, value) {
        void updateMatterLocal(matterId, (matter) => {
            const draft = matter;
            draft[field] = value;
            return matter;
        });
    }
    function handleBlur(matterId) {
        const matter = activeMatters.find((item) => item.id === matterId);
        if (!matter) {
            return;
        }
        void persistMatter(matterId, {
            executionPrompt: normalizeText(matter.executionPrompt) ? matter.executionPrompt ?? null : null,
            notes: normalizeText(matter.notes) ? matter.notes ?? null : null
        });
    }
    async function handleToggleConcluded(matterId, concluded) {
        updateMatterLocal(matterId, (matter) => {
            matter.concluded = concluded;
            return matter;
        });
        await persistMatter(matterId, { concluded });
    }
    async function handleRestore(matterId) {
        if (!window.confirm("Restaurar este asunto a activos?")) {
            return;
        }
        try {
            const updated = await apiPost(`/matters/${matterId}/restore`, {});
            setDeletedMatters((items) => sortDeletedMatters(items.filter((item) => item.id !== updated.id)));
            setActiveMatters((items) => sortActiveMatters([...items, updated], clients));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleCreateTask(payload) {
        if (!panelMatter || !module) {
            return;
        }
        try {
            const uniqueTrackIds = [...new Set(payload.trackIds)];
            const eventName = payload.subject.trim() || panelMatter.subject || "Tarea de ejecucion";
            await apiPost("/tasks/distributions", {
                moduleId: module.moduleId,
                matterId: panelMatter.id,
                matterNumber: panelMatter.matterNumber,
                clientNumber: getEffectiveClientNumber(panelMatter, clients),
                clientName: panelMatter.clientName || "Sin cliente",
                subject: panelMatter.subject || "",
                specificProcess: panelMatter.specificProcess ?? null,
                matterIdentifier: panelMatter.matterIdentifier ?? null,
                eventName,
                responsible: payload.responsible,
                targets: uniqueTrackIds.map((trackId) => {
                    const track = module.definition.tracks.find((candidate) => candidate.id === trackId);
                    const taskName = payload.subject.trim() || track?.label || eventName;
                    return {
                        tableCode: trackId,
                        sourceTable: trackId,
                        tableLabel: track?.label ?? trackId,
                        taskName,
                        dueDate: payload.dueDate,
                        status: payload.state === "COMPLETED" ? "presentado" : "pendiente",
                        workflowStage: 1,
                        data: {
                            source: "execution-distributor",
                            recurring: Boolean(track?.recurring)
                        }
                    };
                })
            });
            const loadedTrackingRecords = await apiGet(`/tasks/tracking-records?moduleId=${module.moduleId}`);
            setTrackingRecords(loadedTrackingRecords);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    async function handleUpdateTaskState(task, state) {
        if (task.sourceType === "tracking") {
            try {
                const updated = await apiPatch(`/tasks/tracking-records/${task.id}`, {
                    status: state === "COMPLETED" ? "presentado" : "pendiente",
                    completedAt: state === "COMPLETED" ? new Date().toISOString() : null
                });
                if (!updated) {
                    return;
                }
                setTrackingRecords((items) => items
                    .map((record) => (record.id === updated.id ? updated : record))
                    .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? "")));
            }
            catch (error) {
                setErrorMessage(toErrorMessage(error));
            }
            return;
        }
        if (task.sourceType === "term") {
            try {
                const updated = await apiPatch(`/tasks/terms/${task.id}`, {
                    status: state === "COMPLETED" ? "presentado" : "pendiente"
                });
                if (!updated) {
                    return;
                }
                setTerms((items) => items
                    .map((term) => (term.id === updated.id ? updated : term))
                    .sort((left, right) => (left.dueDate ?? left.termDate ?? "").localeCompare(right.dueDate ?? right.termDate ?? "")));
            }
            catch (error) {
                setErrorMessage(toErrorMessage(error));
            }
            return;
        }
        if (task.sourceType !== "task") {
            return;
        }
        try {
            const updated = await apiPatch(`/tasks/items/${task.id}/state`, { state });
            if (!updated) {
                return;
            }
            setTasks((items) => items
                .map((task) => (task.id === updated.id ? updated : task))
                .sort((left, right) => left.dueDate.localeCompare(right.dueDate)));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
    }
    const panelTasks = panelMatter ? getMatterTasks(panelMatter, allTaskMap, sourcePrefix) : [];
    return (_jsxs("section", { className: "page-stack execution-page", children: [showHero ? (_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(backPath), children: "Volver" }), _jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", style: { color: module.color }, children: module.icon }), _jsx("div", { children: _jsx("h2", { children: `${titlePrefix}${module.label}` }) })] })] }), _jsx("p", { className: "muted", children: description })] })) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Asuntos en ejecucion" }), _jsxs("span", { children: [filteredMatters.length, " registros"] })] }), _jsxs("div", { className: "matters-toolbar", children: [_jsx("div", { className: "matters-toolbar-actions", children: _jsx("span", { className: "muted", children: "Filtra por cliente y abre cada asunto para crear o consultar tareas del equipo." }) }), _jsx("div", { className: "matters-filters", children: _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Cliente" }), _jsx("input", { type: "text", value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Buscar cliente..." })] }) })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table execution-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: "Enviar" }), _jsx("th", { children: "Canal" }), _jsx("th", { children: "Siguiente tarea" }), _jsx("th", { children: "Fecha sig. tarea" }), _jsx("th", { children: "Origen" }), _jsx("th", { children: "Ir" }), _jsx("th", { children: "Comentarios LLM" }), _jsx("th", { children: "Hito conclusion" }), _jsx("th", { children: "Concluyo?" }), _jsx("th", { children: "Comentarios" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 16, className: "centered-inline-message", children: "Cargando ejecucion..." }) })) : filteredMatters.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 16, className: "centered-inline-message", children: "No hay asuntos del equipo en esta vista." }) })) : (_jsxs(_Fragment, { children: [filteredMatters.map((matter) => {
                                                    const clientNumber = getEffectiveClientNumber(matter, clients);
                                                    const matterTasks = getMatterTasks(matter, activeTaskMap, sourcePrefix);
                                                    const validation = evaluateMatterRow(matter, clientNumber, matterTasks);
                                                    const rowClassName = validation.missing.length > 0 || validation.isOverdue
                                                        ? "execution-row-danger"
                                                        : validation.isNextBusinessDay
                                                            ? "execution-row-next-business"
                                                            : "";
                                                    const rowTitle = [
                                                        validation.missing.length > 0 ? `Falta: ${validation.missing.join(", ")}` : "",
                                                        validation.isOverdue ? "Tiene tareas vencidas o con vencimiento de hoy." : ""
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ");
                                                    return (_jsxs("tr", { className: rowClassName, title: rowTitle, children: [_jsx("td", { children: _jsx("input", { className: "lead-cell-input matter-cell-derived", value: clientNumber || "-", readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input matter-cell-readonly", value: matter.clientName || "", readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input matter-cell-readonly", value: matter.quoteNumber || "", readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input matter-cell-readonly", value: matter.subject || "", readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input matter-cell-readonly", value: matter.specificProcess || "", readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input matter-cell-readonly", value: matter.matterIdentifier || "", readOnly: true }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "primary-button matter-inline-button", onClick: () => {
                                                                        setPanelMatter(matter);
                                                                        setPanelMode("create");
                                                                    }, children: "Crear Tarea" }) }), _jsx("td", { children: _jsx("div", { className: "matter-reflection-card", children: getChannelLabel(matter.communicationChannel) }) }), _jsx("td", { children: _jsx("div", { className: "execution-actions-cell", children: matterTasks.length === 0 ? (_jsx("span", { className: "matter-cell-muted", children: "Sin tareas" })) : (matterTasks.map((task) => (_jsxs("div", { className: "execution-inline-entry", children: [_jsx("strong", { children: "\u2022" }), " ", task.subject || task.trackLabel] }, task.id)))) }) }), _jsx("td", { children: _jsx("div", { className: "execution-actions-cell", children: matterTasks.length === 0 ? (_jsx("span", { className: "matter-cell-muted", children: "-" })) : (matterTasks.map((task) => (_jsx("div", { className: "execution-inline-entry", children: toDateInput(task.dueDate) || "S/F" }, task.id)))) }) }), _jsx("td", { className: "matter-checkbox-cell", children: matterTasks.length === 0 ? (_jsx("span", { className: "matter-cell-muted", children: "-" })) : (_jsx("div", { className: "execution-origin-stack", children: matterTasks.map((task) => (_jsx("span", { className: "matter-origin-indicator", title: task.sourceLabel, children: "i" }, task.id))) })) }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => {
                                                                        setPanelMatter(matter);
                                                                        setPanelMode("history");
                                                                    }, children: "Ir" }) }), _jsx("td", { children: _jsx("textarea", { className: "lead-cell-input execution-textarea", value: matter.executionPrompt || "", onChange: (event) => handleLocalChange(matter.id, "executionPrompt", event.target.value), onBlur: () => handleBlur(matter.id), placeholder: "Prompt operativo..." }) }), _jsx("td", { children: _jsx("input", { className: "lead-cell-input matter-cell-readonly", value: matter.milestone || "", readOnly: true }) }), _jsx("td", { className: "matter-checkbox-cell", children: _jsx("input", { type: "checkbox", checked: Boolean(matter.concluded), onChange: (event) => void handleToggleConcluded(matter.id, event.target.checked) }) }), _jsx("td", { children: _jsx("textarea", { className: "lead-cell-input execution-textarea", value: matter.notes || "", onChange: (event) => handleLocalChange(matter.id, "notes", event.target.value), onBlur: () => handleBlur(matter.id), placeholder: "Comentarios del equipo..." }) })] }, matter.id));
                                                }), _jsx("tr", { className: "execution-table-note", children: _jsx("td", { colSpan: 16, children: "Para agregar un nuevo asunto, se debe hacer desde el Distribuidor." }) })] })) })] }) }) })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Papelera de reciclaje" }), _jsxs("span", { children: [filteredDeletedMatters.length, " registros"] })] }), _jsx("p", { className: "muted matter-table-caption", children: "Los asuntos eliminados desaparecen definitivamente despues de 30 dias, igual que en la referencia." }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper", children: _jsxs("table", { className: "lead-table execution-table execution-table-recycle", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: "Canal" }), _jsx("th", { children: "Siguiente Tarea (Legacy)" }), _jsx("th", { children: "Fecha Sig. Tarea (Legacy)" }), _jsx("th", { children: "Comentarios LLM" }), _jsx("th", { children: "Hito conclusion" }), _jsx("th", { children: "Concluyo?" }), _jsx("th", { children: "Notas" }), _jsx("th", { children: "Accion" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 13, className: "centered-inline-message", children: "Cargando papelera..." }) })) : filteredDeletedMatters.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 13, className: "centered-inline-message", children: "Papelera vacia." }) })) : (filteredDeletedMatters.map((matter) => {
                                            const matterTasks = getMatterTasks(matter, allTaskMap, sourcePrefix);
                                            return (_jsxs("tr", { children: [_jsx("td", { children: getEffectiveClientNumber(matter, clients) || "-" }), _jsx("td", { children: matter.clientName || "-" }), _jsx("td", { children: matter.quoteNumber || "-" }), _jsx("td", { children: matter.subject || "-" }), _jsx("td", { children: matter.matterIdentifier || "-" }), _jsx("td", { children: getChannelLabel(matter.communicationChannel) }), _jsx("td", { children: matterTasks.length === 0 ? (_jsx("span", { className: "matter-cell-muted", children: "Sin tareas" })) : (matterTasks.map((task) => (_jsxs("div", { className: "execution-inline-entry", children: [_jsx("strong", { children: "\u2022" }), " ", task.subject || task.trackLabel] }, task.id)))) }), _jsx("td", { children: matterTasks.length === 0 ? (_jsx("span", { className: "matter-cell-muted", children: "-" })) : (matterTasks.map((task) => (_jsx("div", { className: "execution-inline-entry", children: toDateInput(task.dueDate) || "S/F" }, task.id)))) }), _jsx("td", { children: matter.executionPrompt || "-" }), _jsx("td", { children: matter.milestone || "-" }), _jsx("td", { children: matter.concluded ? "Si" : "No" }), _jsx("td", { children: matter.notes || "-" }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => void handleRestore(matter.id), children: "Regresar" }) })] }, matter.id));
                                        })) })] }) }) })] }), _jsx(ExecutionTaskPanel, { module: module, matter: panelMatter, mode: panelMode, tasks: panelTasks, userShortName: user?.shortName, onClose: () => {
                    setPanelMatter(null);
                    setPanelMode(null);
                }, onModeChange: setPanelMode, onCreateTask: handleCreateTask, onUpdateState: handleUpdateTaskState })] }));
}
export function ExecutionTeamPage() {
    return _jsx(ExecutionTeamWorkspace, {});
}
