import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { Matter, TaskDistributionEvent, TaskDistributionHistory } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { EXECUTION_MODULE_BY_SLUG } from "../execution/execution-config";
import { LEGACY_TASK_MODULE_BY_SLUG, type LegacyTaskTableConfig } from "./task-legacy-config";

interface TargetDraft {
  id: string;
  tableSlug: string;
  taskName: string;
  dueDate: string;
  termDate: string;
  reportedMonth: string;
}

function todayInput() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toMatterLabel(matter: Matter) {
  return `${matter.matterNumber} | ${matter.clientName} | ${matter.subject}`;
}

function makeTarget(table: LegacyTaskTableConfig, taskName = "Tarea"): TargetDraft {
  return {
    id: `${table.slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tableSlug: table.slug,
    taskName,
    dueDate: table.showDateColumn === false ? "" : todayInput(),
    termDate: table.autoTerm ? todayInput() : "",
    reportedMonth: ""
  };
}

export function TaskDistributorPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
  const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const [matters, setMatters] = useState<Matter[]>([]);
  const [events, setEvents] = useState<TaskDistributionEvent[]>([]);
  const [history, setHistory] = useState<TaskDistributionHistory[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventName, setEventName] = useState("");
  const [targets, setTargets] = useState<TargetDraft[]>([]);
  const [catalogName, setCatalogName] = useState("");
  const [catalogDefaultTaskName, setCatalogDefaultTaskName] = useState("");
  const [catalogTables, setCatalogTables] = useState<string[]>([]);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDistributor() {
    if (!moduleConfig || !executionModule) {
      return;
    }

    setLoading(true);
    try {
      const [loadedMatters, loadedEvents, loadedHistory] = await Promise.all([
        apiGet<Matter[]>("/matters"),
        apiGet<TaskDistributionEvent[]>(`/tasks/distribution-events?moduleId=${moduleConfig.moduleId}`),
        apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${moduleConfig.moduleId}`)
      ]);
      setMatters(loadedMatters.filter((matter) => matter.responsibleTeam === executionModule.team && !matter.deletedAt));
      setEvents(loadedEvents);
      setHistory(loadedHistory);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDistributor();
  }, [moduleConfig, executionModule]);

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId),
    [matters, selectedMatterId]
  );

  const tableBySlug = useMemo(
    () => new Map(moduleConfig?.tables.map((table) => [table.slug, table]) ?? []),
    [moduleConfig]
  );

  function applyEvent(eventId: string) {
    setSelectedEventId(eventId);
    const selected = events.find((event) => event.id === eventId);
    if (!selected || !moduleConfig) {
      return;
    }

    setEventName(selected.name);
    setTargets(
      selected.targetTables
        .map((tableSlug) => moduleConfig.tables.find((table) => table.slug === tableSlug))
        .filter((table): table is LegacyTaskTableConfig => Boolean(table))
        .map((table) => makeTarget(table, selected.defaultTaskName || selected.name))
    );
  }

  async function saveCatalogEvent() {
    if (!moduleConfig || !catalogName.trim()) {
      return;
    }

    const payload = {
      moduleId: moduleConfig.moduleId,
      name: catalogName.trim(),
      targetTables: catalogTables,
      defaultTaskName: catalogDefaultTaskName || null
    };

    if (editingCatalogId) {
      const updated = await apiPatch<TaskDistributionEvent>(`/tasks/distribution-events/${editingCatalogId}`, payload);
      setEvents((current) => current.map((event) => event.id === editingCatalogId ? updated : event));
    } else {
      const created = await apiPost<TaskDistributionEvent>("/tasks/distribution-events", payload);
      setEvents((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
    }

    setCatalogName("");
    setCatalogDefaultTaskName("");
    setCatalogTables([]);
    setEditingCatalogId(null);
  }

  async function deleteCatalogEvent(event: TaskDistributionEvent) {
    await apiDelete(`/tasks/distribution-events/${event.id}`);
    setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
    if (selectedEventId === event.id) {
      setSelectedEventId("");
      setEventName("");
      setTargets([]);
    }
  }

  async function distribute() {
    if (!moduleConfig || !selectedMatter || targets.length === 0 || !eventName.trim()) {
      return;
    }

    const created = await apiPost<TaskDistributionHistory>("/tasks/distributions", {
      moduleId: moduleConfig.moduleId,
      matterId: selectedMatter.id,
      matterNumber: selectedMatter.matterNumber,
      clientNumber: selectedMatter.clientNumber ?? null,
      clientName: selectedMatter.clientName,
      subject: selectedMatter.subject,
      specificProcess: selectedMatter.specificProcess ?? null,
      matterIdentifier: selectedMatter.matterIdentifier ?? null,
      eventName,
      responsible: moduleConfig.defaultResponsible,
      targets: targets.map((target) => {
        const table = tableBySlug.get(target.tableSlug);
        return {
          tableCode: target.tableSlug,
          sourceTable: table?.sourceTable ?? target.tableSlug,
          tableLabel: table?.title ?? target.tableSlug,
          taskName: target.taskName || eventName,
          dueDate: target.dueDate || null,
          termDate: target.termDate || target.dueDate || null,
          status: "pendiente",
          workflowStage: 1,
          reportedMonth: target.reportedMonth || null,
          createTerm: Boolean(table?.autoTerm),
          data: {
            distributedFrom: "tasks-distributor",
            tableTitle: table?.title
          }
        };
      })
    });

    setHistory((current) => [created, ...current]);
    setTargets([]);
    setEventName("");
    setSelectedEventId("");
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
          Crea registros en tablas de seguimiento y, cuando aplica, crea el termino maestro enlazado con
          `sourceTable/sourceRecordId`, igual que el flujo critico de Intranet.
        </p>
      </header>

      <section className="panel tasks-distributor-grid">
        <article className="tasks-distributor-card">
          <div className="panel-header">
            <h2>1. Catalogo de tareas</h2>
            <span>{events.length} configuradas</span>
          </div>
          <label>
            Nombre de tarea
            <input className="tasks-legacy-input" value={catalogName} onChange={(event) => setCatalogName(event.target.value)} />
          </label>
          <label>
            Nombre por defecto en tablas
            <input className="tasks-legacy-input" value={catalogDefaultTaskName} onChange={(event) => setCatalogDefaultTaskName(event.target.value)} />
          </label>
          <div className="tasks-distributor-table-picker">
            {moduleConfig.tables.map((table) => (
              <label key={table.slug} className="tasks-distributor-checkbox">
                <input
                  type="checkbox"
                  checked={catalogTables.includes(table.slug)}
                  onChange={(event) =>
                    setCatalogTables((current) =>
                      event.target.checked
                        ? [...current, table.slug]
                        : current.filter((tableSlug) => tableSlug !== table.slug)
                    )
                  }
                />
                <span>{table.title}</span>
              </label>
            ))}
          </div>
          <div className="tasks-legacy-actions">
            <button type="button" className="primary-action-button" onClick={() => void saveCatalogEvent()}>
              {editingCatalogId ? "Guardar cambios" : "Guardar tarea"}
            </button>
            {editingCatalogId ? (
              <button type="button" className="secondary-button" onClick={() => { setEditingCatalogId(null); setCatalogName(""); setCatalogDefaultTaskName(""); setCatalogTables([]); }}>
                Cancelar
              </button>
            ) : null}
          </div>
          <div className="tasks-distributor-event-list">
            {events.map((event) => (
              <div key={event.id} className="tasks-distributor-event-row">
                <div>
                  <strong>{event.name}</strong>
                  <span>{event.targetTables.length} tablas</span>
                </div>
                <button type="button" className="secondary-button" onClick={() => {
                  setEditingCatalogId(event.id);
                  setCatalogName(event.name);
                  setCatalogDefaultTaskName(event.defaultTaskName ?? "");
                  setCatalogTables(event.targetTables);
                }}>
                  Configurar
                </button>
                <button type="button" className="danger-button" onClick={() => void deleteCatalogEvent(event)}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="tasks-distributor-card">
          <div className="panel-header">
            <h2>2. Enviar a seguimiento</h2>
            <span>{targets.length} destinos</span>
          </div>
          <label>
            Asunto origen
            <select className="tasks-legacy-input" value={selectedMatterId} onChange={(event) => setSelectedMatterId(event.target.value)}>
              <option value="">Selecciona un asunto</option>
              {matters.map((matter) => <option key={matter.id} value={matter.id}>{toMatterLabel(matter)}</option>)}
            </select>
          </label>
          <label>
            Tarea configurada
            <select className="tasks-legacy-input" value={selectedEventId} onChange={(event) => applyEvent(event.target.value)}>
              <option value="">Selecciona una tarea guardada</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <label>
            Nombre del evento a distribuir
            <input className="tasks-legacy-input" value={eventName} onChange={(event) => setEventName(event.target.value)} />
          </label>
          <label>
            Agregar tabla manualmente
            <select
              className="tasks-legacy-input"
              value=""
              onChange={(event) => {
                const table = moduleConfig.tables.find((candidate) => candidate.slug === event.target.value);
                if (table) {
                  setTargets((current) => [...current, makeTarget(table, eventName || "Tarea")]);
                }
              }}
            >
              <option value="">Selecciona tabla</option>
              {moduleConfig.tables.map((table) => <option key={table.slug} value={table.slug}>{table.title}</option>)}
            </select>
          </label>

          <div className="tasks-distributor-target-list">
            {targets.map((target) => {
              const table = tableBySlug.get(target.tableSlug);
              return (
                <div key={target.id} className="tasks-distributor-target-card">
                  <div className="tasks-distributor-target-head">
                    <strong>{table?.title ?? target.tableSlug}</strong>
                    <button type="button" className="danger-button" onClick={() => setTargets((current) => current.filter((candidate) => candidate.id !== target.id))}>
                      Quitar
                    </button>
                  </div>
                  <label>
                    Tarea en esta tabla
                    <input
                      className="tasks-legacy-input"
                      value={target.taskName}
                      onChange={(event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate))}
                    />
                  </label>
                  {table?.showDateColumn === false ? null : (
                    <label>
                      {table?.dateLabel ?? "Fecha limite"}
                      <input
                        className="tasks-legacy-input"
                        type="date"
                        value={target.dueDate}
                        onChange={(event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, dueDate: event.target.value } : candidate))}
                      />
                    </label>
                  )}
                  {table?.autoTerm ? (
                    <label>
                      Fecha de termino
                      <input
                        className="tasks-legacy-input"
                        type="date"
                        value={target.termDate}
                        onChange={(event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, termDate: event.target.value } : candidate))}
                      />
                    </label>
                  ) : null}
                  {table?.showReportedPeriod ? (
                    <label>
                      {table.reportedPeriodLabel ?? "Mes reportado"}
                      <input
                        className="tasks-legacy-input"
                        type="month"
                        value={target.reportedMonth}
                        onChange={(event) => setTargets((current) => current.map((candidate) => candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate))}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="primary-action-button"
            disabled={loading || !selectedMatter || targets.length === 0 || !eventName.trim()}
            onClick={() => void distribute()}
          >
            Distribuir tareas
          </button>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Historial del distribuidor</h2>
          <span>{history.length} movimientos</span>
        </div>
        <div className="table-scroll">
          <table className="data-table tasks-legacy-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Asunto</th>
                <th>Evento</th>
                <th>Tablas destino</th>
                <th>Created IDs</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="centered-inline-message">Aun no hay movimientos del distribuidor.</td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id}>
                    <td>{item.createdAt.slice(0, 10)}</td>
                    <td>{item.clientName || "-"}</td>
                    <td>{item.subject || "-"}</td>
                    <td>{item.eventName}</td>
                    <td>{item.targetTables.join(", ")}</td>
                    <td><code>{Object.keys(item.createdIds).length} enlaces</code></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
