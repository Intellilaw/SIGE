import {
  TASK_MODULES,
  type KpiMetric,
  type KpiMetricStatus,
  type LegacyTaskStatus,
  type ManagedUser,
  type Matter,
  type TaskAdditionalTask,
  type TaskItem,
  type TaskModuleDefinition,
  type TaskTerm,
  type TaskTrackingRecord
} from "@sige/contracts";

import type { KpiAccessScope, KpisRepository, MattersRepository, TasksRepository, UsersRepository } from "../../repositories/types";

type SupervisionBucketKey = "today" | "tomorrow" | "restOfWeek";
type TaskSummaryKey = "today" | "overdue";
type KpiPeriodKey = "lastWeek" | "currentWeek";

interface DateRange {
  key: SupervisionBucketKey;
  label: string;
  startDate: string;
  endDate: string;
}

interface KpiDateRange {
  key: KpiPeriodKey;
  label: string;
  startDate: string;
  endDate: string;
}

interface SupervisionUserReference {
  userId: string;
  displayName: string;
  shortName?: string;
  teamLabel: string;
  specificRole?: string;
}

interface SupervisionTaskCandidate {
  id: string;
  moduleId: string;
  moduleLabel: string;
  teamLabel: string;
  taskLabel: string;
  clientName: string;
  subject: string;
  responsible: string;
  dueDate: string;
  statusLabel: string;
  sourceLabel: string;
  originPath: string;
}

interface SupervisionTermCandidate {
  id: string;
  moduleId: string;
  moduleLabel: string;
  teamLabel: string;
  termLabel: string;
  clientName: string;
  subject: string;
  responsible: string;
  termDate: string;
  statusLabel: string;
  sourceLabel: string;
  originPath: string;
}

interface SupervisionTaskDashboardLink {
  moduleId: string;
  label: string;
  path: string;
  total: number;
  today: number;
  overdue: number;
}

interface GroupedUserTaskSummary extends SupervisionUserReference {
  total: number;
  today: number;
  overdue: number;
  dashboardLinks: SupervisionTaskDashboardLink[];
}

interface GroupedTeamTerms {
  moduleId: string;
  teamLabel: string;
  total: number;
  terms: SupervisionTermCandidate[];
}

interface KpiUserAlerts extends SupervisionUserReference {
  total: number;
  metrics: KpiMetric[];
}

const TEAM_LABELS: Record<string, string> = {
  ADMIN: "Direccion general",
  CLIENT_RELATIONS: "Comunicacion con cliente",
  FINANCE: "Finanzas",
  LITIGATION: "Litigio",
  CORPORATE_LABOR: "Corporativo y laboral",
  SETTLEMENTS: "Convenios",
  FINANCIAL_LAW: "Der Financiero",
  TAX_COMPLIANCE: "Compliance Fiscal",
  AUDIT: "Auditoria",
  ADMIN_OPERATIONS: "Servicios administrativos"
};

const TASK_MODULE_SLUGS: Record<string, string> = {
  litigation: "litigio",
  "corporate-labor": "corporativo",
  settlements: "convenios",
  "financial-law": "financiero",
  "tax-compliance": "compliance"
};

