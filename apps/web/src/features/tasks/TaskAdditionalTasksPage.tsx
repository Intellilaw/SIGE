import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { TaskAdditionalTask } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";

function toDateInput(value?: string | null) {
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
  const [tasks, setTasks] = useState<TaskAdditionalTask[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    if (!moduleConfig) {
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
  }, [moduleConfig]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
      status: "pendiente" as const
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
    const updated = await apiPatch<TaskAdditionalTask>(`/tasks/additional/${task.id}`, {
      status: task.status === "pendiente" ? "concluida" : "pendiente"
    });
    setTasks((current) => current.map((candidate) => candidate.id === task.id ? updated : candidate));
  }

  async function deleteTask(task: TaskAdditionalTask) {
    await apiDelete(`/tasks/additional/${task.id}`);
    setTasks((current) => current.filter((candidate) => candidate.id !== task.id));
  }

  if (!moduleConfig) {
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
            <input
              className="tasks-legacy-input"
              value={form.responsible}
              onChange={(event) => setForm((current) => ({ ...current, responsible: event.target.value }))}
              placeholder={moduleConfig.defaultResponsible}
              required
            />
          </label>
          <label>
            Responsable 2
            <input
              className="tasks-legacy-input"
              value={form.responsible2}
              onChange={(event) => setForm((current) => ({ ...current, responsible2: event.target.value }))}
            />
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
          <span>{tasks.length} tareas</span>
        </div>
        <div className="table-scroll">
          <table className="data-table tasks-legacy-table">
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
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="centered-inline-message">No hay tareas adicionales.</td>
                </tr>
              ) : (
                tasks.map((task) => {
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
                                dueDate
                              });
                            }}
                          >
                            Modificar
                          </button>
                          <button type="button" className="secondary-button" onClick={() => void toggleStatus(task)}>
                            {task.status === "pendiente" ? "Marcar concluida" : "Reabrir"}
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
