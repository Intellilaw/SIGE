import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  buildLegalFlowSalesTasks,
  deriveEffectivePermissions,
  EXECUTION_HOLIDAY_AUTHORITIES,
  getExecutionMatterMissingFields,
  LEGALFLOW_SALES_PRODUCTS,
  LEGALFLOW_SALES_START_DATE,
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
const DEFAULT_ORGANIZATION_ID = "org-rusconi";
const BUSINESS_TIME_ZONE = "America/Mexico_City";
const KPI_HISTORY_BASELINE_DATE_KEY = "2026-06-17";
const LAMR_KPI_USER_KEY = "LAMR";
const LAMR_EXECUTION_INCOMPLETE_ROWS_KPI_ID = "lamr-filas-incompletas-ejecucion";
const LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD = 2;
const NON_EVALUATED_KPI_DAY_UNIT = "dias-no-evaluados";
const KPI_HOLIDAY_ORGAN_AUTHORITIES = new Set<string>(EXECUTION_HOLIDAY_AUTHORITIES);
const TERM_MARKED_AT_DATA_KEY = "termMarkedAt";
const VERIFICATION_DATES_DATA_KEY = "verificationDates";
const WRITING_PRESENTED_AT_DATA_KEY = "writingPresentedAt";
const WRITING_REGISTERED_AT_DATA_KEY = "writingRegisteredAt";
const BRIEF_PRESENTED_STAGE = 3;
const BRIEF_REGISTERED_STAGE = 4;
const LITIGATION_VERIFICATION_KEYS: Record<string, string> = {
  MEOO: "verificado_meoo",
  LAMR: "verificado_lamr",
  EKPO: "verificado_ekpo",
  NBSG: "verificado_nbsg"
};

