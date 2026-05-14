import type { PrismaClient } from "@prisma/client";
import {
  deriveEffectivePermissions,
  type KpiIncident,
  type KpiMetric,
  type KpiMetricStatus,
  type KpiOverview,
  type KpiTeamSummary,
  type KpiUserSummary,
  type LegacyTaskStatus,
  type Team
} from "@sige/contracts";

import type { KpiAccessScope, KpisRepository } from "./types";

const LITIGATION_MODULE_ID = "litigation";
const BRIEF_TABLE_ALIASES = ["escritos-fondo", "escritos_fondo"];
const WRIT_TABLE_ALIASES = ["escritos", "escritos_kpi"];
const PREVENTION_TABLE_ALIASES = ["desahogo-prevenciones", "desahogo_prevenciones"];

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

const TEAM_ORDER = [
  "LITIGATION",
  "CORPORATE_LABOR",
  "SETTLEMENTS",
  "FINANCIAL_LAW",
  "TAX_COMPLIANCE",
  "AUDIT",
  "CLIENT_RELATIONS",
  "FINANCE",
  "ADMIN_OPERATIONS",
  "ADMIN",
  "UNASSIGNED"
];

const TABLE_LABELS: Record<string, string> = {
  escritos_fondo: "Escritos de fondo",
  escritos_kpi: "Escritos que deben ser presentados",
  desahogo_prevenciones: "Desahogo de prevenciones"
};

const KPI_EXCLUDED_SHORT_NAMES = new Set(["emrt", "iamp", "mavh", "vmse"]);
const KPI_EXCLUDED_USERNAME_KEYS = new Set([
  "eduardo.rusconi",
  "axel mendoza",
  "miguel valencia",
  "veronica salas",
  "veronica salas elisea"
]);
const KPI_EXCLUDED_DISPLAY_NAME_KEYS = new Set([
  "axel mendoza",
  "miguel angel valencia",
  "veronica salas",
  "veronica mariana salas elisea"
]);

interface UserRecord {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  team: string | null;
  legacyTeam: string | null;
  specificRole: string | null;
  isActive: boolean;
}

interface TrackingRecord {
  id: string;
  moduleId: string;
  tableCode: string;
  sourceTable: string;
  clientName: string;
  subject: string;
  matterNumber: string | null;
  matterIdentifier: string | null;
  taskName: string;
  eventName: string | null;
  responsible: string;
  dueDate: Date | null;
  termDate: Date | null;
  completedAt: Date | null;
  status: string;
  workflowStage: number;
  data: unknown;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TermRecord {
  id: string;
  moduleId: string;
  sourceTable: string | null;
  sourceRecordId: string | null;
  clientName: string;
  subject: string;
  matterNumber: string | null;
  matterIdentifier: string | null;
  eventName: string;
  pendingTaskLabel: string | null;
  responsible: string;
  dueDate: Date | null;
  termDate: Date | null;
  status: string;
  recurring: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface VacationEventRecord {
  id: string;
  startDate: Date | null;
  endDate: Date | null;
  vacationDates: unknown;
  laborFile: {
    userId: string | null;
  };
}

interface GlobalVacationDayRecord {
  id: string;
  date: Date;
}

interface PeriodContext {
  startKey: string;
  endKey: string;
  cutoffKey: string;
  todayKey: string;
  businessDaysInPeriod: number;
  businessDaysElapsed: number;
  periodComplete: boolean;
  excludedDateKeys: Set<string>;
}

interface DeadlineSource {
  id: string;
  sourceType: KpiIncident["sourceType"];
  moduleId: string;
  tableCode?: string;
  tableLabel: string;
  clientName: string;
  subject: string;
  matterIdentifier?: string;
  taskName: string;
  responsible: string;
  dueDate?: string;
  termDate?: string;
  completedAt?: string;
  status: LegacyTaskStatus;
  createdAt: string;
}

interface KpiUserConfig {
  key: string;
  aliases: string[];
  buildMetrics: (input: {
    user: UserRecord;
    aliases: string[];
    trackingRecords: TrackingRecord[];
    terms: TermRecord[];
    period: PeriodContext;
  }) => KpiMetric[];
}

function normalizeText(value?: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const objectText = ["label", "name", "key", "value"].find((key) => typeof record[key] === "string");
    if (objectText) {
      return normalizeText(record[objectText]);
    }
  }

  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTableKey(value?: string | null) {
  return normalizeText(value).replace(/[-\s]+/g, "_");
}

function toDateKey(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function addDaysKey(value: string, offset: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return toDateKey(date);
}

function getMonthStartKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function getMonthEndKey(year: number, month: number) {
  return toDateKey(new Date(Date.UTC(year, month, 0, 12, 0, 0)));
}

function isFuturePeriod(startKey: string, todayKey: string) {
  return startKey > todayKey;
}

function getCutoffKey(startKey: string, endKey: string, todayKey: string) {
  if (isFuturePeriod(startKey, todayKey)) {
    return addDaysKey(startKey, -1);
  }

  return endKey < todayKey ? endKey : todayKey;
}

function enumerateDateKeys(startKey: string, endKey: string) {
  if (!startKey || !endKey || startKey > endKey) {
    return [];
  }

  const keys: string[] = [];
  let cursor = startKey;
  while (cursor <= endKey) {
    keys.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }

  return keys;
}

function countBusinessDays(startKey: string, endKey: string, holidayKeys: Set<string>, excludedDateKeys = new Set<string>()) {
  return enumerateDateKeys(startKey, endKey).filter((key) => {
    const day = dateFromKey(key).getUTCDay();
    return day !== 0 && day !== 6 && !holidayKeys.has(key) && !excludedDateKeys.has(key);
  }).length;
}

function formatDecimal(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value);
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function tableMatches(record: { tableCode?: string | null; sourceTable?: string | null }, aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalizeTableKey));
  return [record.tableCode, record.sourceTable].some((candidate) => aliasSet.has(normalizeTableKey(candidate)));
}

function termTableMatches(term: { sourceTable?: string | null }, aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalizeTableKey));
  return aliasSet.has(normalizeTableKey(term.sourceTable));
}

