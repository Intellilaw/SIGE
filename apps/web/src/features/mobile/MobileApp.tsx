import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import type {
  Client,
  Matter,
  TaskAdditionalTask,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskTerm,
  TaskTrackingRecord
} from "@sige/contracts";
import { APP_VERSION_LABEL, APP_VERSION_TEXT } from "@sige/contracts";

import { apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import type { ExecutionModuleDescriptor } from "../execution/execution-config";
import { findLegacyTableByAnyName, getCatalogTargetEntries, getTableDisplayName } from "../tasks/task-distribution-utils";
import {
  buildDistributionHistoryTaskNameMap,
  hasMeaningfulTaskLabel,
  isTrackingTermEnabled,
  resolveHistoryTaskName,
  resolveTrackingTaskName,
  usesPresentationAndTermDates
} from "../tasks/task-display-utils";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID, type TaskDashboardMember } from "../tasks/task-dashboard-config";
import { LEGACY_TASK_MODULE_BY_ID } from "../tasks/task-legacy-config";
import type { LegacyTaskModuleConfig, LegacyTaskTableConfig } from "../tasks/task-legacy-config";

type MobileTaskTarget = {
  id: string;
  tableSlug: string;
  taskName: string;
  reportedMonth: string;
};

type MobileDashboardTimeframe = "anteriores" | "hoy" | "manana" | "posteriores";

type MobileDashboardRow = {
  id: string;
  title: string;
  typeLabel: string;
  date: string;
  clientName: string;
  clientNumber: string;
  subject: string;
  originLabel: string;
  highlighted: boolean;
};

const MOBILE_TIMEFRAMES: Array<{ id: MobileDashboardTimeframe; label: string }> = [
  { id: "anteriores", label: "Realizadas" },
  { id: "hoy", label: "Hoy" },
  { id: "manana", label: "Manana" },
  { id: "posteriores", label: "Posteriores" }
];

const TERMS_TABLE_ID = "terminos";
const RECURRING_TERMS_TABLE_ID = "terminos-recurrentes";

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

function localDateInput(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);

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

function isCompletedStatus(status: string) {
  return status === "presentado" || status === "concluida";
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
  if ("taskName" in record && hasMeaningfulTaskLabel(record.taskName)) {
    return record.taskName;
  }

  if ("pendingTaskLabel" in record) {
    return hasMeaningfulTaskLabel(record.pendingTaskLabel) ? record.pendingTaskLabel : record.eventName || record.subject || "Tarea";
  }

  return record.eventName || record.subject || "Tarea";
}

function findTrackingTable(moduleConfig: LegacyTaskModuleConfig, record: TaskTrackingRecord) {
  return findLegacyTableByAnyName(moduleConfig, record.tableCode)
    ?? findLegacyTableByAnyName(moduleConfig, record.sourceTable);
}

function isCompletedTrackingRecord(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (isCompletedStatus(record.status)) {
    return true;
  }

  return Boolean(table && table.mode === "workflow" && record.workflowStage >= table.tabs.length);
}

function trackingRecordMatchesTable(
  moduleConfig: LegacyTaskModuleConfig,
  record: TaskTrackingRecord,
  table: LegacyTaskTableConfig
) {
  return findTrackingTable(moduleConfig, record)?.slug === table.slug;
}

function getManagerTermDate(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  const explicitTerm = toDateInput(record.termDate);
  if (usesPresentationAndTermDates(table)) {
    return isTrackingTermEnabled(record, table) ? explicitTerm : "";
  }

  if (explicitTerm) {
    return explicitTerm;
  }

  if (table && !usesPresentationAndTermDates(table) && (table.autoTerm || table.termManagedDate)) {
    return toDateInput(record.dueDate);
  }

  return "";
}

function isManagerTermRecord(moduleConfig: LegacyTaskModuleConfig, record: TaskTrackingRecord) {
  const table = findTrackingTable(moduleConfig, record);
  if (!table) {
    return false;
  }

  if (usesPresentationAndTermDates(table)) {
    return !isCompletedTrackingRecord(table, record) && isTrackingTermEnabled(record, table);
  }

  return !isCompletedTrackingRecord(table, record)
    && Boolean(getManagerTermDate(table, record))
    && Boolean(table.autoTerm || table.termManagedDate);
}