const OPEN_LEGACY_STATUSES: LegacyTaskStatus[] = ["pendiente"];
const OPEN_TASK_STATES: TaskItem["state"][] = ["PENDING", "IN_PROGRESS"];
const KPI_ALERT_STATUSES: KpiMetricStatus[] = ["missed", "warning"];
const LITIGATION_MODULE_ID = "litigation";
const LITIGATION_TEAM = "LITIGATION";
const LITIGATION_MISSING_NEXT_TASK_OWNER = "LAMR";
const TASK_VERIFICATION_COLUMNS: Record<string, Array<{ key: string; label: string }>> = {
  litigation: [
    { key: "verificado_meoo", label: "V. MEOO" },
    { key: "verificado_lamr", label: "V. LAMR" },
    { key: "verificado_ekpo", label: "V. EKPO" },
    { key: "verificado_nbsg", label: "V. NBSG" }
  ],
  "corporate-labor": [
    { key: "verificado_crv", label: "V. CRV" },
    { key: "verificado_cagc", label: "V. CAGC" }
  ],
  settlements: [
    { key: "verificado_lider", label: "V. MLDM" },
    { key: "verificado_colaborador", label: "V. CAOG" }
  ],
  "financial-law": [
    { key: "verificado_lider", label: "V. RJVO" },
    { key: "verificado_colaborador", label: "V. HKMG" }
  ],
  "tax-compliance": [
    { key: "verificado_lider", label: "V. MPC" },
    { key: "verificado_colaborador", label: "V. YMAH" }
  ]
};

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeKey(value?: string | null) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function toDateKey(value?: string | Date | null) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function addDaysKey(value: string, offset: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getCurrentDateKey() {
  return toDateKey(new Date());
}

function getWeekStartKey(dateKey: string) {
  const date = dateFromKey(dateKey);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysKey(dateKey, offset);
}

function getDataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getStringDataValue(data: unknown, keys: string[]) {
  const record = getDataRecord(data);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function isVerificationValueComplete(value?: string | null) {
  return ["si", "yes"].includes(normalizeKey(value));
}

function getVerificationResponsible(column: { key: string; label: string }) {
  const labelAlias = column.label.replace(/^v\.\s*/i, "").trim();
  if (labelAlias) {
    return labelAlias;
  }

  return column.key.replace(/^verificado[_-]?/i, "").replace(/[_-]+/g, " ").trim();
}

function statusLabel(status: LegacyTaskStatus | TaskItem["state"]) {
  if (status === "presentado") {
    return "Presentado";
  }
  if (status === "concluida" || status === "COMPLETED") {
    return "Concluida";
  }
  if (status === "IN_PROGRESS") {
    return "En proceso";
  }
  if (status === "MONTHLY_VIEW") {
    return "Vista mensual";
  }

  return "Pendiente";
}

function getTaskModuleDefinitions(modules: TaskModuleDefinition[]) {
  const definitions = new Map<string, TaskModuleDefinition>();
  [...TASK_MODULES, ...modules].forEach((module) => definitions.set(module.id, module));
  return definitions;
}

function getModulePath(moduleId: string, suffix = "") {
  const slug = TASK_MODULE_SLUGS[moduleId];
  return slug ? `/app/tasks/${slug}${suffix}` : "/app/tasks";
}

function getModuleLabel(module: TaskModuleDefinition | undefined, moduleId: string) {
  return module?.label ?? moduleId;
}

function getTeamLabelFromModule(module: TaskModuleDefinition | undefined, moduleId: string) {
  return module?.label ?? moduleId;
}

function getTrackLabel(module: TaskModuleDefinition | undefined, trackId?: string | null) {
  if (!module || !trackId) {
    return undefined;
  }

  return module.tracks.find((track) => track.id === trackId)?.label;
}

function getRecordSourceLabel(module: TaskModuleDefinition | undefined, record: TaskTrackingRecord) {
  return getStringDataValue(record.data, ["tableLabel", "sourceLabel"])
    ?? getTrackLabel(module, record.tableCode)
    ?? getTrackLabel(module, record.sourceTable)
    ?? record.sourceTable
    ?? record.tableCode
    ?? "Seguimiento";
}

function normalizeMatterIdentity(value?: string | null) {
  return (value ?? "").trim();
}

function matterKeyMatches(recordValue: string | undefined | null, matterValues: string[]) {
  const normalizedRecordValue = normalizeMatterIdentity(recordValue);
  return Boolean(normalizedRecordValue && matterValues.includes(normalizedRecordValue));
}

function getMatterIdentityValues(matter: Matter) {
  return [
    matter.id,
    matter.matterNumber,
    matter.matterIdentifier
  ].map(normalizeMatterIdentity).filter(Boolean);
}

function isCompletedTrackingRecord(record: TaskTrackingRecord) {
  return record.status === "presentado" || record.status === "concluida";
}

function hasActiveLinkedTrackingRecord(matter: Matter, records: TaskTrackingRecord[]) {
  const matterValues = getMatterIdentityValues(matter);

  return records.some((record) =>
    !record.deletedAt
    && !isCompletedTrackingRecord(record)
    && (
      matterKeyMatches(record.matterId, matterValues)
      || matterKeyMatches(record.matterNumber, matterValues)
      || matterKeyMatches(record.matterIdentifier, matterValues)
    )
  );
}

function hasActiveStandaloneTerm(matter: Matter, terms: TaskTerm[]) {
  const matterValues = getMatterIdentityValues(matter);

  return terms.some((term) =>
    !term.deletedAt
    && !term.sourceRecordId
    && term.status === "pendiente"
    && (
      matterKeyMatches(term.matterId, matterValues)
      || matterKeyMatches(term.matterNumber, matterValues)
      || matterKeyMatches(term.matterIdentifier, matterValues)
    )
  );
}

function hasExecutionNextTask(matter: Matter, records: TaskTrackingRecord[], terms: TaskTerm[]) {
  return hasActiveLinkedTrackingRecord(matter, records) || hasActiveStandaloneTerm(matter, terms);
}

function splitResponsibleAliases(value?: string | null) {
  const normalized = normalizeKey(value).replace(/\s*\/\s*/g, "/");
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s*(?:\/|,|;|&|\by\b)\s*/u)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function getUserTeamLabel(user: ManagedUser) {
  return (user.team ? TEAM_LABELS[user.team] : undefined) ?? user.legacyTeam ?? "Sin equipo";
}

function userReferenceFromManagedUser(user: ManagedUser): SupervisionUserReference {
  return {
    userId: user.id,
    displayName: user.displayName,
    shortName: user.shortName,
    teamLabel: getUserTeamLabel(user),
    specificRole: user.specificRole
  };
}

function buildUserDirectory(users: ManagedUser[]) {
  const aliasLookup = new Map<string, SupervisionUserReference>();
  const activeUsers = users.filter((user) => user.isActive);

  activeUsers.forEach((user) => {
    const reference = userReferenceFromManagedUser(user);
    const emailLocalPart = user.email.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
    const aliases = [
      user.shortName,
      user.displayName,
      user.username,
      user.specificRole,
      user.email,
      emailLocalPart
    ];

    aliases.forEach((alias) => {
      const key = normalizeKey(alias);
      if (key && !aliasLookup.has(key)) {
        aliasLookup.set(key, reference);
      }
    });
  });

  return { aliasLookup };
}

function fallbackUserReference(responsible: string): SupervisionUserReference {
  const label = responsible.trim() || "Sin responsable";
  return {
    userId: `responsible:${normalizeKey(label) || "unassigned"}`,
    displayName: label,
    shortName: label.length <= 12 ? label.toUpperCase() : undefined,
    teamLabel: "Sin equipo"
  };
}

function resolveResponsibleUsers(responsible: string, aliasLookup: Map<string, SupervisionUserReference>) {
  const segments = splitResponsibleAliases(responsible);
  const candidates = segments.length > 0 ? segments : [responsible];
  const resolved = new Map<string, SupervisionUserReference>();

  candidates.forEach((candidate) => {
    const user = aliasLookup.get(normalizeKey(candidate)) ?? fallbackUserReference(candidate);
    resolved.set(user.userId, user);
  });

  if (resolved.size === 0) {
    const user = fallbackUserReference("");
    resolved.set(user.userId, user);
  }

  return Array.from(resolved.values());
}

function isDateInRange(dateKey: string, range: DateRange | KpiDateRange) {
  return Boolean(dateKey) && dateKey >= range.startDate && dateKey <= range.endDate;
}

function getTaskSummaryKey(dateKey: string, todayKey: string): TaskSummaryKey | undefined {
  if (!dateKey || dateKey < todayKey) {
    return "overdue";
  }

  return dateKey === todayKey ? "today" : undefined;
}

function sortTasks<T extends { dueDate?: string; termDate?: string; clientName: string; taskLabel?: string; termLabel?: string }>(items: T[]) {
  return items.sort((left, right) =>
    (left.dueDate ?? left.termDate ?? "").localeCompare(right.dueDate ?? right.termDate ?? "")
    || left.clientName.localeCompare(right.clientName)
    || (left.taskLabel ?? left.termLabel ?? "").localeCompare(right.taskLabel ?? right.termLabel ?? "")
  );
}

function buildDashboardRanges(todayKey: string): DateRange[] {
  const tomorrowKey = addDaysKey(todayKey, 1);
  const weekEndKey = addDaysKey(getWeekStartKey(todayKey), 6);
  const restStartKey = addDaysKey(todayKey, 2);

  return [
    { key: "today", label: "Hoy", startDate: todayKey, endDate: todayKey },
    { key: "tomorrow", label: "Manana", startDate: tomorrowKey, endDate: tomorrowKey },
    {
      key: "restOfWeek",
      label: "Resto de la semana natural",
      startDate: restStartKey,
      endDate: restStartKey <= weekEndKey ? weekEndKey : addDaysKey(restStartKey, -1)
    }
  ];
}

function buildKpiRanges(todayKey: string): KpiDateRange[] {
  const currentWeekStart = getWeekStartKey(todayKey);
  const currentWeekEnd = addDaysKey(currentWeekStart, 6);
  const lastWeekStart = addDaysKey(currentWeekStart, -7);
  const lastWeekEnd = addDaysKey(currentWeekStart, -1);

  return [
    { key: "lastWeek", label: "Semana pasada", startDate: lastWeekStart, endDate: lastWeekEnd },
    { key: "currentWeek", label: "Esta semana", startDate: currentWeekStart, endDate: currentWeekEnd }
  ];
}

function getUserDashboardPath(moduleId: string, user: SupervisionUserReference) {
  const basePath = getModulePath(moduleId);
  if (basePath === "/app/tasks" || !user.shortName) {
    return basePath;
  }

  return `${basePath}?member=${encodeURIComponent(user.shortName)}&timeframe=hoy`;
}

function buildTaskOverviewByUser(
  todayKey: string,
  tasks: SupervisionTaskCandidate[],
  aliasLookup: Map<string, SupervisionUserReference>
) {
  const groups = new Map<
    string,
    GroupedUserTaskSummary & { linkLookup: Map<string, SupervisionTaskDashboardLink> }
  >();

  sortTasks(tasks).forEach((task) => {
    const summaryKey = getTaskSummaryKey(task.dueDate, todayKey);
    if (!summaryKey) {
      return;
    }

    resolveResponsibleUsers(task.responsible, aliasLookup).forEach((user) => {
      const group = groups.get(user.userId) ?? {
        ...user,
        total: 0,
        today: 0,
        overdue: 0,
        dashboardLinks: [],
        linkLookup: new Map<string, SupervisionTaskDashboardLink>()
      };
      const link = group.linkLookup.get(task.moduleId) ?? {
        moduleId: task.moduleId,
        label: task.moduleLabel,
        path: getUserDashboardPath(task.moduleId, user),
        total: 0,
        today: 0,
        overdue: 0
      };

      group[summaryKey] += 1;
      group.total += 1;
      link[summaryKey] += 1;
      link.total += 1;
      group.linkLookup.set(task.moduleId, link);
      groups.set(user.userId, group);
    });
  });

  const users = Array.from(groups.values())
    .map(({ linkLookup, ...user }) => ({
      ...user,
      dashboardLinks: Array.from(linkLookup.values()).sort((left, right) => left.label.localeCompare(right.label))
    }))
    .sort((left, right) => right.total - left.total || left.displayName.localeCompare(right.displayName));

  return {
    todayTotal: users.reduce((total, user) => total + user.today, 0),
    overdueTotal: users.reduce((total, user) => total + user.overdue, 0),
    total: users.reduce((total, user) => total + user.total, 0),
    users
  };
}

function groupTermsByTeam(range: DateRange, terms: SupervisionTermCandidate[]) {
  const groups = new Map<string, GroupedTeamTerms>();

  sortTasks(terms.filter((term) => isDateInRange(term.termDate, range))).forEach((term) => {
    const group = groups.get(term.moduleId) ?? {
      moduleId: term.moduleId,
      teamLabel: term.teamLabel,
      total: 0,
      terms: []
    };

    group.terms.push(term);
    group.total += 1;
    groups.set(term.moduleId, group);
  });

  return Array.from(groups.values()).sort((left, right) => left.teamLabel.localeCompare(right.teamLabel));
}

function flattenKpiAlerts(period: KpiDateRange, overview: Awaited<ReturnType<KpisRepository["getPeriodOverview"]>>) {
  const users = new Map<string, KpiUserAlerts>();

  overview.teams.forEach((team) => {
    team.users.forEach((user) => {
      const alertMetrics = user.metrics.filter((metric) => KPI_ALERT_STATUSES.includes(metric.status));
      if (alertMetrics.length === 0) {
        return;
      }

      users.set(user.userId, {
        userId: user.userId,
        displayName: user.displayName,
        shortName: user.shortName,
        teamLabel: user.teamLabel,
        specificRole: user.specificRole,
        total: alertMetrics.length,
        metrics: alertMetrics
      });
    });
  });

  const userAlerts = Array.from(users.values()).sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    ...period,
    totalMetrics: userAlerts.reduce((total, user) => total + user.total, 0),
    totalIncidents: userAlerts.reduce(
      (total, user) => total + user.metrics.reduce((metricTotal, metric) => metricTotal + metric.incidents.length, 0),
      0
    ),
    users: userAlerts
  };
}

function buildTaskCandidates(input: {
  taskItems: TaskItem[];
  trackingRecords: TaskTrackingRecord[];
  terms: TaskTerm[];
  additionalTasks: TaskAdditionalTask[];
  matters: Matter[];
  moduleDefinitions: Map<string, TaskModuleDefinition>;
  todayKey: string;
}) {
  const candidates: SupervisionTaskCandidate[] = [];

  input.taskItems
    .filter((task) => OPEN_TASK_STATES.includes(task.state))
    .forEach((task) => {
      const module = input.moduleDefinitions.get(task.moduleId);
      const dueDate = toDateKey(task.dueDate);

      candidates.push({
        id: `task-item:${task.id}`,
        moduleId: task.moduleId,
        moduleLabel: getModuleLabel(module, task.moduleId),
        teamLabel: getTeamLabelFromModule(module, task.moduleId),
        taskLabel: getTrackLabel(module, task.trackId) ?? task.subject,
        clientName: task.clientName || "-",
        subject: task.subject || "-",
        responsible: task.responsible,
        dueDate,
        statusLabel: statusLabel(task.state),
        sourceLabel: getTrackLabel(module, task.trackId) ?? "Tarea",
        originPath: getModulePath(task.moduleId)
      });
    });

  input.trackingRecords
    .filter((record) => OPEN_LEGACY_STATUSES.includes(record.status) && !record.deletedAt)
    .forEach((record) => {
      const module = input.moduleDefinitions.get(record.moduleId);
      const dueDate = toDateKey(record.dueDate || record.termDate);

      const sourceLabel = getRecordSourceLabel(module, record);

      candidates.push({
        id: `tracking:${record.id}`,
        moduleId: record.moduleId,
        moduleLabel: getModuleLabel(module, record.moduleId),
        teamLabel: getTeamLabelFromModule(module, record.moduleId),
        taskLabel: record.taskName || record.eventName || sourceLabel,
        clientName: record.clientName || "-",
        subject: record.subject || "-",
        responsible: record.responsible,
        dueDate,
        statusLabel: statusLabel(record.status),
        sourceLabel,
        originPath: getModulePath(record.moduleId, "/distribuidor")
      });
    });

  input.additionalTasks
    .filter((task) => OPEN_LEGACY_STATUSES.includes(task.status) && !task.deletedAt)
    .forEach((task) => {
      const module = input.moduleDefinitions.get(task.moduleId);
      const dueDate = toDateKey(task.dueDate);

      const responsible = [task.responsible, task.responsible2].filter(Boolean).join("/");

      candidates.push({
        id: `additional:${task.id}`,
        moduleId: task.moduleId,
        moduleLabel: getModuleLabel(module, task.moduleId),
        teamLabel: getTeamLabelFromModule(module, task.moduleId),
        taskLabel: task.task,
        clientName: "-",
        subject: "-",
        responsible,
        dueDate,
        statusLabel: statusLabel(task.status),
        sourceLabel: task.recurring ? "Tarea adicional recurrente" : "Tarea adicional",
        originPath: getModulePath(task.moduleId, "/adicionales")
      });
    });

  input.terms
    .filter((term) => !term.deletedAt)
    .forEach((term) => {
      const module = input.moduleDefinitions.get(term.moduleId);
      const sourcePath = term.sourceRecordId
        ? getModulePath(term.moduleId, "/distribuidor")
        : getModulePath(term.moduleId, term.recurring ? "/terminos-recurrentes" : "/terminos");

      (TASK_VERIFICATION_COLUMNS[term.moduleId] ?? [])
        .filter((column) => !isVerificationValueComplete(term.verification[column.key]))
        .forEach((column) => {
          const responsible = getVerificationResponsible(column);

          candidates.push({
            id: `term-verification:${term.id}:${column.key}`,
            moduleId: term.moduleId,
            moduleLabel: getModuleLabel(module, term.moduleId),
            teamLabel: getTeamLabelFromModule(module, term.moduleId),
            taskLabel: `Verificar termino: ${term.pendingTaskLabel || term.eventName || "Termino sin nombre"}`,
            clientName: term.clientName || "-",
            subject: term.subject || "-",
            responsible,
            dueDate: input.todayKey,
            statusLabel: "Pendiente",
            sourceLabel: "Verificacion de termino",
            originPath: sourcePath
          });
        });
    });

  const litigationModule = input.moduleDefinitions.get(LITIGATION_MODULE_ID);
  input.matters
    .filter((matter) => matter.responsibleTeam === LITIGATION_TEAM)
    .filter((matter) => !matter.deletedAt && !matter.concluded)
    .filter((matter) => !hasExecutionNextTask(matter, input.trackingRecords, input.terms))
    .forEach((matter) => {
      candidates.push({
        id: `litigation-missing-next-task:${matter.id}`,
        moduleId: LITIGATION_MODULE_ID,
        moduleLabel: getModuleLabel(litigationModule, LITIGATION_MODULE_ID),
        teamLabel: getTeamLabelFromModule(litigationModule, LITIGATION_MODULE_ID),
        taskLabel: "Agregar una tarea en Siguiente tarea",
        clientName: matter.clientName || "-",
        subject: matter.subject || "-",
        responsible: LITIGATION_MISSING_NEXT_TASK_OWNER,
        dueDate: input.todayKey,
        statusLabel: "Pendiente",
        sourceLabel: "Ejecucion / Litigio",
        originPath: "/app/execution/litigio"
      });
    });

  return candidates;
}

function buildTermCandidates(input: {
  terms: TaskTerm[];
  trackingRecords: TaskTrackingRecord[];
  moduleDefinitions: Map<string, TaskModuleDefinition>;
}) {
  const candidates: SupervisionTermCandidate[] = [];
  const linkedSourceRecordIds = new Set(input.terms.map((term) => term.sourceRecordId).filter(Boolean));
  const termIds = new Set(input.terms.map((term) => term.id));

  input.terms
    .filter((term) => OPEN_LEGACY_STATUSES.includes(term.status) && !term.deletedAt)
    .forEach((term) => {
      const module = input.moduleDefinitions.get(term.moduleId);
      const termDate = toDateKey(term.termDate || term.dueDate);
      if (!termDate) {
        return;
      }

      candidates.push({
        id: `term:${term.id}`,
        moduleId: term.moduleId,
        moduleLabel: getModuleLabel(module, term.moduleId),
        teamLabel: getTeamLabelFromModule(module, term.moduleId),
        termLabel: `${term.recurring ? "[Recurrente] " : ""}${term.pendingTaskLabel || term.eventName || "Termino"}`,
        clientName: term.clientName || "-",
        subject: term.subject || "-",
        responsible: term.responsible,
        termDate,
        statusLabel: statusLabel(term.status),
        sourceLabel: getTrackLabel(module, term.sourceTable) ?? term.sourceTable ?? "Terminos",
        originPath: getModulePath(term.moduleId, term.recurring ? "/terminos-recurrentes" : "/terminos")
      });
    });

  input.trackingRecords
    .filter((record) => OPEN_LEGACY_STATUSES.includes(record.status) && !record.deletedAt)
    .filter((record) => !record.termId || !termIds.has(record.termId))
    .filter((record) => !linkedSourceRecordIds.has(record.id))
    .forEach((record) => {
      const module = input.moduleDefinitions.get(record.moduleId);
      const termDate = toDateKey(record.termDate);
      if (!termDate) {
        return;
      }

      const sourceLabel = getRecordSourceLabel(module, record);

      candidates.push({
        id: `tracking-term:${record.id}`,
        moduleId: record.moduleId,
        moduleLabel: getModuleLabel(module, record.moduleId),
        teamLabel: getTeamLabelFromModule(module, record.moduleId),
        termLabel: record.taskName || record.eventName || "Termino",
        clientName: record.clientName || "-",
        subject: record.subject || "-",
        responsible: record.responsible,
        termDate,
        statusLabel: statusLabel(record.status),
        sourceLabel,
        originPath: getModulePath(record.moduleId, "/distribuidor")
      });
    });

  return candidates;
}

export class GeneralSupervisionService {
  public constructor(
    private readonly repositories: {
      tasks: TasksRepository;
      matters: MattersRepository;
      users: UsersRepository;
      kpis: KpisRepository;
    }
  ) {}

  public async getOverview() {
    const todayKey = getCurrentDateKey();
    const dashboardRanges = buildDashboardRanges(todayKey);
    const kpiRanges = buildKpiRanges(todayKey);
    const currentWeekStart = getWeekStartKey(todayKey);
    const currentWeekEnd = addDaysKey(currentWeekStart, 6);

    const [storedModules, taskItems, trackingRecords, matters, users] = await Promise.all([
      this.repositories.tasks.listModules(),
      this.repositories.tasks.listTasks(),
      this.repositories.tasks.listTrackingRecords({ includeDeleted: false }),
      this.repositories.matters.list(),
      this.repositories.users.list()
    ]);

    const moduleDefinitions = getTaskModuleDefinitions(storedModules);
    const moduleIds = Array.from(moduleDefinitions.keys());

    const [termsByModule, additionalTasksByModule] = await Promise.all([
      Promise.all(moduleIds.map((moduleId) => this.repositories.tasks.listTerms(moduleId))),
      Promise.all(moduleIds.map((moduleId) => this.repositories.tasks.listAdditionalTasks(moduleId)))
    ]);

    const allTerms = termsByModule.flat();
    const allAdditionalTasks = additionalTasksByModule.flat();
    const { aliasLookup } = buildUserDirectory(users);
    const taskCandidates = buildTaskCandidates({
      taskItems,
      trackingRecords,
      terms: allTerms,
      additionalTasks: allAdditionalTasks,
      matters,
      moduleDefinitions,
      todayKey
    });
    const termCandidates = buildTermCandidates({
      terms: allTerms,
      trackingRecords,
      moduleDefinitions
    });
    const kpiAccessScope: KpiAccessScope = {
      role: "SUPERADMIN",
      legacyRole: "SUPERADMIN",
      permissions: ["*"]
    };
    const kpiOverviews = await Promise.all(
      kpiRanges.map((range) =>
        this.repositories.kpis.getPeriodOverview(range.startDate, range.endDate, kpiAccessScope)
      )
    );

    const taskOverview = buildTaskOverviewByUser(todayKey, taskCandidates, aliasLookup);
    const termBuckets = dashboardRanges.map((range) => {
      const teams = groupTermsByTeam(range, termCandidates);
      return {
        ...range,
        total: teams.reduce((total, team) => total + team.total, 0),
        teams
      };
    });
    const kpiPeriods = kpiRanges.map((range, index) => flattenKpiAlerts(range, kpiOverviews[index]));

    return {
      generatedAt: new Date().toISOString(),
      today: todayKey,
      currentWeekStart,
      currentWeekEnd,
      taskOverview,
      termBuckets,
      kpiPeriods,
      summary: {
        tasks: taskOverview.total,
        terms: termBuckets.reduce((total, bucket) => total + bucket.total, 0),
        kpiAlerts: kpiPeriods.reduce((total, period) => total + period.totalMetrics, 0)
      }
    };
  }
}