function getTableLabelFromKeys(tableCode?: string | null, sourceTable?: string | null) {
  const normalized = normalizeTableKey(sourceTable) || normalizeTableKey(tableCode);
  return TABLE_LABELS[normalized] ?? sourceTable ?? tableCode ?? "Terminos";
}

function getDataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (["1", "true", "si", "yes"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function isCompletedStatus(status?: string | null) {
  return status === "presentado" || status === "concluida";
}

function isCompletedTrackingRecord(record: TrackingRecord) {
  return isCompletedStatus(record.status) || Boolean(record.completedAt);
}

function getCompletionKey(record: TrackingRecord | TermRecord) {
  if ("completedAt" in record && record.completedAt) {
    return toDateKey(record.completedAt);
  }

  return isCompletedStatus(record.status) ? toDateKey(record.updatedAt) : "";
}

function isDateInRange(value: string, startKey: string, endKey: string) {
  return Boolean(value) && value >= startKey && value <= endKey;
}

function clampDateKey(value: string, startKey: string, endKey: string) {
  if (value < startKey) {
    return startKey;
  }

  if (value > endKey) {
    return endKey;
  }

  return value;
}

function buildVacationKeysByUser(vacationEvents: VacationEventRecord[], startKey: string, endKey: string) {
  const keysByUser = new Map<string, Set<string>>();

  vacationEvents.forEach((event) => {
    const userId = event.laborFile.userId;
    if (!userId) {
      return;
    }

    const explicitDateKeys = Array.isArray(event.vacationDates)
      ? event.vacationDates.filter((entry): entry is string => typeof entry === "string")
      : [];
    const eventDateKeys = explicitDateKeys.length > 0
      ? explicitDateKeys.map((entry) => entry.slice(0, 10)).filter((entry) => isDateInRange(entry, startKey, endKey))
      : [];

    if (eventDateKeys.length === 0) {
      const eventStartKey = toDateKey(event.startDate);
      if (!eventStartKey) {
        return;
      }

      const eventEndKey = toDateKey(event.endDate) || eventStartKey;
      const rangeStart = clampDateKey(eventStartKey, startKey, endKey);
      const rangeEnd = clampDateKey(eventEndKey, startKey, endKey);

      if (rangeStart > rangeEnd) {
        return;
      }

      eventDateKeys.push(...enumerateDateKeys(rangeStart, rangeEnd));
    }

    if (eventDateKeys.length === 0) {
      return;
    }

    const keys = keysByUser.get(userId) ?? new Set<string>();
    eventDateKeys.forEach((key) => keys.add(key));
    keysByUser.set(userId, keys);
  });

  return keysByUser;
}

function buildUserPeriod(period: PeriodContext, vacationKeys: Set<string>, holidayKeys: Set<string>): PeriodContext {
  if (vacationKeys.size === 0) {
    return period;
  }

  return {
    ...period,
    businessDaysInPeriod: countBusinessDays(period.startKey, period.endKey, holidayKeys, vacationKeys),
    businessDaysElapsed: countBusinessDays(period.startKey, period.cutoffKey, holidayKeys, vacationKeys),
    excludedDateKeys: vacationKeys
  };
}

function splitResponsibleAliases(value?: string | null) {
  const normalized = normalizeText(value).replace(/\s*\/\s*/g, "/");
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s*(?:\/|,|;|&|\by\b)\s*/u)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function matchesResponsible(value: string, aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalizeText).filter(Boolean));
  const normalizedValue = normalizeText(value);
  const splitValues = splitResponsibleAliases(value);
  return aliasSet.has(normalizedValue) || splitValues.some((candidate) => aliasSet.has(candidate));
}

