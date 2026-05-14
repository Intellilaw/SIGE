import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import type {
  Client,
  Lead,
  Matter,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskTerm,
  TaskTrackingRecord
} from "@sige/contracts";
import { APP_VERSION_LABEL, APP_VERSION_TEXT } from "@sige/contracts";

import { apiGet, apiPatch, apiPost } from "../../api/http-client";
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
import { LEGACY_TASK_MODULE_BY_ID } from "../tasks/task-legacy-config";
import type { LegacyTaskModuleConfig, LegacyTaskTableConfig } from "../tasks/task-legacy-config";

type MobileTaskTarget = {
  id: string;
  tableSlug: string;
  taskName: string;
  reportedMonth: string;
};

type MobileLeadForm = {
  clientName: string;
  prospectName: string;
  subject: string;
  amountMxn: string;
  communicationChannel: Lead["communicationChannel"];
  nextInteractionLabel: string;
  nextInteraction: string;
  notes: string;
};

const MOBILE_LEAD_CHANNELS: Array<{ value: Lead["communicationChannel"]; label: string }> = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WECHAT", label: "WeChat" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Telefono" }
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

function initialLeadForm(): MobileLeadForm {
  return {
    clientName: "",
    prospectName: "",
    subject: "",
    amountMxn: "",
    communicationChannel: "WHATSAPP",
    nextInteractionLabel: "Dar seguimiento",
    nextInteraction: addBusinessDays(new Date(), 1),
    notes: ""
  };
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
    return <Navigate to="/intranet-login?redirect=/mobile" replace />;
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
        <NavLink to="/mobile/leads">Leads</NavLink>
        <NavLink to="/mobile/execution">Ejecucion</NavLink>
        <NavLink to="/mobile/tracking">Seguimiento</NavLink>
      </nav>
    </div>
  );
}

export function MobileHomePage() {
  return (
    <section className="mobile-stack">
      <div className="mobile-action-grid">
        <Link className="mobile-home-action" to="/mobile/leads">
          Leads
        </Link>
        <Link className="mobile-home-action" to="/mobile/execution">
          Crear tarea
        </Link>
        <Link className="mobile-home-action" to="/mobile/tracking">
          Ver seguimiento
        </Link>
      </div>
    </section>
  );
}

