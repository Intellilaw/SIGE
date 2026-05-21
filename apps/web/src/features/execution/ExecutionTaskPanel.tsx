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

const duplicateTaskPhraseExpansions: Array<[string, string]> = [
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

type DuplicateTaskMatch = {
  candidateName: string;
  existingTaskName: string;
  existingTaskTrack: string;
  score: number;
};

function normalizeSemanticTaskText(value?: string | null) {
  return normalizeEventSearch(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCanonicalTaskToken(token: string) {
  if (token.startsWith("apreh")) return "aprehension";
  if (token.startsWith("deten")) return "detencion";
  if (token.startsWith("captur")) return "captura";
  if (token.startsWith("arrest")) return "arresto";
  if (token.startsWith("ampar")) return "amparo";
  if (token.startsWith("constit")) return "constitucional";
  if (token.startsWith("demand")) return "demanda";
  if (token.startsWith("contest")) return "contestacion";
  if (token.startsWith("respond")) return "respuesta";
  if (token.startsWith("promoc")) return "promocion";
  if (token.startsWith("apel")) return "apelacion";
  if (token.startsWith("impugn")) return "impugnacion";
  if (token.startsWith("notific")) return "notificacion";
  if (token.startsWith("emplaz")) return "emplazamiento";
  if (token.startsWith("venc")) return "vencimiento";
  if (token.startsWith("termin")) return "termino";
  if (token.startsWith("cautel")) return "cautelar";
  if (token.startsWith("suspend")) return "suspension";
  return token;
}

function getSemanticTaskTokens(value: string) {
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

function calculateSemanticTaskSimilarity(left: string, right: string) {
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

function getCandidateTaskNames(selectedEvent: TaskDistributionEvent | undefined, targets: SelectorTargetEntry[]) {
  const names = new Set<string>();

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

function findDuplicateTaskMatch(
  selectedEvent: TaskDistributionEvent | undefined,
  targets: SelectorTargetEntry[],
  tasks: MatterTaskView[]
): DuplicateTaskMatch | null {
  const candidateNames = getCandidateTaskNames(selectedEvent, targets);
  const activeTasks = tasks.filter((task) => task.state !== "COMPLETED" && !task.isMatterFallback);
  let bestMatch: DuplicateTaskMatch | null = null;

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
                        />
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