function buildUserAliases(user: UserRecord, config: KpiUserConfig) {
  return Array.from(new Set([
    ...config.aliases,
    user.shortName ?? "",
    user.displayName,
    user.username,
    user.specificRole ?? ""
  ].map((value) => value.trim()).filter(Boolean)));
}

function isExcludedFromKpis(user: UserRecord) {
  const shortName = normalizeText(user.shortName);
  const username = normalizeText(user.username);
  const displayName = normalizeText(user.displayName);
  const specificRole = normalizeText(user.specificRole);

  return KPI_EXCLUDED_SHORT_NAMES.has(shortName)
    || KPI_EXCLUDED_USERNAME_KEYS.has(username)
    || KPI_EXCLUDED_DISPLAY_NAME_KEYS.has(displayName)
    || specificRole === "direccion general"
    || user.role === "SUPERADMIN";
}

function getTeamLabel(user: UserRecord) {
  return (user.team ? TEAM_LABELS[user.team] : undefined) ?? user.legacyTeam ?? "Sin equipo";
}

function getTeamKeyFromLabel(label?: string | null) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return undefined;
  }

  const matched = Object.entries(TEAM_LABELS).find(([, teamLabel]) => normalizeText(teamLabel) === normalized);
  return matched?.[0] ?? normalized.toUpperCase().replace(/\s+/g, "_");
}

function getAccessTeamKey(accessScope: KpiAccessScope) {
  return accessScope.team ?? getTeamKeyFromLabel(accessScope.legacyTeam);
}

function getUserTeamKey(user: KpiUserSummary) {
  return user.team ?? getTeamKeyFromLabel(user.teamLabel) ?? "UNASSIGNED";
}

function isGlobalKpiViewer(accessScope: KpiAccessScope) {
  return deriveEffectivePermissions({
    legacyRole: accessScope.legacyRole,
    team: accessScope.team,
    legacyTeam: accessScope.legacyTeam,
    specificRole: accessScope.specificRole,
    permissions: accessScope.permissions
  }).includes("*");
}

function findConfigForUser(user: UserRecord) {
  const candidates = [
    user.shortName,
    user.displayName,
    user.username
  ].map(normalizeText);

  return KPI_USER_CONFIGS.find((config) =>
    candidates.includes(normalizeText(config.key)) || config.aliases.some((alias) => candidates.includes(normalizeText(alias)))
  );
}

function isTermRequiredForTrackingRecord(record: TrackingRecord) {
  if (tableMatches(record, PREVENTION_TABLE_ALIASES)) {
    return true;
  }

  const termEnabled = normalizeBoolean(getDataRecord(record.data).termEnabled);
  return termEnabled === true || Boolean(record.termDate);
}

