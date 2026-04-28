import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type {
  Client,
  Matter,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskState,
  TaskTerm,
  TaskTrackingRecord
} from "@sige/contracts";

import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { LEGACY_TASK_MODULE_BY_ID } from "../tasks/task-legacy-config";
import { ExecutionTaskPanel } from "./ExecutionTaskPanel";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "./execution-config";

type MatterPatchPayload = {
  executionPrompt?: string | null;
  concluded?: boolean;
  notes?: string | null;
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

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  WECHAT: "WeChat",
  EMAIL: "Correo-e",
  PHONE: "Telefono"
};
const LEGACY_TASK_PLACEHOLDERS = new Set(["tarea legacy", "distribucion legacy"]);

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getSearchWords(value?: string | null) {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function matchesClientSearch(matter: Matter, searchWords: string[]) {
  if (searchWords.length === 0) {
    return true;
  }

  const clientName = normalizeComparableText(matter.clientName);
  return searchWords.every((word) => clientName.includes(word));
}

function matchesWordSearch(
  matter: Matter,
  clientNumber: string,
  tasks: MatterTaskView[],
  searchWords: string[]
) {
  if (searchWords.length === 0) {
    return true;
  }

  const haystack = normalizeComparableText(
    [
      clientNumber,
      matter.clientName,
      matter.quoteNumber,
      matter.subject,
      matter.specificProcess,
      matter.matterIdentifier,
      matter.executionPrompt,
      matter.notes,
      matter.milestone,
      matter.nextAction,
      matter.nextActionSource,
      toDateInput(matter.nextActionDueAt),
      getChannelLabel(matter.communicationChannel),
      ...tasks.flatMap((task) => [
        task.subject,
        task.trackLabel,
        task.sourceLabel,
        task.responsible,
        toDateInput(task.dueDate)
      ])
    ]
      .filter(Boolean)
      .join(" ")
  );

  return searchWords.every((word) => haystack.includes(word));
}

function hasMeaningfulTaskLabel(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  return !LEGACY_TASK_PLACEHOLDERS.has(normalizeComparableText(normalized));
}

function getLegacyDataText(data: TaskTrackingRecord["data"], key: string) {
  const value = data?.[key];
  return typeof value === "string" ? normalizeText(value) : "";
}

function buildDistributionHistoryTaskNameMap(histories: TaskDistributionHistory[]) {
  const taskNamesByRecordId = new Map<string, string>();

  histories.forEach((history) => {
    Object.entries(history.createdIds ?? {}).forEach(([key, createdId]) => {
      if (key.startsWith("term-")) {
        return;
      }

      const createdIdText = normalizeText(String(createdId));
      if (!createdIdText) {
        return;
      }

      const match = key.match(/_(\d+)$/);
      const index = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;
      const historyTaskName = Number.isNaN(index) ? undefined : history.eventNamesPerTable[index];

      if (hasMeaningfulTaskLabel(historyTaskName)) {
        taskNamesByRecordId.set(createdIdText, normalizeText(historyTaskName));
      }
    });
  });

  return taskNamesByRecordId;
}

function resolveTrackingRecordSubject(
  record: TaskTrackingRecord,
  trackLabel: string,
  taskNamesByRecordId: Map<string, string>
) {
  const candidates = [
    taskNamesByRecordId.get(record.id),
    getLegacyDataText(record.data, "escrito"),
    getLegacyDataText(record.data, "tarea"),
    getLegacyDataText(record.data, "nombre_tarea"),
    getLegacyDataText(record.data, "taskName"),
    getLegacyDataText(record.data, "evento_nombre"),
    getLegacyDataText(record.data, "evento"),
    getLegacyDataText(record.data, "tramite"),
    getLegacyDataText(record.data, "reporte"),
    getLegacyDataText(record.data, "declaracion"),
    getLegacyDataText(record.data, "entregable"),
    record.taskName,
    record.eventName,
    record.subject
  ];

  return candidates.find((candidate) => hasMeaningfulTaskLabel(candidate)) ?? trackLabel;
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

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function getChannelLabel(value?: string | null) {
  return CHANNEL_LABELS[normalizeText(value)] ?? "WhatsApp";
}

function getEffectiveClientNumber(matter: Matter, clients: Client[]) {
  const normalizedName = normalizeComparableText(matter.clientName);
  const match = clients.find((client) => normalizeComparableText(client.name) === normalizedName);
  return match?.clientNumber ?? normalizeText(matter.clientNumber);
}

function sortActiveMatters(items: Matter[], clients: Client[]) {
  return [...items].sort((left, right) => {
    const leftNumber = Number.parseInt(getEffectiveClientNumber(left, clients), 10);
    const rightNumber = Number.parseInt(getEffectiveClientNumber(right, clients), 10);

    if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    if (Number.isNaN(leftNumber)) {
      return 1;
    }
    if (Number.isNaN(rightNumber)) {
      return -1;
    }

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function sortDeletedMatters(items: Matter[]) {
  return [...items].sort((left, right) =>
    (right.deletedAt ?? right.updatedAt).localeCompare(left.deletedAt ?? left.updatedAt)
  );
}

function replaceMatter(items: Matter[], updated: Matter) {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function getSortedTaskViews(tasks: MatterTaskView[]) {
  return tasks.slice().sort((left, right) => {
    const leftDate = toDateInput(left.dueDate);
    const rightDate = toDateInput(right.dueDate);

    if (!leftDate && !rightDate) {
      return left.id.localeCompare(right.id);
    }
    if (!leftDate) {
      return 1;
    }
    if (!rightDate) {
      return -1;
    }

    return leftDate.localeCompare(rightDate);
  });
}

function addTaskViewToMap(taskMap: Map<string, MatterTaskView[]>, keys: string[], view: MatterTaskView) {
  keys.map(normalizeText).filter(Boolean).forEach((key) => {
    const current = taskMap.get(key) ?? [];
    current.push(view);
    taskMap.set(key, current);
  });
}

function mergeTaskMaps(...maps: Map<string, MatterTaskView[]>[]) {
  const merged = new Map<string, MatterTaskView[]>();

  maps.forEach((taskMap) => {
    taskMap.forEach((tasks, key) => {
      merged.set(key, getSortedTaskViews([...(merged.get(key) ?? []), ...tasks]));
    });
  });

  return merged;
}

function buildTrackingRecordTaskMap(
  records: TaskTrackingRecord[],
  trackLabels: Map<string, string>,
  sourcePrefix: string,
  taskNamesByRecordId: Map<string, string>,
  includeCompleted = false
) {
  const taskMap = new Map<string, MatterTaskView[]>();
  const filteredRecords = records
    .filter((record) => (includeCompleted ? true : record.status === "pendiente" && !record.deletedAt))
    .slice()
    .sort((left, right) => {
      const leftDate = toDateInput(left.dueDate ?? left.termDate);
      const rightDate = toDateInput(right.dueDate ?? right.termDate);
      return leftDate.localeCompare(rightDate);
    });

  filteredRecords.forEach((record) => {
    const trackLabel = trackLabels.get(record.tableCode) ?? record.sourceTable ?? record.tableCode;
    const view: MatterTaskView = {
      id: record.id,
      moduleId: record.moduleId,
      trackId: record.tableCode,
      clientName: record.clientName,
      matterId: record.matterId,
      matterNumber: record.matterNumber,
      subject: resolveTrackingRecordSubject(record, trackLabel, taskNamesByRecordId),
      responsible: record.responsible,
      dueDate: record.dueDate ?? record.termDate ?? "",
      state: record.status === "pendiente" ? "PENDING" : "COMPLETED",
      recurring: Boolean(record.data?.recurring),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      trackLabel,
      sourceLabel: `${sourcePrefix}: ${trackLabel}`,
      sourceType: "tracking"
    };

    addTaskViewToMap(
      taskMap,
      [record.matterId ?? "", record.matterNumber ?? "", record.matterIdentifier ?? ""],
      view
    );
  });

  return taskMap;
}

function buildTermTaskMap(terms: TaskTerm[], sourcePrefix: string, includeCompleted = false) {
  const taskMap = new Map<string, MatterTaskView[]>();
  const filteredTerms = terms
    .filter((term) => !term.sourceRecordId)
    .filter((term) => (includeCompleted ? true : term.status === "pendiente" && !term.deletedAt))
    .slice()
    .sort((left, right) => {
      const leftDate = toDateInput(left.dueDate ?? left.termDate);
      const rightDate = toDateInput(right.dueDate ?? right.termDate);
      return leftDate.localeCompare(rightDate);
    });

  filteredTerms.forEach((term) => {
    const trackLabel = "Terminos";
    const view: MatterTaskView = {
      id: term.id,
      moduleId: term.moduleId,
      trackId: "legacy-term",
      clientName: term.clientName,
      matterId: term.matterId,
      matterNumber: term.matterNumber,
      subject: term.pendingTaskLabel || term.eventName || term.subject || trackLabel,
      responsible: term.responsible,
      dueDate: term.dueDate ?? term.termDate ?? "",
      state: term.status === "pendiente" ? "PENDING" : "COMPLETED",
      recurring: Boolean(term.recurring),
      createdAt: term.createdAt,
      updatedAt: term.updatedAt,
      trackLabel,
      sourceLabel: `${sourcePrefix}: ${trackLabel}`,
      sourceType: "term"
    };

    addTaskViewToMap(
      taskMap,
      [term.matterId ?? "", term.matterNumber ?? "", term.matterIdentifier ?? ""],
      view
    );
  });

  return taskMap;
}

function getMatterTasks(matter: Matter, taskMap: Map<string, MatterTaskView[]>) {
  const linkedTasks =
    taskMap.get(normalizeText(matter.id)) ??
    taskMap.get(normalizeText(matter.matterNumber)) ??
    taskMap.get(normalizeText(matter.matterIdentifier)) ??
    [];
  return linkedTasks;
}

function getNextBusinessDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  do {
    date.setDate(date.getDate() + 1);
  } while (date.getDay() === 0 || date.getDay() === 6);

  return toLocalDateInput(date);
}

function evaluateMatterRow(matter: Matter, clientNumber: string, tasks: MatterTaskView[]) {
  const missing: string[] = [];

  if (!clientNumber) missing.push("No. Cliente");
  if (!normalizeText(matter.clientName)) missing.push("Cliente");
  if (!normalizeText(matter.quoteNumber)) missing.push("No. Cotizacion");
  if (!normalizeText(matter.subject)) missing.push("Asunto");
  if (!normalizeText(matter.matterIdentifier)) missing.push("ID Asunto");
  if (!normalizeText(matter.communicationChannel)) missing.push("Canal");
  if (!normalizeText(matter.milestone)) missing.push("Hito conclusion");
  if (tasks.length === 0) missing.push("Sin siguientes tareas");

  const today = toLocalDateInput(new Date());
  const isOverdue = tasks.some((task) => {
    const dueDate = toDateInput(task.dueDate);
    return Boolean(dueDate) && dueDate <= today;
  });
  const nextBusinessDate = getNextBusinessDate();
  const isNextBusinessDay = !isOverdue && tasks.some((task) => toDateInput(task.dueDate) === nextBusinessDate);

  return {
    missing,
    isOverdue,
    isNextBusinessDay
  };
}

interface ExecutionTeamWorkspaceProps {
  backPath?: string;
  fallbackPath?: string;
  titlePrefix?: string;
  description?: string;
  showHero?: boolean;
}

export function ExecutionTeamWorkspace({
  backPath = "/app/execution",
  fallbackPath = "/app/execution",
  titlePrefix = "",
  description = "Tablero operativo asunto por asunto, con siguientes tareas, resaltado rojo por faltantes o vencimientos y separacion completa por equipo.",
  showHero = true
}: ExecutionTeamWorkspaceProps) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const visibleModules = getVisibleExecutionModules(user);
  const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;

  const [activeMatters, setActiveMatters] = useState<Matter[]>([]);
  const [deletedMatters, setDeletedMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [distributionEvents, setDistributionEvents] = useState<TaskDistributionEvent[]>([]);
  const [distributionHistory, setDistributionHistory] = useState<TaskDistributionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wordSearch, setWordSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [panelMatter, setPanelMatter] = useState<Matter | null>(null);
  const [panelMode, setPanelMode] = useState<"create" | "history" | null>(null);

  const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));

  useEffect(() => {
    if (!module || !canAccess) {
      return;
    }

    const currentModule = module;

    async function loadBoard() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const [
          loadedMatters,
          loadedDeleted,
          loadedClients,
          loadedTrackingRecords,
          loadedTerms,
          loadedDistributionEvents,
          loadedDistributionHistory
        ] = await Promise.all([
          apiGet<Matter[]>("/matters"),
          apiGet<Matter[]>("/matters/recycle-bin"),
          apiGet<Client[]>("/clients"),
          apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${currentModule.moduleId}`),
          apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${currentModule.moduleId}`),
          apiGet<TaskDistributionEvent[]>(`/tasks/distribution-events?moduleId=${currentModule.moduleId}`),
          apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${currentModule.moduleId}`)
        ]);

        const teamMatters = loadedMatters.filter((matter) => matter.responsibleTeam === currentModule.team);
        const teamDeleted = loadedDeleted.filter((matter) => matter.responsibleTeam === currentModule.team);

        setClients(loadedClients);
        setTrackingRecords(loadedTrackingRecords);
        setTerms(loadedTerms);
        setDistributionEvents(loadedDistributionEvents);
        setDistributionHistory(loadedDistributionHistory);
        setActiveMatters(sortActiveMatters(teamMatters, loadedClients));
        setDeletedMatters(sortDeletedMatters(teamDeleted));
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void loadBoard();
  }, [module?.moduleId, module?.team, canAccess]);

  const trackLabels = useMemo(
    () => new Map(module?.definition.tracks.map((track) => [track.id, track.label]) ?? []),
    [module]
  );
  const sourcePrefix = module?.shortLabel ?? "Ejecucion";
  const taskNamesByRecordId = useMemo(
    () => buildDistributionHistoryTaskNameMap(distributionHistory),
    [distributionHistory]
  );
  const activeTrackingMap = useMemo(
    () => buildTrackingRecordTaskMap(trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId),
    [trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId]
  );
  const allTrackingMap = useMemo(
    () => buildTrackingRecordTaskMap(trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId, true),
    [trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId]
  );
  const activeTermMap = useMemo(
    () => buildTermTaskMap(terms, sourcePrefix),
    [terms, sourcePrefix]
  );
  const allTermMap = useMemo(
    () => buildTermTaskMap(terms, sourcePrefix, true),
    [terms, sourcePrefix]
  );
  const activeTaskMap = useMemo(
    () => mergeTaskMaps(activeTermMap, activeTrackingMap),
    [activeTermMap, activeTrackingMap]
  );
  const allTaskMap = useMemo(
    () => mergeTaskMaps(allTermMap, allTrackingMap),
    [allTermMap, allTrackingMap]
  );

  const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
  const wordSearchWords = useMemo(() => getSearchWords(wordSearch), [wordSearch]);
  const filteredMatters = useMemo(
    () =>
      activeMatters.filter((matter) => {
        const clientNumber = getEffectiveClientNumber(matter, clients);
        const matterTasks = getMatterTasks(matter, activeTaskMap);
        return (
          matchesClientSearch(matter, clientSearchWords) &&
          matchesWordSearch(matter, clientNumber, matterTasks, wordSearchWords)
        );
      }),
    [activeMatters, activeTaskMap, clientSearchWords, clients, wordSearchWords]
  );
  const filteredDeletedMatters = useMemo(
    () =>
      deletedMatters.filter((matter) => {
        const clientNumber = getEffectiveClientNumber(matter, clients);
        const matterTasks = getMatterTasks(matter, allTaskMap);
        return (
          matchesClientSearch(matter, clientSearchWords) &&
          matchesWordSearch(matter, clientNumber, matterTasks, wordSearchWords)
        );
      }),
    [allTaskMap, clientSearchWords, clients, deletedMatters, wordSearchWords]
  );

  if (!module || !canAccess || !legacyConfig) {
    return <Navigate to={fallbackPath} replace />;
  }

  function updateMatterLocal(matterId: string, updater: (matter: Matter) => Matter) {
    const current = activeMatters.find((item) => item.id === matterId);
    if (!current) {
      return null;
    }

    const updated = updater({ ...current });
    setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
    return updated;
  }

  async function persistMatter(matterId: string, payload: MatterPatchPayload) {
    try {
      const updated = await apiPatch<Matter>(`/matters/${matterId}`, payload);
      setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleLocalChange(matterId: string, field: keyof MatterPatchPayload, value: string) {
    void updateMatterLocal(matterId, (matter) => {
      const draft = matter as Matter & Record<string, unknown>;
      draft[field as string] = value;
      return matter;
    });
  }

  function handleBlur(matterId: string) {
    const matter = activeMatters.find((item) => item.id === matterId);
    if (!matter) {
      return;
    }

    void persistMatter(matterId, {
      executionPrompt: normalizeText(matter.executionPrompt) ? matter.executionPrompt ?? null : null,
      notes: normalizeText(matter.notes) ? matter.notes ?? null : null
    });
  }

  async function handleToggleConcluded(matterId: string, concluded: boolean) {
    updateMatterLocal(matterId, (matter) => {
      matter.concluded = concluded;
      return matter;
    });

    await persistMatter(matterId, { concluded });
  }

  async function handleRestore(matterId: string) {
    if (!window.confirm("Restaurar este asunto a activos?")) {
      return;
    }

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/restore`, {});
      setDeletedMatters((items) => sortDeletedMatters(items.filter((item) => item.id !== updated.id)));
      setActiveMatters((items) => sortActiveMatters([...items, updated], clients));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleCreateTask(payload: {
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
  }) {
    if (!panelMatter || !module || !legacyConfig) {
      return;
    }

    try {
      const eventName = payload.eventName.trim() || panelMatter.subject || "Tarea de ejecucion";

      await apiPost("/tasks/distributions", {
        moduleId: module.moduleId,
        matterId: panelMatter.id,
        matterNumber: panelMatter.matterNumber,
        clientNumber: getEffectiveClientNumber(panelMatter, clients),
        clientName: panelMatter.clientName || "Sin cliente",
        subject: panelMatter.subject || "",
        specificProcess: panelMatter.specificProcess ?? null,
        matterIdentifier: panelMatter.matterIdentifier ?? null,
        eventName,
        responsible: payload.responsible,
        targets: payload.targets.map((target) => {
          const table = legacyConfig.tables.find((candidate) => candidate.slug === target.tableCode);
          const taskName = target.taskName.trim() || table?.title || eventName;

          return {
            tableCode: target.tableCode,
            sourceTable: table?.sourceTable ?? target.tableCode,
            tableLabel: table?.title ?? target.tableCode,
            taskName,
            dueDate: payload.dueDate,
            termDate: table?.autoTerm ? target.termDate || payload.dueDate : target.termDate || null,
            status: "pendiente",
            workflowStage: 1,
            reportedMonth: target.reportedMonth || null,
            createTerm: Boolean(table?.autoTerm),
            data: {
              source: "execution-selector",
              tableTitle: table?.title,
              activeSource: "tasks-distributor"
            }
          };
        })
      });

      const [loadedTrackingRecords, loadedTerms, loadedDistributionHistory] = await Promise.all([
        apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${module.moduleId}`),
        apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${module.moduleId}`),
        apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${module.moduleId}`)
      ]);
      setTrackingRecords(loadedTrackingRecords);
      setTerms(loadedTerms);
      setDistributionHistory(loadedDistributionHistory);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleUpdateTaskState(task: MatterTaskView, state: TaskState) {
    if (task.sourceType === "tracking") {
      try {
        const updated = await apiPatch<TaskTrackingRecord | null>(`/tasks/tracking-records/${task.id}`, {
          status: state === "COMPLETED" ? "presentado" : "pendiente",
          completedAt: state === "COMPLETED" ? new Date().toISOString() : null
        });
        if (!updated) {
          return;
        }

        setTrackingRecords((items) =>
          items
            .map((record) => (record.id === updated.id ? updated : record))
            .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))
        );
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
      return;
    }

    if (task.sourceType === "term") {
      try {
        const updated = await apiPatch<TaskTerm | null>(`/tasks/terms/${task.id}`, {
          status: state === "COMPLETED" ? "concluida" : "pendiente"
        });
        if (!updated) {
          return;
        }

        setTerms((items) =>
          items
            .map((term) => (term.id === updated.id ? updated : term))
            .sort((left, right) => (left.dueDate ?? left.termDate ?? "").localeCompare(right.dueDate ?? right.termDate ?? ""))
        );
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
      return;
    }
  }

  const panelTasks = panelMatter ? getMatterTasks(panelMatter, allTaskMap) : [];

  return (
    <section className="page-stack execution-page">
      {showHero ? (
        <header className="hero module-hero">
          <div className="execution-page-topline">
            <button type="button" className="secondary-button" onClick={() => navigate(backPath)}>
              Volver
            </button>
            <div className="module-hero-head">
              <span className="module-hero-icon" aria-hidden="true" style={{ color: module.color }}>
                {module.icon}
              </span>
              <div>
                <h2>{`${titlePrefix}${module.label}`}</h2>
              </div>
            </div>
          </div>
          <p className="muted">{description}</p>
        </header>
      ) : null}

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Asuntos en ejecucion</h2>
          <span>{filteredMatters.length} registros</span>
        </div>

        <div className="matters-toolbar execution-search-toolbar">
          <div className="matters-filters leads-search-filters matters-active-search-filters execution-search-filters">
            <label className="form-field matters-search-field">
              <span>Buscar por palabra</span>
              <input
                type="text"
                value={wordSearch}
                onChange={(event) => setWordSearch(event.target.value)}
                placeholder="ID, asunto, tarea, nota..."
              />
            </label>

            <label className="form-field matters-search-field">
              <span>Buscador por cliente</span>
              <input
                type="text"
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Buscar palabra del cliente..."
              />
            </label>
          </div>

          <div className="matters-toolbar-actions">
            <span className="muted">
              Filtra por cliente y abre cada asunto para crear o consultar tareas del equipo.
            </span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Asuntos en ejecucion</h2>
          <span>{filteredMatters.length} registros</span>
        </div>

        <div className="lead-table-shell">
          <div className="lead-table-wrapper">
            <table className="lead-table execution-table">
              <thead>
                <tr>
                  <th>No. Cliente</th>
                  <th>Cliente</th>
                  <th>No. Cotizacion</th>
                  <th>Asunto</th>
                  <th>Proceso especifico</th>
                  <th>ID Asunto</th>
                  <th>Enviar</th>
                  <th>Canal</th>
                  <th>Siguiente tarea</th>
                  <th>Fecha sig. tarea</th>
                  <th>Origen</th>
                  <th>Ir</th>
                  <th>Comentarios LLM</th>
                  <th>Hito conclusion</th>
                  <th>Concluyo?</th>
                  <th>Comentarios</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={16} className="centered-inline-message">
                      Cargando ejecucion...
                    </td>
                  </tr>
                ) : filteredMatters.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="centered-inline-message">
                      No hay asuntos del equipo en esta vista.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredMatters.map((matter) => {
                      const clientNumber = getEffectiveClientNumber(matter, clients);
                      const matterTasks = getMatterTasks(matter, activeTaskMap);
                      const validation = evaluateMatterRow(matter, clientNumber, matterTasks);
                      const rowClassName = validation.missing.length > 0 || validation.isOverdue
                        ? "execution-row-danger"
                        : validation.isNextBusinessDay
                          ? "execution-row-next-business"
                          : "";
                      const rowTitle = [
                        validation.missing.length > 0 ? `Falta: ${validation.missing.join(", ")}` : "",
                        validation.isOverdue ? "Tiene tareas vencidas o con vencimiento de hoy." : ""
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <tr key={matter.id} className={rowClassName} title={rowTitle}>
                          <td>
                            <input className="lead-cell-input matter-cell-derived" value={clientNumber || "-"} readOnly />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.clientName || ""} readOnly />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.quoteNumber || ""} readOnly />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.subject || ""} readOnly />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.specificProcess || ""} readOnly />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.matterIdentifier || ""} readOnly />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="primary-button matter-inline-button"
                              onClick={() => {
                                setPanelMatter(matter);
                                setPanelMode("create");
                              }}
                            >
                              Crear Tarea
                            </button>
                          </td>
                          <td>
                            <div className="matter-reflection-card">{getChannelLabel(matter.communicationChannel)}</div>
                          </td>
                          <td>
                            <div className="execution-actions-cell">
                              {matterTasks.length === 0 ? (
                                <span className="matter-cell-muted">Sin tareas</span>
                              ) : (
                                matterTasks.map((task) => (
                                  <div key={task.id} className="execution-inline-entry">
                                    <strong>{"\u2022"}</strong> {task.subject || task.trackLabel}
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="execution-actions-cell">
                              {matterTasks.length === 0 ? (
                                <span className="matter-cell-muted">-</span>
                              ) : (
                                matterTasks.map((task) => (
                                  <div key={task.id} className="execution-inline-entry">
                                    {toDateInput(task.dueDate) || "S/F"}
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="matter-checkbox-cell">
                            {matterTasks.length === 0 ? (
                              <span className="matter-cell-muted">-</span>
                            ) : (
                              <div className="execution-origin-stack">
                                {matterTasks.map((task) => (
                                  <span key={task.id} className="matter-origin-indicator" title={task.sourceLabel}>
                                    i
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary-button matter-inline-button"
                              onClick={() => {
                                setPanelMatter(matter);
                                setPanelMode("history");
                              }}
                            >
                              Ir
                            </button>
                          </td>
                          <td>
                            <textarea
                              className="lead-cell-input execution-textarea"
                              value={matter.executionPrompt || ""}
                              onChange={(event) => handleLocalChange(matter.id, "executionPrompt", event.target.value)}
                              onBlur={() => handleBlur(matter.id)}
                              placeholder="Prompt operativo..."
                            />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.milestone || ""} readOnly />
                          </td>
                          <td className="matter-checkbox-cell">
                            <input
                              type="checkbox"
                              checked={Boolean(matter.concluded)}
                              onChange={(event) => void handleToggleConcluded(matter.id, event.target.checked)}
                            />
                          </td>
                          <td>
                            <textarea
                              className="lead-cell-input execution-textarea"
                              value={matter.notes || ""}
                              onChange={(event) => handleLocalChange(matter.id, "notes", event.target.value)}
                              onBlur={() => handleBlur(matter.id)}
                              placeholder="Comentarios del equipo..."
                            />
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="execution-table-note">
                      <td colSpan={16}>Para agregar un nuevo asunto, se debe hacer desde el Distribuidor.</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Papelera de reciclaje</h2>
          <span>{filteredDeletedMatters.length} registros</span>
        </div>
        <p className="muted matter-table-caption">
          Los asuntos eliminados desaparecen definitivamente despues de 30 dias.
        </p>

        <div className="lead-table-shell">
          <div className="lead-table-wrapper">
            <table className="lead-table execution-table execution-table-recycle">
              <thead>
                <tr>
                  <th>No. Cliente</th>
                  <th>Cliente</th>
                  <th>No. Cotizacion</th>
                  <th>Asunto</th>
                  <th>ID Asunto</th>
                  <th>Canal</th>
                  <th>Siguiente tarea</th>
                  <th>Fecha sig. tarea</th>
                  <th>Comentarios LLM</th>
                  <th>Hito conclusion</th>
                  <th>Concluyo?</th>
                  <th>Notas</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} className="centered-inline-message">
                      Cargando papelera...
                    </td>
                  </tr>
                ) : filteredDeletedMatters.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="centered-inline-message">
                      Papelera vacia.
                    </td>
                  </tr>
                ) : (
                  filteredDeletedMatters.map((matter) => {
                    const matterTasks = getMatterTasks(matter, allTaskMap);

                    return (
                      <tr key={matter.id}>
                        <td>{getEffectiveClientNumber(matter, clients) || "-"}</td>
                        <td>{matter.clientName || "-"}</td>
                        <td>{matter.quoteNumber || "-"}</td>
                        <td>{matter.subject || "-"}</td>
                        <td>{matter.matterIdentifier || "-"}</td>
                        <td>{getChannelLabel(matter.communicationChannel)}</td>
                        <td>
                          {matterTasks.length === 0 ? (
                            <span className="matter-cell-muted">Sin tareas</span>
                          ) : (
                            matterTasks.map((task) => (
                              <div key={task.id} className="execution-inline-entry">
                                <strong>{"\u2022"}</strong> {task.subject || task.trackLabel}
                              </div>
                            ))
                          )}
                        </td>
                        <td>
                          {matterTasks.length === 0 ? (
                            <span className="matter-cell-muted">-</span>
                          ) : (
                            matterTasks.map((task) => (
                              <div key={task.id} className="execution-inline-entry">
                                {toDateInput(task.dueDate) || "S/F"}
                              </div>
                            ))
                          )}
                        </td>
                        <td>{matter.executionPrompt || "-"}</td>
                        <td>{matter.milestone || "-"}</td>
                        <td>{matter.concluded ? "Si" : "No"}</td>
                        <td>{matter.notes || "-"}</td>
                        <td>
                          <button type="button" className="secondary-button matter-inline-button" onClick={() => void handleRestore(matter.id)}>
                            Regresar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ExecutionTaskPanel
        module={module}
        legacyConfig={legacyConfig}
        distributionEvents={distributionEvents}
        matter={panelMatter}
        clientNumber={panelMatter ? getEffectiveClientNumber(panelMatter, clients) : ""}
        mode={panelMode}
        tasks={panelTasks}
        userShortName={user?.shortName}
        onClose={() => {
          setPanelMatter(null);
          setPanelMode(null);
        }}
        onModeChange={setPanelMode}
        onCreateTask={handleCreateTask}
        onUpdateState={handleUpdateTaskState}
      />
    </section>
  );
}

export function ExecutionTeamPage() {
  return <ExecutionTeamWorkspace />;
}
