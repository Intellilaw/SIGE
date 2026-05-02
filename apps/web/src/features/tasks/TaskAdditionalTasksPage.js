import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID } from "./task-dashboard-config";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function currentMonthInput() {
    return todayInput().slice(0, 7);
}
function addMonthsToDateInput(value, months) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
        return "";
    }
    const targetMonthIndex = month - 1 + months;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate();
    const targetDate = new Date(targetYear, normalizedMonthIndex, Math.min(day, lastDayOfTargetMonth));
    return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
}
function getCompletionMonth(task) {
    return toDateInput(task.updatedAt).slice(0, 7);
}
const EMPTY_FORM = {
    task: "",
    responsible: "",
    responsible2: "",
    dueDate: "",
    recurring: false
};
export function TaskAdditionalTasksPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const [tasks, setTasks] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("pendientes");
    const [completedMonth, setCompletedMonth] = useState(currentMonthInput());
    const responsibleOptions = useMemo(() => {
        const members = moduleConfig ? TASK_DASHBOARD_CONFIG_BY_MODULE_ID[moduleConfig.moduleId]?.members ?? [] : [];
        return members.map((member) => member.id);
    }, [moduleConfig]);
    const visibleTasks = useMemo(() => {
        return tasks
            .filter((task) => {
            if (activeTab === "concluidas") {
                return task.status === "concluida" && getCompletionMonth(task) === completedMonth;
            }
            return task.status !== "concluida";
        })
            .sort((left, right) => toDateInput(left.dueDate).localeCompare(toDateInput(right.dueDate)));
    }, [activeTab, completedMonth, tasks]);
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
        const currentTask = editingId ? tasks.find((task) => task.id === editingId) : undefined;
        const payload = {
            moduleId: moduleConfig.moduleId,
            task: form.task,
            responsible: form.responsible,
            responsible2: form.responsible2 || null,
            dueDate: form.dueDate || null,
            recurring: form.recurring,
            status: currentTask?.status ?? "pendiente"
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
        if (task.status === "pendiente" && Boolean(task.recurring)) {
            const currentDueDate = toDateInput(task.dueDate) || todayInput();
            const updated = await apiPatch(`/tasks/additional/${task.id}`, {
                dueDate: addMonthsToDateInput(currentDueDate, 1),
                status: "pendiente"
            });
            setTasks((current) => current.map((candidate) => candidate.id === task.id ? updated : candidate));
            return;
        }
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
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "execution-page-topline", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }) }), _jsxs("h2", { children: ["Tareas adicionales (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Gestion de tareas adicionales con alta, modificacion, conclusion o reactivacion, borrado y resaltado rojo por fecha limite vencida." })] }), _jsx("section", { className: "panel", children: _jsxs("form", { className: "tasks-additional-form", onSubmit: handleSubmit, children: [_jsxs("label", { children: ["Tarea", _jsx("input", { className: "tasks-legacy-input", value: form.task, onChange: (event) => setForm((current) => ({ ...current, task: event.target.value })), required: true })] }), _jsxs("label", { children: ["Responsable", _jsxs("select", { className: "tasks-legacy-input", value: form.responsible, onChange: (event) => setForm((current) => ({ ...current, responsible: event.target.value })), required: true, children: [_jsx("option", { value: "", children: "Seleccionar responsable" }), responsibleOptions.map((responsible) => (_jsx("option", { value: responsible, children: responsible }, responsible)))] })] }), _jsxs("label", { children: ["Responsable 2", _jsxs("select", { className: "tasks-legacy-input", value: form.responsible2, onChange: (event) => setForm((current) => ({ ...current, responsible2: event.target.value })), children: [_jsx("option", { value: "", children: "Sin responsable 2" }), responsibleOptions.map((responsible) => (_jsx("option", { value: responsible, children: responsible }, responsible)))] })] }), _jsxs("label", { children: ["Fecha limite", _jsx("input", { className: "tasks-legacy-input", type: "date", value: form.dueDate, onChange: (event) => setForm((current) => ({ ...current, dueDate: event.target.value })), required: true })] }), _jsxs("label", { className: "tasks-additional-recurring-checkbox", children: [_jsx("input", { type: "checkbox", checked: form.recurring, onChange: (event) => setForm((current) => ({ ...current, recurring: event.target.checked })) }), _jsx("span", { children: "T\u00E9rmino recurrente" })] }), _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "submit", className: "primary-action-button", children: editingId ? "Guardar cambios" : "Agregar nueva tarea" }), editingId ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => { setEditingId(null); setForm(EMPTY_FORM); }, children: "Cancelar" })) : null] })] }) }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Listado de tareas" }), _jsxs("span", { children: [visibleTasks.length, " tareas"] })] }), _jsxs("div", { className: "tasks-legacy-tabs", children: [_jsx("button", { type: "button", className: activeTab === "pendientes" ? "is-active" : "", onClick: () => setActiveTab("pendientes"), children: "1. Pendientes" }), _jsx("button", { type: "button", className: activeTab === "concluidas" ? "is-active" : "", onClick: () => setActiveTab("concluidas"), children: "2. Concluidas" })] }), activeTab === "concluidas" ? (_jsxs("div", { className: "tasks-legacy-month-filter", children: [_jsxs("label", { className: "form-field tasks-legacy-month-field", children: [_jsx("span", { children: "Mes calendario" }), _jsx("input", { type: "month", value: completedMonth, onChange: (event) => setCompletedMonth(event.target.value || currentMonthInput()) })] }), _jsx("p", { className: "muted", children: "Muestra las tareas adicionales concluidas durante el mes seleccionado." })] })) : null, _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table tasks-additional-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tarea" }), _jsx("th", { children: "Responsables" }), _jsx("th", { children: "Fecha Limite" }), _jsx("th", { children: "Estatus" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "centered-inline-message", children: "Cargando tareas..." }) })) : visibleTasks.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "centered-inline-message", children: activeTab === "concluidas" ? "No hay tareas concluidas en el mes seleccionado." : "No hay tareas adicionales pendientes." }) })) : (visibleTasks.map((task) => {
                                        const dueDate = toDateInput(task.dueDate);
                                        const overdue = task.status === "pendiente" && Boolean(dueDate) && dueDate < todayInput();
                                        return (_jsxs("tr", { className: overdue ? "tasks-additional-row-overdue" : task.status === "concluida" ? "tasks-additional-row-completed" : undefined, children: [_jsx("td", { children: task.task }), _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-chip-list", children: [_jsx("span", { children: task.responsible }), task.responsible2 ? _jsx("span", { children: task.responsible2 }) : null] }) }), _jsx("td", { className: overdue ? "tasks-dashboard-title-overdue" : undefined, children: dueDate || "-" }), _jsxs("td", { children: [_jsx("span", { className: `tasks-dashboard-type-pill ${task.status === "concluida" ? "is-completed" : overdue ? "is-overdue" : "is-pending"}`, children: task.status }), task.recurring ? (_jsx("span", { className: "tasks-dashboard-type-pill is-pending", children: "T\u00E9rmino recurrente" })) : null] }), _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => {
                                                                    setEditingId(task.id);
                                                                    setForm({
                                                                        task: task.task,
                                                                        responsible: task.responsible,
                                                                        responsible2: task.responsible2 ?? "",
                                                                        dueDate,
                                                                        recurring: Boolean(task.recurring)
                                                                    });
                                                                }, children: "Modificar" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => void toggleStatus(task), children: task.status === "pendiente" ? task.recurring ? "Completar y mover 1 mes" : "Marcar concluida" : "Reabrir" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => void deleteTask(task), children: "Borrar" })] }) })] }, task.id));
                                    })) })] }) })] })] }));
}
