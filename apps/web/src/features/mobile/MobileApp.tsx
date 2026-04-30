import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import type {
  Client,
  Matter,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskTerm,
  TaskTrackingRecord
} from "@sige/contracts";

import { apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import type { ExecutionModuleDescriptor } from "../execution/execution-config";
import { getCatalogTargetEntries, getTableDisplayName } from "../tasks/task-distribution-utils";
import { LEGACY_TASK_MODULE_BY_ID } from "../tasks/task-legacy-config";
import type { LegacyTaskModuleConfig } from "../tasks/task-legacy-config";

type MobileTaskTarget = {
  id: string;
  tableSlug: string;
  taskName: string;
  reportedMonth: string;
};

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function todayInput() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
}

function getEffectiveClientNumber(matter: Matter, clients: Client[]) {
  const normalizedName = normalizeComparableText(matter.clientName);
  const match = clients.find((client) => normalizeComparableText(client.name) === normalizedName);
  return match?.clientNumber ?? normalizeText(matter.clientNumber);
}

function getMatterRecordKeys(matter: Matter) {
  return new Set([matter.id, matter.matterNumber, matter.matterIdentifier].map(normalizeText).filter(Boolean));
}

function recordBelongsToMatter(record: TaskTrackingRecord | TaskTerm, matter: Matter) {
  const keys = getMatterRecordKeys(matter);
  return keys.has(normalizeText(record.matterId)) ||
    keys.has(normalizeText(record.matterNumber)) ||
    keys.has(normalizeText(record.matterIdentifier));
}

function isPendingRecord(record: TaskTrackingRecord | TaskTerm) {
  return record.status === "pendiente" && !record.deletedAt;
}

function sortByDate<T extends { dueDate?: string; termDate?: string; createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) =>
    (toDateInput(left.dueDate ?? left.termDate) || left.createdAt || "").localeCompare(
      toDateInput(right.dueDate ?? right.termDate) || right.createdAt || ""
    )
  );
}

function getRecordDate(record: TaskTrackingRecord | TaskTerm) {
  return toDateInput(record.dueDate ?? record.termDate);
}

function getRecordTitle(record: TaskTrackingRecord | TaskTerm) {
  if ("taskName" in record && normalizeText(record.taskName)) {
    return record.taskName;
  }

  if ("pendingTaskLabel" in record) {
    return record.pendingTaskLabel || record.eventName || record.subject || "Tarea";
  }

  return record.eventName || record.subject || "Tarea";
}

function getRecordStatusLabel(status: string) {
  if (status === "presentado" || status === "concluida") {
    return "Concluida";
  }

  return "Pendiente";
}

function isRecordOverdue(record: TaskTrackingRecord | TaskTerm) {
  const dueDate = getRecordDate(record);
  return isPendingRecord(record) && Boolean(dueDate) && dueDate <= todayInput();
}

function buildDistributionPayload(
  module: ExecutionModuleDescriptor,
  legacyConfig: LegacyTaskModuleConfig,
  matter: Matter,
  clients: Client[],
  eventName: string,
  responsible: string,
  dueDate: string,
  targets: MobileTaskTarget[]
) {
  return {
    moduleId: module.moduleId,
    matterId: matter.id,
    matterNumber: matter.matterNumber,
    clientNumber: getEffectiveClientNumber(matter, clients),
    clientName: matter.clientName || "Sin cliente",
    subject: matter.subject || "",
    specificProcess: matter.specificProcess ?? null,
    matterIdentifier: matter.matterIdentifier ?? null,
    eventName,
    responsible,
    targets: targets.map((target) => {
      const table = legacyConfig.tables.find((candidate) => candidate.slug === target.tableSlug);
      const taskName = target.taskName.trim() || table?.title || eventName;

      return {
        tableCode: target.tableSlug,
        sourceTable: table?.sourceTable ?? target.tableSlug,
        tableLabel: table?.title ?? target.tableSlug,
        taskName,
        dueDate,
        termDate: table?.autoTerm ? dueDate : null,
        status: "pendiente",
        workflowStage: 1,
        reportedMonth: target.reportedMonth || null,
        createTerm: Boolean(table?.autoTerm),
        data: {
          source: "mobile-execution",
          tableTitle: table?.title,
          activeSource: "mobile"
        }
      };
    })
  };
}