const TEAM_LABELS: Record<string, string> = {
  ADMIN: "Direccion general",
  CLIENT_RELATIONS: "Comunicacion con cliente",
  SALES: "Ventas",
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
  "SALES",
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

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

interface UserRecord {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  team: string | null;
  legacyTeam: string | null;
  secondaryTeam: string | null;
  secondaryLegacyTeam: string | null;
  specificRole: string | null;
  secondarySpecificRole: string | null;
  isActive: boolean;
}

interface UserTeamRecord {
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

interface TrackingRecord {
  id: string;
  moduleId: string;
  tableCode: string;
  sourceTable: string;
  matterId: string | null;
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
  termId: string | null;
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
  matterId: string | null;
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
  verification: unknown;
  data: unknown;
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
  vacationDates: unknown;
}

interface HolidayRecord {
  date: Date;
  authorityShortName: string;
}

interface SalesDailyReportRecord {
  id: string;
  productId: string;
  reportDate: Date;
  content: string;
  submittedAt: Date | null;
  updatedAt: Date;
}

interface ClientRecord {
  id: string;
  clientNumber: string;
  name: string;
}

interface MatterRecord {
  id: string;
  matterNumber: string;
  clientNumber: string | null;
  clientName: string;
  quoteNumber: string | null;
  subject: string;
  responsibleTeam: string | null;
  communicationChannel: string;
  matterIdentifier: string | null;
  executionLinkedModule: string | null;
  milestone: string | null;
  deletedAt: Date | null;
}

interface KpiDailySnapshotRecord {
  id: string;
  userKey: string;
  metricId: string;
  snapshotDate: Date;
  status: string;
  value: number;
  target: number;
  unit: string;
  actualLabel: string;
  targetLabel: string;
  helper: string | null;
  incidents: unknown;
  sourceData: unknown;
}

interface PeriodContext {
  startKey: string;
  endKey: string;
  cutoffKey: string;
  todayKey: string;
  businessDaysInPeriod: number;
  businessDaysElapsed: number;
  periodComplete: boolean;
  holidayKeys: Set<string>;
  excludedDateKeys: Set<string>;
  excludedDateLabels: Map<string, string>;
  evaluatedDateKeys: string[];
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
    matters: MatterRecord[];
    clients: ClientRecord[];
    kpiDailySnapshots: KpiDailySnapshotRecord[];
    salesDailyReports: SalesDailyReportRecord[];
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

function getBusinessDateKey(date = new Date()) {
  const parts = Object.fromEntries(
    businessDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
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

function getBusinessDateKeys(startKey: string, endKey: string, holidayKeys: Set<string>, excludedDateKeys = new Set<string>()) {
  return enumerateDateKeys(startKey, endKey).filter((key) => {
    const day = dateFromKey(key).getUTCDay();
    return day !== 0 && day !== 6 && !holidayKeys.has(key) && !excludedDateKeys.has(key);
  });
}

function getWeekdayDateKeys(startKey: string, endKey: string) {
  return enumerateDateKeys(startKey, endKey).filter((key) => {
    const day = dateFromKey(key).getUTCDay();
    return day !== 0 && day !== 6;
  });
}

function buildKpiHolidayKeys(holidays: HolidayRecord[]) {
  const authoritiesByDate = new Map<string, Set<string>>();

  holidays.forEach((holiday) => {
    if (!KPI_HOLIDAY_ORGAN_AUTHORITIES.has(holiday.authorityShortName)) {
      return;
    }

    const dateKey = toDateKey(holiday.date);
    const authorities = authoritiesByDate.get(dateKey) ?? new Set<string>();
    authorities.add(holiday.authorityShortName);
    authoritiesByDate.set(dateKey, authorities);
  });

  return new Set(
    Array.from(authoritiesByDate.entries())
      .filter(([, authorities]) =>
        EXECUTION_HOLIDAY_AUTHORITIES.every((authority) => authorities.has(authority))
      )
      .map(([dateKey]) => dateKey)
  );
}

function buildKpiHolidayLabels(holidayKeys: Set<string>) {
  return new Map(Array.from(holidayKeys).map((dateKey) => [
    dateKey,
    "Dia inhabil para todos los organos"
  ]));
}

function isBusinessDateKey(dateKey: string, period: PeriodContext) {
  const day = dateFromKey(dateKey).getUTCDay();
  return day !== 0 && day !== 6 && !period.holidayKeys.has(dateKey) && !period.excludedDateKeys.has(dateKey);
}

function isBusinessDateKeyForHolidaySet(dateKey: string, holidayKeys: Set<string>) {
  const day = dateFromKey(dateKey).getUTCDay();
  return day !== 0 && day !== 6 && !holidayKeys.has(dateKey);
}

function isKpiMetricStatus(value: unknown): value is KpiMetricStatus {
  return value === "met" || value === "warning" || value === "missed" || value === "not-configured";
}

function parseKpiIncidents(value: unknown): KpiIncident[] {
  return Array.isArray(value) ? value as KpiIncident[] : [];
}

function getExcludedDateLabel(dateKey: string, period: PeriodContext) {
  return period.excludedDateLabels.get(dateKey)
    ?? (period.holidayKeys.has(dateKey) ? "Dia inhabil" : "Dia no evaluado");
}

function buildNonEvaluatedDailyBreakdown(period: PeriodContext) {
  const evaluatedKeys = new Set(period.evaluatedDateKeys);

  return getWeekdayDateKeys(period.startKey, period.cutoffKey)
    .filter((dateKey) => !evaluatedKeys.has(dateKey))
    .filter((dateKey) => period.holidayKeys.has(dateKey) || period.excludedDateKeys.has(dateKey))
    .map((dateKey) => {
      const label = getExcludedDateLabel(dateKey, period);

      return {
        date: dateKey,
        status: "not-configured",
        value: 0,
        target: 0,
        unit: NON_EVALUATED_KPI_DAY_UNIT,
        actualLabel: label,
        targetLabel: "No evaluado",
        helper: `${label}: este dia no cuenta como KPI cumplido ni como KPI incumplido.`,
        incidents: []
      } satisfies KpiMetric["dailyBreakdown"][number];
    });
}

function isNonEvaluatedKpiDay(day: KpiMetric["dailyBreakdown"][number]) {
  return day.status === "not-configured" && day.unit === NON_EVALUATED_KPI_DAY_UNIT;
}

function withNonEvaluatedDays(
  period: PeriodContext,
  dailyBreakdown: Array<KpiMetric["dailyBreakdown"][number]>
) {
  return [...dailyBreakdown, ...buildNonEvaluatedDailyBreakdown(period)]
    .sort((left, right) => left.date.localeCompare(right.date));
}

function isMissingKpiDailySnapshotTableError(error: unknown) {
  const record = getDataRecord(error);
  const meta = getDataRecord(record.meta);
  const code = String(record.code ?? meta.code ?? "");
  const message = String(record.message ?? "");
  const metaMessage = String(meta.message ?? "");

  return (code === "42P01" || code === "P2010")
    && (message.includes("KpiDailySnapshot") || metaMessage.includes("KpiDailySnapshot"));
}

function addBusinessDaysKey(startKey: string, days: number, period: PeriodContext) {
  let cursor = startKey;
  let remaining = days;

  while (remaining > 0) {
    cursor = addDaysKey(cursor, 1);
    if (isBusinessDateKey(cursor, period)) {
      remaining -= 1;
    }
  }

  return cursor;
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

function isYesValue(value: unknown) {
  return ["si", "yes"].includes(normalizeText(typeof value === "string" ? value : ""));
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

function getDateDataValue(data: unknown, key: string) {
  const value = getDataRecord(data)[key];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function getVerificationDate(term: TermRecord, verificationKey: string) {
  const verificationDates = getStringRecord(getDataRecord(term.data)[VERIFICATION_DATES_DATA_KEY]);
  const dateKey = verificationDates[verificationKey];
  if (dateKey && /^\d{4}-\d{2}-\d{2}/.test(dateKey)) {
    return dateKey.slice(0, 10);
  }

  return isYesValue(getStringRecord(term.verification)[verificationKey])
    ? getBaselineOrRecordedDateKey("", term.updatedAt)
    : "";
}

function getBaselineOrRecordedDateKey(value: string, fallbackDate: Date) {
  if (value) {
    return value;
  }

  const fallbackKey = toDateKey(fallbackDate);
  return fallbackKey && fallbackKey > KPI_HISTORY_BASELINE_DATE_KEY ? fallbackKey : KPI_HISTORY_BASELINE_DATE_KEY;
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

function buildUserPeriod(
  period: PeriodContext,
  vacationKeys: Set<string>,
  holidayKeys: Set<string>,
  options?: {
    personalVacationKeys?: Set<string>;
    globalVacationKeys?: Set<string>;
  }
): PeriodContext {
  if (vacationKeys.size === 0) {
    return period;
  }

  const excludedDateLabels = new Map(period.excludedDateLabels);
  vacationKeys.forEach((dateKey) => {
    if (options?.personalVacationKeys?.has(dateKey)) {
      excludedDateLabels.set(dateKey, "Vacaciones");
      return;
    }

    if (options?.globalVacationKeys?.has(dateKey)) {
      excludedDateLabels.set(dateKey, "Vacaciones generales");
      return;
    }

    excludedDateLabels.set(dateKey, "Dia no evaluado");
  });

  return {
    ...period,
    businessDaysInPeriod: countBusinessDays(period.startKey, period.endKey, holidayKeys, vacationKeys),
    businessDaysElapsed: countBusinessDays(period.startKey, period.cutoffKey, holidayKeys, vacationKeys),
    excludedDateKeys: vacationKeys,
    excludedDateLabels,
    evaluatedDateKeys: getBusinessDateKeys(period.startKey, period.cutoffKey, holidayKeys, vacationKeys)
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
    user.specificRole ?? "",
    user.secondarySpecificRole ?? ""
  ].map((value) => value.trim()).filter(Boolean)));
}

function isExcludedFromKpis(user: UserRecord) {
  const shortName = normalizeText(user.shortName);
  const username = normalizeText(user.username);
  const displayName = normalizeText(user.displayName);
  const specificRole = normalizeText(user.specificRole);
  const secondarySpecificRole = normalizeText(user.secondarySpecificRole);

  return KPI_EXCLUDED_SHORT_NAMES.has(shortName)
    || KPI_EXCLUDED_USERNAME_KEYS.has(username)
    || KPI_EXCLUDED_DISPLAY_NAME_KEYS.has(displayName)
    || specificRole === "direccion general"
    || secondarySpecificRole === "direccion general"
    || user.role === "SUPERADMIN";
}

function getTeamLabelFromAssignment(team: string | null | undefined, legacyTeam: string | null | undefined, teamLabelByKey: Map<string, string>) {
  return (team ? teamLabelByKey.get(team) ?? TEAM_LABELS[team] : undefined) ?? legacyTeam ?? "Sin equipo";
}

function getTeamKeyFromLabel(label?: string | null, teamLabelByKey?: Map<string, string>) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return undefined;
  }

  const matchedCatalog = teamLabelByKey
    ? Array.from(teamLabelByKey.entries()).find(([, teamLabel]) => normalizeText(teamLabel) === normalized)
    : undefined;
  if (matchedCatalog) {
    return matchedCatalog[0];
  }

  const matched = Object.entries(TEAM_LABELS).find(([, teamLabel]) => normalizeText(teamLabel) === normalized);
  return matched?.[0] ?? normalized.toUpperCase().replace(/\s+/g, "_");
}

function getUserTeamKey(user: KpiUserSummary, teamLabelByKey?: Map<string, string>) {
  return user.team ?? getTeamKeyFromLabel(user.teamLabel, teamLabelByKey) ?? "UNASSIGNED";
}

function getUserTeamAssignments(user: UserRecord, teamLabelByKey: Map<string, string>) {
  const assignments = [
    {
      teamKey: user.team ?? getTeamKeyFromLabel(user.legacyTeam, teamLabelByKey) ?? "UNASSIGNED",
      teamLabel: getTeamLabelFromAssignment(user.team, user.legacyTeam, teamLabelByKey),
      specificRole: user.specificRole ?? undefined
    },
    {
      teamKey: user.secondaryTeam ?? getTeamKeyFromLabel(user.secondaryLegacyTeam, teamLabelByKey),
      teamLabel: user.secondaryTeam || user.secondaryLegacyTeam
        ? getTeamLabelFromAssignment(user.secondaryTeam, user.secondaryLegacyTeam, teamLabelByKey)
        : undefined,
      specificRole: user.secondarySpecificRole ?? undefined
    }
  ];
  const seen = new Set<string>();

  return assignments.filter((assignment): assignment is {
    teamKey: string;
    teamLabel: string;
    specificRole: string | undefined;
  } => {
    if (!assignment.teamKey || !assignment.teamLabel || seen.has(assignment.teamKey)) {
      return false;
    }

    seen.add(assignment.teamKey);
    return true;
  });
}

function getAccessTeamKeys(accessScope: KpiAccessScope, teamLabelByKey: Map<string, string>) {
  return Array.from(new Set([
    accessScope.team ?? getTeamKeyFromLabel(accessScope.legacyTeam, teamLabelByKey),
    accessScope.secondaryTeam ?? getTeamKeyFromLabel(accessScope.secondaryLegacyTeam, teamLabelByKey)
  ].filter((teamKey): teamKey is string => Boolean(teamKey))));
}

function isGlobalKpiViewer(accessScope: KpiAccessScope) {
  return deriveEffectivePermissions({
    legacyRole: accessScope.legacyRole,
    team: accessScope.team,
    legacyTeam: accessScope.legacyTeam,
    secondaryTeam: accessScope.secondaryTeam,
    secondaryLegacyTeam: accessScope.secondaryLegacyTeam,
    specificRole: accessScope.specificRole,
    secondarySpecificRole: accessScope.secondarySpecificRole,
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

function getMatterReferenceKeys(matter: MatterRecord) {
  return new Set(
    [matter.id, matter.matterNumber, matter.matterIdentifier]
      .map(normalizeText)
      .filter(Boolean)
  );
}

function sourceMatchesMatter(
  source: Pick<TrackingRecord | TermRecord, "matterId" | "matterNumber" | "matterIdentifier">,
  matterKeys: Set<string>
) {
  return [source.matterId, source.matterNumber, source.matterIdentifier]
    .map(normalizeText)
    .some((key) => matterKeys.has(key));
}

function getPendingMatterTaskCount(input: {
  matter: MatterRecord;
  trackingRecords: TrackingRecord[];
  terms: TermRecord[];
}) {
  const matterKeys = getMatterReferenceKeys(input.matter);
  const taskIdentities = new Set<string>();

  input.trackingRecords
    .filter((record) => record.moduleId === LITIGATION_MODULE_ID && !record.deletedAt)
    .filter((record) => record.status === "pendiente")
    .filter((record) => sourceMatchesMatter(record, matterKeys))
    .forEach((record) => taskIdentities.add(`tracking:${record.id}`));

  input.terms
    .filter((term) => term.moduleId === LITIGATION_MODULE_ID && !term.deletedAt && !term.sourceRecordId)
    .filter((term) => term.status === "pendiente")
    .filter((term) => sourceMatchesMatter(term, matterKeys))
    .forEach((term) => taskIdentities.add(`term:${term.id}`));

  return taskIdentities.size;
}

function getClientNumberForMatter(matter: MatterRecord, clients: ClientRecord[]) {
  const normalizedClientName = normalizeText(matter.clientName);
  const matchedClient = normalizedClientName
    ? clients.find((client) => normalizeText(client.name) === normalizedClientName)
    : undefined;

  return matchedClient?.clientNumber ?? matter.clientNumber ?? "";
}

function buildMatterIncident(input: {
  matter: MatterRecord;
  missing: string[];
  dateKey: string;
}): KpiIncident {
  return {
    id: input.matter.id,
    sourceType: "matter",
    moduleId: input.matter.executionLinkedModule ?? LITIGATION_MODULE_ID,
    tableCode: "execution",
    tableLabel: "Ejecucion",
    clientName: input.matter.clientName || "-",
    subject: input.matter.subject || "-",
    matterIdentifier: input.matter.matterIdentifier ?? input.matter.matterNumber,
    taskName: "Fila incompleta en Ejecucion",
    responsible: "LAMR",
    dueDate: input.dateKey,
    status: "pendiente",
    reason: `Faltantes: ${input.missing.join(", ")}`
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

function getProductionDailyTarget(
  targetCadence: "six-per-week" | "five-per-day" | "one-per-two-business-days",
  businessDayIndex: number
) {
  if (targetCadence === "six-per-week") {
    return (businessDayIndex / 5) * 6;
  }

  if (targetCadence === "five-per-day") {
    return 5;
  }

  return Math.floor(businessDayIndex / 2);
}

function getProductionDailyTargetLabel(
  targetCadence: "six-per-week" | "five-per-day" | "one-per-two-business-days",
  target: number
) {
  if (targetCadence === "five-per-day") {
    return "5 escritos esperados en el dia";
  }

  if (targetCadence === "one-per-two-business-days" && target === 0) {
    return "Primer dia habil del bloque; la meta vence al segundo dia habil";
  }

  return `Meta acumulada al corte diario: ${formatDecimal(target)} escritos`;
}

function buildProductionDailyBreakdown(input: {
  completedRecords: TrackingRecord[];
  period: PeriodContext;
  targetCadence: "six-per-week" | "five-per-day" | "one-per-two-business-days";
}) {
  const recordsByDate = new Map<string, TrackingRecord[]>();
  input.completedRecords.forEach((record) => {
    const completionKey = getCompletionKey(record);
    const records = recordsByDate.get(completionKey) ?? [];
    records.push(record);
    recordsByDate.set(completionKey, records);
  });

  let accumulatedValue = 0;

  const dailyBreakdown = input.period.evaluatedDateKeys.map((dateKey, index) => {
    const dayValue = recordsByDate.get(dateKey)?.length ?? 0;
    accumulatedValue += dayValue;
    const businessDayIndex = index + 1;
    const target = getProductionDailyTarget(input.targetCadence, businessDayIndex);
    const value = input.targetCadence === "five-per-day" ? dayValue : accumulatedValue;
    const missingValue = Math.max(0, target - value);
    const status: KpiMetricStatus = value >= target
      ? "met"
      : dateKey === input.period.todayKey && !input.period.periodComplete
        ? "warning"
        : "missed";
    const helper = status === "met"
      ? input.targetCadence === "five-per-day"
        ? "Meta del dia cumplida con la informacion registrada en seguimiento."
        : "Ritmo acumulado cumplido con la informacion registrada en seguimiento."
      : status === "warning"
        ? `El dia sigue en curso; faltan ${formatDecimal(missingValue)} escritos para la meta de referencia.`
        : input.targetCadence === "five-per-day"
          ? `Faltaron ${formatDecimal(missingValue)} escritos para cumplir la meta del dia.`
          : `Faltaron ${formatDecimal(missingValue)} escritos para cumplir el ritmo acumulado al corte de este dia.`;

    return {
      date: dateKey,
      status,
      value,
      target,
      unit: "escritos",
      actualLabel: input.targetCadence === "five-per-day"
        ? `${dayValue} escritos registrados en el dia`
        : `${dayValue} escritos del dia; ${accumulatedValue} acumulados`,
      targetLabel: getProductionDailyTargetLabel(input.targetCadence, target),
      helper,
      incidents: []
    } satisfies KpiMetric["dailyBreakdown"][number];
  });

  return withNonEvaluatedDays(input.period, dailyBreakdown);
}

function getIncidentDateKey(incident: KpiIncident) {
  return incident.termDate ?? incident.dueDate ?? "";
}

function buildDeadlineDailyBreakdown(input: {
  incidents: KpiIncident[];
  period: PeriodContext;
}) {
  const incidentDateKeys = input.incidents
    .map(getIncidentDateKey)
    .filter((dateKey) => isDateInRange(dateKey, input.period.startKey, input.period.cutoffKey));
  const dateKeys = Array.from(new Set([...input.period.evaluatedDateKeys, ...incidentDateKeys])).sort();

  const dailyBreakdown = dateKeys.map((dateKey) => {
    const incidents = input.incidents.filter((incident) => getIncidentDateKey(incident) === dateKey);

    return {
      date: dateKey,
      status: incidents.length > 0 ? "missed" : "met",
      value: incidents.length,
      target: 0,
      unit: "incidencias",
      actualLabel: `${incidents.length} incidencias`,
      targetLabel: "0 incidencias esperadas en el dia",
      helper: incidents.length > 0
        ? "Se detectaron terminos vencidos o presentados fuera de termino en este dia."
        : "No se detectaron terminos vencidos ni presentaciones tardias en este dia.",
      incidents
    } satisfies KpiMetric["dailyBreakdown"][number];
  });

  return withNonEvaluatedDays(input.period, dailyBreakdown);
}

function buildDatedIncident(input: {
  id: string;
  source: DeadlineSource;
  dueKey: string;
  completedKey?: string;
  reason: string;
}) {
  return {
    id: input.id,
    sourceType: input.source.sourceType,
    moduleId: input.source.moduleId,
    tableCode: input.source.tableCode,
    tableLabel: input.source.tableLabel,
    clientName: input.source.clientName,
    subject: input.source.subject,
    matterIdentifier: input.source.matterIdentifier,
    taskName: input.source.taskName,
    responsible: input.source.responsible,
    dueDate: input.dueKey,
    termDate: input.source.termDate,
    completedAt: input.completedKey,
    status: input.source.status,
    reason: input.reason
  } satisfies KpiIncident;
}

function getTermMarkedKeyForRecord(record: TrackingRecord, linkedTerm?: TermRecord) {
  return getDateDataValue(record.data, TERM_MARKED_AT_DATA_KEY)
    || (linkedTerm ? getDateDataValue(linkedTerm.data, TERM_MARKED_AT_DATA_KEY) : "")
    || getBaselineOrRecordedDateKey("", record.createdAt);
}

function getTermMarkedKeyForTerm(term: TermRecord) {
  return getDateDataValue(term.data, TERM_MARKED_AT_DATA_KEY)
    || getBaselineOrRecordedDateKey("", term.createdAt);
}

function buildTermVerificationMetric(input: {
  id: string;
  label: string;
  description: string;
  verificationKey: string;
  verificationLabel: string;
  trackingRecords: TrackingRecord[];
  terms: TermRecord[];
  period: PeriodContext;
}) {
  const termsByRecordId = new Map(
    input.terms
      .filter((term) => term.moduleId === LITIGATION_MODULE_ID && !term.deletedAt && term.sourceRecordId)
      .map((term) => [term.sourceRecordId as string, term])
  );
  const termsById = new Map(
    input.terms
      .filter((term) => term.moduleId === LITIGATION_MODULE_ID && !term.deletedAt)
      .map((term) => [term.id, term])
  );
  const linkedTermIds = new Set<string>();
  const verificationSources: Array<{
    id: string;
    source: DeadlineSource;
    dueKey: string;
    verifiedKey: string;
  }> = [];

  input.trackingRecords
    .filter((record) => record.moduleId === LITIGATION_MODULE_ID && !record.deletedAt)
    .filter(isTermRequiredForTrackingRecord)
    .forEach((record) => {
      const linkedTerm = termsByRecordId.get(record.id) ?? (record.termId ? termsById.get(record.termId) : undefined);
      if (linkedTerm) {
        linkedTermIds.add(linkedTerm.id);
      }

      const markedKey = getTermMarkedKeyForRecord(record, linkedTerm);
      const dueKey = addBusinessDaysKey(markedKey, 1, input.period);
      const verifiedKey = linkedTerm ? getVerificationDate(linkedTerm, input.verificationKey) : "";
      verificationSources.push({
        id: `term-verification:${record.id}:${input.verificationKey}`,
        source: trackingToDeadlineSource(record),
        dueKey,
        verifiedKey
      });
    });

  input.terms
    .filter((term) => term.moduleId === LITIGATION_MODULE_ID && !term.deletedAt && !linkedTermIds.has(term.id))
    .filter((term) => !term.sourceRecordId)
    .forEach((term) => {
      const markedKey = getTermMarkedKeyForTerm(term);
      const dueKey = addBusinessDaysKey(markedKey, 1, input.period);
      verificationSources.push({
        id: `term-verification:${term.id}:${input.verificationKey}`,
        source: termToDeadlineSource(term),
        dueKey,
        verifiedKey: getVerificationDate(term, input.verificationKey)
      });
    });

  const dueSources = verificationSources.filter((source) =>
    isDateInRange(source.dueKey, input.period.startKey, input.period.cutoffKey)
  );
  const incidents = dueSources
    .filter((source) => !source.verifiedKey || source.verifiedKey > source.dueKey)
    .map((source) => buildDatedIncident({
      id: source.id,
      source: source.source,
      dueKey: source.dueKey,
      completedKey: source.verifiedKey || undefined,
      reason: source.verifiedKey
        ? `${input.verificationLabel} marco Si despues del dia habil siguiente.`
        : `${input.verificationLabel} no marco Si dentro del dia habil siguiente.`
    }));
  const verifiedOnTime = dueSources.length - incidents.length;
  const progressPct = dueSources.length > 0 ? clampProgress((verifiedOnTime / dueSources.length) * 100) : 100;
  const incidentDateKeys = incidents
    .map((incident) => incident.dueDate ?? "")
    .filter((dateKey) => isDateInRange(dateKey, input.period.startKey, input.period.cutoffKey));
  const dateKeys = Array.from(new Set([...input.period.evaluatedDateKeys, ...incidentDateKeys])).sort();
  const dailyBreakdown = withNonEvaluatedDays(input.period, dateKeys.map((dateKey) => {
    const dueToday = verificationSources.filter((source) => source.dueKey === dateKey);
    const incidentsToday = incidents.filter((incident) => incident.dueDate === dateKey);
    const verifiedToday = dueToday.length - incidentsToday.length;

    return {
      date: dateKey,
      status: incidentsToday.length > 0 ? "missed" : "met",
      value: verifiedToday,
      target: dueToday.length,
      unit: "verificaciones",
      actualLabel: `${verifiedToday}/${dueToday.length} verificados a tiempo`,
      targetLabel: `${dueToday.length} verificaciones esperadas en el dia`,
      helper: incidentsToday.length > 0
        ? "Hay terminos que no fueron verificados dentro del dia habil siguiente."
        : "Las verificaciones vencidas al corte del dia estan en meta.",
      incidents: incidentsToday
    } satisfies KpiMetric["dailyBreakdown"][number];
  }));

  return {
    id: input.id,
    label: input.label,
    description: input.description,
    kind: "deadline",
    status: incidents.length > 0 ? "missed" : "met",
    value: verifiedOnTime,
    target: dueSources.length,
    unit: "verificaciones",
    progressPct,
    targetLabel: `${dueSources.length} verificaciones esperadas al corte`,
    actualLabel: `${verifiedOnTime} verificaciones a tiempo`,
    helper: "Se revisa el checkbox Es termino y el dropdown individual de verificacion del Manager de tareas.",
    sourceDescription: "Manager de tareas: tareas marcadas como termino y dropdown de verificacion.",
    sourceTables: ["manager_tareas_terminos"],
    incidents,
    dailyBreakdown
  } satisfies KpiMetric;
}

function getBriefPresentedKey(record: TrackingRecord) {
  return getDateDataValue(record.data, WRITING_PRESENTED_AT_DATA_KEY)
    || getBaselineOrRecordedDateKey("", record.updatedAt);
}

function getBriefRegisteredKey(record: TrackingRecord) {
  if (record.workflowStage < BRIEF_REGISTERED_STAGE) {
    return "";
  }

  return getDateDataValue(record.data, WRITING_REGISTERED_AT_DATA_KEY)
    || getBaselineOrRecordedDateKey("", record.updatedAt);
}

function buildBriefBeBlRegistrationMetric(input: {
  aliases: string[];
  trackingRecords: TrackingRecord[];
  period: PeriodContext;
}) {
  const sources = input.trackingRecords
    .filter((record) => record.moduleId === LITIGATION_MODULE_ID && !record.deletedAt)
    .filter((record) => tableMatches(record, BRIEF_TABLE_ALIASES))
    .filter((record) => matchesResponsible(record.responsible, input.aliases))
    .filter((record) => record.workflowStage >= BRIEF_PRESENTED_STAGE)
    .map((record) => {
      const presentedKey = getBriefPresentedKey(record);
      return {
        id: `brief-be-bl:${record.id}`,
        source: trackingToDeadlineSource(record),
        dueKey: addBusinessDaysKey(presentedKey, 1, input.period),
        registeredKey: getBriefRegisteredKey(record)
      };
    });
  const dueSources = sources.filter((source) =>
    isDateInRange(source.dueKey, input.period.startKey, input.period.cutoffKey)
  );
  const incidents = dueSources
    .filter((source) => !source.registeredKey || source.registeredKey > source.dueKey)
    .map((source) => buildDatedIncident({
      id: source.id,
      source: source.source,
      dueKey: source.dueKey,
      completedKey: source.registeredKey || undefined,
      reason: source.registeredKey
        ? "El escrito de fondo fue dado de alta en BE y BL despues del dia habil siguiente."
        : "El escrito de fondo no fue dado de alta en BE y BL dentro del dia habil siguiente."
    }));
  const completedOnTime = dueSources.length - incidents.length;
  const progressPct = dueSources.length > 0 ? clampProgress((completedOnTime / dueSources.length) * 100) : 100;
  const incidentDateKeys = incidents
    .map((incident) => incident.dueDate ?? "")
    .filter((dateKey) => isDateInRange(dateKey, input.period.startKey, input.period.cutoffKey));
  const dateKeys = Array.from(new Set([...input.period.evaluatedDateKeys, ...incidentDateKeys])).sort();
  const dailyBreakdown = withNonEvaluatedDays(input.period, dateKeys.map((dateKey) => {
    const dueToday = sources.filter((source) => source.dueKey === dateKey);
    const incidentsToday = incidents.filter((incident) => incident.dueDate === dateKey);
    const completedToday = dueToday.length - incidentsToday.length;

    return {
      date: dateKey,
      status: incidentsToday.length > 0 ? "missed" : "met",
      value: completedToday,
      target: dueToday.length,
      unit: "escritos",
      actualLabel: `${completedToday}/${dueToday.length} dados de alta a tiempo`,
      targetLabel: `${dueToday.length} altas en BE y BL esperadas`,
      helper: incidentsToday.length > 0
        ? "Hay escritos de fondo que no llegaron a BE y BL dentro del dia habil siguiente."
        : "Las altas en BE y BL vencidas al corte del dia estan en meta.",
      incidents: incidentsToday
    } satisfies KpiMetric["dailyBreakdown"][number];
  }));

  return {
    id: "escritos-fondo-be-bl-dia-habil",
    label: "Dar de alta escritos de fondo en BE y BL",
    description: "Todos los escritos de fondo presentados deben estar dados de alta en BE y BL dentro del dia habil siguiente.",
    kind: "deadline",
    status: incidents.length > 0 ? "missed" : "met",
    value: completedOnTime,
    target: dueSources.length,
    unit: "escritos",
    progressPct,
    targetLabel: `${dueSources.length} escritos esperados en BE y BL al corte`,
    actualLabel: `${completedOnTime} escritos dados de alta a tiempo`,
    helper: "Se mide desde que el escrito de fondo pasa a la pestana 3 Presentados hasta su alta en la pestana 4 BE y BL.",
    sourceDescription: "Tabla de seguimiento: Escritos de fondo, pestanas 3 y 4.",
    sourceTables: ["escritos_fondo"],
    incidents,
    dailyBreakdown
  } satisfies KpiMetric;
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
    incidents: [],
    dailyBreakdown: buildProductionDailyBreakdown({
      completedRecords,
      period: input.period,
      targetCadence: input.targetCadence
    })
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
    incidents,
    dailyBreakdown: buildDeadlineDailyBreakdown({
      incidents,
      period: input.period
    })
  } satisfies KpiMetric;
}

interface ExecutionIncompleteRow {
  matter: MatterRecord;
  missing: string[];
}

interface ExecutionIncompleteRowsEvaluation {
  dateKey: string;
  status: KpiMetricStatus;
  value: number;
  target: number;
  unit: string;
  actualLabel: string;
  targetLabel: string;
  helper: string;
  incidents: KpiIncident[];
  sourceData: {
    incompleteRows: Array<{
      matterId: string;
      matterNumber: string;
      clientName: string;
      subject: string;
      matterIdentifier: string | null;
      missing: string[];
    }>;
  };
}

function getExecutionIncompleteRows(input: {
  matters: MatterRecord[];
  clients: ClientRecord[];
  trackingRecords: TrackingRecord[];
  terms: TermRecord[];
}) {
  return input.matters
    .filter((matter) => !matter.deletedAt)
    .filter((matter) => matter.responsibleTeam === "LITIGATION" || matter.executionLinkedModule === LITIGATION_MODULE_ID)
    .map((matter) => {
      const missing = getExecutionMatterMissingFields({
        clientNumber: getClientNumberForMatter(matter, input.clients),
        clientName: matter.clientName,
        quoteNumber: matter.quoteNumber,
        subject: matter.subject,
        matterIdentifier: matter.matterIdentifier,
        communicationChannel: matter.communicationChannel,
        milestone: matter.milestone,
        taskCount: getPendingMatterTaskCount({
          matter,
          trackingRecords: input.trackingRecords,
          terms: input.terms
        })
      });

      return {
        matter,
        missing
      };
    })
    .filter((row) => row.missing.length > 0) satisfies ExecutionIncompleteRow[];
}

function buildExecutionIncompleteRowsEvaluation(input: {
  matters: MatterRecord[];
  clients: ClientRecord[];
  trackingRecords: TrackingRecord[];
  terms: TermRecord[];
  dateKey: string;
  isOpenBusinessDay: boolean;
}) {
  const incompleteRows = getExecutionIncompleteRows(input);
  const value = incompleteRows.length;
  const status: KpiMetricStatus = !input.dateKey || value <= LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD
    ? "met"
    : input.isOpenBusinessDay
      ? "warning"
      : "missed";
  const incidents = value > LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD && input.dateKey
    ? incompleteRows.map((row) => buildMatterIncident({
      matter: row.matter,
      missing: row.missing,
      dateKey: input.dateKey
    }))
    : [];

  return {
    dateKey: input.dateKey,
    status,
    value,
    target: LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD,
    unit: "filas",
    actualLabel: `${value} filas incompletas`,
    targetLabel: `Maximo ${LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD} filas incompletas`,
    helper: value <= LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD
      ? "El modulo de Ejecucion estuvo dentro del maximo permitido de filas incompletas."
      : input.isOpenBusinessDay
        ? "El dia sigue abierto; hay mas filas incompletas que el maximo permitido."
        : "Hay mas filas incompletas que el maximo permitido al cierre.",
    incidents,
    sourceData: {
      incompleteRows: incompleteRows.map((row) => ({
        matterId: row.matter.id,
        matterNumber: row.matter.matterNumber,
        clientName: row.matter.clientName,
        subject: row.matter.subject,
        matterIdentifier: row.matter.matterIdentifier,
        missing: row.missing
      }))
    }
  } satisfies ExecutionIncompleteRowsEvaluation;
}

function executionEvaluationToDailyMetric(evaluation: ExecutionIncompleteRowsEvaluation) {
  return {
    date: evaluation.dateKey,
    status: evaluation.status,
    value: evaluation.value,
    target: evaluation.target,
    unit: evaluation.unit,
    actualLabel: evaluation.actualLabel,
    targetLabel: evaluation.targetLabel,
    helper: evaluation.helper,
    incidents: evaluation.incidents
  } satisfies KpiMetric["dailyBreakdown"][number];
}

function snapshotToDailyMetric(snapshot: KpiDailySnapshotRecord) {
  const status = isKpiMetricStatus(snapshot.status)
    ? snapshot.status
    : snapshot.value <= snapshot.target
      ? "met"
      : "missed";

  return {
    date: toDateKey(snapshot.snapshotDate),
    status,
    value: snapshot.value,
    target: snapshot.target,
    unit: snapshot.unit,
    actualLabel: snapshot.actualLabel,
    targetLabel: snapshot.targetLabel,
    helper: snapshot.helper ?? "Snapshot diario guardado al cierre del dia.",
    incidents: parseKpiIncidents(snapshot.incidents)
  } satisfies KpiMetric["dailyBreakdown"][number];
}

function buildMissingExecutionSnapshotDailyMetric(dateKey: string) {
  return {
    date: dateKey,
    status: "not-configured",
    value: 0,
    target: LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD,
    unit: NON_EVALUATED_KPI_DAY_UNIT,
    actualLabel: "Sin snapshot diario",
    targetLabel: "No evaluado",
    helper: "No hay snapshot de cierre guardado para este dia; no cuenta como KPI cumplido ni como KPI incumplido.",
    incidents: []
  } satisfies KpiMetric["dailyBreakdown"][number];
}

function summarizeDailyStatus(dailyBreakdown: Array<KpiMetric["dailyBreakdown"][number]>): KpiMetricStatus {
  const evaluatedDays = dailyBreakdown.filter((day) => !isNonEvaluatedKpiDay(day));

  if (evaluatedDays.length === 0) {
    return "not-configured";
  }

  if (evaluatedDays.some((day) => day.status === "missed")) {
    return "missed";
  }

  if (evaluatedDays.some((day) => day.status === "warning")) {
    return "warning";
  }

  return "met";
}

function buildExecutionIncompleteRowsMetric(input: {
  matters: MatterRecord[];
  clients: ClientRecord[];
  trackingRecords: TrackingRecord[];
  terms: TermRecord[];
  kpiDailySnapshots: KpiDailySnapshotRecord[];
  period: PeriodContext;
}) {
  const liveDateKey = input.period.cutoffKey >= input.period.startKey ? input.period.cutoffKey : "";
  const liveEvaluation = liveDateKey
    ? buildExecutionIncompleteRowsEvaluation({
      matters: input.matters,
      clients: input.clients,
      trackingRecords: input.trackingRecords,
      terms: input.terms,
      dateKey: liveDateKey,
      isOpenBusinessDay: liveDateKey === input.period.todayKey && !input.period.periodComplete
    })
    : null;
  const snapshotsByDate = new Map(
    input.kpiDailySnapshots
      .filter((snapshot) => snapshot.userKey === LAMR_KPI_USER_KEY)
      .filter((snapshot) => snapshot.metricId === LAMR_EXECUTION_INCOMPLETE_ROWS_KPI_ID)
      .map((snapshot) => [toDateKey(snapshot.snapshotDate), snapshot])
  );
  const dailyBreakdown = withNonEvaluatedDays(input.period, input.period.evaluatedDateKeys
    .filter((dateKey) => dateKey >= KPI_HISTORY_BASELINE_DATE_KEY)
    .flatMap((dateKey) => {
      const snapshot = snapshotsByDate.get(dateKey);
      if (snapshot) {
        return [snapshotToDailyMetric(snapshot)];
      }

      if (
        liveEvaluation
        && dateKey === liveEvaluation.dateKey
        && dateKey === input.period.todayKey
      ) {
        return [executionEvaluationToDailyMetric(liveEvaluation)];
      }

      return [buildMissingExecutionSnapshotDailyMetric(dateKey)];
    }));
  const status = summarizeDailyStatus(dailyBreakdown);
  const currentDay = dailyBreakdown.filter((day) => !isNonEvaluatedKpiDay(day)).at(-1) ?? null;
  const value = currentDay?.value ?? 0;
  const progressPct = currentDay
    ? currentDay.value <= currentDay.target
      ? 100
      : clampProgress((currentDay.target / currentDay.value) * 100)
    : 0;
  const incidents = dailyBreakdown
    .filter((day) => day.status === "missed" || day.status === "warning")
    .flatMap((day) => day.incidents);

  return {
    id: LAMR_EXECUTION_INCOMPLETE_ROWS_KPI_ID,
    label: "Filas incompletas en Ejecucion",
    description: "Al cierre del dia debe haber como maximo 2 filas incompletas en el modulo de Ejecucion.",
    kind: "deadline",
    status,
    value,
    target: LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD,
    unit: "filas",
    progressPct,
    targetLabel: `Maximo ${LAMR_EXECUTION_INCOMPLETE_ROWS_THRESHOLD} filas incompletas`,
    actualLabel: currentDay?.actualLabel ?? "Sin snapshot diario",
    helper: dailyBreakdown.length > 0
      ? "Los dias cerrados se leen desde snapshots diarios del cierre; el dia abierto solo aparece si esta en observacion."
      : "Sin snapshots diarios disponibles para el periodo evaluado.",
    sourceDescription: "Modulo de Ejecucion: asuntos activos de Litigio y columna Faltantes.",
    sourceTables: ["execution_matters"],
    incidents,
    dailyBreakdown
  } satisfies KpiMetric;
}

function buildSalesDailyReportMetric(input: {
  salesDailyReports: SalesDailyReportRecord[];
  period: PeriodContext;
}) {
  const productById = new Map(LEGALFLOW_SALES_PRODUCTS.map((product) => [product.id, product]));
  const expectedTasks = buildLegalFlowSalesTasks(input.period.cutoffKey)
    .filter((task) => task.responsibleId === "IR")
    .filter((task) => isDateInRange(task.dueDate, input.period.startKey, input.period.cutoffKey))
    .filter((task) => task.dueDate >= LEGALFLOW_SALES_START_DATE);
  const reportByProductAndDate = new Map(
    input.salesDailyReports
      .filter((report) => report.content.trim().length > 0)
      .map((report) => [`${report.productId}:${toDateKey(report.reportDate)}`, report])
  );
  const submittedCount = expectedTasks.filter((task) => reportByProductAndDate.has(`${task.productId}:${task.dueDate}`)).length;
  const target = expectedTasks.length;
  const progressPct = target > 0 ? clampProgress((submittedCount / target) * 100) : 100;
  const status: KpiMetricStatus = submittedCount >= target
    ? "met"
    : input.period.periodComplete
      ? "missed"
      : "warning";

  const dailyBreakdown = withNonEvaluatedDays(input.period, expectedTasks.map((task) => {
    const product = productById.get(task.productId);
    const report = reportByProductAndDate.get(`${task.productId}:${task.dueDate}`);
    const value = report ? 1 : 0;
    const dayStatus: KpiMetricStatus = value >= 1
      ? "met"
      : task.dueDate === input.period.todayKey && !input.period.periodComplete
        ? "warning"
        : "missed";

    return {
      date: task.dueDate,
      status: dayStatus,
      value,
      target: 1,
      unit: "reportes",
      actualLabel: report ? "1 reporte guardado" : "0 reportes guardados",
      targetLabel: `1 reporte de actividad de ${product?.name ?? task.productId}`,
      helper: report
        ? `Reporte guardado en el modulo de Ventas para ${product?.name ?? task.productId}.`
        : `No se encontro reporte guardado en Ventas para ${product?.name ?? task.productId}.`,
      incidents: []
    } satisfies KpiMetric["dailyBreakdown"][number];
  }));

  return {
    id: "ijrr-reporte-actividad-diario-ventas",
    label: "Reporte diario de actividad en Ventas",
    description: "Se debe enviar el reporte de actividad diario en el modulo de Ventas.",
    kind: "production",
    status,
    value: submittedCount,
    target,
    unit: "reportes",
    progressPct,
    targetLabel: `${target} reportes esperados al corte`,
    actualLabel: `${submittedCount} reportes guardados`,
    helper: "Se verifica automaticamente la bitacora diaria guardada en RDS desde el modulo de Ventas.",
    sourceDescription: "Modulo de Ventas: reportes diarios de actividad.",
    sourceTables: ["sales_daily_reports"],
    incidents: [],
    dailyBreakdown
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
        description: "Se deben generar, en promedio, 6 escritos de fondo a la semana.",
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
        description: "Se debe evitar que venza ningun termino en los escritos de fondo.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: BRIEF_TABLE_ALIASES,
        sourceDescription: "Terminos habilitados dentro de Escritos de fondo.",
        sourceTables: ["escritos_fondo"]
      }),
      buildTermVerificationMetric({
        id: "meoo-verificaciones-terminos",
        label: "Verificaciones de terminos",
        description: "Todos los terminos marcados en el Manager de tareas deben verificarse a mas tardar al dia habil siguiente.",
        verificationKey: LITIGATION_VERIFICATION_KEYS.MEOO,
        verificationLabel: "MEOO",
        trackingRecords,
        terms,
        period
      })
    ]
  },
  {
    key: "LAMR",
    aliases: ["LAMR", "Alejandra Mejia", "Alejandra Mejía", "Litigio (colaborador)"],
    buildMetrics: ({ aliases, trackingRecords, terms, matters, clients, kpiDailySnapshots, period }) => [
      buildProductionMetric({
        id: "lamr-escritos-diarios",
        label: "Escritos no de fondo diarios",
        description: "Se deben realizar y presentar 5 escritos no de fondo diarios.",
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
        description: "Se debe evitar que venza ningun termino en escritos que deben ser presentados no de fondo.",
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
        description: "Se debe evitar que venza ningun termino en desahogo de prevenciones.",
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
        description: "Se debe evitar que venza ningun otro termino que sea su responsabilidad.",
        aliases,
        trackingRecords,
        terms,
        period,
        excludedTableAliases: [...WRIT_TABLE_ALIASES, ...PREVENTION_TABLE_ALIASES],
        sourceDescription: "Todos los demas terminos del modulo de litigio asignados a Alejandra.",
        sourceTables: ["terminos_litigio"]
      }),
      buildTermVerificationMetric({
        id: "lamr-verificaciones-terminos",
        label: "Verificaciones de terminos",
        description: "Todos los terminos marcados en el Manager de tareas deben verificarse a mas tardar al dia habil siguiente.",
        verificationKey: LITIGATION_VERIFICATION_KEYS.LAMR,
        verificationLabel: "LAMR",
        trackingRecords,
        terms,
        period
      }),
      buildExecutionIncompleteRowsMetric({
        matters,
        clients,
        trackingRecords,
        terms,
        kpiDailySnapshots,
        period
      })
    ]
  },
  {
    key: "EKPO",
    aliases: ["EKPO", "Evelyng Perez", "Evelyng Pérez", "Proyectista 1"],
    buildMetrics: ({ aliases, trackingRecords, terms, period }) => [
      buildDeadlineMetric({
        id: "ekpo-terminos-prevenciones",
        label: "Terminos de desahogo de prevenciones",
        description: "No se debe vencer ningun termino de desahogo de prevenciones.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: PREVENTION_TABLE_ALIASES,
        sourceDescription: "Tabla de seguimiento y terminos de Desahogo de prevenciones.",
        sourceTables: ["desahogo_prevenciones"]
      }),
      buildTermVerificationMetric({
        id: "ekpo-verificaciones-terminos",
        label: "Verificaciones de terminos",
        description: "Todos los terminos deben estar verificados dentro del dia habil siguiente a aquel en el que la tarea de termino fue subida al Manager de tareas.",
        verificationKey: LITIGATION_VERIFICATION_KEYS.EKPO,
        verificationLabel: "EKPO",
        trackingRecords,
        terms,
        period
      }),
      buildBriefBeBlRegistrationMetric({
        aliases,
        trackingRecords,
        period
      })
    ]
  },
  {
    key: "NBSG",
    aliases: ["NBSG", "Noelia Serrano", "Proyectista 2"],
    buildMetrics: ({ aliases, trackingRecords, terms, period }) => [
      buildDeadlineMetric({
        id: "nbsg-terminos-prevenciones",
        label: "Terminos de desahogo de prevenciones",
        description: "No se debe vencer ningun termino de desahogo de prevenciones.",
        aliases,
        trackingRecords,
        terms,
        period,
        tableAliases: PREVENTION_TABLE_ALIASES,
        sourceDescription: "Tabla de seguimiento y terminos de Desahogo de prevenciones.",
        sourceTables: ["desahogo_prevenciones"]
      }),
      buildTermVerificationMetric({
        id: "nbsg-verificaciones-terminos",
        label: "Verificaciones de terminos",
        description: "Todos los terminos deben estar verificados dentro del dia habil siguiente a aquel en el que la tarea de termino fue subida al Manager de tareas.",
        verificationKey: LITIGATION_VERIFICATION_KEYS.NBSG,
        verificationLabel: "NBSG",
        trackingRecords,
        terms,
        period
      }),
      buildBriefBeBlRegistrationMetric({
        aliases,
        trackingRecords,
        period
      })
    ]
  },
  {
    key: "IJRR",
    aliases: ["IJRR", "IR", "Itari Romero", "Itari Jhoana Romero Romero", "Ventas"],
    buildMetrics: ({ salesDailyReports, period }) => [
      buildSalesDailyReportMetric({
        salesDailyReports,
        period
      })
    ]
  }
];

export class PrismaKpisRepository implements KpisRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async captureExecutionIncompleteRowsSnapshot(dateKey = getBusinessDateKey()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new Error(`Invalid KPI snapshot date: ${dateKey}`);
    }

    const holidayRecords = await this.prisma.holiday.findMany({
      select: { date: true, authorityShortName: true },
      where: {
        date: {
          gte: dateFromKey(dateKey),
          lte: dateFromKey(dateKey)
        }
      }
    });
    const holidayKeys = buildKpiHolidayKeys(holidayRecords);

    if (!isBusinessDateKeyForHolidaySet(dateKey, holidayKeys)) {
      return {
        dateKey,
        skipped: true,
        reason: "not-business-day"
      };
    }

    const [trackingRecords, terms, matters, clients] = await Promise.all([
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
      this.prisma.matter.findMany({
        select: {
          id: true,
          matterNumber: true,
          clientNumber: true,
          clientName: true,
          quoteNumber: true,
          subject: true,
          responsibleTeam: true,
          communicationChannel: true,
          matterIdentifier: true,
          executionLinkedModule: true,
          milestone: true,
          deletedAt: true
        },
        where: {
          deletedAt: null,
          OR: [
            { responsibleTeam: "LITIGATION" },
            { executionLinkedModule: LITIGATION_MODULE_ID }
          ]
        },
        orderBy: [{ clientNumber: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.client.findMany({
        select: {
          id: true,
          clientNumber: true,
          name: true
        },
        where: {
          deletedAt: null
        },
        orderBy: [{ clientNumber: "asc" }]
      })
    ]);

    const evaluation = buildExecutionIncompleteRowsEvaluation({
      matters: matters as MatterRecord[],
      clients: clients as ClientRecord[],
      trackingRecords: trackingRecords as TrackingRecord[],
      terms: terms as TermRecord[],
      dateKey,
      isOpenBusinessDay: false
    });
    const snapshotDate = dateFromKey(dateKey);
    const snapshotId = randomUUID();
    const now = new Date();
    const snapshots = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "KpiDailySnapshot" (
        "id",
        "organizationId",
        "userKey",
        "metricId",
        "snapshotDate",
        "status",
        "value",
        "target",
        "unit",
        "actualLabel",
        "targetLabel",
        "helper",
        "incidents",
        "sourceData",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${snapshotId},
        ${DEFAULT_ORGANIZATION_ID},
        ${LAMR_KPI_USER_KEY},
        ${LAMR_EXECUTION_INCOMPLETE_ROWS_KPI_ID},
        CAST(${snapshotDate} AS date),
        ${evaluation.status},
        ${evaluation.value},
        ${evaluation.target},
        ${evaluation.unit},
        ${evaluation.actualLabel},
        ${evaluation.targetLabel},
        ${evaluation.helper},
        CAST(${JSON.stringify(evaluation.incidents)} AS jsonb),
        CAST(${JSON.stringify(evaluation.sourceData)} AS jsonb),
        ${now},
        ${now}
      )
      ON CONFLICT ("organizationId", "userKey", "metricId", "snapshotDate")
      DO UPDATE SET
        "status" = EXCLUDED."status",
        "value" = EXCLUDED."value",
        "target" = EXCLUDED."target",
        "unit" = EXCLUDED."unit",
        "actualLabel" = EXCLUDED."actualLabel",
        "targetLabel" = EXCLUDED."targetLabel",
        "helper" = EXCLUDED."helper",
        "incidents" = EXCLUDED."incidents",
        "sourceData" = EXCLUDED."sourceData",
        "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id"
    `);
    const snapshot = snapshots[0];

    return {
      dateKey,
      skipped: false,
      snapshotId: snapshot?.id ?? snapshotId,
      status: evaluation.status,
      value: evaluation.value,
      incidentCount: evaluation.incidents.length
    };
  }

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
    const todayKey = getBusinessDateKey();
    const cutoffKey = getCutoffKey(startKey, endKey, todayKey);

    const [users, userTeams, trackingRecords, terms, matters, clients, kpiDailySnapshots, salesDailyReports, holidays, vacationEvents, globalVacationDays] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true },
        orderBy: [{ legacyTeam: "asc" }, { team: "asc" }, { displayName: "asc" }]
      }),
      this.prisma.userTeam.findMany({
        orderBy: [
          { sortOrder: "asc" },
          { label: "asc" }
        ]
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
      this.prisma.matter.findMany({
        select: {
          id: true,
          matterNumber: true,
          clientNumber: true,
          clientName: true,
          quoteNumber: true,
          subject: true,
          responsibleTeam: true,
          communicationChannel: true,
          matterIdentifier: true,
          executionLinkedModule: true,
          milestone: true,
          deletedAt: true
        },
        where: {
          deletedAt: null,
          OR: [
            { responsibleTeam: "LITIGATION" },
            { executionLinkedModule: LITIGATION_MODULE_ID }
          ]
        },
        orderBy: [{ clientNumber: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.client.findMany({
        select: {
          id: true,
          clientNumber: true,
          name: true
        },
        where: {
          deletedAt: null
        },
        orderBy: [{ clientNumber: "asc" }]
      }),
      this.listKpiDailySnapshots(startKey, cutoffKey),
      this.prisma.salesDailyReport.findMany({
        where: {
          reportDate: {
            gte: dateFromKey(startKey),
            lte: dateFromKey(endKey)
          }
        },
        orderBy: [{ reportDate: "asc" }, { productId: "asc" }]
      }),
      this.prisma.holiday.findMany({
        select: {
          date: true,
          authorityShortName: true
        },
        where: {
          date: {
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
          date: true,
          vacationDates: true
        },
        where: {
          date: {
            gte: dateFromKey(startKey),
            lte: dateFromKey(endKey)
          }
        }
      })
    ]);
    const teamCatalog = userTeams as UserTeamRecord[];
    const activeTeamCatalog = teamCatalog.filter((team) => team.isActive);
    const activeTeamKeys = new Set(activeTeamCatalog.map((team) => team.key));
    const teamLabelByKey = new Map(teamCatalog.map((team) => [team.key, team.label]));

    const holidayKeys = buildKpiHolidayKeys(holidays as HolidayRecord[]);
    const holidayLabels = buildKpiHolidayLabels(holidayKeys);
    const vacationKeysByUser = buildVacationKeysByUser(vacationEvents as VacationEventRecord[], startKey, endKey);
    const globalVacationKeys = new Set(
      (globalVacationDays as GlobalVacationDayRecord[]).flatMap((day) => {
        if (Array.isArray(day.vacationDates)) {
          return day.vacationDates
            .filter((date): date is string => typeof date === "string")
            .map((date) => date.slice(0, 10))
            .filter((date) => date >= startKey && date <= endKey);
        }

        return [toDateKey(day.date)];
      })
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
      holidayKeys,
      excludedDateKeys: new Set(),
      excludedDateLabels: holidayLabels,
      evaluatedDateKeys: getBusinessDateKeys(startKey, cutoffKey, holidayKeys)
    };

    const userSummaries = (users as UserRecord[])
      .filter((user) => !isExcludedFromKpis(user))
      .flatMap<KpiUserSummary>((user) => {
        const config = findConfigForUser(user);
        const aliases = config ? buildUserAliases(user, config) : [];
        const vacationKeys = new Set([
          ...globalVacationKeys,
          ...(vacationKeysByUser.get(user.id) ?? new Set<string>())
        ]);
        const personalVacationKeys = vacationKeysByUser.get(user.id) ?? new Set<string>();
        const userPeriod = buildUserPeriod(period, vacationKeys, holidayKeys, {
          personalVacationKeys,
          globalVacationKeys
        });
        const metrics = config
          ? config.buildMetrics({
              user,
              aliases,
              trackingRecords: trackingRecords as TrackingRecord[],
              terms: terms as TermRecord[],
              matters: matters as MatterRecord[],
              clients: clients as ClientRecord[],
              kpiDailySnapshots: kpiDailySnapshots as KpiDailySnapshotRecord[],
              salesDailyReports: salesDailyReports as SalesDailyReportRecord[],
              period: userPeriod
            })
          : [];

        return getUserTeamAssignments(user, teamLabelByKey)
          .filter((assignment) => assignment.teamKey === "UNASSIGNED" || activeTeamKeys.has(assignment.teamKey))
          .map((assignment) => ({
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          shortName: user.shortName ?? undefined,
            team: assignment.teamKey === "UNASSIGNED" ? undefined : assignment.teamKey as Team,
            teamLabel: assignment.teamLabel,
            specificRole: assignment.specificRole,
          configured: Boolean(config),
          metrics
          }));
      });

    const visibleTeams = this.filterTeamsByAccessScope(activeTeamCatalog, accessScope, teamLabelByKey);
    const visibleTeamKeys = new Set(visibleTeams.map((team) => team.key));
    const visibleUserSummaries = this.filterUsersByAccessScope(userSummaries, accessScope, teamLabelByKey)
      .filter((user) => {
        const teamKey = getUserTeamKey(user, teamLabelByKey);
        return teamKey === "UNASSIGNED" || visibleTeamKeys.has(teamKey);
      });

    return {
      year,
      month,
      generatedAt: new Date().toISOString(),
      cutoffDate: cutoffKey,
      businessDaysInPeriod,
      businessDaysElapsed,
      sourceNote: "Los KPI's se alimentan automaticamente desde usuarios, tablas de seguimiento, terminos, reportes de ventas en RDS, dias inhabiles y vacaciones registradas; no reciben captura manual.",
      teams: this.groupUsersByTeam(visibleUserSummaries, visibleTeams, teamLabelByKey)
    };
  }

  private async listKpiDailySnapshots(startKey: string, endKey: string): Promise<KpiDailySnapshotRecord[]> {
    if (endKey < startKey) {
      return [];
    }

    try {
      return await this.prisma.$queryRaw<KpiDailySnapshotRecord[]>(Prisma.sql`
        SELECT
          "id",
          "userKey",
          "metricId",
          "snapshotDate",
          "status",
          "value",
          "target",
          "unit",
          "actualLabel",
          "targetLabel",
          "helper",
          "incidents",
          "sourceData"
        FROM "KpiDailySnapshot"
        WHERE "snapshotDate" >= CAST(${dateFromKey(startKey)} AS date)
          AND "snapshotDate" <= CAST(${dateFromKey(endKey)} AS date)
          AND "metricId" = ${LAMR_EXECUTION_INCOMPLETE_ROWS_KPI_ID}
          AND "userKey" = ${LAMR_KPI_USER_KEY}
        ORDER BY "snapshotDate" ASC, "userKey" ASC, "metricId" ASC
      `);
    } catch (error) {
      if (isMissingKpiDailySnapshotTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  private filterTeamsByAccessScope(
    teams: UserTeamRecord[],
    accessScope: KpiAccessScope,
    teamLabelByKey: Map<string, string>
  ) {
    if (isGlobalKpiViewer(accessScope)) {
      return teams;
    }

    const teamKeys = getAccessTeamKeys(accessScope, teamLabelByKey);
    if (teamKeys.length === 0) {
      return [];
    }

    return teams.filter((team) => teamKeys.includes(team.key));
  }

  private filterUsersByAccessScope(
    users: KpiUserSummary[],
    accessScope: KpiAccessScope,
    teamLabelByKey: Map<string, string>
  ) {
    if (isGlobalKpiViewer(accessScope)) {
      return users;
    }

    const teamKeys = getAccessTeamKeys(accessScope, teamLabelByKey);
    if (teamKeys.length === 0) {
      return [];
    }

    return users.filter((user) => teamKeys.includes(getUserTeamKey(user, teamLabelByKey)));
  }

  private groupUsersByTeam(
    users: KpiUserSummary[],
    teams: UserTeamRecord[],
    teamLabelByKey: Map<string, string>
  ): KpiTeamSummary[] {
    const groups = new Map<string, KpiTeamSummary>();
    const sortOrderByTeam = new Map<string, number>();

    teams.forEach((team) => {
      sortOrderByTeam.set(team.key, team.sortOrder);
      groups.set(team.key, {
        teamKey: team.key,
        teamLabel: team.label,
        users: [],
        configuredMetricsCount: 0,
        missedMetricsCount: 0
      });
    });

    users.forEach((user) => {
      const teamKey = getUserTeamKey(user, teamLabelByKey);
      const existing = groups.get(teamKey);
      const targetGroup = existing ?? {
        teamKey,
        teamLabel: teamLabelByKey.get(teamKey) ?? user.teamLabel,
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
        const leftFallbackIndex = TEAM_ORDER.indexOf(left.teamKey);
        const rightFallbackIndex = TEAM_ORDER.indexOf(right.teamKey);
        const leftIndex = sortOrderByTeam.get(left.teamKey)
          ?? 100_000 + (leftFallbackIndex === -1 ? TEAM_ORDER.length : leftFallbackIndex);
        const rightIndex = sortOrderByTeam.get(right.teamKey)
          ?? 100_000 + (rightFallbackIndex === -1 ? TEAM_ORDER.length : rightFallbackIndex);

        return leftIndex - rightIndex || left.teamLabel.localeCompare(right.teamLabel);
      });
  }
}