function trackingToDeadlineSource(record: TrackingRecord): DeadlineSource {
  return {
    id: record.id,
    sourceType: "tracking-record",
    moduleId: record.moduleId,
    tableCode: record.sourceTable || record.tableCode,
    tableLabel: getTableLabelFromKeys(record.tableCode, record.sourceTable),
    clientName: record.clientName || "-",
    subject: record.subject || "-",
    matterIdentifier: record.matterIdentifier ?? record.matterNumber ?? undefined,
    taskName: record.taskName || record.eventName || getTableLabelFromKeys(record.tableCode, record.sourceTable),
    responsible: record.responsible,
    dueDate: toDateKey(record.dueDate) || undefined,
    termDate: toDateKey(record.termDate) || undefined,
    completedAt: getCompletionKey(record) || undefined,
    status: record.status as LegacyTaskStatus,
    createdAt: toDateKey(record.createdAt)
  };
}

function termToDeadlineSource(term: TermRecord): DeadlineSource {
  return {
    id: term.id,
    sourceType: "term",
    moduleId: term.moduleId,
    tableCode: term.sourceTable ?? undefined,
    tableLabel: getTableLabelFromKeys(term.sourceTable, term.sourceTable),
    clientName: term.clientName || "-",
    subject: term.subject || "-",
    matterIdentifier: term.matterIdentifier ?? term.matterNumber ?? undefined,
    taskName: term.pendingTaskLabel || term.eventName || "Termino",
    responsible: term.responsible,
    dueDate: toDateKey(term.dueDate) || undefined,
    termDate: toDateKey(term.termDate) || undefined,
    completedAt: getCompletionKey(term) || undefined,
    status: term.status as LegacyTaskStatus,
    createdAt: toDateKey(term.createdAt)
  };
}

function buildIncident(source: DeadlineSource, reason: string): KpiIncident {
  return {
    id: source.id,
    sourceType: source.sourceType,
    moduleId: source.moduleId,
    tableCode: source.tableCode,
    tableLabel: source.tableLabel,
    clientName: source.clientName,
    subject: source.subject,
    matterIdentifier: source.matterIdentifier,
    taskName: source.taskName,
    responsible: source.responsible,
    dueDate: source.dueDate,
    termDate: source.termDate,
    completedAt: source.completedAt,
    status: source.status,
    reason
  };
}

function evaluateDeadlineSource(source: DeadlineSource, period: PeriodContext) {
  const termKey = source.termDate ?? "";

  if (termKey) {
    if (!isDateInRange(termKey, period.startKey, period.cutoffKey)) {
      return null;
    }

    if (period.excludedDateKeys.has(termKey)) {
      return null;
    }

    if (isCompletedStatus(source.status)) {
      return source.completedAt && source.completedAt > termKey
        ? buildIncident(source, "Presentado o concluido despues del termino.")
        : null;
    }

    return termKey < period.todayKey
      ? buildIncident(source, "Termino vencido sin presentacion o conclusion.")
      : null;
  }

  const fallbackKey = source.dueDate || source.createdAt;
  if (period.excludedDateKeys.has(fallbackKey)) {
    return null;
  }

  if (isDateInRange(fallbackKey, period.startKey, period.cutoffKey) && fallbackKey < period.todayKey && !isCompletedStatus(source.status)) {
    return buildIncident(source, "Fila con termino requerido pero sin fecha de termino capturada.");
  }

  return null;
}

