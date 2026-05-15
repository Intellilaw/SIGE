import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { TaskAdditionalTask } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID } from "./task-dashboard-config";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";

function toDateInput(value?: string | null) {
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

function addMonthsToDateInput(value: string, months: number) {
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

function getCompletionMonth(task: TaskAdditionalTask) {
  return toDateInput(task.updatedAt).slice(0, 7);
}

const EMPTY_FORM = {
  task: "",
  responsible: "",
  responsible2: "",
  dueDate: "",
  recurring: false
};

type AdditionalTab = "pendientes" | "concluidas";

export function TaskAdditionalTasksPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
  const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const canAccessModule = Boolean(
    executionModule && getVisibleExecutionModules(user).some((module) => module.moduleId === executionModule.moduleId)
  );
  const [tasks, setTasks] = useState<TaskAdditionalTask[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdditionalTab>("pendientes");
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
    if (!moduleConfig || !canAccessModule) {
      return;
    }

    setLoading(true);
    try {
      const loaded = await apiGet<TaskAdditionalTask[]>(`/tasks/additional?moduleId=${moduleConfig.moduleId}`);
      setTasks(loaded);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, [canAccessModule, moduleConfig]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moduleConfig || !canAccessModule) {
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
      status: currentTask?.status ?? ("pendiente" as const)
    };

    if (editingId) {
      const updated = await apiPatch<TaskAdditionalTask>(`/tasks/additional/${editingId}`, payload);
      setTasks((current) => current.map((task) => task.id === editingId ? updated : task));
    } else {
      const created = await apiPost<TaskAdditionalTask>("/tasks/additional", payload);
      setTasks((current) => [created, ...current]);
    }

    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function toggleStatus(task: TaskAdditionalTask) {
    if (task.status === "pendiente" && Boolean(task.recurring)) {
      const currentDueDate = toDateInput(task.dueDate) || todayInput();
      const updated = await apiPatch<TaskAdditionalTask>(`/tasks/additional/${task.id}`, {
        dueDate: addMonthsToDateInput(currentDueDate, 1),
        status: "pendiente" as const
      });
      setTasks((current) => current.map((candidate) => candidate.id === task.id ? updated : candidate));
      return;
    }

    const updated = await apiPatch<TaskAdditionalTask>(`/tasks/additional/${task.id}`, {
      status: task.status === "pendiente" ? "concluida" : "pendiente"
    });
    setTasks((current) => current.map((candidate) => candidate.id === task.id ? updated : candidate));
  }

  async function deleteTask(task: TaskAdditionalTask) {
    await apiDelete(`/tasks/additional/${task.id}`);
    setTasks((current) => current.filter((candidate) => candidate.id !== task.id));
  }

  if (!moduleConfig || !executionModule || !canAccessModule) {
    return <Navigate to="/app/tasks" replace />;
  }

  return (
    <section className="page-stack tasks-legacy-page">
      <header className="hero module-hero">
        <div className="execution-page-topline">
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}`)}>
            Volver al dashboard
          </button>
        </div>
        <h2>Tareas adicionales ({moduleConfig.label})</h2>
        <p className="muted">
          Gestion de tareas adicionales con alta, modificacion, conclusion o reactivacion, borrado y resaltado rojo
          por fecha limite vencida.
        </p>
      </header>

      <section className="panel">
        <form className="tasks-additional-form" onSubmit={handleSubmit}>
          <label>
            Tarea
            <input
              className="tasks-legacy-input"
              value={form.task}
              onChange={(event) => setForm((current) => ({ ...current, task: event.target.value }))}
              required
            />
          </label>
          <label>
            Responsable
            <select
              className="tasks-legacy-input"
              value={form.responsible}
              onChange={(event) => setForm((current) => ({ ...current, responsible: event.target.value }))}
              required
            >
              <option value="">Seleccionar responsable</option>
              {responsibleOptions.map((responsible) => (
                <option key={responsible} value={responsible}>
                  {responsible}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsable 2
            <select
              className="tasks-legacy-input"
              value={form.responsible2}
              onChange={(event) => setForm((current) => ({ ...current, responsible2: event.target.value }))}
            >
              <option value="">Sin responsable 2</option>
              {responsibleOptions.map((responsible) => (
                <option key={responsible} value={responsible}>
                  {responsible}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha limite
            <input
              className="tasks-legacy-input"
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              required
            />
          </label>
          <label className="tasks-additional-recurring-checkbox">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(event) => setForm((current) => ({ ...current, recurring: event.target.checked }))}
            />
            <span>Término recurrente</span>
          </label>
          <div className="tasks-legacy-actions">
            <button type="submit" className="primary-action-button">
              {editingId ? "Guardar cambios" : "Agregar nueva tarea"}
            </button>
            {editingId ? (
              <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Listado de tareas</h2>
          <span>{visibleTasks.length} tareas</span>
        </div>
        <div className="tasks-legacy-tabs">
          <button
            type="button"
            className={activeTab === "pendientes" ? "is-active" : ""}
            onClick={() => setActiveTab("pendientes")}
          >
            1. Pendientes
          </button>
          <button
            type="button"
            className={activeTab === "concluidas" ? "is-active" : ""}
            onClick={() => setActiveTab("concluidas")}
          >
            2. Concluidas
          </button>
        </div>
        {activeTab === "concluidas" ? (
          <div className="tasks-legacy-month-filter">
            <label className="form-field tasks-legacy-month-field">
              <span>Mes calendario</span>
              <input
                type="month"
                value={completedMonth}
                onChange={(event) => setCompletedMonth(event.target.value || currentMonthInput())}
              />
            </label>
            <p className="muted">
              Muestra las tareas adicionales concluidas durante el mes seleccionado.
            </p>
          </div>
        ) : null}
        <div className="table-scroll">
          <table className="data-table tasks-additional-table">
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Responsables</th>
                <th>Fecha Limite</th>
                <th>Estatus</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="centered-inline-message">Cargando tareas...</td>
                </tr>
              ) : visibleTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="centered-inline-message">
                    {activeTab === "concluidas" ? "No hay tareas concluidas en el mes seleccionado." : "No hay tareas adicionales pendientes."}
                  </td>
                </tr>
              ) : (
                visibleTasks.map((task) => {
                  const dueDate = toDateInput(task.dueDate);
                  const overdue = task.status === "pendiente" && Boolean(dueDate) && dueDate < todayInput();
                  return (
                    <tr key={task.id} className={overdue ? "tasks-additional-row-overdue" : task.status === "concluida" ? "tasks-additional-row-completed" : undefined}>
                      <td>{task.task}</td>
                      <td>
                        <div className="tasks-legacy-chip-list">
                          <span>{task.responsible}</span>
                          {task.responsible2 ? <span>{task.responsible2}</span> : null}
                        </div>
                      </td>
                      <td className={overdue ? "tasks-dashboard-title-overdue" : undefined}>{dueDate || "-"}</td>
                      <td>
                        <span className={`tasks-dashboard-type-pill ${task.status === "concluida" ? "is-completed" : overdue ? "is-overdue" : "is-pending"}`}>
                          {task.status}
                        </span>
                        {task.recurring ? (
                          <span className="tasks-dashboard-type-pill is-pending">
                            Término recurrente
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <div className="tasks-legacy-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setEditingId(task.id);
                              setForm({
                                task: task.task,
                                responsible: task.responsible,
                                responsible2: task.responsible2 ?? "",
                                dueDate,
                                recurring: Boolean(task.recurring)
                              });
                            }}
                          >
                            Modificar
                          </button>
                          <button type="button" className="secondary-button" onClick={() => void toggleStatus(task)}>
                            {task.status === "pendiente" ? task.recurring ? "Completar y mover 1 mes" : "Marcar concluida" : "Reabrir"}
                          </button>
                          <button type="button" className="danger-button" onClick={() => void deleteTask(task)}>
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
