import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import type {
  Client,
  FinanceRecord,
  GeneralExpense,
  Lead,
  Matter,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskTerm,
  TaskTrackingRecord,
  Team
} from "@sige/contracts";
import { APP_VERSION_LABEL, APP_VERSION_TEXT, TEAM_OPTIONS } from "@sige/contracts";

import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";
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

type MobileAuthUser = {
  role: string;
  legacyRole: string;
  permissions: string[];
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

type MobileFinanceForm = {
  clientNumber: string;
  clientName: string;
  quoteNumber: string;
  matterType: FinanceRecord["matterType"];
  subject: string;
  responsibleTeam: Team | "";
  totalMatterMxn: string;
  workingConcepts: string;
  conceptFeesMxn: string;
  previousPaymentsMxn: string;
  paidThisMonthMxn: string;
  paymentDate1: string;
  expenseNotes1: string;
  expenseAmount1Mxn: string;
  nextPaymentDate: string;
  nextPaymentNotes: string;
  financeComments: string;
};

type MobileGeneralExpenseDistributionMode = "general" | "without-team" | "team";

type MobileGeneralExpenseForm = {
  detail: string;
  amountMxn: string;
  countsTowardLimit: boolean;
  distributionMode: MobileGeneralExpenseDistributionMode;
  team: GeneralExpense["team"];
  paymentMethod: GeneralExpense["paymentMethod"];
  bank: GeneralExpense["bank"] | "";
  recurring: boolean;
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

const MOBILE_GENERAL_EXPENSE_TEAMS: Array<{ value: GeneralExpense["team"]; label: string }> = [
  { value: "Litigio", label: "Litigio" },
  { value: "Corporativo y laboral", label: "Corporativo y laboral" },
  { value: "Convenios", label: "Convenios" },
  { value: "Der Financiero", label: "Der Financiero" },
  { value: "Compliance Fiscal", label: "Compliance Fiscal" }
];

const MOBILE_GENERAL_EXPENSE_BANKS: Array<NonNullable<GeneralExpense["bank"]>> = ["Banamex", "HSBC"];

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeResponsibleOption(value?: string | null) {
  return normalizeText(value).toUpperCase();
}

function splitResponsibleOptions(value?: string | null) {
  return normalizeText(value)
    .split(/[\/,;]/)
    .map(normalizeResponsibleOption)
    .filter(Boolean);
}

function dedupeResponsibleOptions(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map(normalizeResponsibleOption).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function getDefaultResponsibleOption(userShortName?: string | null, moduleDefaultResponsible?: string | null) {
  return normalizeResponsibleOption(userShortName) || splitResponsibleOptions(moduleDefaultResponsible)[0] || "";
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

function initialFinanceForm(): MobileFinanceForm {
  return {
    clientNumber: "",
    clientName: "",
    quoteNumber: "",
    matterType: "ONE_TIME",
    subject: "",
    responsibleTeam: "",
    totalMatterMxn: "",
    workingConcepts: "",
    conceptFeesMxn: "",
    previousPaymentsMxn: "",
    paidThisMonthMxn: "",
    paymentDate1: todayInput(),
    expenseNotes1: "",
    expenseAmount1Mxn: "",
    nextPaymentDate: "",
    nextPaymentNotes: "",
    financeComments: ""
  };
}

function initialGeneralExpenseForm(): MobileGeneralExpenseForm {
  return {
    detail: "",
    amountMxn: "",
    countsTowardLimit: false,
    distributionMode: "general",
    team: "Litigio",
    paymentMethod: "Transferencia",
    bank: "Banamex",
    recurring: false
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
}

function hasMobilePermission(user: MobileAuthUser | null | undefined, permission: string) {
  return Boolean(user?.permissions.includes("*") || user?.permissions.includes(permission));
}

function canReadMobileFinances(user?: MobileAuthUser | null) {
  return canReadModule(user, "finances");
}

function canWriteMobileFinances(user?: MobileAuthUser | null) {
  return canWriteModule(user, "finances");
}

function canReadMobileLeads(user?: MobileAuthUser | null) {
  return canReadModule(user, "lead-tracking");
}

function canReadMobileGeneralExpenses(user?: MobileAuthUser | null) {
  return canReadModule(user, "general-expenses");
}

function canWriteMobileGeneralExpenses(user?: MobileAuthUser | null) {
  return canWriteModule(user, "general-expenses");
}

function canReadMobileExecution(user?: MobileAuthUser | null) {
  return canReadModule(user, "execution");
}

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function getMonthName(month: number) {
  return [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
  ][month - 1] ?? String(month);
}

function getTeamLabel(team?: Team | null) {
  return TEAM_OPTIONS.find((option) => option.key === team)?.label ?? "-";
}

function getFinanceMatterTypeLabel(type: FinanceRecord["matterType"]) {
  return type === "RETAINER" ? "Iguala" : "Unico";
}

function formatDateList(values: Array<string | null | undefined>) {
  const dates = values.map(toDateInput).filter(Boolean);
  return dates.length > 0 ? dates.join(" / ") : "-";
}

function getGeneralExpenseDistributionPatch(form: MobileGeneralExpenseForm) {
  if (form.distributionMode === "general") {
    return {
      team: "General" as GeneralExpense["team"],
      generalExpense: true,
      expenseWithoutTeam: false
    };
  }

  if (form.distributionMode === "without-team") {
    return {
      team: "Sin equipo" as GeneralExpense["team"],
      generalExpense: false,
      expenseWithoutTeam: true
    };
  }

  return {
    team: form.team,
    generalExpense: false,
    expenseWithoutTeam: false,
    pctLitigation: form.team === "Litigio" ? 100 : 0,
    pctCorporateLabor: form.team === "Corporativo y laboral" ? 100 : 0,
    pctSettlements: form.team === "Convenios" ? 100 : 0,
    pctFinancialLaw: form.team === "Der Financiero" ? 100 : 0,
    pctTaxCompliance: form.team === "Compliance Fiscal" ? 100 : 0
  };
}

function getGeneralExpenseDistributionLabel(expense: GeneralExpense) {
  if (expense.generalExpense) {
    return "Gasto general";
  }

  if (expense.expenseWithoutTeam) {
    return "Sin equipo";
  }

  return expense.team || "Sin equipo";
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
  const showLeads = canReadMobileLeads(user);
  const showFinances = canReadMobileFinances(user);
  const showGeneralExpenses = canReadMobileGeneralExpenses(user);
  const showExecution = canReadMobileExecution(user);

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
        {showLeads ? <NavLink to="/mobile/leads">Leads</NavLink> : null}
        {showFinances ? <NavLink to="/mobile/finances">Finanzas</NavLink> : null}
        {showGeneralExpenses ? <NavLink to="/mobile/general-expenses">Gastos</NavLink> : null}
        {showExecution ? <NavLink to="/mobile/execution">Ejecucion</NavLink> : null}
        {showExecution ? <NavLink to="/mobile/tracking">Seguimiento</NavLink> : null}
      </nav>
    </div>
  );
}

export function MobileHomePage() {
  const { user } = useAuth();
  const showLeads = canReadMobileLeads(user);
  const showFinances = canReadMobileFinances(user);
  const showGeneralExpenses = canReadMobileGeneralExpenses(user);
  const showExecution = canReadMobileExecution(user);

  return (
    <section className="mobile-stack">
      <div className="mobile-action-grid">
        {showLeads ? (
          <Link className="mobile-home-action" to="/mobile/leads">
            Leads
          </Link>
        ) : null}
        {showFinances ? (
          <Link className="mobile-home-action" to="/mobile/finances">
            Finanzas
          </Link>
        ) : null}
        {showGeneralExpenses ? (
          <Link className="mobile-home-action" to="/mobile/general-expenses">
            Gastos generales
          </Link>
        ) : null}
        {showExecution ? (
          <Link className="mobile-home-action" to="/mobile/execution">
            Crear tarea
          </Link>
        ) : null}
        {showExecution ? (
          <Link className="mobile-home-action" to="/mobile/tracking">
            Ver seguimiento
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function MobileLeadsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<MobileLeadForm>(() => initialLeadForm());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canRead = canReadMobileLeads(user);
  const canWrite = canWriteModule(user, "lead-tracking");

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
    if (!canRead) {
      setLoading(false);
      return;
    }

    void loadLeads();
  }, [canRead]);

  function updateField<Key extends keyof MobileLeadForm>(field: Key, value: MobileLeadForm[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      return;
    }

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

  if (!canRead) {
    return <Navigate to="/mobile" replace />;
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

        <button className="mobile-submit" type="submit" disabled={submitting || !canWrite}>
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

export function MobileFinancesPage() {
  const { user } = useAuth();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const canRead = canReadMobileFinances(user);
  const canWrite = canWriteMobileFinances(user);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [form, setForm] = useState<MobileFinanceForm>(() => initialFinanceForm());
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const monthTotals = useMemo(() => {
    return records.reduce(
      (totals, record) => {
        const income = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;
        const expenses = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
        return {
          income: totals.income + income,
          expenses: totals.expenses + expenses,
          pending: totals.pending + Math.max(record.conceptFeesMxn - record.previousPaymentsMxn - income, 0)
        };
      },
      { income: 0, expenses: 0, pending: 0 }
    );
  }, [records]);

  const visibleRecords = useMemo(() => {
    const query = normalizeComparableText(search);
    const sorted = [...records].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));

    if (!query) {
      return sorted;
    }

    return sorted.filter((record) =>
      normalizeComparableText([
        record.clientNumber,
        record.clientName,
        record.quoteNumber,
        record.subject,
        record.workingConcepts,
        record.nextPaymentNotes,
        record.financeComments
      ].join(" ")).includes(query)
    );
  }, [records, search]);

  async function loadFinanceRecords(year = selectedYear, month = selectedMonth) {
    setLoading(true);
    setErrorMessage(null);
    try {
      setRecords(await apiGet<FinanceRecord[]>(`/finances/records?year=${year}&month=${month}`));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    void loadFinanceRecords();
  }, [canRead, selectedMonth, selectedYear]);

  function updateField<Key extends keyof MobileFinanceForm>(field: Key, value: MobileFinanceForm[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const clientName = normalizeText(form.clientName);
    const subject = normalizeText(form.subject);
    const paidThisMonthMxn = parseMoneyInput(form.paidThisMonthMxn);
    const conceptFeesMxn = parseMoneyInput(form.conceptFeesMxn) || paidThisMonthMxn;
    const totalMatterMxn = parseMoneyInput(form.totalMatterMxn) || conceptFeesMxn || paidThisMonthMxn;
    const expenseAmount1Mxn = parseMoneyInput(form.expenseAmount1Mxn);

    if (!clientName) {
      setErrorMessage("Captura el cliente.");
      return;
    }

    if (!subject) {
      setErrorMessage("Captura el asunto o concepto.");
      return;
    }

    if (!canWrite) {
      setErrorMessage("Tu usuario no tiene permiso para agregar entradas de Finanzas.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await apiPost<FinanceRecord>("/finances/records", {
        year: selectedYear,
        month: selectedMonth,
        clientNumber: normalizeText(form.clientNumber) || null,
        clientName,
        quoteNumber: normalizeText(form.quoteNumber) || null,
        matterType: form.matterType,
        subject,
        contractSignedStatus: "NOT_REQUIRED",
        responsibleTeam: form.responsibleTeam || null,
        totalMatterMxn,
        workingConcepts: normalizeText(form.workingConcepts) || subject,
        conceptFeesMxn,
        previousPaymentsMxn: parseMoneyInput(form.previousPaymentsMxn),
        nextPaymentDate: toDateInput(form.nextPaymentDate) || null,
        nextPaymentNotes: normalizeText(form.nextPaymentNotes) || null,
        paidThisMonthMxn,
        paymentDate1: paidThisMonthMxn > 0 ? toDateInput(form.paymentDate1) || todayInput() : null,
        expenseNotes1: normalizeText(form.expenseNotes1) || null,
        expenseAmount1Mxn,
        financeComments: normalizeText(form.financeComments) || "Captura movil"
      });

      setRecords((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setForm(initialFinanceForm());
      setSuccessMessage("Entrada agregada a Finanzas.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canRead) {
    return (
      <section className="mobile-stack">
        <MobilePageTitle title="Finanzas" subtitle="Captura rapida de entradas del mes." />
        <div className="mobile-alert mobile-alert-error">Tu usuario no tiene permiso para ver Finanzas.</div>
      </section>
    );
  }

  return (
    <section className="mobile-stack">
      <MobilePageTitle title="Finanzas" subtitle="Agrega entradas del mes desde el celular." />

      {errorMessage ? <div className="mobile-alert mobile-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="mobile-alert mobile-alert-success">{successMessage}</div> : null}

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Periodo</h2>
          <span>{getMonthName(selectedMonth)} {selectedYear}</span>
        </div>
        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Ano</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="mobile-field">
            <span>Mes</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{getMonthName(month)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mobile-finance-summary-grid">
          <article>
            <span>Cobrado</span>
            <strong>{formatCurrency(monthTotals.income)}</strong>
          </article>
          <article>
            <span>Gastos</span>
            <strong>{formatCurrency(monthTotals.expenses)}</strong>
          </article>
          <article>
            <span>Pendiente</span>
            <strong>{formatCurrency(monthTotals.pending)}</strong>
          </article>
        </div>
      </section>

      <form className="mobile-section mobile-form-panel" onSubmit={(event) => void handleSubmit(event)}>
        <div className="mobile-section-head">
          <h2>Nueva entrada</h2>
          <span>Finanzas</span>
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
          <span>Asunto o concepto</span>
          <input
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            placeholder="Que se esta cobrando"
          />
        </label>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>No. cliente</span>
            <input
              value={form.clientNumber}
              onChange={(event) => updateField("clientNumber", event.target.value)}
              placeholder="Opcional"
            />
          </label>
          <label className="mobile-field">
            <span>No. cotizacion</span>
            <input
              value={form.quoteNumber}
              onChange={(event) => updateField("quoteNumber", event.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Tipo</span>
            <select
              value={form.matterType}
              onChange={(event) => updateField("matterType", event.target.value as FinanceRecord["matterType"])}
            >
              <option value="ONE_TIME">Unico</option>
              <option value="RETAINER">Iguala</option>
            </select>
          </label>
          <label className="mobile-field">
            <span>Equipo</span>
            <select
              value={form.responsibleTeam}
              onChange={(event) => updateField("responsibleTeam", event.target.value as Team | "")}
            >
              <option value="">Sin equipo</option>
              {TEAM_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mobile-field">
          <span>Conceptos trabajando</span>
          <textarea
            value={form.workingConcepts}
            onChange={(event) => updateField("workingConcepts", event.target.value)}
            placeholder="Descripcion breve"
            rows={2}
          />
        </label>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Total asunto</span>
            <input
              inputMode="decimal"
              value={form.totalMatterMxn}
              onChange={(event) => updateField("totalMatterMxn", event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="mobile-field">
            <span>Honorarios</span>
            <input
              inputMode="decimal"
              value={form.conceptFeesMxn}
              onChange={(event) => updateField("conceptFeesMxn", event.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Pagos previos</span>
            <input
              inputMode="decimal"
              value={form.previousPaymentsMxn}
              onChange={(event) => updateField("previousPaymentsMxn", event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="mobile-field">
            <span>Cobrado ahora</span>
            <input
              inputMode="decimal"
              value={form.paidThisMonthMxn}
              onChange={(event) => updateField("paidThisMonthMxn", event.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <label className="mobile-field">
          <span>Fecha de pago</span>
          <input
            type="date"
            value={form.paymentDate1}
            onChange={(event) => updateField("paymentDate1", event.target.value)}
          />
        </label>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Gasto</span>
            <input
              inputMode="decimal"
              value={form.expenseAmount1Mxn}
              onChange={(event) => updateField("expenseAmount1Mxn", event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="mobile-field">
            <span>Detalle gasto</span>
            <input
              value={form.expenseNotes1}
              onChange={(event) => updateField("expenseNotes1", event.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>

        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Proximo pago</span>
            <input
              type="date"
              value={form.nextPaymentDate}
              onChange={(event) => updateField("nextPaymentDate", event.target.value)}
            />
          </label>
          <label className="mobile-field">
            <span>Detalle</span>
            <input
              value={form.nextPaymentNotes}
              onChange={(event) => updateField("nextPaymentNotes", event.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>

        <label className="mobile-field">
          <span>Comentarios</span>
          <textarea
            value={form.financeComments}
            onChange={(event) => updateField("financeComments", event.target.value)}
            placeholder="Notas para Finanzas"
            rows={3}
          />
        </label>

        <button className="mobile-submit" type="submit" disabled={submitting || !canWrite}>
          {submitting ? "Guardando..." : "Guardar entrada"}
        </button>
      </form>

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Entradas del mes</h2>
          <span>{visibleRecords.length}</span>
        </div>

        <label className="mobile-field">
          <span>Buscar</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, asunto, cotizacion..." />
        </label>

        {loading ? (
          <div className="mobile-empty">Cargando Finanzas...</div>
        ) : visibleRecords.length === 0 ? (
          <div className="mobile-empty">No hay entradas para este periodo.</div>
        ) : (
          <div className="mobile-card-list">
            {visibleRecords.map((record) => {
              const income = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;
              const expenses = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;

              return (
                <article key={record.id} className="mobile-record-card mobile-finance-card">
                  <div className="mobile-record-card-head">
                    <strong>{record.clientName || "Sin cliente"}</strong>
                    <span>{getFinanceMatterTypeLabel(record.matterType)}</span>
                  </div>
                  <p>{record.subject || "Sin asunto"}</p>
                  <dl>
                    <div>
                      <dt>Cobrado</dt>
                      <dd>{formatCurrency(income)}</dd>
                    </div>
                    <div>
                      <dt>Gastos</dt>
                      <dd>{formatCurrency(expenses)}</dd>
                    </div>
                    <div>
                      <dt>Pago</dt>
                      <dd>{formatDateList([record.paymentDate1, record.paymentDate2, record.paymentDate3])}</dd>
                    </div>
                    <div>
                      <dt>Equipo</dt>
                      <dd>{getTeamLabel(record.responsibleTeam)}</dd>
                    </div>
                    <div>
                      <dt>Cotizacion</dt>
                      <dd>{record.quoteNumber || "-"}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

export function MobileGeneralExpensesPage() {
  const { user } = useAuth();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const canRead = canReadMobileGeneralExpenses(user);
  const canWrite = canWriteMobileGeneralExpenses(user);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [form, setForm] = useState<MobileGeneralExpenseForm>(() => initialGeneralExpenseForm());
  const [records, setRecords] = useState<GeneralExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const monthTotals = useMemo(() => {
    return records.reduce(
      (totals, expense) => {
        const amount = Number(expense.amountMxn || 0);
        return {
          total: totals.total + amount,
          limit: totals.limit + (expense.countsTowardLimit ? amount : 0),
          paid: totals.paid + (expense.paid ? amount : 0)
        };
      },
      { total: 0, limit: 0, paid: 0 }
    );
  }, [records]);

  const visibleRecords = useMemo(() => {
    const query = normalizeComparableText(search);
    const sorted = [...records].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));

    if (!query) {
      return sorted;
    }

    return sorted.filter((expense) =>
      normalizeComparableText([
        expense.detail,
        expense.team,
        expense.paymentMethod,
        expense.bank,
        getGeneralExpenseDistributionLabel(expense)
      ].join(" ")).includes(query)
    );
  }, [records, search]);

  async function loadGeneralExpenses(year = selectedYear, month = selectedMonth) {
    setLoading(true);
    setErrorMessage(null);
    try {
      setRecords(await apiGet<GeneralExpense[]>(`/general-expenses?year=${year}&month=${month}`));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    void loadGeneralExpenses();
  }, [canRead, selectedMonth, selectedYear]);

  function updateField<Key extends keyof MobileGeneralExpenseForm>(field: Key, value: MobileGeneralExpenseForm[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const detail = normalizeText(form.detail);
    const amountMxn = parseMoneyInput(form.amountMxn);

    if (!detail) {
      setErrorMessage("Captura el detalle del gasto.");
      return;
    }

    if (amountMxn <= 0) {
      setErrorMessage("Captura un monto mayor a cero.");
      return;
    }

    if (!canWrite) {
      setErrorMessage("Tu usuario no tiene permiso para agregar gastos generales.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await apiPost<GeneralExpense>("/general-expenses", {
        year: selectedYear,
        month: selectedMonth
      });
      const patch = {
        detail,
        amountMxn,
        countsTowardLimit: form.countsTowardLimit,
        paymentMethod: form.paymentMethod,
        bank: form.paymentMethod === "Transferencia" ? form.bank || "Banamex" : null,
        recurring: form.recurring,
        ...getGeneralExpenseDistributionPatch(form)
      };
      const updated = await apiPatch<GeneralExpense>(`/general-expenses/${created.id}`, patch);

      setRecords((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
      setForm(initialGeneralExpenseForm());
      setSuccessMessage("Gasto agregado.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canRead) {
    return (
      <section className="mobile-stack">
        <MobilePageTitle title="Gastos generales" subtitle="Captura rapida de gastos del mes." />
        <div className="mobile-alert mobile-alert-error">Tu usuario no tiene permiso para ver Gastos generales.</div>
      </section>
    );
  }

  return (
    <section className="mobile-stack">
      <MobilePageTitle title="Gastos generales" subtitle="Agrega gastos del mes desde el celular." />

      {errorMessage ? <div className="mobile-alert mobile-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="mobile-alert mobile-alert-success">{successMessage}</div> : null}

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Periodo</h2>
          <span>{getMonthName(selectedMonth)} {selectedYear}</span>
        </div>
        <div className="mobile-two-fields">
          <label className="mobile-field">
            <span>Ano</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="mobile-field">
            <span>Mes</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{getMonthName(month)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mobile-finance-summary-grid">
          <article>
            <span>Total</span>
            <strong>{formatCurrency(monthTotals.total)}</strong>
          </article>
          <article>
            <span>Limite</span>
            <strong>{formatCurrency(monthTotals.limit)}</strong>
          </article>
          <article>
            <span>Pagado</span>
            <strong>{formatCurrency(monthTotals.paid)}</strong>
          </article>
        </div>
      </section>

      <form className="mobile-section mobile-form-panel" onSubmit={(event) => void handleSubmit(event)}>
        <div className="mobile-section-head">
          <h2>Nuevo gasto</h2>
          <span>Movil</span>
        </div>

        <label className="mobile-field">
          <span>Detalle</span>
          <textarea
            value={form.detail}
            onChange={(event) => updateField("detail", event.target.value)}
            placeholder="Concepto del gasto"
            rows={3}
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
            <span>Metodo</span>
            <select
              value={form.paymentMethod}
              onChange={(event) => updateField("paymentMethod", event.target.value as GeneralExpense["paymentMethod"])}
            >
              <option value="Transferencia">Transferencia</option>
              <option value="Efectivo">Efectivo</option>
            </select>
          </label>
        </div>

        {form.paymentMethod === "Transferencia" ? (
          <label className="mobile-field">
            <span>Banco</span>
            <select
              value={form.bank}
              onChange={(event) => updateField("bank", event.target.value as GeneralExpense["bank"])}
            >
              {MOBILE_GENERAL_EXPENSE_BANKS.map((bank) => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="mobile-segmented mobile-three-segmented">
          <button
            type="button"
            className={form.distributionMode === "general" ? "is-active" : ""}
            onClick={() => updateField("distributionMode", "general")}
          >
            General
          </button>
          <button
            type="button"
            className={form.distributionMode === "without-team" ? "is-active" : ""}
            onClick={() => updateField("distributionMode", "without-team")}
          >
            Sin equipo
          </button>
          <button
            type="button"
            className={form.distributionMode === "team" ? "is-active" : ""}
            onClick={() => updateField("distributionMode", "team")}
          >
            Equipo
          </button>
        </div>

        {form.distributionMode === "team" ? (
          <label className="mobile-field">
            <span>Equipo</span>
            <select
              value={form.team}
              onChange={(event) => updateField("team", event.target.value as GeneralExpense["team"])}
            >
              {MOBILE_GENERAL_EXPENSE_TEAMS.map((team) => (
                <option key={team.value} value={team.value}>{team.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="mobile-checkbox-list">
          <label>
            <input
              type="checkbox"
              checked={form.countsTowardLimit}
              onChange={(event) => updateField("countsTowardLimit", event.target.checked)}
            />
            <span>Cuenta para limite</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(event) => updateField("recurring", event.target.checked)}
            />
            <span>Gasto recurrente</span>
          </label>
        </div>

        <button className="mobile-submit" type="submit" disabled={submitting || !canWrite}>
          {submitting ? "Guardando..." : "Guardar gasto"}
        </button>
      </form>

      <section className="mobile-section">
        <div className="mobile-section-head">
          <h2>Gastos del mes</h2>
          <span>{visibleRecords.length}</span>
        </div>

        <label className="mobile-field">
          <span>Buscar</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Detalle, equipo, banco..." />
        </label>

        {loading ? (
          <div className="mobile-empty">Cargando gastos...</div>
        ) : visibleRecords.length === 0 ? (
          <div className="mobile-empty">No hay gastos para este periodo.</div>
        ) : (
          <div className="mobile-card-list">
            {visibleRecords.map((expense) => (
              <article key={expense.id} className="mobile-record-card mobile-expense-card">
                <div className="mobile-record-card-head">
                  <strong>{expense.detail || "Sin detalle"}</strong>
                  <span>{expense.paid ? "Pagado" : "Pendiente"}</span>
                </div>
                <dl>
                  <div>
                    <dt>Monto</dt>
                    <dd>{formatCurrency(expense.amountMxn)}</dd>
                  </div>
                  <div>
                    <dt>Tipo</dt>
                    <dd>{getGeneralExpenseDistributionLabel(expense)}</dd>
                  </div>
                  <div>
                    <dt>Metodo</dt>
                    <dd>{expense.paymentMethod}{expense.bank ? ` / ${expense.bank}` : ""}</dd>
                  </div>
                  <div>
                    <dt>Limite</dt>
                    <dd>{expense.countsTowardLimit ? "Si" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Recurrente</dt>
                    <dd>{expense.recurring ? "Si" : "No"}</dd>
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

  if (!canReadMobileExecution(user)) {
    return <Navigate to="/mobile" replace />;
  }

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
  const [responsible, setResponsible] = useState(getDefaultResponsibleOption(user?.shortName, module?.defaultResponsible));
  const [responsibleOptions, setResponsibleOptions] = useState<string[]>([]);
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
  const fallbackResponsibleOptions = useMemo(
    () => splitResponsibleOptions(module?.defaultResponsible),
    [module?.defaultResponsible]
  );
  const moduleResponsibleOptions = useMemo(
    () => dedupeResponsibleOptions([
      ...responsibleOptions,
      ...fallbackResponsibleOptions,
      user?.shortName,
      responsible
    ]),
    [fallbackResponsibleOptions, responsible, responsibleOptions, user?.shortName]
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
    setResponsible(getDefaultResponsibleOption(user?.shortName, module?.defaultResponsible));
  }, [module?.moduleId, user?.shortName]);

  useEffect(() => {
    if (!module || !canAccess) {
      setResponsibleOptions([]);
      return;
    }

    let cancelled = false;
    const team = module.team;
    const fallbackOptions = splitResponsibleOptions(module.defaultResponsible);

    async function loadResponsibleOptions() {
      try {
        const loaded = await apiGet<string[]>(`/users/team-short-names?team=${encodeURIComponent(team)}`);
        const nextOptions = dedupeResponsibleOptions([...loaded, ...fallbackOptions, user?.shortName]);
        if (!cancelled) {
          setResponsibleOptions(nextOptions.length > 0 ? nextOptions : fallbackOptions);
        }
      } catch {
        if (!cancelled) {
          setResponsibleOptions(dedupeResponsibleOptions([...fallbackOptions, user?.shortName]));
        }
      }
    }

    void loadResponsibleOptions();

    return () => {
      cancelled = true;
    };
  }, [canAccess, module?.moduleId, module?.team, module?.defaultResponsible, user?.shortName]);

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
              <select value={responsible} onChange={(event) => setResponsible(event.target.value)}>
                <option value="">Seleccionar responsable</option>
                {moduleResponsibleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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

  if (!canReadMobileExecution(user)) {
    return <Navigate to="/mobile" replace />;
  }

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