function getLinkedTerm(terms: TaskTerm[], record: TaskTrackingRecord) {
  return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}

function termFromTrackingRecord(
  moduleConfig: LegacyTaskModuleConfig,
  record: TaskTrackingRecord,
  linkedTerm: TaskTerm | undefined
): TaskTerm {
  const table = findTrackingTable(moduleConfig, record);
  const taskName = resolveTrackingTaskName(record, table, undefined, record.eventName);

  return {
    ...(linkedTerm ?? {
      id: `manager-term-${record.id}`,
      verification: {},
      data: record.data,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }),
    moduleId: record.moduleId,
    sourceTable: record.sourceTable,
    sourceRecordId: record.id,
    matterId: record.matterId,
    matterNumber: record.matterNumber,
    clientNumber: record.clientNumber,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess,
    matterIdentifier: record.matterIdentifier,
    eventName: taskName || record.eventName || "Termino",
    pendingTaskLabel: taskName || undefined,
    responsible: record.responsible,
    dueDate: record.dueDate,
    termDate: getManagerTermDate(table, record),
    status: record.status,
    recurring: false,
    reportedMonth: record.reportedMonth,
    deletedAt: record.deletedAt
  };
}

function buildVisibleTerms(moduleConfig: LegacyTaskModuleConfig, terms: TaskTerm[], records: TaskTrackingRecord[], recurring: boolean) {
  if (recurring) {
    return terms.filter((term) => term.recurring && !term.deletedAt);
  }

  return records
    .filter((record) => isManagerTermRecord(moduleConfig, record))
    .map((record) => termFromTrackingRecord(moduleConfig, record, getLinkedTerm(terms, record)));
}

function splitResponsibleAliases(value?: string | null) {
  const normalized = normalizeComparableText(value).replace(/\s*\/\s*/g, "/");
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s*(?:\/|,|;|&|\by\b)\s*/u)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function matchesResponsible(taskResponsible: string, member: TaskDashboardMember, sharedAliases: string[]) {
  const normalizedResponsible = normalizeComparableText(taskResponsible).replace(/\s*\/\s*/g, "/");
  const responsibleAliases = splitResponsibleAliases(taskResponsible);
  const memberAliases = member.aliases.map((alias) => normalizeComparableText(alias));
  const shared = sharedAliases.map((alias) => normalizeComparableText(alias).replace(/\s*\/\s*/g, "/"));

  return memberAliases.includes(normalizedResponsible)
    || responsibleAliases.some((alias) => memberAliases.includes(alias))
    || shared.includes(normalizedResponsible);
}

function belongsToTimeframe(input: { state: "open" | "closed"; date: string }, timeframe: MobileDashboardTimeframe) {
  const today = localDateInput();
  const tomorrow = localDateInput(1);

  if (timeframe === "anteriores") {
    return input.state === "closed";
  }

  if (input.state === "closed") {
    return false;
  }

  if (timeframe === "hoy") {
    return !input.date || input.date <= today;
  }

  if (timeframe === "manana") {
    return input.date === tomorrow;
  }

  return input.date > tomorrow;
}

function isVerificationComplete(term: TaskTerm) {
  const values = Object.values(term.verification ?? {});
  return values.length > 0 && values.every((value) => ["si", "yes"].includes(normalizeComparableText(value)));
}

function getTrackingDashboardDate(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  const dates = [toDateInput(record.dueDate)];
  const termDate = toDateInput(record.termDate);

  if (isTrackingTermEnabled(record, table) && termDate) {
    dates.push(termDate);
  }

  if (!usesPresentationAndTermDates(table) && !dates[0] && termDate) {
    dates.push(termDate);
  }

  return dates.filter(Boolean).sort()[0] ?? "";
}

