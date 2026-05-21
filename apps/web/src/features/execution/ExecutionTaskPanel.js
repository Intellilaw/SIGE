import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCatalogTargetEntries, getTableDisplayName } from "../tasks/task-distribution-utils";
import { RusconiIntelligenceBadge } from "../rusconi-intelligence/RusconiIntelligenceBadge";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function toLocalDateInput(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
    return toLocalDateInput(next);
}
function getStateLabel(state) {
    switch (state) {
        case "IN_PROGRESS":
            return "En curso";
        case "COMPLETED":
            return "Completada";
        case "MONTHLY_VIEW":
            return "Vista mensual";
        default:
            return "Pendiente";
    }
}
function normalizeEventSearch(value) {
    return (value ?? "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}
const CREATE_TASKS_RI_CONNECTION_ID = "RI-002";
const DUPLICATE_TASK_THRESHOLD = 0.62;
const duplicateTaskStopWords = new Set([
    "a",
    "al",
    "ante",
    "con",
    "contra",
    "de",
    "del",
    "el",
    "en",
    "la",
    "las",
    "lo",
    "los",
    "para",
    "por",
    "que",
    "se",
    "sin",
    "sobre",
    "su",
    "sus",
    "un",
    "una",
    "unos",
    "unas",
    "vs",
    "versus",
    "tarea",
    "realizar",
    "hacer",
    "preparar",
    "presentar",
    "promover",
    "interponer",
    "solicitar",
    "generar",
    "registrar"
]);
const duplicateTaskPhraseExpansions = [
    ["orden de aprehension", "detencion captura arresto"],
    ["orden aprehension", "detencion captura arresto"],
    ["orden de captura", "aprehension detencion arresto"],
    ["privacion de libertad", "detencion arresto aprehension"],
    ["amparo indirecto", "amparo constitucional"],
    ["medio de defensa", "recurso impugnacion"],
    ["contestacion de demanda", "respuesta demanda"],
    ["termino judicial", "plazo vencimiento"]
];
const duplicateTaskSynonymGroups = [
    ["amparo", "constitucional"],
    ["aprehension", "detencion", "captura", "arresto"],
    ["demanda", "accion", "juicio", "reclamacion"],
    ["contestacion", "respuesta"],
    ["escrito", "promocion", "peticion"],
    ["recurso", "apelacion", "impugnacion", "revision"],
    ["audiencia", "comparecencia", "diligencia"],
    ["notificacion", "emplazamiento", "citacion", "aviso"],
    ["vencimiento", "termino", "plazo"],
    ["pago", "cobro", "liquidacion"],
    ["convenio", "acuerdo", "transaccion"],
    ["prueba", "evidencia", "documental"],
    ["sentencia", "resolucion", "fallo"],
    ["medida", "cautelar", "suspension"]
];
function normalizeSemanticTaskText(value) {
    return normalizeEventSearch(value)
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function getCanonicalTaskToken(token) {
    if (token.startsWith("apreh"))
        return "aprehension";
    if (token.startsWith("deten"))
        return "detencion";
    if (token.startsWith("captur"))
        return "captura";
    if (token.startsWith("arrest"))
        return "arresto";
    if (token.startsWith("ampar"))
        return "amparo";
    if (token.startsWith("constit"))
        return "constitucional";
    if (token.startsWith("demand"))
        return "demanda";
    if (token.startsWith("contest"))
        return "contestacion";
    if (token.startsWith("respond"))
        return "respuesta";
    if (token.startsWith("promoc"))
        return "promocion";
    if (token.startsWith("apel"))
        return "apelacion";
    if (token.startsWith("impugn"))
        return "impugnacion";
    if (token.startsWith("notific"))
        return "notificacion";
    if (token.startsWith("emplaz"))
        return "emplazamiento";
    if (token.startsWith("venc"))
        return "vencimiento";
    if (token.startsWith("termin"))
        return "termino";
    if (token.startsWith("cautel"))
        return "cautelar";
    if (token.startsWith("suspend"))
        return "suspension";
    return token;
}
function getSemanticTaskTokens(value) {
    let text = normalizeSemanticTaskText(value);
    for (const [phrase, expansion] of duplicateTaskPhraseExpansions) {
        if (text.includes(phrase)) {
            text = `${text} ${expansion}`;
        }
    }
    const tokens = text
        .split(" ")
        .map(getCanonicalTaskToken)
        .filter((token) => token.length > 2 && !duplicateTaskStopWords.has(token));
    const expanded = new Set(tokens);
    for (const token of tokens) {
        const group = duplicateTaskSynonymGroups.find((synonyms) => synonyms.includes(token));
        group?.forEach((synonym) => expanded.add(synonym));
    }
    return expanded;
}
function calculateSemanticTaskSimilarity(left, right) {
    const leftText = normalizeSemanticTaskText(left);
    const rightText = normalizeSemanticTaskText(right);
    if (!leftText || !rightText) {
        return 0;
    }
    if (leftText === rightText) {
        return 1;
    }
    if ((leftText.length > 8 || rightText.length > 8) && (leftText.includes(rightText) || rightText.includes(leftText))) {
        return 0.9;
    }
    const leftTokens = getSemanticTaskTokens(left);
    const rightTokens = getSemanticTaskTokens(right);
    if (leftTokens.size === 0 || rightTokens.size === 0) {
        return 0;
    }
    const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    if (overlap === 0) {
        return 0;
    }
    const shorterOverlap = overlap / Math.min(leftTokens.size, rightTokens.size);
    const dice = (2 * overlap) / (leftTokens.size + rightTokens.size);
    const contextualScore = shorterOverlap * 0.72 + dice * 0.28;
    const overlapBoost = overlap >= 3 ? 0.08 : overlap >= 2 ? 0.04 : 0;
    return Math.min(1, contextualScore + overlapBoost);
}
function getCandidateTaskNames(selectedEvent, targets) {
    const names = new Set();
    for (const target of targets) {
        const targetName = target.taskName.trim() || selectedEvent?.name.trim() || "";
        if (targetName) {
            names.add(targetName);
        }
    }
    if (names.size === 0 && selectedEvent?.name.trim()) {
        names.add(selectedEvent.name.trim());
    }
    return [...names];
}
function findDuplicateTaskMatch(selectedEvent, targets, tasks) {
    const candidateNames = getCandidateTaskNames(selectedEvent, targets);
    const activeTasks = tasks.filter((task) => task.state !== "COMPLETED" && !task.isMatterFallback);
    let bestMatch = null;
    for (const candidateName of candidateNames) {
        for (const task of activeTasks) {
            const existingTaskName = task.subject || task.trackLabel;
            const score = calculateSemanticTaskSimilarity(candidateName, existingTaskName);
            if (score < DUPLICATE_TASK_THRESHOLD) {
                continue;
            }
            if (!bestMatch || score > bestMatch.score) {
                bestMatch = {
                    candidateName,
                    existingTaskName,
                    existingTaskTrack: task.trackLabel,
                    score
                };
            }
        }
    }
    return bestMatch;
}
export function ExecutionTaskPanel({ module, legacyConfig, distributionEvents, matter, clientNumber, mode, tasks, onClose, onModeChange, onCreateTask, onUpdateState }) {
    const [selectedEventId, setSelectedEventId] = useState("");
    const [taskSearch, setTaskSearch] = useState("");
    const [taskSearchOpen, setTaskSearchOpen] = useState(false);
    const [selectorTargets, setSelectorTargets] = useState([]);
    const [responsible, setResponsible] = useState(module.defaultResponsible);
    const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [duplicateWarningAcknowledged, setDuplicateWarningAcknowledged] = useState(false);
    const [savingTaskId, setSavingTaskId] = useState(null);
    const searchWrapRef = useRef(null);
    const selectedEvent = useMemo(() => distributionEvents.find((event) => event.id === selectedEventId), [distributionEvents, selectedEventId]);
    const exactSearchEvent = useMemo(() => {
        const query = normalizeEventSearch(taskSearch);
        if (!query) {
            return undefined;
        }
        return distributionEvents.find((event) => normalizeEventSearch(event.name) === query);
    }, [distributionEvents, taskSearch]);
    const filteredDistributionEvents = useMemo(() => {
        const query = taskSearch.trim().toLowerCase();
        if (!query) {
            return distributionEvents;
        }
        return distributionEvents.filter((event) => event.name.toLowerCase().includes(query));
    }, [distributionEvents, taskSearch]);
    const duplicateSelectionKey = selectorTargets.map((target) => `${target.id}:${target.taskName}:${target.reportedMonth}`).join("|");
    const duplicateTaskMatch = useMemo(() => (mode === "create" ? findDuplicateTaskMatch(selectedEvent, selectorTargets, tasks) : null), [mode, selectedEvent, selectorTargets, tasks]);
    useEffect(() => {
        if (!matter || !mode) {
            return;
        }
        setSelectedEventId("");
        setTaskSearch("");
        setTaskSearchOpen(false);
        setSelectorTargets([]);
        setResponsible(module.defaultResponsible);
        setDueDate(addBusinessDays(new Date(), 3));
        setSuccessMessage(null);
        setDuplicateWarningAcknowledged(false);
    }, [matter?.id, mode, module.defaultResponsible]);
    useEffect(() => {
        setDuplicateWarningAcknowledged(false);
    }, [selectedEventId, duplicateSelectionKey, matter?.id]);
    useEffect(() => {
        if (!taskSearchOpen) {
            return;
        }
        function handlePointerDown(event) {
            if (!searchWrapRef.current?.contains(event.target)) {
                setTaskSearchOpen(false);
            }
        }
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setTaskSearchOpen(false);
            }
        }
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [taskSearchOpen]);
    useEffect(() => {
        if (selectedEventId || !exactSearchEvent) {
            return;
        }
        setSelectedEventId(exactSearchEvent.id);
        setSelectorTargets(getCatalogTargetEntries(exactSearchEvent, legacyConfig).map((target) => ({ ...target, reportedMonth: "" })));
    }, [exactSearchEvent, legacyConfig, selectedEventId]);
    function handleEventSelect(eventId) {
        setSelectedEventId(eventId);
        const event = distributionEvents.find((candidate) => candidate.id === eventId);
        setTaskSearch(event?.name ?? "");
        setTaskSearchOpen(false);
        setSelectorTargets(event ? getCatalogTargetEntries(event, legacyConfig).map((target) => ({ ...target, reportedMonth: "" })) : []);
        setSuccessMessage(null);
    }
    if (!matter || !mode) {
        return null;
    }
    const activeMatter = matter;
    const missingTargetNames = selectorTargets.some((target) => !target.taskName.trim());
    async function handleCreate() {
        if (!selectedEvent || selectorTargets.length === 0 || missingTargetNames) {
            return;
        }
        if (duplicateTaskMatch && !duplicateWarningAcknowledged) {
            setDuplicateWarningAcknowledged(true);
            setSuccessMessage(null);
            return;
        }
        setSubmitting(true);
        setSuccessMessage(null);
        try {
            await onCreateTask({
                eventName: selectedEvent.name,
                responsible: responsible.trim() || module.defaultResponsible,
                dueDate,
                targets: selectorTargets.map((target) => ({
                    tableCode: target.tableSlug,
                    taskName: target.taskName.trim() || selectedEvent.name,
                    dueDate,
                    termDate: dueDate,
                    reportedMonth: target.reportedMonth
                }))
            });
            setSelectedEventId("");
            setTaskSearch("");
            setTaskSearchOpen(false);
            setSelectorTargets([]);
            setDuplicateWarningAcknowledged(false);
            setSuccessMessage("La tarea fue distribuida correctamente.");
        }
        catch {
            // The parent owns the visible error banner; keep the selector open without a false success state.
        }
        finally {
            setSubmitting(false);
        }
    }
    async function handleStateChange(task, state) {
        setSavingTaskId(task.id);
        try {
            await onUpdateState(task, state);
        }
        finally {
            setSavingTaskId(null);
        }
    }
    return (_jsx("div", { className: "execution-panel-backdrop", role: "presentation", onClick: onClose, children: _jsxs("aside", { className: `execution-panel ${mode === "create" ? "execution-panel-selector" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": mode === "create" ? "Crear tareas" : "Lista de tareas", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "execution-panel-header", children: [_jsxs("div", { children: [_jsxs("p", { className: "eyebrow", children: ["Ejecucion / ", module.shortLabel] }), _jsx("h3", { children: mode === "create" ? "Crear tareas" : "Lista de tareas" }), _jsxs("p", { className: "muted execution-panel-copy", children: [matter.clientName || "Cliente sin nombre", " - ", matter.subject || "Asunto sin nombre"] }), mode === "create" ? (_jsx("div", { className: "execution-panel-ri-anchor", children: _jsx(RusconiIntelligenceBadge, { connectionId: CREATE_TASKS_RI_CONNECTION_ID, label: "Ejecucion / Crear tareas" }) })) : null] }), _jsx("button", { type: "button", className: "secondary-button", onClick: onClose, children: "Cerrar" })] }), mode === "history" ? (_jsx("div", { className: "execution-panel-switcher", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => onModeChange("create"), children: "Crear tareas" }) })) : null, mode === "create" ? (_jsx("div", { className: "execution-panel-body execution-panel-form", children: _jsxs("div", { className: "execution-selector-layout", children: [_jsxs("div", { className: "execution-selector-form", children: [_jsxs("label", { className: "form-field execution-selector-search-field", children: [_jsx("span", { children: "Seleccionar tarea" }), _jsxs("div", { className: "execution-selector-search", ref: searchWrapRef, children: [_jsx("input", { value: taskSearch, onChange: (event) => {
                                                            setTaskSearch(event.target.value);
                                                            setTaskSearchOpen(true);
                                                            setSuccessMessage(null);
                                                            if (selectedEventId) {
                                                                setSelectedEventId("");
                                                                setSelectorTargets([]);
                                                            }
                                                        }, onClick: () => setTaskSearchOpen((current) => !current), placeholder: "Buscar tarea...", autoComplete: "off" }), taskSearchOpen ? (_jsx("div", { className: "execution-selector-search-results", role: "listbox", children: filteredDistributionEvents.length === 0 ? (_jsx("div", { className: "execution-selector-search-empty", children: "No hay tareas con ese criterio." })) : (filteredDistributionEvents.map((event) => (_jsx("button", { type: "button", role: "option", "aria-selected": event.id === selectedEventId, onMouseDown: (mouseEvent) => {
                                                                mouseEvent.preventDefault();
                                                                handleEventSelect(event.id);
                                                            }, children: event.name }, event.id)))) })) : null] })] }), _jsx("button", { type: "button", className: "primary-button execution-selector-submit", onClick: () => void handleCreate(), disabled: submitting || !selectedEvent || selectorTargets.length === 0 || !dueDate || missingTargetNames, children: submitting ? "Procesando..." : duplicateTaskMatch && duplicateWarningAcknowledged ? "Distribuir de todos modos" : "Distribuir Tareas" }), duplicateTaskMatch ? (_jsxs("div", { className: "message-banner message-warning execution-duplicate-warning", children: [_jsx(RusconiIntelligenceBadge, { connectionId: CREATE_TASKS_RI_CONNECTION_ID, label: "Ejecucion / Crear tareas" }), _jsxs("div", { children: [_jsx("strong", { children: "Posible tarea duplicada vigente" }), _jsxs("span", { children: ["\"", duplicateTaskMatch.candidateName, "\" se parece a \"", duplicateTaskMatch.existingTaskName, "\" en ", duplicateTaskMatch.existingTaskTrack, ".", duplicateWarningAcknowledged
                                                                ? " Si deseas conservar ambas tareas, presiona Distribuir de todos modos."
                                                                : " Si necesitas registrarla de todas formas, presiona Distribuir Tareas para confirmar la excepcion."] })] })] })) : null, successMessage ? (_jsx("div", { className: "message-banner message-success", children: successMessage })) : null, _jsxs("div", { className: "execution-selector-matter", children: [_jsx("h4", { children: "Detalles del Asunto (Lectura)" }), _jsxs("div", { className: "execution-selector-matter-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "ID Asunto" }), _jsx("input", { readOnly: true, value: activeMatter.matterIdentifier || activeMatter.matterNumber || "" })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "No. Cliente" }), _jsx("input", { readOnly: true, value: clientNumber || activeMatter.clientNumber || "" })] }), _jsxs("label", { className: "form-field execution-selector-span", children: [_jsx("span", { children: "Cliente" }), _jsx("input", { readOnly: true, value: activeMatter.clientName || "" })] }), _jsxs("label", { className: "form-field execution-selector-span", children: [_jsx("span", { children: "Asunto / Expediente" }), _jsx("input", { readOnly: true, value: activeMatter.subject || "" })] }), _jsxs("label", { className: "form-field execution-selector-span", children: [_jsx("span", { children: "Proceso espec\u00EDfico" }), _jsx("input", { readOnly: true, value: activeMatter.specificProcess || "" })] })] })] })] }), _jsxs("div", { className: "execution-selector-summary", children: [_jsx("h3", { children: "Resumen de Env\u00EDo" }), selectorTargets.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Selecciona una tarea para ver las tablas destino." })) : (_jsx("div", { className: "execution-selector-target-list", children: selectorTargets.map((target) => (_jsxs("article", { className: "execution-selector-target-card", children: [_jsxs("div", { className: "tasks-distributor-target-head", children: [_jsx("strong", { children: getTableDisplayName(legacyConfig, target.tableSlug) }), _jsx("button", { type: "button", className: "danger-button tasks-distributor-small-button", onClick: () => setSelectorTargets((current) => current.filter((candidate) => candidate.id !== target.id)), children: "Quitar" })] }), _jsx("input", { value: target.taskName, onChange: (event) => setSelectorTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate)), placeholder: "Nombre del registro" }), legacyConfig.tables.find((table) => table.slug === target.tableSlug)?.showReportedPeriod ? (_jsxs("label", { className: "form-field", children: [_jsx("span", { children: legacyConfig.tables.find((table) => table.slug === target.tableSlug)?.reportedPeriodLabel ?? "Periodo reportado" }), _jsx("input", { type: "month", value: target.reportedMonth, onChange: (event) => setSelectorTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate)) })] })) : null] }, target.id))) }))] })] }) })) : (_jsx("div", { className: "execution-panel-body", children: tasks.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay tareas ligadas a este asunto." })) : (_jsx("div", { className: "execution-task-list", children: tasks.map((task) => (_jsxs("article", { className: "execution-task-card", children: [_jsxs("div", { className: "execution-task-topline", children: [_jsxs("div", { children: [_jsx("strong", { children: task.subject }), _jsxs("p", { className: "muted execution-task-meta", children: [task.trackLabel, " - ", task.responsible || "Sin responsable", " - ", toDateInput(task.dueDate) || "-"] })] }), _jsx("span", { className: `execution-task-state execution-task-state-${task.state.toLowerCase()}`, children: getStateLabel(task.state) })] }), task.isMatterFallback ? (_jsx("p", { className: "muted execution-task-meta", children: "Esta fila viene del origen del asunto. Para gestionarla desde Ejecucion, crea una tarea en Crear tareas." })) : (_jsx("div", { className: "execution-task-actions", children: ["PENDING", "IN_PROGRESS", "COMPLETED"].map((state) => (_jsx("button", { type: "button", className: task.state === state ? "primary-button" : "secondary-button", disabled: savingTaskId === task.id, onClick: () => void handleStateChange(task, state), children: state === "PENDING" ? "Pendiente" : state === "IN_PROGRESS" ? "En curso" : "Completar" }, state))) }))] }, task.id))) })) }))] }) }));
}
