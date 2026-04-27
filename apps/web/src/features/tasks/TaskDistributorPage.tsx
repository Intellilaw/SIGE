import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { TaskDistributionEvent, TaskDistributionHistory, TaskTerm, TaskTrackingRecord } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { EXECUTION_MODULE_BY_SLUG } from "../execution/execution-config";
import {
  LEGACY_TASK_MODULE_BY_SLUG,
  type LegacyTaskTableConfig
} from "./task-legacy-config";
import {
  encodeCatalogTarget,
  findLegacyTableByAnyName,
  getCatalogTargetEntries,
  getTableDisplayName,
  makeCatalogTargetEntry,
  type CatalogTargetEntry
} from "./task-distribution-utils";

type DistributorTab = "active" | "config";

type TrackingRecordPatch = Partial<Omit<TaskTrackingRecord, "dueDate" | "termDate" | "completedAt">> & {
  dueDate?: string | null;
  termDate?: string | null;
  completedAt?: string | null;
};

function normalize(value?: string | null) {
  return (value ?? "").trim();
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function todayInput() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getRowDate(record: TaskTrackingRecord) {
  return toDateInput(record.dueDate || record.termDate);
}

function isCompletedRecord(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (record.status === "presentado" || record.status === "concluida") {
    return true;
  }

  return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}

function isTrackingRecordRed(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (isCompletedRecord(table, record)) {
    return false;
  }

  const dueDate = getRowDate(record);
  const requiresDate = table?.showDateColumn !== false;

  return !record.taskName || !record.responsible || (requiresDate && !dueDate) || (Boolean(dueDate) && dueDate <= todayInput());
}

function getStageLabel(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (!table) {
    return record.status;
  }

  if (table.mode === "workflow") {
    return table.tabs.find((tab) => Number(tab.stage) === Number(record.workflowStage || 1))?.label ?? "Etapa pendiente";
  }

  return table.tabs.find((tab) => tab.status === record.status)?.label ?? record.status;
}

function getLinkedTerm(terms: TaskTerm[], record: TaskTrackingRecord) {
  return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}

export function TaskDistributorPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
  const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const [activeTab, setActiveTab] = useState<DistributorTab>("active");
  const [events, setEvents] = useState<TaskDistributionEvent[]>([]);
  const [history, setHistory] = useState<TaskDistributionHistory[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [catalogName, setCatalogName] = useState("");
  const [catalogEntries, setCatalogEntries] = useState<CatalogTargetEntry[]>([]);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadDistributor() {
    if (!moduleConfig) {
      return;
    }

    setLoading(true);
    try {
      const [loadedEvents, loadedHistory, loadedTrackingRecords, loadedTerms] = await Promise.all([
        apiGet<TaskDistributionEvent[]>(`/tasks/distribution-events?moduleId=${moduleConfig.moduleId}`),
        apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${moduleConfig.moduleId}`),
        apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}`),
        apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${moduleConfig.moduleId}`)
      ]);
      setEvents(loadedEvents);
      setHistory(loadedHistory);
      setTrackingRecords(loadedTrackingRecords);
      setTerms(loadedTerms);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDistributor();
  }, [moduleConfig]);

  const tableBySlug = useMemo(
    () => new Map(moduleConfig?.tables.map((table) => [table.slug, table]) ?? []),
    [moduleConfig]
  );

  const trackingById = useMemo(
    () => new Map(trackingRecords.map((record) => [record.id, record])),
    [trackingRecords]
  );

  function resolveHistoryRecord(item: TaskDistributionHistory, tableValue: string, index: number, usedIds: Set<string>) {
    if (!moduleConfig) {
      return undefined;
    }

    const table = findLegacyTableByAnyName(moduleConfig, tableValue);
    const possibleKeys = [
      `${table?.slug ?? tableValue}_${index}`,
      `${table?.sourceTable ?? tableValue}_${index}`,
      `${tableValue}_${index}`,
      table?.slug,
      table?.sourceTable,
      tableValue
    ].filter((key): key is string => Boolean(key));

    for (const key of possibleKeys) {
      const recordId = item.createdIds[key];
      const record = recordId ? trackingById.get(recordId) : undefined;
      if (record && !usedIds.has(record.id)) {
        usedIds.add(record.id);
        return record;
      }
    }

    const expectedName = normalize(item.eventNamesPerTable[index] || item.eventName);
    const record = trackingRecords.find((candidate) => {
      if (usedIds.has(candidate.id)) {
        return false;
      }

      const sameTable = candidate.tableCode === table?.slug || candidate.sourceTable === table?.sourceTable || candidate.tableCode === tableValue || candidate.sourceTable === tableValue;
      const sameMatter =
        candidate.matterId === item.matterId ||
        candidate.matterNumber === item.matterNumber ||
        candidate.matterIdentifier === item.matterIdentifier;
      const sameTask = !expectedName || candidate.taskName === expectedName || candidate.eventName === item.eventName;

      return sameTable && sameMatter && sameTask;
    });

    if (record) {
      usedIds.add(record.id);
    }

    return record;
  }

  function historyHasOpenRecords(item: TaskDistributionHistory) {
    const usedIds = new Set<string>();

    return item.targetTables.some((targetTable, index) => {
      const record = resolveHistoryRecord(item, targetTable, index, usedIds);
      const table = record ? tableBySlug.get(record.tableCode) : findLegacyTableByAnyName(moduleConfig!, targetTable);

      return Boolean(record && !record.deletedAt && !isCompletedRecord(table, record));
    });
  }

  const activeHistory = useMemo(() => {
    const query = normalize(clientSearch).toLowerCase();

    return history
      .filter(historyHasOpenRecords)
      .filter((item) => !query || normalize(item.clientName).toLowerCase().includes(query));
  }, [clientSearch, history, moduleConfig, tableBySlug, trackingById, trackingRecords]);

  function resetCatalogForm() {
    setCatalogName("");
    setCatalogEntries([]);
    setEditingCatalogId(null);
  }

  function startCatalogEdit(event: TaskDistributionEvent) {
    if (!moduleConfig) {
      return;
    }

    setEditingCatalogId(event.id);
    setCatalogName(event.name);
    setCatalogEntries(getCatalogTargetEntries(event, moduleConfig));
  }

  function addCatalogEntry(table: LegacyTaskTableConfig) {
    setCatalogEntries((current) => [
      ...current,
      makeCatalogTargetEntry(table, catalogName || table.title)
    ]);
  }

  function removeCatalogEntry(table: LegacyTaskTableConfig) {
    setCatalogEntries((current) => {
      const index = current.map((entry) => entry.tableSlug).lastIndexOf(table.slug);
      if (index < 0) {
        return current;
      }

      return current.filter((_, entryIndex) => entryIndex !== index);
    });
  }

  async function saveCatalogEvent() {
    if (!moduleConfig || !catalogName.trim() || catalogEntries.length === 0) {
      return;
    }

    const payload = {
      moduleId: moduleConfig.moduleId,
      name: catalogName.trim(),
      targetTables: catalogEntries.map((entry) => encodeCatalogTarget({
        tableSlug: entry.tableSlug,
        taskName: entry.taskName.trim() || catalogName.trim()
      })),
      defaultTaskName: catalogName.trim()
    };

    if (editingCatalogId) {
      const updated = await apiPatch<TaskDistributionEvent>(`/tasks/distribution-events/${editingCatalogId}`, payload);
      setEvents((current) => current.map((event) => event.id === editingCatalogId ? updated : event));
    } else {
      const created = await apiPost<TaskDistributionEvent>("/tasks/distribution-events", payload);
      setEvents((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
    }

    resetCatalogForm();
  }

  async function deleteCatalogEvent(event: TaskDistributionEvent) {
    if (!window.confirm(`Eliminar la tarea configurada "${event.name}"?`)) {
      return;
    }

    await apiDelete(`/tasks/distribution-events/${event.id}`);
    setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
    if (editingCatalogId === event.id) {
      resetCatalogForm();
    }
  }

  async function patchRecord(record: TaskTrackingRecord, patch: TrackingRecordPatch) {
    const updated = await apiPatch<TaskTrackingRecord | null>(`/tasks/tracking-records/${record.id}`, patch);
    if (!updated) {
      return;
    }

    setTrackingRecords((current) => current.map((candidate) => candidate.id === record.id ? updated : candidate));

    const linkedTerm = getLinkedTerm(terms, record);
    if (linkedTerm && ("dueDate" in patch || "termDate" in patch || "responsible" in patch || "status" in patch || "deletedAt" in patch)) {
      setTerms((current) =>
        current.map((term) =>
          term.id === linkedTerm.id
            ? {
                ...term,
                dueDate: patch.dueDate === undefined ? term.dueDate : patch.dueDate ?? undefined,
                termDate: patch.termDate === undefined ? term.termDate : patch.termDate ?? undefined,
                responsible: patch.responsible === undefined ? term.responsible : patch.responsible,
                status: patch.status === undefined ? term.status : patch.status,
                deletedAt: patch.deletedAt === undefined ? term.deletedAt : patch.deletedAt ?? undefined
              }
            : term
        )
      );
    }
  }

  async function handleDateChange(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined, value: string) {
    await patchRecord(record, {
      dueDate: value || null,
      termDate: table?.termManagedDate ? value || null : record.termDate ?? null
    });
  }

  async function handleAdvance(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined) {
    if (table?.mode === "workflow") {
      const finalStage = table.tabs.length;
      const nextStage = Math.min((record.workflowStage || 1) + 1, finalStage);
      await patchRecord(record, {
        workflowStage: nextStage,
        status: nextStage >= finalStage ? "presentado" : "pendiente",
        completedAt: nextStage >= finalStage ? new Date().toISOString() : undefined
      });
      return;
    }

    await patchRecord(record, {
      status: "presentado",
      completedAt: new Date().toISOString()
    });
  }

  async function handleStepBack(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined) {
    await patchRecord(record, {
      workflowStage: table?.mode === "workflow" ? Math.max(1, (record.workflowStage || 1) - 1) : record.workflowStage,
      status: "pendiente",
      completedAt: null
    });
  }

  async function handleReopen(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined) {
    await patchRecord(record, {
      status: "pendiente",
      completedAt: null,
      workflowStage: table?.mode === "workflow" ? Math.max(1, table.tabs.length - 1) : record.workflowStage
    });
  }

  async function handleDeleteRecord(record: TaskTrackingRecord) {
    if (!window.confirm("Quitar este registro de seguimiento?")) {
      return;
    }

    await apiDelete(`/tasks/tracking-records/${record.id}`);
    setTrackingRecords((current) => current.filter((candidate) => candidate.id !== record.id));
    setTerms((current) => current.filter((term) => term.id !== record.termId && term.sourceRecordId !== record.id));
  }

  async function handleDeleteDistribution(item: TaskDistributionHistory) {
    if (!window.confirm(`Quitar todos los registros activos de "${item.eventName}"?`)) {
      return;
    }

    const usedIds = new Set<string>();
    const records = item.targetTables
      .map((targetTable, index) => resolveHistoryRecord(item, targetTable, index, usedIds))
      .filter((record): record is TaskTrackingRecord => Boolean(record));

    await Promise.all(records.map((record) => apiDelete(`/tasks/tracking-records/${record.id}`)));
    setTrackingRecords((current) => current.filter((record) => !records.some((deleted) => deleted.id === record.id)));
    setTerms((current) => current.filter((term) => !records.some((record) => term.id === record.termId || term.sourceRecordId === record.id)));
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
        <h2>Distribuidor de tareas ({moduleConfig.label})</h2>
        <p className="muted">
          La pestaña de tareas activas es la fuente operativa: sus registros alimentan las tablas de seguimiento y
          el modulo de ejecucion. La configuracion conserva el catalogo usado por el Selector de Tareas.
        </p>
      </header>

      <section className="panel">
        <div className="tasks-legacy-tabs tasks-distributor-tabs">
          <button
            type="button"
            className={activeTab === "active" ? "is-active" : ""}
            onClick={() => setActiveTab("active")}
          >
            Tareas activas
          </button>
          <button
            type="button"
            className={activeTab === "config" ? "is-active" : ""}
            onClick={() => setActiveTab("config")}
          >
            Configuración
          </button>
        </div>

        {activeTab === "active" ? (
          <div className="tasks-distributor-active">
            <div className="panel-header">
              <div>
                <h2>Tareas activas ({moduleConfig.label})</h2>
                <p className="muted">
                  Registro de tareas distribuidas. Editar aqui actualiza la informacion que se ve en seguimiento y ejecucion.
                </p>
              </div>
              <span>{activeHistory.length} activas</span>
            </div>

            <div className="tasks-legacy-toolbar">
              <input
                className="tasks-legacy-input tasks-distributor-search"
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Buscar cliente..."
              />
              {executionModule ? (
                <button type="button" className="secondary-button" onClick={() => navigate(`/app/execution/${executionModule.slug}`)}>
                  Ir a Ejecución
                </button>
              ) : null}
            </div>

            <div className="table-scroll tasks-legacy-table-wrap">
              <table className="data-table tasks-legacy-table tasks-distributor-active-table">
                <thead>
                  <tr>
                    <th>No. Cliente</th>
                    <th>Cliente</th>
                    <th>Asunto</th>
                    <th>Proceso especifico</th>
                    <th>ID Asunto</th>
                    <th>Tarea</th>
                    <th>Tablas / tareas</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="centered-inline-message">Cargando tareas activas...</td>
                    </tr>
                  ) : activeHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="centered-inline-message">No hay tareas activas en este equipo.</td>
                    </tr>
                  ) : (
                    activeHistory.map((item) => {
                      const usedIds = new Set<string>();

                      return (
                        <tr key={item.id}>
                          <td>{item.clientNumber || "-"}</td>
                          <td>{item.clientName || "-"}</td>
                          <td>{item.subject || "-"}</td>
                          <td><span className="tasks-legacy-process-pill">{item.specificProcess || "N/A"}</span></td>
                          <td>{item.matterIdentifier || item.matterNumber || "-"}</td>
                          <td>
                            <strong>{item.eventName}</strong>
                            <span className="tasks-distributor-date">{item.createdAt.slice(0, 10)}</span>
                            <button type="button" className="danger-button tasks-distributor-small-button" onClick={() => void handleDeleteDistribution(item)}>
                              Borrar todo
                            </button>
                          </td>
                          <td>
                            <div className="tasks-active-target-list">
                              {item.targetTables.map((targetTable, index) => {
                                const record = resolveHistoryRecord(item, targetTable, index, usedIds);
                                const table = record ? tableBySlug.get(record.tableCode) : findLegacyTableByAnyName(moduleConfig, targetTable);
                                const completed = record ? isCompletedRecord(table, record) : false;
                                const danger = record ? isTrackingRecordRed(table, record) : true;
                                const canStepBack = Boolean(record && table?.mode === "workflow" && !completed && (record.workflowStage || 1) > 1);

                                return (
                                  <article
                                    key={`${item.id}-${targetTable}-${index}`}
                                    className={`tasks-active-target-card ${danger ? "is-danger" : completed ? "is-completed" : ""}`}
                                  >
                                    <div className="tasks-active-target-head">
                                      <div>
                                        <strong>{record?.taskName || item.eventNamesPerTable[index] || item.eventName}</strong>
                                        <span>{table?.title ?? getTableDisplayName(moduleConfig, targetTable)}</span>
                                        {record ? <small>{getStageLabel(table, record)}</small> : <small>Registro no encontrado</small>}
                                      </div>
                                      {record && table ? (
                                        <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/${table.slug}`)}>
                                          Ir
                                        </button>
                                      ) : null}
                                    </div>

                                    {record ? (
                                      <>
                                        <div className="tasks-active-target-fields">
                                          <input
                                            className="tasks-legacy-input"
                                            value={record.taskName}
                                            onChange={(event) => void patchRecord(record, { taskName: event.target.value })}
                                            aria-label="Nombre de la tarea"
                                          />
                                          <input
                                            className="tasks-legacy-input"
                                            value={record.responsible}
                                            onChange={(event) => void patchRecord(record, { responsible: event.target.value })}
                                            aria-label="Responsable"
                                          />
                                          {table?.showDateColumn === false ? null : (
                                            <input
                                              className="tasks-legacy-input"
                                              type="date"
                                              value={getRowDate(record)}
                                              onChange={(event) => void handleDateChange(record, table, event.target.value)}
                                              aria-label={table?.dateLabel ?? "Fecha"}
                                            />
                                          )}
                                        </div>
                                        <div className="tasks-legacy-actions">
                                          {completed ? (
                                            <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => void handleReopen(record, table)}>
                                              Reabrir
                                            </button>
                                          ) : (
                                            <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => void handleAdvance(record, table)}>
                                              {table?.mode === "workflow" ? "Avanzar" : "Completar"}
                                            </button>
                                          )}
                                          {canStepBack ? (
                                            <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => void handleStepBack(record, table)}>
                                              Regresar
                                            </button>
                                          ) : null}
                                          <button type="button" className="danger-button tasks-distributor-small-button" onClick={() => void handleDeleteRecord(record)}>
                                            Quitar
                                          </button>
                                        </div>
                                      </>
                                    ) : null}
                                  </article>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="tasks-distributor-config">
            <div className="panel-header">
              <div>
                <h2>Gestión de Catálogo de Tareas</h2>
                <p className="muted">
                  Define la tarea maestra y cuantas filas debe crear en cada tabla de seguimiento, igual que el catalogo de Intranet.
                </p>
              </div>
              <span>{events.length} configuradas</span>
            </div>

            <div className="tasks-distributor-config-layout">
              <article className="tasks-distributor-card">
                <label>
                  Nombre de la Tarea
                  <input
                    className="tasks-legacy-input"
                    value={catalogName}
                    onChange={(event) => setCatalogName(event.target.value)}
                    placeholder="Ej. Desahogar prevención"
                  />
                </label>

                <div className="tasks-distributor-table-count-grid">
                  {moduleConfig.tables.map((table) => {
                    const entries = catalogEntries.filter((entry) => entry.tableSlug === table.slug);

                    return (
                      <div key={table.slug} className="tasks-distributor-table-count-card">
                        <div className="tasks-distributor-target-head">
                          <strong>{table.title}</strong>
                          <div className="tasks-distributor-count-controls">
                            <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => removeCatalogEntry(table)}>
                              -
                            </button>
                            <span>{entries.length}</span>
                            <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => addCatalogEntry(table)}>
                              +
                            </button>
                          </div>
                        </div>
                        {entries.length > 0 ? (
                          <div className="tasks-distributor-entry-name-list">
                            {entries.map((entry) => (
                              <input
                                key={entry.id}
                                className="tasks-legacy-input"
                                value={entry.taskName}
                                onChange={(event) =>
                                  setCatalogEntries((current) =>
                                    current.map((candidate) =>
                                      candidate.id === entry.id ? { ...candidate, taskName: event.target.value } : candidate
                                    )
                                  )
                                }
                                placeholder="Nombre para esta tabla"
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="tasks-legacy-actions">
                  <button type="button" className="primary-action-button" onClick={() => void saveCatalogEvent()} disabled={!catalogName.trim() || catalogEntries.length === 0}>
                    {editingCatalogId ? "Guardar cambios" : "Guardar tarea"}
                  </button>
                  {editingCatalogId ? (
                    <button type="button" className="secondary-button" onClick={resetCatalogForm}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </article>

              <article className="tasks-distributor-card">
                <div className="panel-header">
                  <h3>Catálogo guardado</h3>
                  <span>{events.length}</span>
                </div>
                <div className="tasks-distributor-event-list">
                  {events.length === 0 ? (
                    <div className="centered-inline-message">Aun no hay tareas configuradas.</div>
                  ) : (
                    events.map((event) => {
                      const entries = getCatalogTargetEntries(event, moduleConfig);

                      return (
                        <div key={event.id} className="tasks-distributor-event-row tasks-distributor-catalog-row">
                          <div>
                            <strong>{event.name}</strong>
                            <span>{entries.length} destino{entries.length === 1 ? "" : "s"}</span>
                            <div className="tasks-legacy-chip-list">
                              {entries.map((entry) => (
                                <span key={entry.id}>{getTableDisplayName(moduleConfig, entry.tableSlug)}: {entry.taskName}</span>
                              ))}
                            </div>
                          </div>
                          <button type="button" className="secondary-button" onClick={() => startCatalogEdit(event)}>
                            Configurar
                          </button>
                          <button type="button" className="danger-button" onClick={() => void deleteCatalogEvent(event)}>
                            Eliminar
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
