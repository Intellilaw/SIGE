import { useEffect, useMemo, useRef, useState } from "react";
import type { Matter, TaskDistributionEvent, TaskState } from "@sige/contracts";

import {
  getCatalogTargetEntries,
  getTableDisplayName,
  type CatalogTargetEntry
} from "../tasks/task-distribution-utils";
import type { LegacyTaskModuleConfig } from "../tasks/task-legacy-config";
import { RusconiIntelligenceBadge } from "../rusconi-intelligence/RusconiIntelligenceBadge";
import type { ExecutionModuleDescriptor } from "./execution-config";
import {
  CREATE_TASKS_RI_CONNECTION_ID,
  findDuplicateTaskMatch
} from "./execution-task-intelligence";

type SelectorTargetEntry = CatalogTargetEntry & {
  reportedMonth: string;
};

type MatterTaskView = {
  id: string;
  moduleId: string;
  trackId: string;
  clientName: string;
  matterId?: string;
  matterNumber?: string;
  subject: string;
  responsible: string;
  dueDate: string;
  state: TaskState;
  recurring: boolean;
  createdAt?: string;
  updatedAt?: string;
  trackLabel: string;
  sourceLabel: string;
  isMatterFallback?: boolean;
  sourceType: "tracking" | "term" | "matter";
};

interface CreateTaskInput {
  eventName: string;
  responsible: string;
  dueDate: string;
  targets: Array<{
    tableCode: string;
    taskName: string;
    dueDate: string;
    termDate: string;
    reportedMonth: string;
  }>;
}