function getDashboardMemberForUser(member: TaskDashboardMember, user?: { shortName?: string; displayName?: string; username?: string } | null) {
  const userAliases = [user?.shortName, user?.displayName, user?.username].map((value) => normalizeComparableText(value));
  return member.aliases.some((alias) => userAliases.includes(normalizeComparableText(alias))) || userAliases.includes(normalizeComparableText(member.id));
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
          <strong>SIGE movil <span className="mobile-topbar-version">{APP_VERSION_LABEL}</span></strong>
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
        <NavLink to="/mobile/dashboard">Dashboard</NavLink>
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
        <div className="mobile-hero-version-row">
          <p className="mobile-eyebrow">Operacion diaria</p>
          <span className="mobile-version-badge">{APP_VERSION_TEXT}</span>
        </div>
        <h1>Crear tareas y revisar seguimiento</h1>
        <p>Entrada rapida al modulo de ejecucion y a las tablas del manager de tareas.</p>
      </div>

      <section className="mobile-version-card" aria-label="Version instalada">
        <span>Version instalada</span>
        <strong>{APP_VERSION_LABEL}</strong>
      </section>

      <div className="mobile-action-grid">
        <Link className="mobile-primary-action" to="/mobile/execution">
          Crear tarea de ejecucion
        </Link>
        <Link className="mobile-secondary-action" to="/mobile/tracking">
          Consultar tablas
        </Link>
        <Link className="mobile-secondary-action" to="/mobile/dashboard">
          Ver dashboard
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

function MobileMatterSummary({
  matter,
  clientNumber
}: {
  matter: Matter;
  clientNumber: string;
}) {
  return (
    <article className="mobile-matter-summary" aria-label="Resumen del asunto seleccionado">
      <div className="mobile-matter-summary-head">
        <div>
          <span>Asunto seleccionado</span>
          <strong>{matter.clientName || "Cliente sin nombre"}</strong>
        </div>
        <span>{matter.matterIdentifier || matter.matterNumber || "Sin ID"}</span>
      </div>

      <dl>
        <div>
          <dt>ID Asunto</dt>
          <dd>{matter.matterIdentifier || matter.matterNumber || "-"}</dd>
        </div>
        <div>
          <dt>No. Cliente</dt>
          <dd>{clientNumber || matter.clientNumber || "-"}</dd>
        </div>
        <div>
          <dt>Cliente</dt>
          <dd>{matter.clientName || "-"}</dd>
        </div>
        <div>
          <dt>Asunto / Expediente</dt>
          <dd>{matter.subject || "-"}</dd>
        </div>
        <div>
          <dt>Proceso especifico</dt>
          <dd>{matter.specificProcess || "-"}</dd>
        </div>
      </dl>
    </article>
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
  const [eventSearch, setEventSearch] = useState("");
  const [eventSearchOpen, setEventSearchOpen] = useState(false);
  const [targets, setTargets] = useState<MobileTaskTarget[]>([]);
  const [responsible, setResponsible] = useState(user?.shortName || module?.defaultResponsible || "");
  const [dueDate, setDueDate] = useState(addBusinessDays(new Date(), 3));
  const [submitting, setSubmitting] = useState(false);
  const eventSearchRef = useRef<HTMLDivElement | null>(null);

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId) ?? null,
    [matters, selectedMatterId]
  );
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );
  const filteredEvents = useMemo(() => {
    const query = normalizeComparableText(eventSearch);
    if (!query) {
      return events;
    }

    return events.filter((event) => normalizeComparableText(event.name).includes(query));
  }, [eventSearch, events]);

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

  useEffect(() => {
    if (!eventSearchOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!eventSearchRef.current?.contains(event.target as Node)) {
        setEventSearchOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEventSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [eventSearchOpen]);

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
    setEventSearch(nextEvent?.name ?? "");
    setEventSearchOpen(false);
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
      setEventSearch("");
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

          <MobileMatterSummary
            matter={selectedMatter}
            clientNumber={getEffectiveClientNumber(selectedMatter, clients)}
          />

          <label className="mobile-field mobile-event-search-field">
            <span>Selector de tareas</span>
            <div className="mobile-event-search" ref={eventSearchRef}>
              <input
                value={eventSearch}
                onChange={(event) => {
                  setEventSearch(event.target.value);
                  setEventSearchOpen(true);
                  setSuccessMessage(null);
                  if (selectedEventId) {
                    setSelectedEventId("");
                    setTargets([]);
                  }
                }}
                onFocus={() => setEventSearchOpen(true)}
                placeholder="Buscar tarea..."
                autoComplete="off"
              />
              {eventSearchOpen ? (
                <div className="mobile-event-search-results" role="listbox">
                  {filteredEvents.length === 0 ? (
                    <div className="mobile-event-search-empty">No hay tareas con ese criterio.</div>
                  ) : (
                    filteredEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        role="option"
                        aria-selected={event.id === selectedEventId}
                        onMouseDown={(mouseEvent) => {
                          mouseEvent.preventDefault();
                          handleEventChange(event.id);
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

export function MobileDashboardIndexPage() {
  const { user } = useAuth();
  const visibleModules = getVisibleExecutionModules(user);

  if (visibleModules.length === 1 && user?.team !== "CLIENT_RELATIONS" && user?.team !== "ADMIN" && user?.role !== "SUPERADMIN") {
    return <Navigate to={`/mobile/dashboard/${visibleModules[0].slug}`} replace />;
  }

  return (
    <section className="mobile-stack">
      <MobilePageTitle title="Dashboard" subtitle="Vista diaria de tareas por integrante." />
      <div className="mobile-card-list">
        {visibleModules.map((module) => (
          <Link key={module.moduleId} className="mobile-module-card" to={`/mobile/dashboard/${module.slug}`}>
            <strong>{module.label}</strong>
            <span>Dashboard del equipo</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MobileDashboardModulePage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
  const dashboardConfig = module ? TASK_DASHBOARD_CONFIG_BY_MODULE_ID[module.moduleId] : undefined;
  const visibleModules = getVisibleExecutionModules(user);
  const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));

  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [records, setRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [additionalTasks, setAdditionalTasks] = useState<TaskAdditionalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [timeframe, setTimeframe] = useState<MobileDashboardTimeframe>("hoy");

  useEffect(() => {
    if (!module || !canAccess) {
      return;
    }

    async function loadDashboard() {
      setLoading(true);
      try {
        const [loadedClients, loadedMatters, loadedRecords, loadedTerms, loadedAdditionalTasks] = await Promise.all([
          apiGet<Client[]>("/clients"),
          apiGet<Matter[]>("/matters"),
          apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${module!.moduleId}`),
          apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${module!.moduleId}`),
          apiGet<TaskAdditionalTask[]>(`/tasks/additional?moduleId=${module!.moduleId}`)
        ]);

        setClients(loadedClients);
        setMatters(loadedMatters.filter((matter) => matter.responsibleTeam === module!.team));
        setRecords(loadedRecords);
        setTerms(loadedTerms);
        setAdditionalTasks(loadedAdditionalTasks);
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [canAccess, module?.moduleId, module?.team]);

  useEffect(() => {
    if (!dashboardConfig || selectedMemberId) {
      return;
    }

    const userMember = dashboardConfig.members.find((member) => getDashboardMemberForUser(member, user));
    setSelectedMemberId((userMember ?? dashboardConfig.members[0])?.id ?? "");
  }, [dashboardConfig, selectedMemberId, user]);

  if (!module || !legacyConfig || !dashboardConfig || !canAccess) {
    return <Navigate to="/mobile/dashboard" replace />;
  }

  const currentLegacyConfig = legacyConfig;
  const currentDashboardConfig = dashboardConfig;
  const selectedMember = currentDashboardConfig.members.find((member) => member.id === selectedMemberId) ?? currentDashboardConfig.members[0];

  function buildRows(member: TaskDashboardMember, activeTimeframe: MobileDashboardTimeframe): MobileDashboardRow[] {
    const termById = new Map(terms.map((term) => [term.id, term]));
    const termBySourceRecordId = new Map(terms.filter((term) => term.sourceRecordId).map((term) => [term.sourceRecordId ?? "", term]));
    const sharedAliases = currentDashboardConfig.sharedResponsibleAliases ?? [];

    const trackingRows = records
      .filter((record) => matchesResponsible(record.responsible, member, sharedAliases))
      .filter((record) => {
        const table = findTrackingTable(currentLegacyConfig, record);
        return belongsToTimeframe({
          state: isCompletedTrackingRecord(table, record) ? "closed" : "open",
          date: getTrackingDashboardDate(table, record)
        }, activeTimeframe);
      })
      .map<MobileDashboardRow>((record) => {
        const table = findTrackingTable(currentLegacyConfig, record);
        const linkedTerm = (record.termId ? termById.get(record.termId) : undefined) ?? termBySourceRecordId.get(record.id);
        const date = getTrackingDashboardDate(table, record);
        const taskLabel = resolveTrackingTaskName(record, table, undefined, record.eventName) || "Tarea";
        const completed = isCompletedTrackingRecord(table, record);
        const highlighted = !completed && (!taskLabel || !record.responsible || !date || date <= localDateInput() || (isTrackingTermEnabled(record, table) && !linkedTerm));

        return {
          id: `tracking-${record.id}`,
          title: taskLabel,
          typeLabel: completed ? "Completada" : isTrackingTermEnabled(record, table) ? "Termino / seguimiento" : "Seguimiento",
          date: completed ? toDateInput(record.completedAt || record.updatedAt) : date,
          clientName: record.clientName || "-",
          clientNumber: record.clientNumber || "-",
          subject: record.subject || "-",
          originLabel: table?.title ?? record.sourceTable,
          highlighted
        };
      });

    const termRows = terms
      .filter((term) => term.recurring && !term.sourceRecordId)
      .filter((term) => matchesResponsible(term.responsible, member, sharedAliases))
      .filter((term) => belongsToTimeframe({
        state: isCompletedStatus(term.status) ? "closed" : "open",
        date: toDateInput(term.termDate || term.dueDate)
      }, activeTimeframe))
      .map<MobileDashboardRow>((term) => {
        const date = toDateInput(term.termDate || term.dueDate);
        const completed = isCompletedStatus(term.status);

        return {
          id: `term-${term.id}`,
          title: term.eventName || term.pendingTaskLabel || "Termino",
          typeLabel: term.recurring ? "Termino recurrente" : "Termino",
          date,
          clientName: term.clientName || "-",
          clientNumber: term.clientNumber || "-",
          subject: term.subject || "-",
          originLabel: term.recurring ? "Terminos recurrentes" : "Terminos",
          highlighted: !completed && (!term.responsible || !date || date <= localDateInput() || !isVerificationComplete(term))
        };
      });

    const additionalRows = additionalTasks
      .filter((task) =>
        matchesResponsible(task.responsible, member, sharedAliases) ||
        matchesResponsible(task.responsible2 ?? "", member, sharedAliases)
      )
      .filter((task) => belongsToTimeframe({
        state: task.status === "concluida" ? "closed" : "open",
        date: toDateInput(task.dueDate)
      }, activeTimeframe))
      .map<MobileDashboardRow>((task) => {
        const date = toDateInput(task.dueDate);
        return {
          id: `additional-${task.id}`,
          title: task.task,
          typeLabel: task.recurring ? "Termino recurrente" : "Tarea adicional",
          date,
          clientName: "-",
          clientNumber: "-",
          subject: "-",
          originLabel: "Tareas adicionales",
          highlighted: task.status !== "concluida" && (!task.task || !task.responsible || !date || date < localDateInput())
        };
      });

    return [...trackingRows, ...termRows, ...additionalRows].sort((left, right) => left.date.localeCompare(right.date));
  }

  const rows = selectedMember ? buildRows(selectedMember, timeframe) : [];

  return (
    <section className="mobile-stack">
      <MobilePageTitle title={`Dashboard ${module.shortLabel}`} subtitle="Vista diaria por integrante." />

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Integrante</h2>
          <span>{selectedMember?.id}</span>
        </div>
        <label className="mobile-field">
          <span>Usuario</span>
          <select value={selectedMember?.id ?? ""} onChange={(event) => setSelectedMemberId(event.target.value)}>
            {currentDashboardConfig.members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="mobile-segmented mobile-dashboard-segmented">
        {MOBILE_TIMEFRAMES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={timeframe === item.id ? "is-active" : ""}
            onClick={() => setTimeframe(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>{MOBILE_TIMEFRAMES.find((item) => item.id === timeframe)?.label}</h2>
          <span>{rows.length} tareas</span>
        </div>
        {loading ? (
          <div className="mobile-empty">Cargando dashboard...</div>
        ) : rows.length === 0 ? (
          <div className="mobile-empty">No hay tareas en esta ventana.</div>
        ) : (
          <div className="mobile-card-list">
            {rows.map((row) => (
              <article key={row.id} className={`mobile-record-card${row.highlighted ? " is-overdue" : ""}`}>
                <div className="mobile-record-card-head">
                  <strong>{row.title}</strong>
                  <span>{row.typeLabel}</span>
                </div>
                <dl>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{row.clientNumber} | {row.clientName}</dd>
                  </div>
                  <div>
                    <dt>Asunto</dt>
                    <dd>{row.subject}</dd>
                  </div>
                  <div>
                    <dt>Fecha</dt>
                    <dd>{row.date || "-"}</dd>
                  </div>
                  <div>
                    <dt>Origen</dt>
                    <dd>{row.originLabel}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
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
        <Link className="mobile-table-link mobile-table-link-featured" to={`/mobile/tracking/${module.slug}/${TERMS_TABLE_ID}`}>
          <strong>Terminos</strong>
          <span>Tabla maestra de terminos activos</span>
        </Link>
        {legacyConfig.hasRecurringTerms ? (
          <Link className="mobile-table-link mobile-table-link-featured" to={`/mobile/tracking/${module.slug}/${RECURRING_TERMS_TABLE_ID}`}>
            <strong>Terminos recurrentes</strong>
            <span>Terminos periodicos del equipo</span>
          </Link>
        ) : null}
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
  const isTermsTable = tableId === TERMS_TABLE_ID || tableId === RECURRING_TERMS_TABLE_ID;
  const recurrentTermsMode = tableId === RECURRING_TERMS_TABLE_ID;
  const table = legacyConfig?.tables.find((candidate) => candidate.slug === tableId);
  const visibleModules = getVisibleExecutionModules(user);
  const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));
  const [records, setRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [histories, setHistories] = useState<TaskDistributionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "done">("pending");
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!module || (!table && !isTermsTable) || !canAccess) {
      return;
    }

    async function loadRecords() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [loadedRecords, loadedTerms, loadedHistories] = await Promise.all([
          apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${module!.moduleId}`),
          apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${module!.moduleId}`),
          apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${module!.moduleId}`)
        ]);
        setRecords(loadedRecords);
        setTerms(loadedTerms);
        setHistories(loadedHistories);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void loadRecords();
  }, [module?.moduleId, table?.slug, tableId, canAccess, isTermsTable]);

  if (!module || !legacyConfig || (!table && !isTermsTable) || !canAccess) {
    return <Navigate to="/mobile/tracking" replace />;
  }

  const visibleTerms = isTermsTable
    ? sortByDate(buildVisibleTerms(legacyConfig, terms, records, recurrentTermsMode))
      .filter((term) => statusFilter === "pending" ? isPendingRecord(term) : !isPendingRecord(term))
      .filter((term) => {
        const query = normalizeComparableText(search);
        if (!query) {
          return true;
        }

        return normalizeComparableText([
          term.clientNumber,
          term.clientName,
          term.subject,
          term.specificProcess,
          term.matterIdentifier,
          term.pendingTaskLabel,
          term.eventName,
          term.responsible
        ].join(" ")).includes(query);
      })
    : [];

  const visibleRecords = sortByDate(records)
    .filter((record) => table ? trackingRecordMatchesTable(legacyConfig, record, table) : false)
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
      <MobilePageTitle
        title={isTermsTable ? recurrentTermsMode ? "Terminos recurrentes" : "Terminos" : table?.title ?? "Seguimiento"}
        subtitle={isTermsTable ? module.label : table?.dateLabel}
      />

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
        <MobileRecordList records={isTermsTable ? visibleTerms : visibleRecords} legacyConfig={legacyConfig} histories={histories} />
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
  buildDistributionHistoryTaskNameMap(histories).forEach((taskName, recordId) => {
    historyTaskNames.set(recordId, taskName);
  });

  return (
    <div className="mobile-card-list">
      {records.map((record) => {
        const table = "tableCode" in record ? findTrackingTable(legacyConfig, record) : undefined;
        const historyFallback = "tableCode" in record ? resolveHistoryTaskName(record, histories, table) : "";
        const title = "tableCode" in record
          ? resolveTrackingTaskName(record, table, historyTaskNames, historyFallback) || getRecordTitle(record)
          : getRecordTitle(record);
        const tableLabel = "tableCode" in record
          ? table?.title ?? getTableDisplayName(legacyConfig, record.tableCode)
          : "Terminos";
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