export function MobileLeadsPage() {
  const [form, setForm] = useState<MobileLeadForm>(() => initialLeadForm());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const visibleLeads = useMemo(() => {
    const query = normalizeComparableText(search);
    const sorted = [...leads].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));

    if (!query) {
      return sorted;
    }

    return sorted.filter((lead) =>
      normalizeComparableText([
        lead.clientName,
        lead.prospectName,
        lead.subject,
        lead.nextInteractionLabel,
        lead.notes
      ].join(" ")).includes(query)
    );
  }, [leads, search]);

  async function loadLeads() {
    setLoading(true);
    setErrorMessage(null);
    try {
      setLeads(await apiGet<Lead[]>("/leads"));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLeads();
  }, []);

  function updateField<Key extends keyof MobileLeadForm>(field: Key, value: MobileLeadForm[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const clientName = normalizeText(form.clientName);
    const prospectName = normalizeText(form.prospectName);
    const subject = normalizeText(form.subject);

    if (!clientName && !prospectName) {
      setErrorMessage("Captura cliente o prospecto.");
      return;
    }

    if (!subject) {
      setErrorMessage("Captura el asunto del lead.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await apiPost<Lead>("/leads", {});
      const updated = await apiPatch<Lead>(`/leads/${created.id}`, {
        clientId: null,
        clientName,
        prospectName: prospectName || null,
        commissionAssignee: null,
        quoteId: null,
        quoteNumber: null,
        subject,
        amountMxn: Number(form.amountMxn || 0),
        communicationChannel: form.communicationChannel,
        lastInteractionLabel: "Captura movil",
        lastInteraction: todayInput(),
        nextInteractionLabel: normalizeText(form.nextInteractionLabel) || null,
        nextInteraction: toDateInput(form.nextInteraction) || null,
        notes: normalizeText(form.notes) || null
      });

      setLeads((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
      setForm(initialLeadForm());
      setSuccessMessage("Lead agregado.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mobile-stack">
      <MobilePageTitle title="Leads" subtitle="Captura rapida y consulta de leads activos." />

      {errorMessage ? <div className="mobile-alert mobile-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="mobile-alert mobile-alert-success">{successMessage}</div> : null}

      <form className="mobile-section mobile-form-panel" onSubmit={(event) => void handleSubmit(event)}>
        <div className="mobile-section-head">
          <h2>Nuevo lead</h2>
          <span>Movil</span>
        </div>

        <label className="mobile-field">
          <span>Cliente</span>
          <input
            value={form.clientName}
            onChange={(event) => updateField("clientName", event.target.value)}
            placeholder="Nombre del cliente"
          />
        </label>

        <label className="mobile-field">
          <span>Prospecto</span>
          <input
            value={form.prospectName}
            onChange={(event) => updateField("prospectName", event.target.value)}
            placeholder="Si todavia no es cliente"
          />
        </label>

        <label className="mobile-field">
          <span>Asunto</span>
          <input
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            placeholder="Que necesita"
          />
        </label>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Monto</span>
            <input
              inputMode="decimal"
              value={form.amountMxn}
              onChange={(event) => updateField("amountMxn", event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="mobile-field">
            <span>Canal</span>
            <select
              value={form.communicationChannel}
              onChange={(event) => updateField("communicationChannel", event.target.value as Lead["communicationChannel"])}
            >
              {MOBILE_LEAD_CHANNELS.map((channel) => (
                <option key={channel.value} value={channel.value}>{channel.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Siguiente accion</span>
            <input
              value={form.nextInteractionLabel}
              onChange={(event) => updateField("nextInteractionLabel", event.target.value)}
            />
          </label>
          <label className="mobile-field">
            <span>Fecha</span>
            <input
              type="date"
              value={form.nextInteraction}
              onChange={(event) => updateField("nextInteraction", event.target.value)}
            />
          </label>
        </div>

        <label className="mobile-field">
          <span>Notas</span>
          <textarea
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            placeholder="Contexto breve"
            rows={3}
          />
        </label>

        <button className="mobile-submit" type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar lead"}
        </button>
      </form>

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Leads activos</h2>
          <span>{visibleLeads.length}</span>
        </div>

        <label className="mobile-field">
          <span>Buscar</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, prospecto, asunto..." />
        </label>

        {loading ? (
          <div className="mobile-empty">Cargando leads...</div>
        ) : visibleLeads.length === 0 ? (
          <div className="mobile-empty">No hay leads para mostrar.</div>
        ) : (
          <div className="mobile-card-list">
            {visibleLeads.map((lead) => (
              <article key={lead.id} className="mobile-lead-card">
                <div className="mobile-lead-card-head">
                  <strong>{lead.clientName || lead.prospectName || "Sin nombre"}</strong>
                  <span>{MOBILE_LEAD_CHANNELS.find((channel) => channel.value === lead.communicationChannel)?.label ?? lead.communicationChannel}</span>
                </div>
                <p>{lead.subject || "Sin asunto"}</p>
                <dl>
                  <div>
                    <dt>Siguiente</dt>
                    <dd>{lead.nextInteractionLabel || "-"}</dd>
                  </div>
                  <div>
                    <dt>Fecha</dt>
                    <dd>{toDateInput(lead.nextInteraction) || "-"}</dd>
                  </div>
                  <div>
                    <dt>Monto</dt>
                    <dd>{Number(lead.amountMxn || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</dd>
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

  function renderSelectedMatterPanel() {
    if (!selectedMatter) {
      return null;
    }

    return (
      <>
        <section className="mobile-section mobile-form-panel mobile-inline-task-panel">
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

        <section className="mobile-section mobile-inline-pending-panel">
          <div className="mobile-section-head">
            <h2>Pendientes del asunto</h2>
            <span>{matterRecords.length + matterTerms.length}</span>
          </div>
          <MobileRecordList records={[...matterRecords, ...matterTerms]} legacyConfig={currentLegacyConfig} histories={histories} />
        </section>
      </>
    );
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
                <div key={matter.id} className="mobile-matter-item">
                  <button
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

                  {matter.id === selectedMatterId ? renderSelectedMatterPanel() : null}
                </div>
              );
            })
          )}
        </div>
      </section>
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