function buildDeadlineIncidents(input: {
  aliases: string[];
  trackingRecords: TrackingRecord[];
  terms: TermRecord[];
  period: PeriodContext;
  tableAliases?: string[];
  excludedTableAliases?: string[];
}) {
  const incidents: KpiIncident[] = [];
  const excluded = input.excludedTableAliases ?? [];

  input.trackingRecords
    .filter((record) => record.moduleId === LITIGATION_MODULE_ID && !record.deletedAt)
    .filter((record) => matchesResponsible(record.responsible, input.aliases))
    .filter((record) => input.tableAliases ? tableMatches(record, input.tableAliases) : true)
    .filter((record) => excluded.length === 0 || !tableMatches(record, excluded))
    .filter(isTermRequiredForTrackingRecord)
    .forEach((record) => {
      const incident = evaluateDeadlineSource(trackingToDeadlineSource(record), input.period);
      if (incident) {
        incidents.push(incident);
      }
    });

  input.terms
    .filter((term) => term.moduleId === LITIGATION_MODULE_ID && !term.deletedAt && !term.sourceRecordId)
    .filter((term) => matchesResponsible(term.responsible, input.aliases))
    .filter((term) => input.tableAliases ? termTableMatches(term, input.tableAliases) : true)
    .filter((term) => excluded.length === 0 || !termTableMatches(term, excluded))
    .forEach((term) => {
      const incident = evaluateDeadlineSource(termToDeadlineSource(term), input.period);
      if (incident) {
        incidents.push(incident);
      }
    });

  return incidents.sort((left, right) =>
    (left.termDate ?? left.dueDate ?? "").localeCompare(right.termDate ?? right.dueDate ?? "")
    || left.clientName.localeCompare(right.clientName)
  );
}

function buildProductionMetric(input: {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  trackingRecords: TrackingRecord[];
  period: PeriodContext;
  tableAliases: string[];
  targetCadence: "six-per-week" | "five-per-day" | "one-per-two-business-days";
  sourceDescription: string;
  sourceTables: string[];
}) {
  const completedRecords = input.trackingRecords
    .filter((record) => record.moduleId === LITIGATION_MODULE_ID && !record.deletedAt)
    .filter((record) => tableMatches(record, input.tableAliases))
    .filter((record) => matchesResponsible(record.responsible, input.aliases))
    .filter(isCompletedTrackingRecord)
    .filter((record) => isDateInRange(getCompletionKey(record), input.period.startKey, input.period.cutoffKey));

  const businessDays = input.period.businessDaysElapsed;
  const value = completedRecords.length;
  const target = input.targetCadence === "six-per-week"
    ? (businessDays / 5) * 6
    : input.targetCadence === "five-per-day"
      ? businessDays * 5
      : businessDays / 2;
  const progressPct = target > 0 ? clampProgress((value / target) * 100) : 100;
  const status: KpiMetricStatus = target <= 0 || value >= target
    ? "met"
    : input.period.periodComplete
      ? "missed"
      : "warning";

  const rate = input.targetCadence === "six-per-week"
    ? (businessDays > 0 ? value / (businessDays / 5) : 0)
    : input.targetCadence === "five-per-day"
      ? (businessDays > 0 ? value / businessDays : 0)
      : (value > 0 ? businessDays / value : 0);

  const targetLabel = input.targetCadence === "six-per-week"
    ? `6 escritos por semana (${formatDecimal(target)} esperados al corte)`
    : input.targetCadence === "five-per-day"
      ? `5 escritos diarios (${formatDecimal(target)} esperados al corte)`
      : `1 escrito por cada 2 dias habiles (${formatDecimal(target)} esperados al corte)`;
  const actualLabel = input.targetCadence === "six-per-week"
    ? `${value} escritos; promedio ${formatDecimal(rate)} por semana`
    : input.targetCadence === "five-per-day"
      ? `${value} escritos; promedio ${formatDecimal(rate)} diarios`
      : `${value} escritos; ritmo ${value > 0 ? formatDecimal(rate) : "sin"} dias habiles por escrito`;

  return {
    id: input.id,
    label: input.label,
    description: input.description,
    kind: "production",
    status,
    value,
    target,
    unit: "escritos",
    progressPct,
    targetLabel,
    actualLabel,
    helper: `${businessDays} dias habiles evaluados automaticamente desde seguimiento.`,
    sourceDescription: input.sourceDescription,
    sourceTables: input.sourceTables,
    incidents: []
  } satisfies KpiMetric;
}

