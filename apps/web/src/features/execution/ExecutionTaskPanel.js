import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { getCatalogTargetEntries, getTableDisplayName } from "../tasks/task-distribution-utils";
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
export function ExecutionTaskPanel({ module, legacyConfig, distributionEvents, matter, clientNumber, mode, tasks, userShortName, onClose, onModeChange, onCreateTask, onUpdateState }) {
    const [selectedEventId, setSelectedEventId] = useState("");
    const [selectorTargets, setSelectorTargets] = useState([]);
    const [responsible, setResponsible] = useState(userShortName || module.defaultResponsible);
    const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
    const [submitting, setSubmitting] = useState(false);
    const [savingTaskId, setSavingTaskId] = useState(null);
    const selectedEvent = useMemo(() => distributionEvents.find((event) => event.id === selectedEventId), [distributionEvents, selectedEventId]);
    useEffect(() => {
        if (!matter || !mode) {
            return;
        }
        setSelectedEventId("");
        setSelectorTargets([]);
        setResponsible(userShortName || module.defaultResponsible);
        setDueDate(addBusinessDays(new Date(), 3));
    }, [matter?.id, mode, module.defaultResponsible, userShortName]);
    function handleEventSelect(eventId) {
        setSelectedEventId(eventId);
        const event = distributionEvents.find((candidate) => candidate.id === eventId);
        setSelectorTargets(event ? getCatalogTargetEntries(event, legacyConfig).map((target) => ({ ...target, reportedMonth: "" })) : []);
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
        setSubmitting(true);
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
            onModeChange("history");
            setSelectedEventId("");
            setSelectorTargets([]);
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
    return (_jsx("div", { className: "execution-panel-backdrop", role: "presentation", onClick: onClose, children: _jsxs("aside", { className: "execution-panel", role: "dialog", "aria-modal": "true", "aria-label": mode === "create" ? "Selector de Tareas" : "Lista de tareas", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "execution-panel-header", children: [_jsxs("div", { children: [_jsxs("p", { className: "eyebrow", children: ["Ejecucion / ", module.shortLabel] }), _jsx("h3", { children: mode === "create" ? "Selector de Tareas" : "Lista de tareas" }), _jsxs("p", { className: "muted execution-panel-copy", children: [matter.clientName || "Cliente sin nombre", " - ", matter.subject || "Asunto sin nombre"] })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: onClose, children: "Cerrar" })] }), _jsxs("div", { className: "execution-panel-switcher", children: [_jsx("button", { type: "button", className: mode === "history" ? "primary-button" : "secondary-button", onClick: () => onModeChange("history"), children: "Lista" }), _jsx("button", { type: "button", className: mode === "create" ? "primary-button" : "secondary-button", onClick: () => onModeChange("create"), children: "Selector de tareas" })] }), mode === "create" ? (_jsx("div", { className: "execution-panel-body execution-panel-form", children: _jsxs("div", { className: "execution-selector-layout", children: [_jsxs("div", { className: "execution-selector-form", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "1. Seleccionar Tarea Maestra" }), _jsxs("select", { value: selectedEventId, onChange: (event) => handleEventSelect(event.target.value), children: [_jsx("option", { value: "", children: "Selecciona una tarea configurada" }), distributionEvents.map((event) => (_jsx("option", { value: event.id, children: event.name }, event.id)))] })] }), _jsxs("div", { className: "execution-selector-matter", children: [_jsx("h4", { children: "Detalles del Asunto (Lectura)" }), _jsxs("div", { className: "execution-selector-matter-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "ID Asunto" }), _jsx("input", { readOnly: true, value: activeMatter.matterIdentifier || activeMatter.matterNumber || "" })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "No. Cliente" }), _jsx("input", { readOnly: true, value: clientNumber || activeMatter.clientNumber || "" })] }), _jsxs("label", { className: "form-field execution-selector-span", children: [_jsx("span", { children: "Cliente" }), _jsx("input", { readOnly: true, value: activeMatter.clientName || "" })] }), _jsxs("label", { className: "form-field execution-selector-span", children: [_jsx("span", { children: "Asunto / Expediente" }), _jsx("input", { readOnly: true, value: activeMatter.subject || "" })] }), _jsxs("label", { className: "form-field execution-selector-span", children: [_jsx("span", { children: "Proceso espec\u00EDfico" }), _jsx("input", { readOnly: true, value: activeMatter.specificProcess || "" })] })] })] }), _jsxs("div", { className: "execution-panel-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Responsable" }), _jsx("input", { value: responsible, onChange: (event) => setResponsible(event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha compromiso" }), _jsx("input", { type: "date", value: dueDate, onChange: (event) => setDueDate(event.target.value) })] })] }), _jsx("button", { type: "button", className: "primary-button execution-selector-submit", onClick: () => void handleCreate(), disabled: submitting || !selectedEvent || selectorTargets.length === 0 || !dueDate || missingTargetNames, children: submitting ? "Procesando..." : "Distribuir Tareas" })] }), _jsxs("div", { className: "execution-selector-summary", children: [_jsx("h3", { children: "Resumen de Env\u00EDo" }), selectorTargets.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Selecciona una tarea para ver las tablas destino." })) : (_jsx("div", { className: "execution-selector-target-list", children: selectorTargets.map((target) => (_jsxs("article", { className: "execution-selector-target-card", children: [_jsxs("div", { className: "tasks-distributor-target-head", children: [_jsx("strong", { children: getTableDisplayName(legacyConfig, target.tableSlug) }), _jsx("button", { type: "button", className: "danger-button tasks-distributor-small-button", onClick: () => setSelectorTargets((current) => current.filter((candidate) => candidate.id !== target.id)), children: "Quitar" })] }), _jsx("input", { value: target.taskName, onChange: (event) => setSelectorTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate)), placeholder: "Nombre del registro" }), legacyConfig.tables.find((table) => table.slug === target.tableSlug)?.showReportedPeriod ? (_jsxs("label", { className: "form-field", children: [_jsx("span", { children: legacyConfig.tables.find((table) => table.slug === target.tableSlug)?.reportedPeriodLabel ?? "Periodo reportado" }), _jsx("input", { type: "month", value: target.reportedMonth, onChange: (event) => setSelectorTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate)) })] })) : null] }, target.id))) }))] })] }) })) : (_jsx("div", { className: "execution-panel-body", children: tasks.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay tareas ligadas a este asunto." })) : (_jsx("div", { className: "execution-task-list", children: tasks.map((task) => (_jsxs("article", { className: "execution-task-card", children: [_jsxs("div", { className: "execution-task-topline", children: [_jsxs("div", { children: [_jsx("strong", { children: task.subject }), _jsxs("p", { className: "muted execution-task-meta", children: [task.trackLabel, " - ", task.responsible || "Sin responsable", " - ", toDateInput(task.dueDate) || "-"] })] }), _jsx("span", { className: `execution-task-state execution-task-state-${task.state.toLowerCase()}`, children: getStateLabel(task.state) })] }), task.isMatterFallback ? (_jsx("p", { className: "muted execution-task-meta", children: "Esta fila viene del origen del asunto. Para gestionarla desde Ejecucion, crea una tarea en el Selector de Tareas." })) : (_jsx("div", { className: "execution-task-actions", children: ["PENDING", "IN_PROGRESS", "COMPLETED"].map((state) => (_jsx("button", { type: "button", className: task.state === state ? "primary-button" : "secondary-button", disabled: savingTaskId === task.id, onClick: () => void handleStateChange(task, state), children: state === "PENDING" ? "Pendiente" : state === "IN_PROGRESS" ? "En curso" : "Completar" }, state))) }))] }, task.id))) })) }))] }) }));
}
