import { useEffect, useMemo, useState } from "react";
import type { Matter, TaskItem, TaskState } from "@sige/contracts";

import type { ExecutionModuleDescriptor } from "./execution-config";

type MatterTaskView = TaskItem & {
  trackLabel: string;
  sourceLabel: string;
  isMatterFallback?: boolean;
  sourceType: "task" | "tracking" | "term" | "matter";
};

interface CreateTaskInput {
  trackIds: string[];
  subject: string;
  responsible: string;
  dueDate: string;
  state: TaskState;
}

interface ExecutionTaskPanelProps {
  module: ExecutionModuleDescriptor;
  matter: Matter | null;
  mode: "create" | "history" | null;
  tasks: MatterTaskView[];
  userShortName?: string;
  onClose: () => void;
  onModeChange: (mode: "create" | "history") => void;
  onCreateTask: (payload: CreateTaskInput) => Promise<void>;
  onUpdateState: (task: MatterTaskView, state: TaskState) => Promise<void>;
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toLocalDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addBusinessDays(baseDate: Date, amount: number) {
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

function getStateLabel(state: TaskState) {
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

export function ExecutionTaskPanel({
  module,
  matter,
  mode,
  tasks,
  userShortName,
  onClose,
  onModeChange,
  onCreateTask,
  onUpdateState
}: ExecutionTaskPanelProps) {
  const tracks = module.definition.tracks;
  const initialTrackId = tracks[0]?.id ?? "";
  const initialLabel = tracks[0]?.label ?? "";

  const [trackIds, setTrackIds] = useState<string[]>(initialTrackId ? [initialTrackId] : []);
  const [subject, setSubject] = useState(initialLabel);
  const [responsible, setResponsible] = useState(userShortName || module.defaultResponsible);
  const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
  const [submitting, setSubmitting] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const selectedTracks = useMemo(
    () => tracks.filter((track) => trackIds.includes(track.id)),
    [trackIds, tracks]
  );

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
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStateChange(task: MatterTaskView, state: TaskState) {
    setSavingTaskId(task.id);
    try {
      await onUpdateState(task, state);
    } finally {
      setSavingTaskId(null);
    }
  }

  return (
    <div className="execution-panel-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="execution-panel"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Distribuidor de tareas" : "Lista de tareas"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="execution-panel-header">
          <div>
            <p className="eyebrow">Ejecucion / {module.shortLabel}</p>
            <h3>{mode === "create" ? "Distribuidor de tareas" : "Lista de tareas"}</h3>
            <p className="muted execution-panel-copy">
              {matter.clientName || "Cliente sin nombre"} - {matter.subject || "Asunto sin nombre"}
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="execution-panel-switcher">
          <button
            type="button"
            className={mode === "history" ? "primary-button" : "secondary-button"}
            onClick={() => onModeChange("history")}
          >
            Lista
          </button>
          <button
            type="button"
            className={mode === "create" ? "primary-button" : "secondary-button"}
            onClick={() => onModeChange("create")}
          >
            Selector de tareas
          </button>
        </div>

        {mode === "create" ? (
          <div className="execution-panel-body execution-panel-form">
            <label className="form-field">
              <span>Tablas de origen / destino</span>
              <div className="execution-track-picker">
                {tracks.map((track) => {
                  const checked = trackIds.includes(track.id);

                  return (
                    <label key={track.id} className="execution-track-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setTrackIds((current) => [...new Set([...current, track.id])]);
                            setSubject((current) => current || track.label);
                            return;
                          }

                          setTrackIds((current) => current.filter((currentTrackId) => currentTrackId !== track.id));
                        }}
                      />
                      <span>{track.label}</span>
                    </label>
                  );
                })}
              </div>
            </label>

            <label className="form-field">
              <span>Nombre de la tarea</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </label>

            <div className="execution-panel-grid">
              <label className="form-field">
                <span>Responsable</span>
                <input value={responsible} onChange={(event) => setResponsible(event.target.value)} />
              </label>

              <label className="form-field">
                <span>Fecha compromiso</span>
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            </div>

            <div className="execution-panel-note">
              <strong>
                {selectedTracks.length} tabla{selectedTracks.length === 1 ? "" : "s"} seleccionada{selectedTracks.length === 1 ? "" : "s"}
              </strong>
              <span>Se creara un registro pendiente por cada tabla seleccionada, como en el distribuidor.</span>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleCreate()}
                disabled={submitting || selectedTracks.length === 0 || !dueDate}
              >
                {submitting ? "Guardando..." : "Crear Tarea"}
              </button>
            </div>
          </div>
        ) : (
          <div className="execution-panel-body">
            {tasks.length === 0 ? (
              <div className="centered-inline-message">No hay tareas ligadas a este asunto.</div>
            ) : (
              <div className="execution-task-list">
                {tasks.map((task) => (
                  <article key={task.id} className="execution-task-card">
                    <div className="execution-task-topline">
                      <div>
                        <strong>{task.subject}</strong>
                        <p className="muted execution-task-meta">
                          {task.trackLabel} - {task.responsible || "Sin responsable"} - {toDateInput(task.dueDate) || "-"}
                        </p>
                      </div>
                      <span className={`execution-task-state execution-task-state-${task.state.toLowerCase()}`}>
                        {getStateLabel(task.state)}
                      </span>
                    </div>

                    {task.isMatterFallback ? (
                      <p className="muted execution-task-meta">
                        Esta fila viene del origen del asunto. Para gestionarla desde Ejecucion, crea una tarea en el distribuidor.
                      </p>
                    ) : (
                      <div className="execution-task-actions">
                        {(["PENDING", "IN_PROGRESS", "COMPLETED"] as TaskState[]).map((state) => (
                          <button
                            key={state}
                            type="button"
                            className={task.state === state ? "primary-button" : "secondary-button"}
                            disabled={savingTaskId === task.id}
                            onClick={() => void handleStateChange(task, state)}
                          >
                            {state === "PENDING" ? "Pendiente" : state === "IN_PROGRESS" ? "En curso" : "Completar"}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
