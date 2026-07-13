import {
  TASK_MODULES,
  type KpiMetric,
  type KpiMetricStatus,
  type LegacyTaskStatus,
  type ManagedUser,
  type TaskAdditionalTask,
  type TaskModuleDefinition,
  type TaskTerm,
  type TaskTrackingRecord
} from "@sige/contracts";

import type {
  GeneralSupervisionObservationActor,
  GeneralSupervisionPreferencesRepository,
  HolidaysRepository,
  KpiAccessScope,
  KpisRepository,
  LaborFilesRepository,
  MattersRepository,
  TasksRepository,
  UsersRepository
} from "../../repositories/types";
import type { KpiCommissionRequirementsService } from "../../repositories/kpi-commission-requirements";
import { AppError } from "../../core/errors/app-error";

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

interface KpiOverrideDateRange {
  key: string;
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
  isSynthetic?: boolean;
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

interface SupervisionCompletedTaskCandidate {
  id: string;
  moduleId: string;
  moduleLabel: string;
  responsible: string;
  completedDate: string;
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
  completedThisMonth: number;
  today: number;
  overdue: number;
  kpiMetDays: number;
  kpiMissedDays: number;
  isObserved: boolean;
  canToggleObservation: boolean;
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
const CLOSED_LEGACY_STATUSES: LegacyTaskStatus[] = ["presentado", "concluida"];
const KPI_ALERT_STATUSES: KpiMetricStatus[] = ["missed", "warning"];
const VERIFICATION_DATES_DATA_KEY = "verificationDates";
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

function getMonthPeriodsInRange(startDate: string, endDate: string) {
  const periods: Array<{ year: number; month: number }> = [];
  let year = Number(startDate.slice(0, 4));
  let month = Number(startDate.slice(5, 7));
  const endYear = Number(endDate.slice(0, 4));
  const endMonth = Number(endDate.slice(5, 7));

  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return periods;
}

function isBusinessDateKey(dateKey: string, holidayKeys: Set<string>) {
  const day = dateFromKey(dateKey).getUTCDay();
  return day !== 0 && day !== 6 && !holidayKeys.has(dateKey);
}

function getFirstBusinessDateKey(startDate: string, endDate: string, holidayKeys: Set<string>) {
  let cursor = startDate;

  while (cursor <= endDate) {
    if (isBusinessDateKey(cursor, holidayKeys)) {
      return cursor;
    }

    cursor = addDaysKey(cursor, 1);
  }

  return startDate;
}

function getLastBusinessDateKey(startDate: string, endDate: string, holidayKeys: Set<string>) {
  let cursor = endDate;

  while (cursor >= startDate) {
    if (isBusinessDateKey(cursor, holidayKeys)) {
      return cursor;
    }

    cursor = addDaysKey(cursor, -1);
  }

  return endDate;
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

function isWeekendDateKey(dateKey: string) {
  const day = dateFromKey(dateKey).getUTCDay();
  return day === 0 || day === 6;
}

function getBusinessWeekRange(dateKey: string) {
  const startDate = getWeekStartKey(dateKey);
  return {
    startDate,
    endDate: addDaysKey(startDate, 4)
  };
}

function getMonthStartKey(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`;
}

function getMonthEndKey(dateKey: string) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
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

function getStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function getVerificationCompletedDateKey(term: TaskTerm, verificationKey: string) {
  const verificationDates = getStringRecord(getDataRecord(term.data)[VERIFICATION_DATES_DATA_KEY]);
  const dateKey = verificationDates[verificationKey];
  return dateKey && /^\d{4}-\d{2}-\d{2}/.test(dateKey)
    ? dateKey.slice(0, 10)
    : toDateKey(term.updatedAt);
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = normalizeKey(value);
    if (["1", "true", "si", "yes"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no"].includes(normalized)) {
      return false;
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

function statusLabel(status: LegacyTaskStatus) {
  if (status === "presentado") {
    return "Presentado";
  }
  if (status === "concluida") {
    return "Concluida";
  }

  return "Pendiente";
}

function isClosedLegacyTask(status: LegacyTaskStatus) {
  return CLOSED_LEGACY_STATUSES.includes(status);
}

function getCompletionDateKey(value: { completedAt?: string; updatedAt: string }) {
  return toDateKey(value.completedAt || value.updatedAt);
}

function isInDateRange(dateKey: string, startDate: string, endDate: string) {
  return Boolean(dateKey) && dateKey >= startDate && dateKey <= endDate;
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

function isTrackingTermEnabledForDashboard(record: TaskTrackingRecord) {
  const configured = normalizeBoolean(getDataRecord(record.data).termEnabled);
  if (configured !== undefined) {
    return configured;
  }

  return Boolean(record.termDate || record.termId);
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

function addUserAliases(
  aliasLookup: Map<string, SupervisionUserReference>,
  user: SupervisionUserReference,
  aliases: Array<string | undefined | null>
) {
  aliases.forEach((alias) => {
    const key = normalizeKey(alias);
    if (key && !aliasLookup.has(key)) {
      aliasLookup.set(key, user);
    }
  });
}

function buildUserDirectory(users: ManagedUser[], modules: TaskModuleDefinition[] = []) {
  const aliasLookup = new Map<string, SupervisionUserReference>();
  const referenceByUserId = new Map<string, SupervisionUserReference>();
  const activeUsers = users.filter((user) => user.isActive);

  activeUsers.forEach((user) => {
    const reference = userReferenceFromManagedUser(user);
    referenceByUserId.set(user.id, reference);
    const emailLocalPart = user.email.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
    const aliases = [
      user.shortName,
      user.displayName,
      user.username,
      user.specificRole,
      user.email,
      emailLocalPart
    ];

    addUserAliases(aliasLookup, reference, aliases);
  });

  modules.forEach((module) => {
    (module.members ?? []).forEach((member) => {
      const reference = referenceByUserId.get(member.userId)
        ?? aliasLookup.get(normalizeKey(member.shortName))
        ?? aliasLookup.get(normalizeKey(member.id))
        ?? aliasLookup.get(normalizeKey(member.name));

      if (!reference) {
        return;
      }

      addUserAliases(aliasLookup, reference, [
        member.id,
        member.name,
        member.shortName,
        member.specificRole,
        ...member.aliases
      ]);
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
    teamLabel: "Sin equipo",
    isSynthetic: true
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

function getTaskSummaryKeys(dateKey: string, todayKey: string): TaskSummaryKey[] {
  if (!dateKey) {
    return ["today"];
  }

  if (dateKey < todayKey) {
    return ["today", "overdue"];
  }

  return dateKey === todayKey ? ["today"] : [];
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
    { key: "tomorrow", label: "Mañana", startDate: tomorrowKey, endDate: tomorrowKey },
    {
      key: "restOfWeek",
      label: "Resto de la semana natural",
      startDate: restStartKey,
      endDate: restStartKey <= weekEndKey ? weekEndKey : addDaysKey(restStartKey, -1)
    }
  ];
}

function buildKpiRanges(todayKey: string): KpiDateRange[] {
  const currentWeek = getBusinessWeekRange(todayKey);

  if (isWeekendDateKey(todayKey)) {
    const nextWeek = getBusinessWeekRange(addDaysKey(currentWeek.startDate, 7));

    return [
      {
        key: "lastWeek",
        label: "Semana pasada",
        startDate: currentWeek.startDate,
        endDate: currentWeek.endDate
      },
      {
        key: "currentWeek",
        label: "Semana actual",
        startDate: nextWeek.startDate,
        endDate: nextWeek.endDate
      }
    ];
  }

  const lastWeek = getBusinessWeekRange(addDaysKey(currentWeek.startDate, -7));

  return [
    { key: "lastWeek", label: "Semana pasada", startDate: lastWeek.startDate, endDate: lastWeek.endDate },
    { key: "currentWeek", label: "Semana actual", startDate: currentWeek.startDate, endDate: currentWeek.endDate }
  ];
}

function buildKpiOverrideRanges(todayKey: string): KpiOverrideDateRange[] {
  const calendarWeek = getBusinessWeekRange(todayKey);
  const currentWeek = isWeekendDateKey(todayKey)
    ? getBusinessWeekRange(addDaysKey(calendarWeek.startDate, 7))
    : calendarWeek;

  return Array.from({ length: 6 }, (_, index) => {
    const range = getBusinessWeekRange(addDaysKey(currentWeek.startDate, index * -7));
    return {
      key: index === 0 ? "currentWeek" : `previousWeek${index}`,
      label: index === 0 ? "Semana actual" : index === 1 ? "Semana pasada" : `Semana anterior ${index}`,
      startDate: range.startDate,
      endDate: range.endDate
    };
  });
}

function getUserDashboardPath(moduleId: string, user: SupervisionUserReference) {
  const basePath = getModulePath(moduleId);
  if (basePath === "/app/tasks" || !user.shortName) {
    return basePath;
  }

  return `${basePath}?member=${encodeURIComponent(user.shortName)}&timeframe=hoy`;
}

function getObservationState(user: SupervisionUserReference, observedUserPreferences: Map<string, boolean>) {
  if (user.isSynthetic) {
    return {
      isObserved: false,
      canToggleObservation: false
    };
  }

  return {
    isObserved: observedUserPreferences.get(user.userId) ?? false,
    canToggleObservation: true
  };
}

function buildTaskOverviewByUser(
  todayKey: string,
  tasks: SupervisionTaskCandidate[],
  completedTasks: SupervisionCompletedTaskCandidate[],
  aliasLookup: Map<string, SupervisionUserReference>,
  eligibleUsers: SupervisionUserReference[],
  monthlyKpiDaysByUser: Map<string, { user: SupervisionUserReference; metDays: number; missedDays: number }>,
  observedUserPreferences: Map<string, boolean>
) {
  const eligibleUserIds = new Set(eligibleUsers.map((user) => user.userId));
  const groups = new Map<
    string,
    GroupedUserTaskSummary & { linkLookup: Map<string, SupervisionTaskDashboardLink> }
  >();

  function getOrCreateGroup(user: SupervisionUserReference) {
    const observationState = getObservationState(user, observedUserPreferences);
    const group = groups.get(user.userId) ?? {
      ...user,
      total: 0,
      completedThisMonth: 0,
      today: 0,
      overdue: 0,
      kpiMetDays: 0,
      kpiMissedDays: 0,
      ...observationState,
      dashboardLinks: [],
      linkLookup: new Map<string, SupervisionTaskDashboardLink>()
    };

    group.isObserved = observationState.isObserved;
    group.canToggleObservation = observationState.canToggleObservation;
    groups.set(user.userId, group);
    return group;
  }

  eligibleUsers.forEach(getOrCreateGroup);

  sortTasks(completedTasks.map((task) => ({
    ...task,
    dueDate: task.completedDate,
    clientName: "",
    taskLabel: task.id
  }))).forEach((task) => {
    resolveResponsibleUsers(task.responsible, aliasLookup)
      .filter((user) => eligibleUserIds.has(user.userId))
      .forEach((user) => {
        const group = getOrCreateGroup(user);
        const link = group.linkLookup.get(task.moduleId) ?? {
          moduleId: task.moduleId,
          label: task.moduleLabel,
          path: getUserDashboardPath(task.moduleId, user),
          total: 0,
          today: 0,
          overdue: 0
        };

        group.completedThisMonth += 1;
        group.total = group.completedThisMonth;
        link.total += 1;
        group.linkLookup.set(task.moduleId, link);
        groups.set(user.userId, group);
      });
  });

  sortTasks(tasks).forEach((task) => {
    const summaryKeys = getTaskSummaryKeys(task.dueDate, todayKey);
    if (summaryKeys.length === 0) {
      return;
    }

    resolveResponsibleUsers(task.responsible, aliasLookup)
      .filter((user) => eligibleUserIds.has(user.userId))
      .forEach((user) => {
        const group = getOrCreateGroup(user);
        const link = group.linkLookup.get(task.moduleId) ?? {
          moduleId: task.moduleId,
          label: task.moduleLabel,
          path: getUserDashboardPath(task.moduleId, user),
          total: 0,
          today: 0,
          overdue: 0
        };

        summaryKeys.forEach((summaryKey) => {
          group[summaryKey] += 1;
          link[summaryKey] += 1;
        });
        link.total += 1;
        group.linkLookup.set(task.moduleId, link);
        groups.set(user.userId, group);
      });
  });

  monthlyKpiDaysByUser.forEach((kpiSummary, userId) => {
    if (!eligibleUserIds.has(userId)) {
      return;
    }

    const group = getOrCreateGroup(kpiSummary.user);
    group.kpiMetDays = kpiSummary.metDays;
    group.kpiMissedDays = kpiSummary.missedDays;
    groups.set(userId, group);
  });

  const users = Array.from(groups.values())
    .map(({ linkLookup, ...user }) => ({
      ...user,
      dashboardLinks: Array.from(linkLookup.values()).sort((left, right) => left.label.localeCompare(right.label))
    }))
    .sort((left, right) =>
      (right.today + right.overdue + right.kpiMissedDays + right.completedThisMonth)
        - (left.today + left.overdue + left.kpiMissedDays + left.completedThisMonth)
      || left.displayName.localeCompare(right.displayName)
    );

  return {
    todayTotal: users.reduce((total, user) => total + user.today, 0),
    overdueTotal: users.reduce((total, user) => total + user.overdue, 0),
    completedThisMonthTotal: users.reduce((total, user) => total + user.completedThisMonth, 0),
    kpiMetDaysTotal: users.reduce((total, user) => total + user.kpiMetDays, 0),
    kpiMissedDaysTotal: users.reduce((total, user) => total + user.kpiMissedDays, 0),
    total: users.reduce((total, user) => total + user.completedThisMonth, 0),
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
      if (user.metrics.length === 0) {
        return;
      }

      users.set(user.userId, {
        userId: user.userId,
        displayName: user.displayName,
        shortName: user.shortName,
        teamLabel: user.teamLabel,
        specificRole: user.specificRole,
        total: alertMetrics.length,
        metrics: user.metrics
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

function flattenKpiOverridePeriod(
  period: KpiOverrideDateRange,
  overview: Awaited<ReturnType<KpisRepository["getPeriodOverview"]>>
) {
  return {
    ...period,
    users: overview.teams.flatMap((team) =>
      team.users.map((user) => ({
        userId: user.userId,
        metrics: user.metrics.map((metric) => ({
          id: metric.id,
          dailyBreakdown: metric.dailyBreakdown.filter((day) =>
            day.date >= period.startDate && day.date <= period.endDate
          )
        })).filter((metric) => metric.dailyBreakdown.length > 0)
      })).filter((user) => user.metrics.length > 0)
    )
  };
}

function buildMonthlyKpiDaysByUser(overview: Awaited<ReturnType<KpisRepository["getPeriodOverview"]>>) {
  const users = new Map<string, { user: SupervisionUserReference; metDays: number; missedDays: number }>();

  overview.teams.forEach((team) => {
    team.users.forEach((user) => {
      const statusesByDate = new Map<string, KpiMetricStatus[]>();

      user.metrics.forEach((metric) => {
        metric.dailyBreakdown.forEach((day) => {
          if (day.status === "not-configured") {
            return;
          }
          statusesByDate.set(day.date, [...(statusesByDate.get(day.date) ?? []), day.status]);
        });
      });

      const days = Array.from(statusesByDate.values());
      const metDays = days.filter((statuses) => statuses.length > 0 && statuses.every((status) => status === "met")).length;
      const missedDays = days.filter((statuses) => statuses.includes("missed")).length;

      if (metDays === 0 && missedDays === 0) {
        return;
      }

      users.set(user.userId, {
        user: {
          userId: user.userId,
          displayName: user.displayName,
          shortName: user.shortName,
          teamLabel: user.teamLabel,
          specificRole: user.specificRole
        },
        metDays,
        missedDays
      });
    });
  });

  return users;
}

function buildTaskCandidates(input: {
  trackingRecords: TaskTrackingRecord[];
  terms: TaskTerm[];
  additionalTasks: TaskAdditionalTask[];
  moduleDefinitions: Map<string, TaskModuleDefinition>;
  todayKey: string;
}) {
  const candidates: SupervisionTaskCandidate[] = [];
  const managerRecordIds = new Set<string>();
  const managerTermIds = new Set<string>();

  input.trackingRecords
    .filter((record) => OPEN_LEGACY_STATUSES.includes(record.status) && !record.deletedAt)
    .filter(isTrackingTermEnabledForDashboard)
    .forEach((record) => {
      managerRecordIds.add(record.id);
      if (record.termId) {
        managerTermIds.add(record.termId);
      }
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

  input.terms
    .filter((term) => !term.deletedAt)
    .filter((term) =>
      term.sourceRecordId
        ? managerRecordIds.has(term.sourceRecordId)
        : managerTermIds.has(term.id)
    )
    .forEach((term) => {
      const module = input.moduleDefinitions.get(term.moduleId);

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
            originPath: getModulePath(term.moduleId, "/distribuidor")
          });
        });
    });

  input.additionalTasks
    .filter((task) => task.status === "pendiente" && !task.deletedAt)
    .forEach((task) => {
      const module = input.moduleDefinitions.get(task.moduleId);

      candidates.push({
        id: `additional:${task.id}`,
        moduleId: task.moduleId,
        moduleLabel: getModuleLabel(module, task.moduleId),
        teamLabel: getTeamLabelFromModule(module, task.moduleId),
        taskLabel: task.task,
        clientName: "-",
        subject: "-",
        responsible: [task.responsible, task.responsible2].filter(Boolean).join("/"),
        dueDate: toDateKey(task.dueDate),
        statusLabel: "Pendiente",
        sourceLabel: "Tareas adicionales",
        originPath: getModulePath(task.moduleId, "/adicionales")
      });
    });

  return candidates;
}

function buildCompletedTaskCandidates(input: {
  trackingRecords: TaskTrackingRecord[];
  terms: TaskTerm[];
  additionalTasks: TaskAdditionalTask[];
  moduleDefinitions: Map<string, TaskModuleDefinition>;
  currentMonthStart: string;
  currentMonthEnd: string;
}) {
  const candidates: SupervisionCompletedTaskCandidate[] = [];
  const managerRecordIds = new Set<string>();
  const managerTermIds = new Set<string>();

  input.trackingRecords
    .filter((record) => !record.deletedAt && isTrackingTermEnabledForDashboard(record))
    .forEach((record) => {
      managerRecordIds.add(record.id);
      if (record.termId) {
        managerTermIds.add(record.termId);
      }
    });

  input.trackingRecords
    .filter((record) => isClosedLegacyTask(record.status) && !record.deletedAt)
    .forEach((record) => {
      const completedDate = getCompletionDateKey(record);
      if (!isInDateRange(completedDate, input.currentMonthStart, input.currentMonthEnd)) {
        return;
      }

      const module = input.moduleDefinitions.get(record.moduleId);
      candidates.push({
        id: `tracking:${record.id}`,
        moduleId: record.moduleId,
        moduleLabel: getModuleLabel(module, record.moduleId),
        responsible: record.responsible,
        completedDate
      });
    });

  input.terms
    .filter((term) => !term.deletedAt)
    .filter((term) =>
      term.sourceRecordId
        ? managerRecordIds.has(term.sourceRecordId)
        : managerTermIds.has(term.id)
    )
    .forEach((term) => {
      const module = input.moduleDefinitions.get(term.moduleId);
      (TASK_VERIFICATION_COLUMNS[term.moduleId] ?? [])
        .filter((column) => isVerificationValueComplete(term.verification[column.key]))
        .forEach((column) => {
          const completedDate = getVerificationCompletedDateKey(term, column.key);
          if (!isInDateRange(completedDate, input.currentMonthStart, input.currentMonthEnd)) {
            return;
          }

          candidates.push({
            id: `term-verification:${term.id}:${column.key}`,
            moduleId: term.moduleId,
            moduleLabel: getModuleLabel(module, term.moduleId),
            responsible: getVerificationResponsible(column),
            completedDate
          });
        });
    });

  input.additionalTasks
    .filter((task) => task.status === "concluida" && !task.deletedAt)
    .forEach((task) => {
      const completedDate = toDateKey(task.updatedAt);
      if (!isInDateRange(completedDate, input.currentMonthStart, input.currentMonthEnd)) {
        return;
      }

      const module = input.moduleDefinitions.get(task.moduleId);
      candidates.push({
        id: `additional:${task.id}`,
        moduleId: task.moduleId,
        moduleLabel: getModuleLabel(module, task.moduleId),
        responsible: [task.responsible, task.responsible2].filter(Boolean).join("/"),
        completedDate
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
  const managerRecords = input.trackingRecords.filter((record) =>
    OPEN_LEGACY_STATUSES.includes(record.status) && !record.deletedAt && isTrackingTermEnabledForDashboard(record)
  );
  const managerRecordIds = new Set(managerRecords.map((record) => record.id));
  const managerTermIds = new Set(managerRecords.map((record) => record.termId).filter((termId): termId is string => Boolean(termId)));
  const managerTerms = input.terms.filter((term) =>
    !term.deletedAt &&
    (term.sourceRecordId
      ? managerRecordIds.has(term.sourceRecordId)
      : managerTermIds.has(term.id))
  );
  const linkedSourceRecordIds = new Set(managerTerms.map((term) => term.sourceRecordId).filter(Boolean));
  const termIds = new Set(managerTerms.map((term) => term.id));

  managerTerms
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
        originPath: getModulePath(term.moduleId, "/distribuidor")
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
      laborFiles: LaborFilesRepository;
      kpis: KpisRepository;
      kpiCommissionRequirements: KpiCommissionRequirementsService;
      holidays: HolidaysRepository;
      supervisionPreferences: GeneralSupervisionPreferencesRepository;
    }
  ) {}

  public async setObservedUser(userId: string, isObserved: boolean, actor: GeneralSupervisionObservationActor) {
    return this.repositories.supervisionPreferences.setObservedUser(userId, isObserved, actor);
  }

  public async setKpiOverride(
    userId: string,
    metricId: string,
    date: string,
    isExcluded: boolean,
    actor: GeneralSupervisionObservationActor
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isWeekendDateKey(date)) {
      throw new AppError(400, "KPI_OVERRIDE_DATE_INVALID", "El override solo puede aplicarse a un dia habil.");
    }

    const overview = await this.repositories.kpis.getPeriodOverview(date, date, {
      role: "SUPERADMIN",
      legacyRole: "SUPERADMIN",
      permissions: ["*"]
    });
    const user = overview.teams.flatMap((team) => team.users).find((candidate) => candidate.userId === userId);
    const metric = user?.metrics.find((candidate) => candidate.id === metricId);

    if (!metric) {
      throw new AppError(404, "KPI_OVERRIDE_METRIC_NOT_FOUND", "No se encontro este KPI para la persona seleccionada.");
    }
    if (metric.emrtOverridePolicy === "not-allowed" || !metric.emrtOverridePolicy) {
      throw new AppError(409, "KPI_OVERRIDE_NOT_ALLOWED", "Los KPI de terminos y vencimientos no admiten override.");
    }

    const saved = await this.repositories.supervisionPreferences.setKpiOverride(
      userId,
      metricId,
      date,
      isExcluded,
      actor
    );
    await this.repositories.kpiCommissionRequirements.synchronize();
    return saved;
  }

  public async getOverview() {
    const todayKey = getCurrentDateKey();
    const dashboardRanges = buildDashboardRanges(todayKey);
    const kpiRanges = buildKpiRanges(todayKey);
    const kpiOverrideRanges = buildKpiOverrideRanges(todayKey);
    const displayWeekReference = isWeekendDateKey(todayKey)
      ? getBusinessWeekRange(addDaysKey(getWeekStartKey(todayKey), 7))
      : getBusinessWeekRange(todayKey);
    const currentWeekStart = displayWeekReference.startDate;
    const currentWeekEnd = displayWeekReference.endDate;
    const currentMonthStart = getMonthStartKey(todayKey);
    const currentMonthEnd = getMonthEndKey(todayKey);
    const currentWeekHolidayPeriods = getMonthPeriodsInRange(currentWeekStart, currentWeekEnd);
    const kpiOverrideStart = kpiOverrideRanges.at(-1)?.startDate ?? currentWeekStart;
    const kpiOverrideEnd = kpiOverrideRanges[0]?.endDate ?? currentWeekEnd;

    const [storedModules, trackingRecords, users, activeLaborFileUserIds, observedUserSettings, kpiOverrides, currentWeekHolidaysByPeriod] = await Promise.all([
      this.repositories.tasks.listModules(),
      this.repositories.tasks.listTrackingRecords({ includeDeleted: false }),
      this.repositories.users.list(),
      this.repositories.laborFiles.listActiveUserIds(),
      this.repositories.supervisionPreferences.listObservedUsers(),
      this.repositories.supervisionPreferences.listKpiOverrides(kpiOverrideStart, kpiOverrideEnd),
      Promise.all(
        currentWeekHolidayPeriods.map((period) =>
          this.repositories.holidays.list(period.year, period.month)
        )
      )
    ]);
    const currentWeekHolidayKeys = new Set(currentWeekHolidaysByPeriod.flat().map((holiday) => holiday.date));
    const currentWeekDisplayStart = getFirstBusinessDateKey(
      currentWeekStart,
      currentWeekEnd,
      currentWeekHolidayKeys
    );
    const currentWeekDisplayEnd = getLastBusinessDateKey(
      currentWeekStart,
      currentWeekEnd,
      currentWeekHolidayKeys
    );

    const moduleDefinitions = getTaskModuleDefinitions(storedModules);
    const moduleIds = Array.from(moduleDefinitions.keys());

    const termsByModule = await Promise.all(
      moduleIds.map((moduleId) => this.repositories.tasks.listTerms(moduleId))
    );
    const additionalTasksByModule = await Promise.all(
      moduleIds.map((moduleId) => this.repositories.tasks.listAdditionalTasks(moduleId))
    );

    const allTerms = termsByModule.flat();
    const allAdditionalTasks = additionalTasksByModule.flat();
    const { aliasLookup } = buildUserDirectory(users, Array.from(moduleDefinitions.values()));
    const activeUsersById = new Map(
      users
        .filter((user) =>
          user.isActive
          && user.createLaborFile
          && user.role !== "SUPERADMIN"
          && user.legacyRole !== "SUPERADMIN"
        )
        .map((user) => [user.id, user])
    );
    const eligibleUsers = activeLaborFileUserIds
      .map((userId) => activeUsersById.get(userId))
      .filter((user): user is ManagedUser => Boolean(user))
      .map(userReferenceFromManagedUser);
    const observedUserPreferences = new Map(observedUserSettings.map((setting) => [setting.userId, setting.isObserved]));
    const taskCandidates = buildTaskCandidates({
      trackingRecords,
      terms: allTerms,
      additionalTasks: allAdditionalTasks,
      moduleDefinitions,
      todayKey
    });
    const completedTaskCandidates = buildCompletedTaskCandidates({
      trackingRecords,
      terms: allTerms,
      additionalTasks: allAdditionalTasks,
      moduleDefinitions,
      currentMonthStart,
      currentMonthEnd
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
    const [kpiOverviews, kpiOverrideOverview, currentMonthKpiOverview, commissionEligibility] = await Promise.all([
      Promise.all(
        kpiRanges.map((range) =>
          this.repositories.kpis.getPeriodOverview(range.startDate, range.endDate, kpiAccessScope)
        )
      ),
      this.repositories.kpis.getPeriodOverview(kpiOverrideStart, kpiOverrideEnd, kpiAccessScope, {
        includeFutureNonEvaluatedDays: true
      }),
      this.repositories.kpis.getPeriodOverview(currentMonthStart, currentMonthEnd, kpiAccessScope),
      this.repositories.kpiCommissionRequirements.getCurrentEligibility()
    ]);

    const monthlyKpiDaysByUser = buildMonthlyKpiDaysByUser(currentMonthKpiOverview);
    const baseTaskOverview = buildTaskOverviewByUser(
      todayKey,
      taskCandidates,
      completedTaskCandidates,
      aliasLookup,
      eligibleUsers,
      monthlyKpiDaysByUser,
      observedUserPreferences
    );
    const commissionEligibilityByUser = new Map(
      commissionEligibility.map((eligibility) => [eligibility.userId, eligibility])
    );
    const taskOverview = {
      ...baseTaskOverview,
      users: baseTaskOverview.users.map((user) => ({
        ...user,
        commissionRequirements: commissionEligibilityByUser.get(user.userId)?.requirements ?? []
      }))
    };
    const termBuckets = dashboardRanges.map((range) => {
      const teams = groupTermsByTeam(range, termCandidates);
      return {
        ...range,
        total: teams.reduce((total, team) => total + team.total, 0),
        teams
      };
    });
    const kpiPeriods = kpiRanges.map((range, index) => flattenKpiAlerts(range, kpiOverviews[index]));
    const kpiOverridePeriods = kpiOverrideRanges.map((range) =>
      flattenKpiOverridePeriod(range, kpiOverrideOverview)
    );

    return {
      generatedAt: new Date().toISOString(),
      today: todayKey,
      currentWeekStart,
      currentWeekDisplayStart,
      currentWeekDisplayEnd,
      currentWeekEnd,
      currentMonthStart,
      currentMonthEnd,
      kpiOverrides,
      kpiOverridePeriods,
      taskOverview,
      termBuckets,
      kpiPeriods,
      summary: {
        tasks: taskOverview.total,
        terms: termBuckets.reduce((total, bucket) => total + bucket.total, 0),
        kpiAlerts: kpiPeriods.reduce((total, period) => total + period.totalMetrics, 0),
        monthlyKpiMisses: taskOverview.kpiMissedDaysTotal
      }
    };
  }
}
