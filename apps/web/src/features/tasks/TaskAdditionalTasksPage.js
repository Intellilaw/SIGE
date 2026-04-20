import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const EMPTY_FORM = {
    task: "",
    responsible: "",
    responsible2: "",
    dueDate: ""
};
export function TaskAdditionalTasksPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const [tasks, setTasks] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    async function loadTasks() {
        if (!moduleConfig) {
            return;
        }
        setLoading(true);
        try {
            const loaded = await apiGet(`/tasks/additional?moduleId=${moduleConfig.moduleId}`);
            setTasks(loaded);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadTasks();
    }, [moduleConfig]);
    async function handleSubmit(event) {
        event.preventDefault();
        if (!moduleConfig) {
            return;
        }
        const payload = {
            moduleId: moduleConfig.moduleId,
            task: form.task,
            responsible: form.responsible,
            responsible2: form.responsible2 || null,
            dueDate: form.dueDate || null,
            status: "pendiente"
        };
        if (editingId) {
            const updated = await apiPatch(`/tasks/additional/${editingId}`, payload);
            setTasks((current) => current.map((task) => task.id === editingId ? updated : task));
        }
        else {
            const created = await apiPost("/tasks/additional", payload);
            setTasks((current) => [created, ...current]);
        }
        setForm(EMPTY_FORM);
        setEditingId(null);
    }
    async function toggleStatus(task) {
        const updated = await apiPatch(`/tasks/additional/${task.id}`, {
            status: task.status === "pendiente" ? "concluida" : "pendiente"
        });
        setTasks((current) => current.map((candidate) => candidate.id === task.id ? updated : candidate));
    }
    async function deleteTask(task) {
        await apiDelete(`/tasks/additional/${task.id}`);
        setTasks((current) => current.filter((candidate) => candidate.id !== task.id));
    }
    if (!moduleConfig) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "execution-page-topline", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }) }), _jsxs("h2", { children: ["Tareas adicionales (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Equivalente a las tareas adicionales de Intranet: alta, modificacion, conclusion/reactivacion, borrado y resaltado rojo por fecha limite vencida." })] }), _jsx("section", { className: "panel", children: _jsxs("form", { className: "tasks-additional-form", onSubmit: handleSubmit, children: [_jsxs("label", { children: ["Tarea", _jsx("input", { className: "tasks-legacy-input", value: form.task, onChange: (event) => setForm((current) => ({ ...current, task: event.target.value })), required: true })] }), _jsxs("label", { children: ["Responsable", _jsx("input", { className: "tasks-legacy-input", value: form.responsible, onChange: (event) => setForm((current) => ({ ...current, responsible: event.target.value })), placeholder: moduleConfig.defaultResponsible, required: true })] }), _jsxs("label", { children: ["Responsable 2", _jsx("input", { className: "tasks-legacy-input", value: form.responsible2, onChange: (event) => setForm((current) => ({ ...current, responsible2: event.target.value })) })] }), _jsxs("label", { children: ["Fecha limite", _jsx("input", { className: "tasks-legacy-input", type: "date", value: form.dueDate, onChange: (event) => setForm((current) => ({ ...current, dueDate: event.target.value })), required: true })] }), _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "submit", className: "primary-action-button", children: editingId ? "Guardar cambios" : "Agregar nueva tarea" }), editingId ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => { setEditingId(null); setForm(EMPTY_FORM); }, children: "Cancelar" })) : null] })] }) }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Listado de tareas" }), _jsxs("span", { children: [tasks.length, " tareas"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table tasks-legacy-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tarea" }), _jsx("th", { children: "Responsables" }), _jsx("th", { children: "Fecha Limite" }), _jsx("th", { children: "Estatus" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "centered-inline-message", children: "Cargando tareas..." }) })) : tasks.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "centered-inline-message", children: "No hay tareas adicionales." }) })) : (tasks.map((task) => {
                                        const dueDate = toDateInput(task.dueDate);
                                        const overdue = task.status === "pendiente" && Boolean(dueDate) && dueDate < todayInput();
                                        return (_jsxs("tr", { className: overdue ? "tasks-additional-row-overdue" : task.status === "concluida" ? "tasks-additional-row-completed" : undefined, children: [_jsx("td", { children: task.task }), _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-chip-list", children: [_jsx("span", { children: task.responsible }), task.responsible2 ? _jsx("span", { children: task.responsible2 }) : null] }) }), _jsx("td", { className: overdue ? "tasks-dashboard-title-overdue" : undefined, children: dueDate || "-" }), _jsx("td", { children: _jsx("span", { className: `tasks-dashboard-type-pill ${task.status === "concluida" ? "is-completed" : overdue ? "is-overdue" : "is-pending"}`, children: task.status }) }), _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => {
                                                                    setEditingId(task.id);
                                                                    setForm({
                                                                        task: task.task,
                                                                        responsible: task.responsible,
                                                                        responsible2: task.responsible2 ?? "",
                                                                        dueDate
                                                                    });
                                                                }, children: "Modificar" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => void toggleStatus(task), children: task.status === "pendiente" ? "Marcar concluida" : "Reabrir" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => void deleteTask(task), children: "Borrar" })] }) })] }, task.id));
                                    })) })] }) })] })] }));
}