interface ExecutionTaskPanelProps {
  module: ExecutionModuleDescriptor;
  legacyConfig: LegacyTaskModuleConfig;
  distributionEvents: TaskDistributionEvent[];
  matter: Matter | null;
  clientNumber?: string;
  mode: "create" | "history" | null;
  tasks: MatterTaskView[];
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

function normalizeEventSearch(value?: string | null) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function ExecutionTaskPanel({
  module,
  legacyConfig,
  distributionEvents,
  matter,
  clientNumber,
  mode,
  tasks,
  onClose,
  onModeChange,
  onCreateTask,
  onUpdateState
}: ExecutionTaskPanelProps) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskSearchOpen, setTaskSearchOpen] = useState(false);
  const [selectorTargets, setSelectorTargets] = useState<SelectorTargetEntry[]>([]);
  const [responsible, setResponsible] = useState(module.defaultResponsible);
  const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [duplicateWarningAcknowledged, setDuplicateWarningAcknowledged] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  const selectedEvent = useMemo(
    () => distributionEvents.find((event) => event.id === selectedEventId),
    [distributionEvents, selectedEventId]
  );
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
  const duplicateTaskMatch = useMemo(
    () => (mode === "create" ? findDuplicateTaskMatch(selectedEvent, selectorTargets, tasks) : null),
    [mode, selectedEvent, selectorTargets, tasks]
  );

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

    function handlePointerDown(event: MouseEvent) {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setTaskSearchOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
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

  function handleEventSelect(eventId: string) {
    setSelectedEventId(eventId);
    const event = distributionEvents.find((candidate) => candidate.id === eventId);
    setTaskSearch(event?.name ?? "");
    setTaskSearchOpen(false);
    setSelectorTargets(event ? getCatalogTargetEntries(event, legacyConfig).map((target) => ({ ...target, reportedMonth: "" })) : []);
    setSuccessMessage(null);
  }

  function handleClearTargetName(targetId: string) {
    setSelectorTargets((current) =>
      current.map((candidate) => (candidate.id === targetId ? { ...candidate, taskName: "" } : candidate))
    );
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
    } catch {
      // The parent owns the visible error banner; keep the selector open without a false success state.
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
        className={`execution-panel ${mode === "create" ? "execution-panel-selector" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Crear tareas" : "Lista de tareas"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="execution-panel-header">
          <div>
            <p className="eyebrow">Ejecucion / {module.shortLabel}</p>
            <h3>{mode === "create" ? "Crear tareas" : "Lista de tareas"}</h3>
            <p className="muted execution-panel-copy">
              {matter.clientName || "Cliente sin nombre"} - {matter.subject || "Asunto sin nombre"}
            </p>
            {mode === "create" ? (
              <div className="execution-panel-ri-anchor">
                <RusconiIntelligenceBadge connectionId={CREATE_TASKS_RI_CONNECTION_ID} label="Ejecucion / Crear tareas" />
              </div>
            ) : null}
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {mode === "history" ? (
          <div className="execution-panel-switcher">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onModeChange("create")}
            >
              Crear tareas
            </button>
          </div>
        ) : null}

        {mode === "create" ? (
          <div className="execution-panel-body execution-panel-form">
            <div className="execution-selector-layout">
              <div className="execution-selector-form">
                <label className="form-field execution-selector-search-field">
                  <span>Seleccionar tarea</span>
                  <div className="execution-selector-search" ref={searchWrapRef}>
                    <input
                      value={taskSearch}
                      onChange={(event) => {
                        setTaskSearch(event.target.value);
                        setTaskSearchOpen(true);
                        setSuccessMessage(null);
                        if (selectedEventId) {
                          setSelectedEventId("");
                          setSelectorTargets([]);
                        }
                      }}
                      onClick={() => setTaskSearchOpen((current) => !current)}
                      placeholder="Buscar tarea..."
                      autoComplete="off"
                    />
                    {taskSearchOpen ? (
                      <div className="execution-selector-search-results" role="listbox">
                        {filteredDistributionEvents.length === 0 ? (
                          <div className="execution-selector-search-empty">No hay tareas con ese criterio.</div>
                        ) : (
                          filteredDistributionEvents.map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              role="option"
                              aria-selected={event.id === selectedEventId}
                              onMouseDown={(mouseEvent) => {
                                mouseEvent.preventDefault();
                                handleEventSelect(event.id);
                              }}
                            >
                              {event.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </label>

                <button
                  type="button"
                  className="primary-button execution-selector-submit"
                  onClick={() => void handleCreate()}
                  disabled={submitting || !selectedEvent || selectorTargets.length === 0 || !dueDate || missingTargetNames}
                >
                  {submitting ? "Procesando..." : duplicateTaskMatch && duplicateWarningAcknowledged ? "Distribuir de todos modos" : "Distribuir Tareas"}
                </button>

                {duplicateTaskMatch ? (
                  <div className="message-banner message-warning execution-duplicate-warning">
                    <RusconiIntelligenceBadge connectionId={CREATE_TASKS_RI_CONNECTION_ID} label="Ejecucion / Crear tareas" />
                    <div>
                      <strong>Posible tarea duplicada vigente</strong>
                      <span>
                        "{duplicateTaskMatch.candidateName}" se parece a "{duplicateTaskMatch.existingTaskName}" en {duplicateTaskMatch.existingTaskTrack}.
                        {duplicateWarningAcknowledged
                          ? " Si deseas conservar ambas tareas, presiona Distribuir de todos modos."
                          : " Si necesitas registrarla de todas formas, presiona Distribuir Tareas para confirmar la excepcion."}
                      </span>
                    </div>
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="message-banner message-success">{successMessage}</div>
                ) : null}

                <div className="execution-selector-matter">
                  <h4>Detalles del Asunto (Lectura)</h4>
                  <div className="execution-selector-matter-grid">
                    <label className="form-field">
                      <span>ID Asunto</span>
                      <input readOnly value={activeMatter.matterIdentifier || activeMatter.matterNumber || ""} />
                    </label>
                    <label className="form-field">
                      <span>No. Cliente</span>
                      <input readOnly value={clientNumber || activeMatter.clientNumber || ""} />
                    </label>
                    <label className="form-field execution-selector-span">
                      <span>Cliente</span>
                      <input readOnly value={activeMatter.clientName || ""} />
                    </label>
                    <label className="form-field execution-selector-span">
                      <span>Asunto / Expediente</span>
                      <input readOnly value={activeMatter.subject || ""} />
                    </label>
                    <label className="form-field execution-selector-span">
                      <span>Proceso específico</span>
                      <input readOnly value={activeMatter.specificProcess || ""} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="execution-selector-summary">
                <h3>Resumen de Envío</h3>
                {selectorTargets.length === 0 ? (
                  <div className="centered-inline-message">Selecciona una tarea para ver las tablas destino.</div>
                ) : (
                  <div className="execution-selector-target-list">
                    {selectorTargets.map((target) => (
                      <article key={target.id} className="execution-selector-target-card">
                        <div className="tasks-distributor-target-head">
                          <strong>{getTableDisplayName(legacyConfig, target.tableSlug)}</strong>
                          <button
                            type="button"
                            className="danger-button tasks-distributor-small-button"
                            onClick={() => setSelectorTargets((current) => current.filter((candidate) => candidate.id !== target.id))}
                          >
                            Quitar
                          </button>
                        </div>
                        <div className="execution-selector-target-name-row">
                          <input
                            value={target.taskName}
                            onChange={(event) =>
                              setSelectorTargets((current) =>
                                current.map((candidate) =>
                                  candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate
                                )
                              )
                            }
                            placeholder="Nombre del registro"
                            aria-label={`Nombre del registro para ${getTableDisplayName(legacyConfig, target.tableSlug)}`}
                          />
                          <button
                            type="button"
                            className="secondary-button execution-selector-clear-button"
                            onClick={() => handleClearTargetName(target.id)}
                            disabled={!target.taskName}
                            aria-label={`Borrar texto de ${getTableDisplayName(legacyConfig, target.tableSlug)}`}
                            title="Borrar texto"
                          >
                            Limpiar
                          </button>
                        </div>
                        {legacyConfig.tables.find((table) => table.slug === target.tableSlug)?.showReportedPeriod ? (
                          <label className="form-field">
                            <span>{legacyConfig.tables.find((table) => table.slug === target.tableSlug)?.reportedPeriodLabel ?? "Periodo reportado"}</span>
                            <input
                              type="month"
                              value={target.reportedMonth}
                              onChange={(event) =>
                                setSelectorTargets((current) =>
                                  current.map((candidate) =>
                                    candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate
                                  )
                                )
                              }
                            />
                          </label>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </div>
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
                        Esta fila viene del origen del asunto. Para gestionarla desde Ejecucion, crea una tarea en Crear tareas.
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