export function MobileProtectedLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <div className="mobile-centered">Cargando SIGE...</div>;
  }

  if (!user) {
    return <Navigate to="/intranet-login" replace />;
  }

  return (
    <div className="mobile-app-shell">
      <header className="mobile-topbar">
        <div>
          <strong>SIGE movil</strong>
          <span>{user.displayName}</span>
        </div>
        <button type="button" onClick={logout}>Salir</button>
      </header>

      <main className="mobile-content">
        <Outlet />
      </main>

      <nav className="mobile-tabbar" aria-label="Navegacion movil">
        <NavLink to="/mobile" end>Inicio</NavLink>
        <NavLink to="/mobile/execution">Ejecucion</NavLink>
        <NavLink to="/mobile/tracking">Seguimiento</NavLink>
        <NavLink to="/app">Web</NavLink>
      </nav>
    </div>
  );
}

export function MobileHomePage() {
  const { user } = useAuth();
  const visibleModules = getVisibleExecutionModules(user);

  return (
    <section className="mobile-stack">
      <div className="mobile-hero">
        <p className="mobile-eyebrow">Operacion diaria</p>
        <h1>Crear tareas y revisar seguimiento</h1>
        <p>Entrada rapida al modulo de ejecucion y a las tablas del manager de tareas.</p>
      </div>

      <div className="mobile-action-grid">
        <Link className="mobile-primary-action" to="/mobile/execution">
          Crear tarea de ejecucion
        </Link>
        <Link className="mobile-secondary-action" to="/mobile/tracking">
          Consultar tablas
        </Link>
      </div>

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Tus equipos</h2>
          <span>{visibleModules.length}</span>
        </div>
        <div className="mobile-card-list">
          {visibleModules.map((module) => (
            <Link key={module.moduleId} className="mobile-module-card" to={`/mobile/execution/${module.slug}`}>
              <strong>{module.label}</strong>
              <span>{module.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}

export function MobileExecutionIndexPage() {
  const { user } = useAuth();
  const visibleModules = getVisibleExecutionModules(user);

  if (visibleModules.length === 1 && user?.team !== "CLIENT_RELATIONS" && user?.team !== "ADMIN" && user?.role !== "SUPERADMIN") {
    return <Navigate to={`/mobile/execution/${visibleModules[0].slug}`} replace />;
  }

  return (
    <section className="mobile-stack">
      <MobilePageTitle title="Ejecucion" subtitle="Selecciona el equipo para crear tareas desde asuntos activos." />
      <div className="mobile-card-list">
        {visibleModules.map((module) => (
          <Link key={module.moduleId} className="mobile-module-card" to={`/mobile/execution/${module.slug}`}>
            <strong>{module.label}</strong>
            <span>{module.shortLabel}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MobilePageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mobile-page-title">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

export function MobileExecutionTeamPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
  const visibleModules = getVisibleExecutionModules(user);
  const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));

  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [records, setRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [events, setEvents] = useState<TaskDistributionEvent[]>([]);
  const [histories, setHistories] = useState<TaskDistributionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [targets, setTargets] = useState<MobileTaskTarget[]>([]);
  const [responsible, setResponsible] = useState(user?.shortName || module?.defaultResponsible || "");
  const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
  const [submitting, setSubmitting] = useState(false);

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId) ?? null,
    [matters, selectedMatterId]
  );
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  async function loadModuleData() {
    if (!module) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const [
        loadedClients,
        loadedMatters,
        loadedRecords,
        loadedTerms,
        loadedEvents,
        loadedHistories
      ] = await Promise.all([
        apiGet<Client[]>("/clients"),
        apiGet<Matter[]>("/matters"),
        apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${module.moduleId}`),
        apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${module.moduleId}`),
        apiGet<TaskDistributionEvent[]>(`/tasks/distribution-events?moduleId=${module.moduleId}`),
        apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${module.moduleId}`)
      ]);

      setClients(loadedClients);
      setMatters(loadedMatters.filter((matter) => matter.responsibleTeam === module.team));
      setRecords(loadedRecords);
      setTerms(loadedTerms);
      setEvents(loadedEvents);
      setHistories(loadedHistories);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (module && canAccess) {
      void loadModuleData();
    }
  }, [module?.moduleId, canAccess]);

  useEffect(() => {
    setResponsible(user?.shortName || module?.defaultResponsible || "");
  }, [module?.moduleId, user?.shortName]);

  if (!module || !legacyConfig || !canAccess) {
    return <Navigate to="/mobile/execution" replace />;
  }

  const currentModule = module;
  const currentLegacyConfig = legacyConfig;

  const filteredMatters = matters.filter((matter) => {
    const query = normalizeComparableText(search);
    if (!query) {
      return true;
    }

    return normalizeComparableText([
      matter.clientName,
      matter.subject,
      matter.specificProcess,
      matter.matterIdentifier,
      matter.matterNumber,
      getEffectiveClientNumber(matter, clients)
    ].join(" ")).includes(query);
  });

  const matterRecords = selectedMatter
    ? sortByDate(records.filter((record) => recordBelongsToMatter(record, selectedMatter)).filter(isPendingRecord))
    : [];
  const matterTerms = selectedMatter
    ? sortByDate(terms.filter((term) => recordBelongsToMatter(term, selectedMatter)).filter(isPendingRecord))
    : [];

  function handleEventChange(eventId: string) {
    const nextEvent = events.find((event) => event.id === eventId);
    setSelectedEventId(eventId);
    setSuccessMessage(null);
    setTargets(
      nextEvent
        ? getCatalogTargetEntries(nextEvent, currentLegacyConfig).map((target) => ({ ...target, reportedMonth: "" }))
        : []
    );
  }

  async function handleSubmit() {
    if (!selectedMatter || !selectedEvent || targets.length === 0) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiPost(
        "/tasks/distributions",
        buildDistributionPayload(
          currentModule,
          currentLegacyConfig,
          selectedMatter,
          clients,
          selectedEvent.name,
          responsible.trim() || currentModule.defaultResponsible,
          dueDate,
          targets
        )
      );
      setSelectedEventId("");
      setTargets([]);
      setSuccessMessage("Tarea enviada al manager de tareas.");
      await loadModuleData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mobile-stack">
      <MobilePageTitle title={currentModule.label} subtitle="Crea tareas y revisa pendientes ligados al asunto." />

      {errorMessage ? <div className="mobile-alert mobile-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="mobile-alert mobile-alert-success">{successMessage}</div> : null}

      <label className="mobile-field">
        <span>Buscar asunto</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, asunto, ID..." />
      </label>

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Asuntos</h2>
          <span>{filteredMatters.length}</span>
        </div>

        <div className="mobile-card-list">
          {loading ? (
            <div className="mobile-empty">Cargando asuntos...</div>
          ) : filteredMatters.length === 0 ? (
            <div className="mobile-empty">No hay asuntos para esta busqueda.</div>
          ) : (
            filteredMatters.map((matter) => {
              const pendingCount =
                records.filter((record) => recordBelongsToMatter(record, matter)).filter(isPendingRecord).length +
                terms.filter((term) => recordBelongsToMatter(term, matter)).filter(isPendingRecord).length;

              return (
                <button
                  key={matter.id}
                  type="button"
                  className={`mobile-matter-card${matter.id === selectedMatterId ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelectedMatterId(matter.id);
                    setSuccessMessage(null);
                  }}
                >
                  <strong>{matter.clientName || "Sin cliente"}</strong>
                  <span>{matter.subject || "Sin asunto"}</span>
                  <small>
                    {getEffectiveClientNumber(matter, clients) || "S/N"} | {matter.matterIdentifier || matter.matterNumber || "Sin ID"} | {pendingCount} pendientes
                  </small>
                </button>
              );
            })
          )}
        </div>
      </section>

      {selectedMatter ? (
        <section className="mobile-section mobile-form-panel">
          <div className="mobile-section-head">
            <h2>Nueva tarea</h2>
            <span>{selectedMatter.clientName}</span>
          </div>

          <label className="mobile-field">
            <span>Selector de tareas</span>
            <select value={selectedEventId} onChange={(event) => handleEventChange(event.target.value)}>
              <option value="">Seleccionar...</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
          </label>

          <div className="mobile-two-fields">
            <label className="mobile-field">
              <span>Responsable</span>
              <input value={responsible} onChange={(event) => setResponsible(event.target.value)} />
            </label>
            <label className="mobile-field">
              <span>Fecha</span>
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>

          {targets.length > 0 ? (
            <div className="mobile-target-list">
              {targets.map((target) => {
                const table = currentLegacyConfig.tables.find((candidate) => candidate.slug === target.tableSlug);
                return (
                  <article key={target.id} className="mobile-target-card">
                    <div>
                      <strong>{getTableDisplayName(currentLegacyConfig, target.tableSlug)}</strong>
                      <button
                        type="button"
                        onClick={() => setTargets((current) => current.filter((candidate) => candidate.id !== target.id))}
                      >
                        Quitar
                      </button>
                    </div>
                    <label className="mobile-field">
                      <span>Nombre del registro</span>
                      <input
                        value={target.taskName}
                        onChange={(event) =>
                          setTargets((current) =>
                            current.map((candidate) =>
                              candidate.id === target.id ? { ...candidate, taskName: event.target.value } : candidate
                            )
                          )
                        }
                      />
                    </label>
                    {table?.showReportedPeriod ? (
                      <label className="mobile-field">
                        <span>{table.reportedPeriodLabel ?? "Periodo reportado"}</span>
                        <input
                          type="month"
                          value={target.reportedMonth}
                          onChange={(event) =>
                            setTargets((current) =>
                              current.map((candidate) =>
                                candidate.id === target.id ? { ...candidate, reportedMonth: event.target.value } : candidate
                              )
                            )
                          }
                        />
                      </label>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            className="mobile-submit"
            disabled={submitting || !selectedEvent || targets.length === 0 || !dueDate}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Enviando..." : "Enviar al manager de tareas"}
          </button>
        </section>
      ) : null}

      {selectedMatter ? (
        <section className="mobile-section">
          <div className="mobile-section-head">
            <h2>Pendientes del asunto</h2>
            <span>{matterRecords.length + matterTerms.length}</span>
          </div>
          <MobileRecordList records={[...matterRecords, ...matterTerms]} legacyConfig={currentLegacyConfig} histories={histories} />
        </section>
      ) : null}
    </section>
  );
}

export function MobileTrackingIndexPage() {
  const { user } = useAuth();
  const visibleModules = getVisibleExecutionModules(user);

  return (
    <section className="mobile-stack">
      <MobilePageTitle title="Seguimiento" subtitle="Consulta rapida de tablas del manager de tareas." />
      <div className="mobile-card-list">
        {visibleModules.map((module) => (
          <Link key={module.moduleId} className="mobile-module-card" to={`/mobile/tracking/${module.slug}`}>
            <strong>{module.label}</strong>
            <span>Ver tablas</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MobileTrackingModulePage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
  const visibleModules = getVisibleExecutionModules(user);
  const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));

  if (!module || !legacyConfig || !canAccess) {
    return <Navigate to="/mobile/tracking" replace />;
  }

  return (
    <section className="mobile-stack">
      <MobilePageTitle title={module.label} subtitle="Tablas de seguimiento disponibles." />
      <div className="mobile-card-list">
        {legacyConfig.tables.map((table) => (
          <Link key={table.slug} className="mobile-table-link" to={`/mobile/tracking/${module.slug}/${table.slug}`}>
            <strong>{table.title}</strong>
            <span>{table.dateLabel}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MobileTrackingTablePage() {
  const { slug, tableId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
  const table = legacyConfig?.tables.find((candidate) => candidate.slug === tableId);
  const visibleModules = getVisibleExecutionModules(user);
  const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
  const [records, setRecords] = useState<TaskTrackingRecord[]>([]);
  const [histories, setHistories] = useState<TaskDistributionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "done">("pending");
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!module || !table || !canAccess) {
      return;
    }

    async function loadRecords() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [loadedRecords, loadedHistories] = await Promise.all([
          apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${module!.moduleId}&tableCode=${table!.slug}`),
          apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${module!.moduleId}`)
        ]);
        setRecords(loadedRecords);
        setHistories(loadedHistories);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void loadRecords();
  }, [module?.moduleId, table?.slug, canAccess]);

  if (!module || !legacyConfig || !table || !canAccess) {
    return <Navigate to="/mobile/tracking" replace />;
  }

  const visibleRecords = sortByDate(records)
    .filter((record) => statusFilter === "pending" ? isPendingRecord(record) : !isPendingRecord(record))
    .filter((record) => {
      const query = normalizeComparableText(search);
      if (!query) {
        return true;
      }

      return normalizeComparableText([
        record.clientNumber,
        record.clientName,
        record.subject,
        record.specificProcess,
        record.matterIdentifier,
        record.taskName,
        record.responsible
      ].join(" ")).includes(query);
    });

  return (
    <section className="mobile-stack">
      <button type="button" className="mobile-back-button" onClick={() => navigate(`/mobile/tracking/${module.slug}`)}>
        Volver a tablas
      </button>
      <MobilePageTitle title={table.title} subtitle={table.dateLabel} />

      {errorMessage ? <div className="mobile-alert mobile-alert-error">{errorMessage}</div> : null}

      <div className="mobile-segmented">
        <button type="button" className={statusFilter === "pending" ? "is-active" : ""} onClick={() => setStatusFilter("pending")}>
          Pendientes
        </button>
        <button type="button" className={statusFilter === "done" ? "is-active" : ""} onClick={() => setStatusFilter("done")}>
          Concluidas
        </button>
      </div>

      <label className="mobile-field">
        <span>Buscar</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, tarea, ID..." />
      </label>

      {loading ? (
        <div className="mobile-empty">Cargando registros...</div>
      ) : (
        <MobileRecordList records={visibleRecords} legacyConfig={legacyConfig} histories={histories} />
      )}
    </section>
  );
}

function MobileRecordList({
  records,
  legacyConfig,
  histories
}: {
  records: Array<TaskTrackingRecord | TaskTerm>;
  legacyConfig: LegacyTaskModuleConfig;
  histories: TaskDistributionHistory[];
}) {
  if (records.length === 0) {
    return <div className="mobile-empty">No hay registros para mostrar.</div>;
  }

  const historyTaskNames = new Map<string, string>();
  histories.forEach((history) => {
    Object.entries(history.createdIds ?? {}).forEach(([key, id]) => {
      const match = key.match(/_(\d+)$/);
      const index = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;
      const taskName = Number.isNaN(index) ? "" : history.eventNamesPerTable[index] ?? "";
      if (taskName) {
        historyTaskNames.set(String(id), taskName);
      }
    });
  });

  return (
    <div className="mobile-card-list">
      {records.map((record) => {
        const title = historyTaskNames.get(record.id) || getRecordTitle(record);
        const tableLabel = "tableCode" in record ? getTableDisplayName(legacyConfig, record.tableCode) : "Terminos";
        return (
          <article key={record.id} className={`mobile-record-card${isRecordOverdue(record) ? " is-overdue" : ""}`}>
            <div className="mobile-record-card-head">
              <strong>{title}</strong>
              <span>{getRecordStatusLabel(record.status)}</span>
            </div>
            <dl>
              <div>
                <dt>Cliente</dt>
                <dd>{record.clientName || "-"}</dd>
              </div>
              <div>
                <dt>Asunto</dt>
                <dd>{record.subject || "-"}</dd>
              </div>
              <div>
                <dt>Tabla</dt>
                <dd>{tableLabel}</dd>
              </div>
              <div>
                <dt>Responsable</dt>
                <dd>{record.responsible || "-"}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{getRecordDate(record) || "-"}</dd>
              </div>
              {"reportedMonth" in record && record.reportedMonth ? (
                <div>
                  <dt>Periodo</dt>
                  <dd>{record.reportedMonth}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