function buildDeadlineMetric(input: {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  trackingRecords: TrackingRecord[];
  terms: TermRecord[];
  period: PeriodContext;
  tableAliases?: string[];
  excludedTableAliases?: string[];
  sourceDescription: string;
  sourceTables: string[];
}) {
  const incidents = buildDeadlineIncidents(input);

  return {
    id: input.id,
    label: input.label,
    description: input.description,
    kind: "deadline",
    status: incidents.length > 0 ? "missed" : "met",
    value: incidents.length,
    target: 0,
    unit: "incidencias",
    progressPct: incidents.length > 0 ? 0 : 100,
    targetLabel: "0 terminos vencidos o presentados tarde",
    actualLabel: `${incidents.length} incidencias`,
    helper: "Se compara fecha de termino contra estado, fecha de presentacion y corte del periodo.",
    sourceDescription: input.sourceDescription,
    sourceTables: input.sourceTables,
    incidents
  } satisfies KpiMetric;
}

const KPI_USER_CONFIGS: KpiUserConfig[] = [
  {
    key: "MEOO",
    aliases: ["MEOO", "Eduardo Olvera", "Litigio (lider)", "Litigio (líder)"],
    buildMetrics: ({ aliases, trackingRecords, terms, period }) => [
      buildProductionMetric({
        id: "meoo-escritos-fondo-semanales",
        label: "Escritos de fondo semanales",
        description: "Que, en promedio, genere 6 escritos de fondo a la semana.",
        aliases,
        trackingRecords,
        period,
        tableAliases: BRIEF_TABLE_ALIASES,
        targetCadence: "six-per-week",
        sourceDescription: "Tabla de seguimiento: Escritos de fondo.",
        sourceTables: ["escritos_fondo"]
      }),
      buildDeadlineMetric({
        id: "meoo-terminos-escritos-fondo",
        label: "Terminos de escritos de fondo",
        description: "Que no se le venza ningun termino en los escritos de fondo.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: BRIEF_TABLE_ALIASES,
        sourceDescription: "Terminos habilitados dentro de Escritos de fondo.",
        sourceTables: ["escritos_fondo"]
      })
    ]
  },
  {
    key: "LAMR",
    aliases: ["LAMR", "Alejandra Mejia", "Alejandra Mejía", "Litigio (colaborador)"],
    buildMetrics: ({ aliases, trackingRecords, terms, period }) => [
      buildProductionMetric({
        id: "lamr-escritos-diarios",
        label: "Escritos no de fondo diarios",
        description: "Que realice y presente 5 escritos no de fondo diarios.",
        aliases,
        trackingRecords,
        period,
        tableAliases: WRIT_TABLE_ALIASES,
        targetCadence: "five-per-day",
        sourceDescription: "Tabla de seguimiento: Escritos que deben ser presentados.",
        sourceTables: ["escritos_kpi"]
      }),
      buildDeadlineMetric({
        id: "lamr-terminos-escritos",
        label: "Terminos de escritos no de fondo",
        description: "Que no se le venza ningun termino en escritos que deben ser presentados no de fondo.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: WRIT_TABLE_ALIASES,
        sourceDescription: "Terminos habilitados dentro de Escritos que deben ser presentados.",
        sourceTables: ["escritos_kpi"]
      }),
      buildDeadlineMetric({
        id: "lamr-terminos-prevenciones",
        label: "Terminos de desahogo de prevenciones",
        description: "Que no se le venza ningun termino en desahogo de prevenciones.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: PREVENTION_TABLE_ALIASES,
        sourceDescription: "Tabla de seguimiento y terminos de Desahogo de prevenciones.",
        sourceTables: ["desahogo_prevenciones"]
      }),
      buildDeadlineMetric({
        id: "lamr-otros-terminos",
        label: "Otros terminos a su cargo",
        description: "Que no se le venza ningun otro termino que sea su responsabilidad.",
        aliases,
        trackingRecords,
        terms,
        period,
        excludedTableAliases: [...WRIT_TABLE_ALIASES, ...PREVENTION_TABLE_ALIASES],
        sourceDescription: "Todos los demas terminos del modulo de litigio asignados a Alejandra.",
        sourceTables: ["terminos_litigio"]
      })
    ]
  },
  {
    key: "EKPO",
    aliases: ["EKPO", "Evelyng Perez", "Evelyng Pérez", "Proyectista 1"],
    buildMetrics: ({ aliases, trackingRecords, terms, period }) => [
      buildProductionMetric({
        id: "ekpo-escritos-fondo-dos-dias",
        label: "Escritos de fondo cada 2 dias habiles",
        description: "Que elabore un escrito de fondo por cada 2 dias habiles maximo.",
        aliases,
        trackingRecords,
        period,
        tableAliases: BRIEF_TABLE_ALIASES,
        targetCadence: "one-per-two-business-days",
        sourceDescription: "Tabla de seguimiento: Escritos de fondo.",
        sourceTables: ["escritos_fondo"]
      }),
      buildDeadlineMetric({
        id: "ekpo-terminos-prevenciones",
        label: "Terminos de desahogo de prevenciones",
        description: "Que no se le venza ningun termino en desahogo de prevenciones a su cargo.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: PREVENTION_TABLE_ALIASES,
        sourceDescription: "Tabla de seguimiento y terminos de Desahogo de prevenciones.",
        sourceTables: ["desahogo_prevenciones"]
      })
    ]
  },
  {
    key: "NBSG",
    aliases: ["NBSG", "Noelia Serrano", "Proyectista 2"],
    buildMetrics: ({ aliases, trackingRecords, terms, period }) => [
      buildProductionMetric({
        id: "nbsg-escritos-fondo-dos-dias",
        label: "Escritos de fondo cada 2 dias habiles",
        description: "Que elabore un escrito de fondo por cada 2 dias habiles maximo.",
        aliases,
        trackingRecords,
        period,
        tableAliases: BRIEF_TABLE_ALIASES,
        targetCadence: "one-per-two-business-days",
        sourceDescription: "Tabla de seguimiento: Escritos de fondo.",
        sourceTables: ["escritos_fondo"]
      }),
      buildDeadlineMetric({
        id: "nbsg-terminos-prevenciones",
        label: "Terminos de desahogo de prevenciones",
        description: "Que no se le venza ningun termino en desahogo de prevenciones a su cargo.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: PREVENTION_TABLE_ALIASES,
        sourceDescription: "Tabla de seguimiento y terminos de Desahogo de prevenciones.",
        sourceTables: ["desahogo_prevenciones"]
      })
    ]
  }
];

