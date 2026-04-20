import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
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
export function ExecutionTaskPanel({ module, matter, mode, tasks, userShortName, onClose, onModeChange, onCreateTask, onUpdateState }) {
    const tracks = module.definition.tracks;
    const initialTrackId = tracks[0]?.id ?? "";
    const initialLabel = tracks[0]?.label ?? "";
    const [trackIds, setTrackIds] = useState(initialTrackId ? [initialTrackId] : []);
    const [subject, setSubject] = useState(initialLabel);
    const [responsible, setResponsible] = useState(userShortName || module.defaultResponsible);
    const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
    const [submitting, setSubmitting] = useState(false);
    const [savingTaskId, setSavingTaskId] = useState(null);
    const selectedTracks = useMemo(() => tracks.filter((track) => trackIds.includes(track.id)), [trackIds, tracks]);
    useEffect(() => {
        if (!matter || !mode) {
            return;
        }
        const defaultTrack = tracks[0];
        setTrackIds(defaultTrack?.id ? [defaultTrack.id] : []);
        setSubject(defaultTrack?.label ?? matter.subject);
        setResponsible(userShortName || module.defaultResponsible);
        setDueDate(addBusinessDays(new Date(), 3));
    }, [matter?.id, mode, module.defaultResponsible, tracks, userShortName, matter?.subject]);
    if (!matter || !mode) {
        return null;
    }
    const activeMatter = matter;
    async function handleCreate() {
        if (selectedTracks.length === 0) {
            return;
        }
        setSubmitting(true);
        try {
            await onCreateTask({
                trackIds,
                subject: subject.trim() || selectedTracks[0]?.label || activeMatter.subject,
                responsible: responsible.trim() || module.defaultResponsible,
                dueDate,
                state: "PENDING"
            });
            onModeChange("history");
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
    return (_jsx("div", { className: "execution-panel-backdrop", role: "presentation", onClick: onClose, children: _jsxs("aside", { className: "execution-panel", role: "dialog", "aria-modal": "true", "aria-label": mode === "create" ? "Distribuidor de tareas" : "Lista de tareas", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "execution-panel-header", children: [_jsxs("div", { children: [_jsxs("p", { className: "eyebrow", children: ["Ejecucion / ", module.shortLabel] }), _jsx("h3", { children: mode === "create" ? "Distribuidor de tareas" : "Lista de tareas" }), _jsxs("p", { className: "muted execution-panel-copy", children: [matter.clientName || "Cliente sin nombre", " - ", matter.subject || "Asunto sin nombre"] })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: onClose, children: "Cerrar" })] }), _jsxs("div", { className: "execution-panel-switcher", children: [_jsx("button", { type: "button", className: mode === "history" ? "primary-button" : "secondary-button", onClick: () => onModeChange("history"), children: "Lista" }), _jsx("button", { type: "button", className: mode === "create" ? "primary-button" : "secondary-button", onClick: () => onModeChange("create"), children: "Selector de tareas" })] }), mode === "create" ? (_jsxs("div", { className: "execution-panel-body execution-panel-form", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tablas de origen / destino" }), _jsx("div", { className: "execution-track-picker", children: tracks.map((track) => {
                                        const checked = trackIds.includes(track.id);
                                        return (_jsxs("label", { className: "execution-track-option", children: [_jsx("input", { type: "checkbox", checked: checked, onChange: (event) => {
                                                        if (event.target.checked) {
                                                            setTrackIds((current) => [...new Set([...current, track.id])]);
                                                            setSubject((current) => current || track.label);
                                                            return;
                                                        }
                                                        setTrackIds((current) => current.filter((currentTrackId) => currentTrackId !== track.id));
                                                    } }), _jsx("span", { children: track.label })] }, track.id));
                                    }) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre de la tarea" }), _jsx("input", { value: subject, onChange: (event) => setSubject(event.target.value) })] }), _jsxs("div", { className: "execution-panel-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Responsable" }), _jsx("input", { value: responsible, onChange: (event) => setResponsible(event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha compromiso" }), _jsx("input", { type: "date", value: dueDate, onChange: (event) => setDueDate(event.target.value) })] })] }), _jsxs("div", { className: "execution-panel-note", children: [_jsxs("strong", { children: [selectedTracks.length, " tabla", selectedTracks.length === 1 ? "" : "s", " seleccionada", selectedTracks.length === 1 ? "" : "s"] }), _jsx("span", { children: "Se creara un registro pendiente por cada tabla seleccionada, como en el distribuidor." })] }), _jsx("div", { className: "form-actions", children: _jsx("button", { type: "button", className: "primary-button", onClick: () => void handleCreate(), disabled: submitting || selectedTracks.length === 0 || !dueDate, children: submitting ? "Guardando..." : "Crear Tarea" }) })] })) : (_jsx("div", { className: "execution-panel-body", children: tasks.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay tareas ligadas a este asunto." })) : (_jsx("div", { className: "execution-task-list", children: tasks.map((task) => (_jsxs("article", { className: "execution-task-card", children: [_jsxs("div", { className: "execution-task-topline", children: [_jsxs("div", { children: [_jsx("strong", { children: task.subject }), _jsxs("p", { className: "muted execution-task-meta", children: [task.trackLabel, " - ", task.responsible || "Sin responsable", " - ", toDateInput(task.dueDate) || "-"] })] }), _jsx("span", { className: `execution-task-state execution-task-state-${task.state.toLowerCase()}`, children: getStateLabel(task.state) })] }), task.isMatterFallback ? (_jsx("p", { className: "muted execution-task-meta", children: "Esta fila viene del origen del asunto. Para gestionarla desde Ejecucion, crea una tarea en el distribuidor." })) : (_jsx("div", { className: "execution-task-actions", children: ["PENDING", "IN_PROGRESS", "COMPLETED"].map((state) => (_jsx("button", { type: "button", className: task.state === state ? "primary-button" : "secondary-button", disabled: savingTaskId === task.id, onClick: () => void handleStateChange(task, state), children: state === "PENDING" ? "Pendiente" : state === "IN_PROGRESS" ? "En curso" : "Completar" }, state))) }))] }, task.id))) })) }))] }) }));
}