export class PrismaKpisRepository implements KpisRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getOverview(year: number, month: number, accessScope: KpiAccessScope): Promise<KpiOverview> {
    const startKey = getMonthStartKey(year, month);
    const endKey = getMonthEndKey(year, month);

    return this.getOverviewForPeriod(startKey, endKey, accessScope);
  }

  public async getPeriodOverview(startDate: string, endDate: string, accessScope: KpiAccessScope): Promise<KpiOverview> {
    return this.getOverviewForPeriod(toDateKey(startDate), toDateKey(endDate), accessScope);
  }

  private async getOverviewForPeriod(startKey: string, endKey: string, accessScope: KpiAccessScope): Promise<KpiOverview> {
    const year = Number(startKey.slice(0, 4));
    const month = Number(startKey.slice(5, 7));
    const todayKey = toDateKey(new Date());
    const cutoffKey = getCutoffKey(startKey, endKey, todayKey);

    const [users, trackingRecords, terms, holidays, vacationEvents, globalVacationDays] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true },
        orderBy: [{ legacyTeam: "asc" }, { team: "asc" }, { displayName: "asc" }]
      }),
      this.prisma.taskTrackingRecord.findMany({
        where: {
          moduleId: LITIGATION_MODULE_ID,
          deletedAt: null
        },
        orderBy: [{ sourceTable: "asc" }, { termDate: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }]
      }),
      this.prisma.taskTerm.findMany({
        where: {
          moduleId: LITIGATION_MODULE_ID,
          deletedAt: null
        },
        orderBy: [{ sourceTable: "asc" }, { termDate: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }]
      }),
      this.prisma.holiday.findMany({
        select: {
          date: true
        },
        where: {
          date: {
            gte: dateFromKey(startKey),
            lte: dateFromKey(endKey)
          }
        }
      }),
      this.prisma.laborVacationEvent.findMany({
        where: {
          eventType: "VACATION",
          startDate: { lte: dateFromKey(endKey) },
          OR: [
            { endDate: null },
            { endDate: { gte: dateFromKey(startKey) } }
          ],
          laborFile: {
            userId: { not: null }
          }
        },
        include: {
          laborFile: {
            select: { userId: true }
          }
        }
      }),
      this.prisma.laborGlobalVacationDay.findMany({
        select: {
          id: true,
          date: true
        },
        where: {
          date: {
            gte: dateFromKey(startKey),
            lte: dateFromKey(endKey)
          }
        }
      })
    ]);

    const holidayKeys = new Set(holidays.map((holiday) => toDateKey(holiday.date)));
    const vacationKeysByUser = buildVacationKeysByUser(vacationEvents as VacationEventRecord[], startKey, endKey);
    const globalVacationKeys = new Set(
      (globalVacationDays as GlobalVacationDayRecord[]).map((day) => toDateKey(day.date))
    );
    const businessDaysInPeriod = countBusinessDays(startKey, endKey, holidayKeys);
    const businessDaysElapsed = countBusinessDays(startKey, cutoffKey, holidayKeys);
    const period: PeriodContext = {
      startKey,
      endKey,
      cutoffKey,
      todayKey,
      businessDaysInPeriod,
      businessDaysElapsed,
      periodComplete: endKey < todayKey,
      excludedDateKeys: new Set()
    };

    const userSummaries = (users as UserRecord[])
      .filter((user) => !isExcludedFromKpis(user))
      .map<KpiUserSummary>((user) => {
        const config = findConfigForUser(user);
        const aliases = config ? buildUserAliases(user, config) : [];
        const vacationKeys = new Set([
          ...globalVacationKeys,
          ...(vacationKeysByUser.get(user.id) ?? new Set<string>())
        ]);
        const userPeriod = buildUserPeriod(period, vacationKeys, holidayKeys);
        const metrics = config
          ? config.buildMetrics({
              user,
              aliases,
              trackingRecords: trackingRecords as TrackingRecord[],
              terms: terms as TermRecord[],
              period: userPeriod
            })
          : [];

        return {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          shortName: user.shortName ?? undefined,
          team: (user.team ?? undefined) as Team | undefined,
          teamLabel: getTeamLabel(user),
          specificRole: user.specificRole ?? undefined,
          configured: Boolean(config),
          metrics
        };
      });

    const visibleUserSummaries = this.filterUsersByAccessScope(userSummaries, accessScope);

    return {
      year,
      month,
      generatedAt: new Date().toISOString(),
      cutoffDate: cutoffKey,
      businessDaysInPeriod,
      businessDaysElapsed,
      sourceNote: "Los KPI's se alimentan automaticamente desde usuarios, tablas de seguimiento, terminos, dias inhabiles y vacaciones registradas; no reciben captura manual.",
      teams: this.groupUsersByTeam(visibleUserSummaries)
    };
  }

  private filterUsersByAccessScope(users: KpiUserSummary[], accessScope: KpiAccessScope) {
    if (isGlobalKpiViewer(accessScope)) {
      return users;
    }

    const teamKey = getAccessTeamKey(accessScope);
    if (!teamKey) {
      return [];
    }

    return users.filter((user) => getUserTeamKey(user) === teamKey);
  }

  private groupUsersByTeam(users: KpiUserSummary[]): KpiTeamSummary[] {
    const groups = new Map<string, KpiTeamSummary>();

    users.forEach((user) => {
      const teamKey = getUserTeamKey(user);
      const existing = groups.get(teamKey);
      const targetGroup = existing ?? {
        teamKey,
        teamLabel: user.teamLabel,
        users: [],
        configuredMetricsCount: 0,
        missedMetricsCount: 0
      };

      targetGroup.users.push(user);
      targetGroup.configuredMetricsCount += user.metrics.length;
      targetGroup.missedMetricsCount += user.metrics.filter((metric) => metric.status === "missed").length;
      groups.set(teamKey, targetGroup);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        users: group.users.sort((left, right) => left.displayName.localeCompare(right.displayName))
      }))
      .sort((left, right) => {
        const leftIndex = TEAM_ORDER.indexOf(left.teamKey);
        const rightIndex = TEAM_ORDER.indexOf(right.teamKey);
        const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

        return normalizedLeftIndex - normalizedRightIndex || left.teamLabel.localeCompare(right.teamLabel);
      });
  }
}
