import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type {
  KpiCommissionMetricRequirement,
  KpiEmrtOverride,
  KpiIncident,
  KpiMetric,
  KpiMetricStatus,
  KpiOverview
} from "@sige/contracts";

import { apiGet, apiPatch } from "../../api/http-client";
import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";

interface SupervisionTaskDashboardLink {
  moduleId: string;
  label: string;
  path: string;
  total: number;
  today: number;
  overdue: number;
}

interface SupervisionTerm {
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

interface SupervisionTaskUserSummary {
  userId: string;
  displayName: string;
  shortName?: string;
  teamLabel: string;
  specificRole?: string;
  total: number;
  completedThisMonth?: number;
  today: number;
  overdue: number;
  monthlyKpiMisses?: number;
  kpiMetDays?: number;
  kpiMissedDays?: number;
  isObserved?: boolean;
  canToggleObservation?: boolean;
  isSynthetic?: boolean;
  commissionRequirements?: KpiCommissionMetricRequirement[];
  dashboardLinks: SupervisionTaskDashboardLink[];
}

interface SupervisionObservationSetting {
  userId: string;
  isObserved: boolean;
}

interface SupervisionTeamGroup {
  moduleId: string;
  teamLabel: string;
  total: number;
  terms: SupervisionTerm[];
}

interface SupervisionTaskOverview {
  todayTotal: number;
  overdueTotal: number;
  completedThisMonthTotal?: number;
  monthlyKpiMissesTotal?: number;
  kpiMetDaysTotal?: number;
  kpiMissedDaysTotal?: number;
  total: number;
  users: SupervisionTaskUserSummary[];
}

interface SupervisionTermBucket {
  key: "today" | "tomorrow" | "restOfWeek";
  label: string;
  startDate: string;
  endDate: string;
  total: number;
  teams: SupervisionTeamGroup[];
}

interface SupervisionKpiUser {
  userId: string;
  displayName: string;
  shortName?: string;
  teamLabel: string;
  specificRole?: string;
  total: number;
  metrics: KpiMetric[];
}

interface SupervisionKpiPeriod {
  key: "lastWeek" | "currentWeek";
  label: string;
  startDate: string;
  endDate: string;
  totalMetrics: number;
  totalIncidents: number;
  users: SupervisionKpiUser[];
}

interface SupervisionUserKpiAlertPeriod {
  key: SupervisionKpiPeriod["key"];
  label: string;
  startDate: string;
  endDate: string;
  totalMetrics: number;
  metrics: KpiMetric[];
}

interface SupervisionKpiWeekReference {
  currentWeek: {
    startDate: string;
    endDate: string;
  };
  lastWeek: {
    startDate: string;
    endDate: string;
  };
}

interface SupervisionKpiOverridePeriod {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  users: Array<{
    userId: string;
    metrics: Array<{
      id: string;
      dailyBreakdown: KpiMetric["dailyBreakdown"];
    }>;
  }>;
}

interface KpiWeekIncidentItem {
  key: string;
  status: KpiMetricStatus;
  label: string;
  description?: string;
}

type KpiDetailView = "unmet" | "met";

interface GeneralSupervisionOverview {
  generatedAt: string;
  today: string;
  currentWeekStart: string;
  currentWeekDisplayStart?: string;
  currentWeekDisplayEnd?: string;
  currentWeekEnd: string;
  currentMonthStart: string;
  currentMonthEnd: string;
  kpiOverrides: KpiEmrtOverride[];
  kpiOverridePeriods: SupervisionKpiOverridePeriod[];
  taskOverview: SupervisionTaskOverview;
  termBuckets: SupervisionTermBucket[];
  kpiPeriods: SupervisionKpiPeriod[];
  summary: {
    tasks: number;
    terms: number;
    kpiAlerts: number;
    monthlyKpiMisses: number;
  };
}

const KPI_STATUS_LABELS: Record<KpiMetric["status"], string> = {
  met: "Cumplido",
  warning: "Incumplido",
  missed: "Incumplido",
  "not-configured": "Sin configurar"
};

const KPI_ALERT_STATUSES: KpiMetricStatus[] = ["missed", "warning"];
const NON_EVALUATED_KPI_DAY_UNIT = "dias-no-evaluados";

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatShortDate(value?: string) {
  if (!value) {
    return "-";
  }

  const [, month, day] = value.slice(0, 10).split("-");
  return month && day ? `${day}/${month}` : value;
}

function formatDateRange(startDate: string, endDate: string) {
  if (endDate < startDate) {
    return "Sin dias restantes";
  }

  if (startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`;
}

function formatCompactDateRange(startDate: string, endDate: string) {
  if (endDate < startDate) {
    return "Sin dias restantes";
  }

  if (startDate === endDate) {
    return formatShortDate(startDate);
  }

  return `${formatShortDate(startDate)}-${formatShortDate(endDate)}`;
}

const LONG_WEEK_DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long"
});

function capitalizeFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function formatLongWeekDate(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = LONG_WEEK_DATE_FORMATTER.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!weekday || !day || !month) {
    return capitalizeFirst(LONG_WEEK_DATE_FORMATTER.format(date).replace(",", ""));
  }

  return `${capitalizeFirst(weekday)} ${day} de ${month}`;
}

function formatReadableWeekRange(startDate: string, endDate: string) {
  if (endDate < startDate) {
    return "Sin dias restantes";
  }

  if (startDate === endDate) {
    return formatLongWeekDate(startDate);
  }

  return `${formatLongWeekDate(startDate)} - ${formatLongWeekDate(endDate)}`;
}

function dateFromKey(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}

function addDaysKey(value: string, offset: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getWeekStartKey(value: string) {
  const date = dateFromKey(value);
  const day = date.getUTCDay();
  return addDaysKey(value, day === 0 ? -6 : 1 - day);
}

function isWeekdayDateKey(value: string) {
  const day = dateFromKey(value).getUTCDay();
  return day !== 0 && day !== 6;
}

function isWeekendDateKey(value: string) {
  return !isWeekdayDateKey(value);
}

const OVERRIDE_DAY_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
  weekday: "short"
});

function formatOverrideDay(value: string) {
  return capitalizeFirst(OVERRIDE_DAY_FORMATTER.format(dateFromKey(value)).replace(".", ""));
}

function getWeekdayKeys(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    if (isWeekdayDateKey(cursor)) {
      dates.push(cursor);
    }
    cursor = addDaysKey(cursor, 1);
  }
  return dates;
}

function getBusinessWeekRange(value: string) {
  const startDate = getWeekStartKey(value);
  return {
    startDate,
    endDate: addDaysKey(startDate, 4)
  };
}

function buildClientKpiRanges(today: string): SupervisionKpiPeriod[] {
  const currentWeek = getBusinessWeekRange(today);

  if (isWeekendDateKey(today)) {
    const nextWeek = getBusinessWeekRange(addDaysKey(currentWeek.startDate, 7));

    return [{
      key: "lastWeek",
      label: "Semana pasada",
      startDate: currentWeek.startDate,
      endDate: currentWeek.endDate,
      totalMetrics: 0,
      totalIncidents: 0,
      users: []
    }, {
      key: "currentWeek",
      label: "Semana actual",
      startDate: nextWeek.startDate,
      endDate: nextWeek.endDate,
      totalMetrics: 0,
      totalIncidents: 0,
      users: []
    }];
  }

  const lastWeek = getBusinessWeekRange(addDaysKey(currentWeek.startDate, -7));

  return [
    {
      key: "lastWeek",
      label: "Semana pasada",
      startDate: lastWeek.startDate,
      endDate: lastWeek.endDate,
      totalMetrics: 0,
      totalIncidents: 0,
      users: []
    },
    {
      key: "currentWeek",
      label: "Esta semana",
      startDate: currentWeek.startDate,
      endDate: currentWeek.endDate,
      totalMetrics: 0,
      totalIncidents: 0,
      users: []
    }
  ];
}

function buildKpiWeekReference(today: string): SupervisionKpiWeekReference {
  const week = getBusinessWeekRange(today);

  if (isWeekendDateKey(today)) {
    return {
      currentWeek: getBusinessWeekRange(addDaysKey(week.startDate, 7)),
      lastWeek: week
    };
  }

  return {
    currentWeek: week,
    lastWeek: getBusinessWeekRange(addDaysKey(week.startDate, -7))
  };
}

function getMonthKey(value: string) {
  return value.slice(0, 7);
}

function getMonthPeriodsForRanges(ranges: SupervisionKpiPeriod[]) {
  const periods = new Map<string, { year: number; month: number }>();

  ranges.forEach((range) => {
    let cursor = `${getMonthKey(range.startDate)}-01`;
    const endMonth = getMonthKey(range.endDate);

    while (getMonthKey(cursor) <= endMonth) {
      const key = getMonthKey(cursor);
      periods.set(key, {
        year: Number(key.slice(0, 4)),
        month: Number(key.slice(5, 7))
      });

      const year = Number(cursor.slice(0, 4));
      const month = Number(cursor.slice(5, 7));
      cursor = new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10);
    }
  });

  return Array.from(periods.values());
}

function getFirstWeekdayDateKey(startDate: string, endDate: string) {
  let cursor = startDate;

  while (cursor <= endDate) {
    if (isWeekdayDateKey(cursor)) {
      return cursor;
    }

    cursor = addDaysKey(cursor, 1);
  }

  return startDate;
}

function getLastWeekdayDateKey(startDate: string, endDate: string) {
  let cursor = endDate;

  while (cursor >= startDate) {
    if (isWeekdayDateKey(cursor)) {
      return cursor;
    }

    cursor = addDaysKey(cursor, -1);
  }

  return endDate;
}

function formatOverviewWeekRange(overview: GeneralSupervisionOverview) {
  if (isWeekendDateKey(overview.today)) {
    const nextWeek = getBusinessWeekRange(addDaysKey(getWeekStartKey(overview.today), 7));
    return formatReadableWeekRange(nextWeek.startDate, nextWeek.endDate);
  }

  return formatReadableWeekRange(
    overview.currentWeekDisplayStart ?? getFirstWeekdayDateKey(overview.currentWeekStart, overview.currentWeekEnd),
    overview.currentWeekDisplayEnd ?? getLastWeekdayDateKey(overview.currentWeekStart, overview.currentWeekEnd)
  );
}

function EntityMeta(props: { clientName: string; subject: string; sourceLabel: string }) {
  const entity = [props.clientName, props.subject].filter((value) => value && value !== "-").join(" / ");

  return (
    <span>
      {entity || "Sin cliente/asunto"} - {props.sourceLabel}
    </span>
  );
}

function EmptyState(props: { children: string }) {
  return <div className="supervision-empty-state">{props.children}</div>;
}

function formatTaskCount(value: number) {
  return `${value} ${value === 1 ? "tarea" : "tareas"}`;
}

function isAutomaticUnobservedUser(user: SupervisionTaskUserSummary) {
  return user.isSynthetic ?? user.userId.startsWith("responsible:");
}

function canToggleUserObservation(user: SupervisionTaskUserSummary) {
  return user.canToggleObservation ?? !isAutomaticUnobservedUser(user);
}

function isObservedTaskUser(user: SupervisionTaskUserSummary) {
  return user.isObserved ?? canToggleUserObservation(user);
}

function getCompletedThisMonth(user: SupervisionTaskUserSummary) {
  return user.completedThisMonth ?? user.total;
}

function getKpiMetDays(user: SupervisionTaskUserSummary) {
  return user.kpiMetDays ?? 0;
}

function getKpiMissedDays(user: SupervisionTaskUserSummary) {
  return user.kpiMissedDays ?? user.monthlyKpiMisses ?? 0;
}

function getCompletedThisMonthTotal(overview: SupervisionTaskOverview) {
  return overview.completedThisMonthTotal ?? overview.total;
}

function getKpiMetDaysTotal(overview: SupervisionTaskOverview) {
  return overview.kpiMetDaysTotal ?? 0;
}

function getKpiMissedDaysTotal(overview: SupervisionTaskOverview) {
  return overview.kpiMissedDaysTotal ?? overview.monthlyKpiMissesTotal ?? 0;
}

function buildKpiAlertsByUser(periods: SupervisionKpiPeriod[]) {
  const alertsByUser = new Map<string, SupervisionUserKpiAlertPeriod[]>();

  periods.forEach((period) => {
    period.users.forEach((user) => {
      const alerts = alertsByUser.get(user.userId) ?? [];
      alerts.push({
        key: period.key,
        label: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        totalMetrics: user.total,
        metrics: user.metrics
      });
      alertsByUser.set(user.userId, alerts);
    });
  });

  return alertsByUser;
}

function summarizeDailyStatus(dailyBreakdown: KpiMetric["dailyBreakdown"]): KpiMetricStatus {
  const evaluatedDays = dailyBreakdown.filter((day) => !isNonEvaluatedKpiDay(day));

  if (evaluatedDays.length === 0) {
    return "not-configured";
  }

  if (evaluatedDays.some((day) => day.status === "missed" || day.status === "warning")) {
    return "missed";
  }

  return "met";
}

function isNonEvaluatedKpiDay(day: KpiMetric["dailyBreakdown"][number]) {
  return day.status === "not-configured" && day.unit === NON_EVALUATED_KPI_DAY_UNIT;
}

function metricHasNonEvaluatedDays(metric: KpiMetric) {
  return metric.dailyBreakdown.some(isNonEvaluatedKpiDay);
}

function pluralizeDays(count: number) {
  return `${count} ${count === 1 ? "dia" : "dias"}`;
}

function buildRangeMetric(metric: KpiMetric, dailyBreakdown: KpiMetric["dailyBreakdown"]): KpiMetric {
  const evaluatedDays = dailyBreakdown.filter((day) => !isNonEvaluatedKpiDay(day));
  const nonEvaluatedDays = dailyBreakdown.filter(isNonEvaluatedKpiDay);
  const missingSnapshotDays = nonEvaluatedDays.filter((day) => day.actualLabel === "Sin snapshot diario");
  const otherNonEvaluatedDays = nonEvaluatedDays.filter((day) => day.actualLabel !== "Sin snapshot diario");
  const missedDays = evaluatedDays.filter((day) => day.status === "missed").length;
  const warningDays = evaluatedDays.filter((day) => day.status === "warning").length;
  const unmetDays = missedDays + warningDays;
  const metDays = evaluatedDays.filter((day) => day.status === "met").length;
  const incidents = evaluatedDays.flatMap((day) => day.incidents);
  const actualLabel = [
    unmetDays > 0 ? `${pluralizeDays(unmetDays)} incumplidos` : "",
    unmetDays === 0 && metDays > 0 ? `${pluralizeDays(metDays)} cumplidos` : "",
    missingSnapshotDays.length > 0 ? `${pluralizeDays(missingSnapshotDays.length)} sin snapshot de cierre` : "",
    otherNonEvaluatedDays.length > 0 ? `${pluralizeDays(otherNonEvaluatedDays.length)} no evaluados` : ""
  ].filter(Boolean).join(" / ") || "Sin dias evaluados";

  return {
    ...metric,
    status: summarizeDailyStatus(dailyBreakdown),
    value: evaluatedDays.reduce((total, day) => total + day.value, 0),
    target: evaluatedDays.reduce((total, day) => total + day.target, 0),
    actualLabel,
    targetLabel: [
      `${pluralizeDays(evaluatedDays.length)} habiles evaluados`,
      missingSnapshotDays.length > 0 ? `${pluralizeDays(missingSnapshotDays.length)} sin snapshot de cierre` : "",
      otherNonEvaluatedDays.length > 0 ? `${pluralizeDays(otherNonEvaluatedDays.length)} no evaluados` : ""
    ].filter(Boolean).join(" / "),
    progressPct: metric.progressPct,
    helper: `Periodo evaluado: ${formatDateRange(dailyBreakdown[0]?.date ?? "", dailyBreakdown.at(-1)?.date ?? "")}`,
    incidents,
    dailyBreakdown
  };
}

function buildKpiPeriodsFromMonthlyOverviews(ranges: SupervisionKpiPeriod[], overviews: KpiOverview[]) {
  return ranges.map((range) => {
    const users = new Map<string, SupervisionKpiUser & { metricsById: Map<string, KpiMetric> }>();

    overviews.forEach((overview) => {
      overview.teams.forEach((team) => {
        team.users.forEach((user) => {
          user.metrics.forEach((metric) => {
            const rangeDays = metric.dailyBreakdown.filter((day) =>
              day.date >= range.startDate
              && day.date <= range.endDate
            );

            if (rangeDays.length === 0) {
              return;
            }

            const group = users.get(user.userId) ?? {
              userId: user.userId,
              displayName: user.displayName,
              shortName: user.shortName,
              teamLabel: user.teamLabel,
              specificRole: user.specificRole,
              total: 0,
              metrics: [],
              metricsById: new Map<string, KpiMetric>()
            };
            const currentMetric = group.metricsById.get(metric.id);
            const mergedDays = currentMetric
              ? [...currentMetric.dailyBreakdown, ...rangeDays].sort((left, right) => left.date.localeCompare(right.date))
              : rangeDays;

            group.metricsById.set(metric.id, buildRangeMetric(metric, mergedDays));
            users.set(user.userId, group);
          });
        });
      });
    });

    const periodUsers = Array.from(users.values()).map(({ metricsById, ...user }) => {
      const metrics = Array.from(metricsById.values()).sort((left, right) => left.label.localeCompare(right.label));
      const alertMetricCount = metrics.filter((metric) => KPI_ALERT_STATUSES.includes(metric.status)).length;
      return {
        ...user,
        total: alertMetricCount,
        metrics
      };
    }).filter((user) => user.metrics.length > 0).sort((left, right) => left.displayName.localeCompare(right.displayName));

    return {
      ...range,
      totalMetrics: periodUsers.reduce((total, user) => total + user.total, 0),
      totalIncidents: periodUsers.reduce(
        (total, user) => total + user.metrics.reduce((metricTotal, metric) => metricTotal + metric.incidents.length, 0),
        0
      ),
      users: periodUsers
    };
  });
}

function countKpiAlerts(periods: SupervisionKpiPeriod[]) {
  return periods.reduce((total, period) => total + period.totalMetrics, 0);
}

function getMetricPeriod(
  periods: SupervisionUserKpiAlertPeriod[],
  metricId: string,
  periodKey: SupervisionKpiPeriod["key"]
) {
  return periods.find((period) => period.key === periodKey)
    ?.metrics.find((metric) => metric.id === metricId);
}

function getKpiIncidentDate(incident: KpiIncident) {
  return incident.dueDate ?? incident.termDate ?? incident.completedAt?.slice(0, 10) ?? "";
}

function getKpiIncidentKey(incident: KpiIncident) {
  return [
    getKpiIncidentDate(incident),
    incident.sourceType,
    incident.id,
    incident.reason
  ].join(":");
}

function getUniqueKpiIncidents(incidents: KpiIncident[]) {
  const lookup = new Map<string, KpiIncident>();

  incidents.forEach((incident) => {
    lookup.set(getKpiIncidentKey(incident), incident);
  });

  return Array.from(lookup.values());
}

function formatKpiIncident(incident: KpiIncident) {
  const date = getKpiIncidentDate(incident);
  const details = [
    incident.clientName && incident.clientName !== "-" ? incident.clientName : "",
    incident.subject && incident.subject !== "-" ? incident.subject : "",
    incident.taskName
  ].filter(Boolean).join(" / ");

  return [date ? formatShortDate(date) : "", details || incident.reason].filter(Boolean).join(" - ");
}

function getKpiWeekIncidentItems(
  periods: SupervisionUserKpiAlertPeriod[],
  metricId: string,
  periodKey: SupervisionKpiPeriod["key"],
  view: KpiDetailView
) {
  const metric = getMetricPeriod(periods, metricId, periodKey);
  const items = new Map<string, KpiWeekIncidentItem>();
  const includedStatuses: KpiMetricStatus[] = view === "met" ? ["met"] : KPI_ALERT_STATUSES;

  metric?.dailyBreakdown
    .filter((day) => includedStatuses.includes(day.status) || isNonEvaluatedKpiDay(day))
    .forEach((day) => {
      if (isNonEvaluatedKpiDay(day)) {
        const key = [day.date, metric.id, day.status, day.unit].join(":");
        items.set(key, {
          key,
          status: day.status,
          label: `${formatShortDate(day.date)} - ${day.actualLabel}`,
          description: day.helper
        });
        return;
      }

      const dayIncidents = getUniqueKpiIncidents(day.incidents);

      if (view === "unmet" && dayIncidents.length > 0) {
        dayIncidents.forEach((incident) => {
          const key = getKpiIncidentKey(incident);
          items.set(key, {
            key,
            status: "missed",
            label: formatKpiIncident(incident),
            description: incident.reason
          });
        });
        return;
      }

      const key = [day.date, metric.id, day.status].join(":");
      items.set(key, {
        key,
        status: day.status === "warning" ? "missed" : day.status,
        label: `${formatShortDate(day.date)} - ${day.actualLabel}`,
        description: `${day.targetLabel}. ${day.helper}`
      });
    });

  return Array.from(items.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function getKpiMissedDaysLabel(periods: SupervisionUserKpiAlertPeriod[], metricId: string) {
  const missedDateKeys = new Set<string>();

  periods.forEach((period) => {
    period.metrics
      .find((metric) => metric.id === metricId)
      ?.dailyBreakdown
      .filter((day) => (day.status === "missed" || day.status === "warning") && !isNonEvaluatedKpiDay(day))
      .forEach((day) => missedDateKeys.add(day.date));
  });

  const count = missedDateKeys.size;
  return `${count} ${count === 1 ? "día incumplido" : "días incumplidos"} en las últimas dos semanas`;
}

function getKpiUnmetMetrics(
  periods: SupervisionUserKpiAlertPeriod[],
  blockedCommissionMetricIds = new Set<string>()
) {
  const metricsById = new Map<string, { metric: KpiMetric; periodKey: SupervisionKpiPeriod["key"] }>();

  periods.forEach((period) => {
    period.metrics.forEach((metric) => {
      if (
        !KPI_ALERT_STATUSES.includes(metric.status)
        && !metricHasNonEvaluatedDays(metric)
        && !blockedCommissionMetricIds.has(metric.id)
      ) {
        return;
      }

      const current = metricsById.get(metric.id);
      if (!current || period.key === "currentWeek") {
        metricsById.set(metric.id, { metric, periodKey: period.key });
      }
    });
  });

  return Array.from(metricsById.values())
    .sort((left, right) => left.metric.label.localeCompare(right.metric.label))
    .map((entry) => entry.metric);
}

function getKpiMetMetrics(periods: SupervisionUserKpiAlertPeriod[]) {
  const metricsById = new Map<string, { metric: KpiMetric; periodKey: SupervisionKpiPeriod["key"] }>();

  periods.forEach((period) => {
    period.metrics.forEach((metric) => {
      if (metric.status !== "met" && !metricHasNonEvaluatedDays(metric)) {
        return;
      }

      const current = metricsById.get(metric.id);
      if (!current || period.key === "currentWeek") {
        metricsById.set(metric.id, { metric, periodKey: period.key });
      }
    });
  });

  return Array.from(metricsById.values())
    .sort((left, right) => left.metric.label.localeCompare(right.metric.label))
    .map((entry) => entry.metric);
}

function getKpiDetailCountLabel(
  view: KpiDetailView,
  metrics: KpiMetric[],
  blockedCommissionMetricIds = new Set<string>()
) {
  const primaryCount = view === "unmet"
    ? metrics.filter((metric) =>
      KPI_ALERT_STATUSES.includes(metric.status) || blockedCommissionMetricIds.has(metric.id)
    ).length
    : metrics.filter((metric) => metric.status === "met").length;
  const nonEvaluatedOnlyCount = metrics.filter((metric) => {
    const isPrimary = view === "unmet"
      ? KPI_ALERT_STATUSES.includes(metric.status) || blockedCommissionMetricIds.has(metric.id)
      : metric.status === "met";

    return !isPrimary && metricHasNonEvaluatedDays(metric);
  }).length;
  const primaryLabel = view === "unmet"
    ? `${primaryCount} alertas`
    : `${primaryCount} cumplidos`;

  return nonEvaluatedOnlyCount > 0
    ? `${primaryLabel} / ${nonEvaluatedOnlyCount} sin evaluacion`
    : primaryLabel;
}

function getKpiOverrideKey(userId: string, metricId: string, date: string) {
  return `${userId}:${metricId}:${date}`;
}

function TaskUserRow(props: {
  user: SupervisionTaskUserSummary;
  kpiAlerts: SupervisionUserKpiAlertPeriod[];
  kpiWeekReference: SupervisionKpiWeekReference;
  kpiOverrides: KpiEmrtOverride[];
  kpiOverridePeriods: SupervisionKpiOverridePeriod[];
  muted?: boolean;
  saving: boolean;
  savingKpiOverrideKey: string;
  onToggleObserved: (userId: string, isObserved: boolean) => void;
  onToggleKpiOverride: (userId: string, metricId: string, date: string, isExcluded: boolean) => void;
}) {
  const {
    user,
    kpiAlerts,
    kpiWeekReference,
    kpiOverrides,
    kpiOverridePeriods,
    muted = false,
    saving,
    savingKpiOverrideKey,
    onToggleObserved,
    onToggleKpiOverride
  } = props;
  const [showDetail, setShowDetail] = useState(false);
  const [kpiDetailView, setKpiDetailView] = useState<KpiDetailView>("unmet");
  const [expandedKpiId, setExpandedKpiId] = useState<string | null>(null);
  const canToggle = canToggleUserObservation(user);
  const isObserved = isObservedTaskUser(user);
  const completedThisMonth = getCompletedThisMonth(user);
  const kpiMetDays = getKpiMetDays(user);
  const kpiMissedDays = getKpiMissedDays(user);
  const blockedCommissionMetricIds = new Set(
    isObserved && !muted
      ? user.commissionRequirements
        ?.filter((requirement) => requirement.blocked)
        .map((requirement) => requirement.metricId) ?? []
      : []
  );
  const kpiUnmetMetrics = getKpiUnmetMetrics(kpiAlerts, blockedCommissionMetricIds);
  const kpiMetMetrics = getKpiMetMetrics(kpiAlerts);
  const displayedKpiMetrics = kpiDetailView === "unmet" ? kpiUnmetMetrics : kpiMetMetrics;
  const displayedKpiCountLabel = getKpiDetailCountLabel(
    kpiDetailView,
    displayedKpiMetrics,
    blockedCommissionMetricIds
  );
  const detailPeriodTitle = kpiDetailView === "met" ? "Semanas evaluadas" : "Semana actual";
  const detailPeriodRange = kpiDetailView === "met"
    ? `${formatDateRange(kpiWeekReference.lastWeek.startDate, kpiWeekReference.lastWeek.endDate)} / ${formatDateRange(kpiWeekReference.currentWeek.startDate, kpiWeekReference.currentWeek.endDate)}`
    : formatDateRange(kpiWeekReference.currentWeek.startDate, kpiWeekReference.currentWeek.endDate);
  const detailId = `supervision-detail-${user.userId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  function selectKpiDetailView(view: KpiDetailView) {
    setKpiDetailView(view);
    setExpandedKpiId(null);
  }

  function toggleUserDetail() {
    setShowDetail((current) => !current);
    setExpandedKpiId(null);
  }

  return (
    <section className={`supervision-task-user-row ${muted ? "is-muted" : ""}`}>
      <div className="supervision-task-user-main">
        <h4>{user.displayName}</h4>
        <span>{user.shortName ?? user.teamLabel}</span>
      </div>

      <label className={`supervision-observe-toggle ${canToggle ? "" : "is-locked"}`}>
        {canToggle ? (
          <input
            type="checkbox"
            checked={isObserved}
            disabled={saving}
            onChange={(event) => onToggleObserved(user.userId, event.currentTarget.checked)}
          />
        ) : null}
        <span>{canToggle ? "Observar" : "Automatico abajo"}</span>
      </label>

      <div className="supervision-task-counts" aria-label={`${user.displayName}: ${formatTaskCount(completedThisMonth)} realizadas este mes, ${formatTaskCount(user.today)} para hoy incluyendo vencidas, ${formatTaskCount(user.overdue)} vencidas, ${kpiMetDays} días KPI cumplidos este mes y ${kpiMissedDays} días KPI incumplidos este mes`}>
        <span className="is-total">
          <strong>{completedThisMonth}</strong>
          Realizadas mes
        </span>
        <span>
          <strong>{user.today}</strong>
          Hoy + vencidas
        </span>
        <span className="is-overdue">
          <strong>{user.overdue}</strong>
          Vencidas
        </span>
        <span className="is-kpi-met">
          <strong>{kpiMetDays}</strong>
          Días KPI cumplidos este mes
        </span>
        <span className="is-kpi-missed">
          <strong>{kpiMissedDays}</strong>
          Días KPI incumplidos este mes
        </span>
      </div>

      <div className="supervision-task-link-list">
        {user.dashboardLinks.length > 0 ? (
          user.dashboardLinks.map((link) => (
            <Link key={link.moduleId} className="secondary-button supervision-task-dashboard-link" to={link.path}>
              {user.dashboardLinks.length === 1 ? "Ir al dashboard" : link.label}
            </Link>
          ))
        ) : (
          <Link className="secondary-button supervision-task-dashboard-link" to="/app/kpis">
            Ir a KPI's
          </Link>
        )}
        <button
          aria-controls={detailId}
          aria-expanded={showDetail}
          className="secondary-button supervision-task-detail-button"
          onClick={toggleUserDetail}
          type="button"
        >
          {showDetail ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {showDetail ? (
        <div className="supervision-task-user-detail" id={detailId}>
          {user.dashboardLinks.length > 0 ? (
            <div className="supervision-task-detail-list">
              {user.dashboardLinks.map((link) => (
                <div className="supervision-task-detail-row" key={link.moduleId}>
                  <div>
                    <strong>{link.label}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Sin dashboards asociados para esta persona.</EmptyState>
          )}

          <section className="supervision-task-kpi-card" aria-label={`Key Performance Indicators de ${user.displayName}`}>
            <header className="supervision-task-kpi-card-head">
              <div>
                <strong>Key Performance Indicators</strong>
              </div>
              <div className="supervision-task-kpi-card-actions">
                <div className="supervision-kpi-view-toggle" role="group" aria-label="Vista de KPI">
                  <button
                    type="button"
                    className={kpiDetailView === "unmet" ? "is-active" : ""}
                    aria-pressed={kpiDetailView === "unmet"}
                    onClick={() => selectKpiDetailView("unmet")}
                  >
                    Ver KPI's incumplidos
                  </button>
                  <button
                    type="button"
                    className={kpiDetailView === "met" ? "is-active" : ""}
                    aria-pressed={kpiDetailView === "met"}
                    onClick={() => selectKpiDetailView("met")}
                  >
                    Ver KPI's cumplidos
                  </button>
                </div>
                <span className={`supervision-task-kpi-alert-count ${kpiDetailView === "met" ? "is-met" : ""}`}>
                  {displayedKpiCountLabel}
                </span>
              </div>
            </header>
            {displayedKpiMetrics.length > 0 ? (
              <section className="supervision-task-kpi-detail-period">
                <header>
                  <strong>{detailPeriodTitle}</strong>
                  <span>
                    {detailPeriodRange} - {displayedKpiCountLabel}
                  </span>
                </header>
                <div className="supervision-kpi-list">
                  {displayedKpiMetrics.map((metric) => {
                    const commissionRequirement = user.commissionRequirements?.find((requirement) =>
                      requirement.metricId === metric.id
                    );

                    return (
                      <KpiMetricRow
                        key={metric.id}
                        metric={metric}
                        periods={kpiAlerts}
                        weekReference={kpiWeekReference}
                        view={kpiDetailView}
                        showCommissionRelease={isObserved && !muted}
                        userId={user.userId}
                        kpiOverrides={kpiOverrides}
                        kpiOverridePeriods={kpiOverridePeriods}
                        savingKpiOverrideKey={savingKpiOverrideKey}
                        onToggleKpiOverride={onToggleKpiOverride}
                        commissionRequirement={commissionRequirement}
                        isExpanded={expandedKpiId === metric.id}
                        onToggle={() => setExpandedKpiId((current) => current === metric.id ? null : metric.id)}
                      />
                    );
                  })}
                </div>
              </section>
            ) : (
              <EmptyState>
                {kpiDetailView === "unmet"
                  ? "Sin KPI's incumplidos para esta persona."
                  : "Sin KPI's cumplidos para esta persona en la semana actual o pasada."}
              </EmptyState>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function TaskOverviewPanel(props: {
  overview: SupervisionTaskOverview;
  kpiAlertsByUser: Map<string, SupervisionUserKpiAlertPeriod[]>;
  kpiWeekReference: SupervisionKpiWeekReference;
  kpiOverrides: KpiEmrtOverride[];
  kpiOverridePeriods: SupervisionKpiOverridePeriod[];
  savingObservedUserId: string;
  savingKpiOverrideKey: string;
  onToggleObserved: (userId: string, isObserved: boolean) => void;
  onToggleKpiOverride: (userId: string, metricId: string, date: string, isExcluded: boolean) => void;
}) {
  const {
    overview,
    kpiAlertsByUser,
    kpiWeekReference,
    kpiOverrides,
    kpiOverridePeriods,
    savingObservedUserId,
    savingKpiOverrideKey,
    onToggleObserved,
    onToggleKpiOverride
  } = props;
  const [showUnobserved, setShowUnobserved] = useState(false);
  const observedUsers = overview.users.filter(isObservedTaskUser);
  const unobservedUsers = overview.users.filter((user) => !isObservedTaskUser(user));
  const completedThisMonthTotal = getCompletedThisMonthTotal(overview);
  const kpiMetDaysTotal = getKpiMetDaysTotal(overview);
  const kpiMissedDaysTotal = getKpiMissedDaysTotal(overview);

  return (
    <article className="supervision-task-overview">
      <header className="supervision-task-overview-head">
        <div className="supervision-task-stat is-total">
          <span>Realizadas este mes</span>
          <strong>{completedThisMonthTotal}</strong>
        </div>
        <div className="supervision-task-stat is-today">
          <span>Para hoy incl. vencidas</span>
          <strong>{overview.todayTotal}</strong>
        </div>
        <div className="supervision-task-stat is-overdue">
          <span>Vencidas</span>
          <strong>{overview.overdueTotal}</strong>
        </div>
        <div className="supervision-task-stat is-kpi-met">
          <span>Días KPI cumplidos este mes</span>
          <strong>{kpiMetDaysTotal}</strong>
        </div>
        <div className="supervision-task-stat is-kpi-missed">
          <span>Días KPI incumplidos este mes</span>
          <strong>{kpiMissedDaysTotal}</strong>
        </div>
      </header>

      <section className="supervision-observed-panel is-primary">
        <header className="supervision-observed-panel-head">
          <div>
            <h3>Personas que observo</h3>
            <span>{observedUsers.length} personas</span>
          </div>
        </header>
        <div className="supervision-task-user-list">
          {observedUsers.length === 0 ? (
            <EmptyState>Sin personas observadas con alertas.</EmptyState>
          ) : (
            observedUsers.map((user) => (
              <TaskUserRow
                key={user.userId}
                user={user}
                kpiAlerts={kpiAlertsByUser.get(user.userId) ?? []}
                kpiWeekReference={kpiWeekReference}
                kpiOverrides={kpiOverrides}
                kpiOverridePeriods={kpiOverridePeriods}
                saving={savingObservedUserId === user.userId}
                savingKpiOverrideKey={savingKpiOverrideKey}
                onToggleObserved={onToggleObserved}
                onToggleKpiOverride={onToggleKpiOverride}
              />
            ))
          )}
        </div>
      </section>

      <section className="supervision-observed-panel is-secondary">
        <header className="supervision-observed-panel-head">
          <div>
            <h3>Personas que no observo</h3>
            <span>{unobservedUsers.length} personas</span>
          </div>
          <button type="button" className="secondary-button" onClick={() => setShowUnobserved((current) => !current)}>
            {showUnobserved ? "Ocultar" : "Mostrar"}
          </button>
        </header>
        {showUnobserved ? (
          <div className="supervision-task-user-list is-muted">
            {unobservedUsers.length === 0 ? (
              <EmptyState>Sin personas fuera de observacion.</EmptyState>
            ) : (
              unobservedUsers.map((user) => (
                <TaskUserRow
                  key={user.userId}
                  user={user}
                  kpiAlerts={kpiAlertsByUser.get(user.userId) ?? []}
                  kpiWeekReference={kpiWeekReference}
                  kpiOverrides={kpiOverrides}
                  kpiOverridePeriods={kpiOverridePeriods}
                  muted
                  saving={savingObservedUserId === user.userId}
                  savingKpiOverrideKey={savingKpiOverrideKey}
                  onToggleObserved={onToggleObserved}
                  onToggleKpiOverride={onToggleKpiOverride}
                />
              ))
            )}
          </div>
        ) : null}
      </section>
    </article>
  );
}

function TermBucketPanel({ bucket }: { bucket: SupervisionTermBucket }) {
  return (
    <article className="supervision-bucket-card">
      <header className="supervision-bucket-head">
        <div>
          <h3>{bucket.label}</h3>
          <span>{formatDateRange(bucket.startDate, bucket.endDate)}</span>
        </div>
        <strong>{bucket.total}</strong>
      </header>

      <div className="supervision-group-list">
        {bucket.teams.length === 0 ? (
          <EmptyState>Sin terminos en esta ventana.</EmptyState>
        ) : (
          bucket.teams.map((team) => (
            <section key={team.moduleId} className="supervision-user-group">
              <div className="supervision-group-head">
                <div>
                  <h4>{team.teamLabel}</h4>
                  <span>{team.total} terminos</span>
                </div>
                <strong>{team.total}</strong>
              </div>

              <div className="supervision-row-list">
                {team.terms.map((term) => (
                  <Link key={term.id} className="supervision-list-row is-term" to={term.originPath}>
                    <div>
                      <strong>{term.termLabel}</strong>
                      <EntityMeta clientName={term.clientName} subject={term.subject} sourceLabel={term.sourceLabel} />
                      <small>{term.responsible || "Sin responsable"}</small>
                    </div>
                    <span>{formatShortDate(term.termDate)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </article>
  );
}

function KpiMetricRow({
  metric,
  periods,
  weekReference,
  view,
  showCommissionRelease,
  commissionRequirement,
  userId,
  kpiOverrides,
  kpiOverridePeriods,
  savingKpiOverrideKey,
  onToggleKpiOverride,
  isExpanded,
  onToggle
}: {
  metric: KpiMetric;
  periods: SupervisionUserKpiAlertPeriod[];
  weekReference: SupervisionKpiWeekReference;
  view: KpiDetailView;
  showCommissionRelease: boolean;
  commissionRequirement?: KpiCommissionMetricRequirement;
  userId: string;
  kpiOverrides: KpiEmrtOverride[];
  kpiOverridePeriods: SupervisionKpiOverridePeriod[];
  savingKpiOverrideKey: string;
  onToggleKpiOverride: (userId: string, metricId: string, date: string, isExcluded: boolean) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const currentWeekIncidents = getKpiWeekIncidentItems(periods, metric.id, "currentWeek", view);
  const lastWeekIncidents = getKpiWeekIncidentItems(periods, metric.id, "lastWeek", view);
  const emptyLabel = view === "met" ? "Sin KPI's cumplidos registrados." : "Sin incidencias registradas.";
  const displayedStatus: KpiMetricStatus = metric.status === "warning"
    ? "missed"
    : view === "unmet" && commissionRequirement?.blocked
    ? "missed"
    : metric.status;
  const missedDaysLabel = getKpiMissedDaysLabel(periods, metric.id);
  const statusLabel = displayedStatus === "not-configured" && metricHasNonEvaluatedDays(metric)
    ? "No evaluado"
    : KPI_STATUS_LABELS[displayedStatus];
  const metricContentId = `supervision-kpi-${userId}-${metric.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const incidentLabel = `${metric.incidents.length} ${metric.incidents.length === 1 ? "incidencia" : "incidencias"}`;

  return (
    <section className={`supervision-kpi-metric is-${displayedStatus} ${isExpanded ? "is-expanded" : "is-collapsed"}`}>
      <button
        type="button"
        className="supervision-kpi-metric-toggle"
        aria-controls={metricContentId}
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span className="supervision-kpi-metric-summary-main">
          <strong>{metric.label}</strong>
          <small>{missedDaysLabel}</small>
        </span>
        <span className="supervision-kpi-metric-summary-meta">
          <span className={`kpis-status-badge is-${displayedStatus}`}>{statusLabel}</span>
          <span className="supervision-kpi-metric-incident-count">{incidentLabel}</span>
          {showCommissionRelease ? (
            commissionRequirement?.blocked ? (
              <span className="supervision-kpi-metric-commission-summary is-blocked">
                Pendiente: {commissionRequirement.pendingAmount} {commissionRequirement.unit}
              </span>
            ) : (
              <span className="supervision-kpi-metric-commission-summary is-clear">Sin pendientes de comision</span>
            )
          ) : null}
        </span>
        <span className="supervision-kpi-metric-chevron" aria-hidden="true" />
      </button>
      {isExpanded ? (
        <div className="supervision-kpi-metric-content" id={metricContentId}>
          <div className="supervision-kpi-metric-evaluation">
            <div className="supervision-kpi-values">
              <span>{missedDaysLabel}</span>
            </div>
            <div className="kpis-progress-track" aria-label={`Avance ${metric.progressPct}%`}>
              <span style={{ width: `${metric.progressPct}%` }} />
            </div>
            {metric.incidents.length > 0 ? (
              <small>{metric.incidents.length} incidencias detectadas</small>
            ) : (
              <small>{metric.helper}</small>
            )}
            <div className="supervision-kpi-week-reference">
              <KpiWeekIncidents
                incidents={currentWeekIncidents}
                label="Semana actual"
                startDate={weekReference.currentWeek.startDate}
                endDate={weekReference.currentWeek.endDate}
                emptyLabel={emptyLabel}
              />
              <KpiWeekIncidents
                incidents={lastWeekIncidents}
                label="Semana pasada"
                startDate={weekReference.lastWeek.startDate}
                endDate={weekReference.lastWeek.endDate}
                emptyLabel={emptyLabel}
              />
            </div>
            {showCommissionRelease ? (
              metric.emrtOverridePolicy === "not-allowed" ? (
                <div className="supervision-kpi-override-locked">
                  Los KPI de terminos y vencimientos no admiten override.
                </div>
              ) : (
                <KpiOverrideControls
                  userId={userId}
                  metric={metric}
                  periods={periods}
                  weekReference={weekReference}
                  overrides={kpiOverrides}
                  calendarPeriods={kpiOverridePeriods}
                  savingKey={savingKpiOverrideKey}
                  onToggle={onToggleKpiOverride}
                />
              )
            ) : null}
          </div>
          {showCommissionRelease ? (
            <aside className={`supervision-kpi-commission-release ${commissionRequirement?.blocked ? "is-blocked" : "is-clear"}`}>
              <strong>Requisitos para liberar comisiones</strong>
              {commissionRequirement?.blocked ? (
                <>
                  <span className="supervision-kpi-commission-total">
                    Pendiente: {commissionRequirement.pendingAmount} {commissionRequirement.unit}
                  </span>
                  {commissionRequirement.oldestOriginDate ? (
                    <small>Origen mas antiguo: {commissionRequirement.oldestOriginDate}</small>
                  ) : null}
                  <ul>
                    {commissionRequirement.requirements.map((requirement) => (
                      <li key={requirement.obligationId}>
                        <strong>{requirement.summary}</strong>
                        <span>{requirement.pendingAmount} {requirement.unit} - {requirement.originDate}</span>
                        {requirement.details.map((detail) => <small key={detail}>{detail}</small>)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <span>Sin pendientes de este KPI que bloqueen el pago.</span>
              )}
            </aside>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function KpiOverrideControls(props: {
  userId: string;
  metric: KpiMetric;
  periods: SupervisionUserKpiAlertPeriod[];
  weekReference: SupervisionKpiWeekReference;
  overrides: KpiEmrtOverride[];
  calendarPeriods: SupervisionKpiOverridePeriod[];
  savingKey: string;
  onToggle: (userId: string, metricId: string, date: string, isExcluded: boolean) => void;
}) {
  const [showOlderWeeks, setShowOlderWeeks] = useState(false);
  const fallbackGroups: SupervisionKpiOverridePeriod[] = [
    { key: "currentWeek", label: "Semana actual", ...props.weekReference.currentWeek, users: [] },
    { key: "previousWeek1", label: "Semana pasada", ...props.weekReference.lastWeek, users: [] }
  ];
  const groups = (props.calendarPeriods.length > 0 ? props.calendarPeriods : fallbackGroups)
    .slice()
    .sort((left, right) => right.startDate.localeCompare(left.startDate))
    .slice(0, 6);
  const visibleGroups = showOlderWeeks ? groups : groups.slice(0, 2);
  const olderGroups = groups.slice(2);
  const activeDates = new Set(
    props.overrides
      .filter((override) => override.userId === props.userId && override.metricId === props.metric.id && override.isExcluded)
      .map((override) => override.date)
  );
  const dailyByDate = new Map(
    [
      ...props.calendarPeriods.flatMap((period) =>
        period.users
          .filter((user) => user.userId === props.userId)
          .flatMap((user) => user.metrics)
          .filter((metric) => metric.id === props.metric.id)
          .flatMap((metric) => metric.dailyBreakdown)
      ),
      ...props.periods.flatMap((period) =>
        period.metrics
          .filter((metric) => metric.id === props.metric.id)
          .flatMap((metric) => metric.dailyBreakdown)
      )
    ].map((day) => [day.date, day])
  );
  const olderActiveOverrideCount = olderGroups.reduce(
    (total, group) => total + getWeekdayKeys(group.startDate, group.endDate)
      .filter((date) => activeDates.has(date)).length,
    0
  );
  const olderWeeksId = `kpi-override-older-${props.userId}-${props.metric.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");

  function getGroupLabel(group: SupervisionKpiOverridePeriod, index: number) {
    if (index === 0) {
      return "Semana actual";
    }
    if (index === 1) {
      return "Semana pasada";
    }
    return `Semana del ${formatShortDate(group.startDate)} al ${formatShortDate(group.endDate)}`;
  }

  return (
    <section className="supervision-kpi-override-panel" aria-label={`Overrides de EMRT para ${props.metric.label}`}>
      <header>
        <strong>Excluir dia por override de EMRT</strong>
        <span>El dia no contara como cumplido ni incumplido.</span>
      </header>
      <div className="supervision-kpi-override-weeks">
        {visibleGroups.map((group, index) => (
          <div
            className="supervision-kpi-override-week"
            id={index === 2 ? olderWeeksId : undefined}
            key={group.key}
          >
            <strong>{getGroupLabel(group, index)}</strong>
            <div>
              {getWeekdayKeys(group.startDate, group.endDate).map((date) => {
                const checked = activeDates.has(date);
                const day = dailyByDate.get(date);
                const unavailable = Boolean(day && isNonEvaluatedKpiDay(day) && !day.emrtExcluded && !checked);
                return (
                  <label
                    className={`supervision-kpi-override-day ${checked ? "is-excluded" : ""} ${unavailable ? "is-unavailable" : ""}`}
                    key={date}
                    title={unavailable ? day?.actualLabel : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={unavailable || Boolean(props.savingKey)}
                      onChange={(event) => props.onToggle(
                        props.userId,
                        props.metric.id,
                        date,
                        event.currentTarget.checked
                      )}
                    />
                    <span>{formatOverrideDay(date)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {olderGroups.length > 0 ? (
        <div className="supervision-kpi-override-history-toggle">
          <button
            type="button"
            className="secondary-button"
            aria-controls={olderWeeksId}
            aria-expanded={showOlderWeeks}
            onClick={() => setShowOlderWeeks((current) => !current)}
          >
            <span>{showOlderWeeks ? "Ocultar semanas anteriores" : `Ver ${olderGroups.length} semanas anteriores`}</span>
            <strong>
              {olderActiveOverrideCount} {olderActiveOverrideCount === 1 ? "override activo" : "overrides activos"}
            </strong>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function KpiWeekIncidents(props: {
  label: string;
  startDate: string;
  endDate: string;
  incidents: KpiWeekIncidentItem[];
  emptyLabel: string;
}) {
  return (
    <section className="supervision-kpi-week-incident-group">
      <strong>{props.label} ({formatCompactDateRange(props.startDate, props.endDate)}):</strong>
      {props.incidents.length > 0 ? (
        <ul>
          {props.incidents.map((incident) => (
            <li key={incident.key} className={`is-${incident.status}`}>
              <span>{incident.label}</span>
              {incident.description ? <small>{incident.description}</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <span>{props.emptyLabel}</span>
      )}
    </section>
  );
}

export function GeneralSupervisionPage() {
  const { user } = useAuth();
  const canAccess = canAccessGeneralSupervision(user);
  const [overview, setOverview] = useState<GeneralSupervisionOverview | null>(null);
  const [clientKpiPeriods, setClientKpiPeriods] = useState<SupervisionKpiPeriod[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [savingObservedUserId, setSavingObservedUserId] = useState("");
  const [savingKpiOverrideKey, setSavingKpiOverrideKey] = useState("");
  const [kpiRefreshVersion, setKpiRefreshVersion] = useState(0);

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadOverview() {
      setLoading(true);
      setErrorMessage("");
      setClientKpiPeriods(null);

      try {
        const loaded = await apiGet<GeneralSupervisionOverview>("/general-supervision/overview");
        if (mounted) {
          setOverview(loaded);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar supervision general.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      mounted = false;
    };
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess || !overview) {
      setClientKpiPeriods(null);
      return;
    }

    let mounted = true;
    const today = overview.today;

    async function loadClientKpiPeriods() {
      const ranges = buildClientKpiRanges(today);
      const monthPeriods = getMonthPeriodsForRanges(ranges);

      try {
        const monthlyOverviews = await Promise.all(
          monthPeriods.map((period) =>
            apiGet<KpiOverview>(`/kpis/overview?year=${period.year}&month=${period.month}`)
          )
        );

        if (mounted) {
          setClientKpiPeriods(buildKpiPeriodsFromMonthlyOverviews(ranges, monthlyOverviews));
        }
      } catch {
        if (mounted) {
          setClientKpiPeriods(null);
        }
      }
    }

    void loadClientKpiPeriods();

    return () => {
      mounted = false;
    };
  }, [canAccess, overview?.today, kpiRefreshVersion]);

  async function handleToggleObserved(userId: string, isObserved: boolean) {
    if (!overview) {
      return;
    }

    const previousOverview = overview;
    setSavingObservedUserId(userId);
    setErrorMessage("");
    setOverview({
      ...overview,
      taskOverview: {
        ...overview.taskOverview,
        users: overview.taskOverview.users.map((taskUser) =>
          taskUser.userId === userId ? { ...taskUser, isObserved, canToggleObservation: true } : taskUser
        )
      }
    });

    try {
      const saved = await apiPatch<SupervisionObservationSetting>(
        "/general-supervision/observed-users",
        { userId, isObserved }
      );
      setOverview((current) => current ? {
        ...current,
        taskOverview: {
          ...current.taskOverview,
          users: current.taskOverview.users.map((taskUser) =>
            taskUser.userId === userId || taskUser.userId === saved.userId
              ? { ...taskUser, userId: saved.userId, isObserved: saved.isObserved, canToggleObservation: true }
              : taskUser
          )
        }
      } : current);
    } catch (error) {
      setOverview(previousOverview);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la preferencia de observacion.");
    } finally {
      setSavingObservedUserId("");
    }
  }

  async function handleToggleKpiOverride(
    userId: string,
    metricId: string,
    date: string,
    isExcluded: boolean
  ) {
    const key = getKpiOverrideKey(userId, metricId, date);
    setSavingKpiOverrideKey(key);
    setErrorMessage("");

    try {
      await apiPatch<KpiEmrtOverride>("/general-supervision/kpi-overrides", {
        userId,
        metricId,
        date,
        isExcluded
      });
      const reloaded = await apiGet<GeneralSupervisionOverview>("/general-supervision/overview");
      setClientKpiPeriods(null);
      setOverview(reloaded);
      setKpiRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar el override de KPI.");
    } finally {
      setSavingKpiOverrideKey("");
    }
  }

  const effectiveKpiPeriods = useMemo(
    () => clientKpiPeriods ?? overview?.kpiPeriods ?? [],
    [clientKpiPeriods, overview]
  );
  const effectiveKpiAlertTotal = useMemo(() => countKpiAlerts(effectiveKpiPeriods), [effectiveKpiPeriods]);

  const summaryCards = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      { label: "Realizadas este mes", value: getCompletedThisMonthTotal(overview.taskOverview), tone: "tasks" },
      { label: "Para hoy incl. vencidas", value: overview.taskOverview.todayTotal, tone: "tasks" },
      { label: "Tareas vencidas", value: overview.taskOverview.overdueTotal, tone: "overdue" },
      { label: "Días KPI incumplidos este mes", value: getKpiMissedDaysTotal(overview.taskOverview), tone: "kpi-month" },
      { label: "Terminos abiertos", value: overview.summary.terms, tone: "terms" },
      { label: "KPI's fuera de meta", value: effectiveKpiAlertTotal, tone: "kpis" }
    ];
  }, [effectiveKpiAlertTotal, overview]);
  const kpiAlertsByUser = useMemo<Map<string, SupervisionUserKpiAlertPeriod[]>>(() => {
    return buildKpiAlertsByUser(effectiveKpiPeriods);
  }, [effectiveKpiPeriods]);
  const kpiWeekReference = useMemo<SupervisionKpiWeekReference>(() => {
    return buildKpiWeekReference(overview?.today ?? new Date().toISOString().slice(0, 10));
  }, [overview?.today]);

  if (!canAccess) {
    return <Navigate to="/app" replace />;
  }

  return (
    <section className="page-stack general-supervision-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <div>
            <h2>Supervision general</h2>
          </div>
        </div>
        <p className="muted">
          Panel ejecutivo de EMRT para revisar tareas, terminos y KPI's semanales que requieren atencion.
        </p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      {loading ? (
        <section className="panel centered-inline-message">Cargando supervision general...</section>
      ) : overview ? (
        <>
          <section className="supervision-summary-grid">
            {summaryCards.map((card) => (
              <article key={card.label} className={`supervision-summary-card is-${card.tone}`}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            ))}
            <article className="supervision-summary-card is-week">
              <span>Semana natural</span>
              <strong>{formatOverviewWeekRange(overview)}</strong>
            </article>
          </section>

          <section className="panel supervision-panel">
            <div className="panel-header">
              <h2>Tareas por usuario</h2>
              <span>
                {getCompletedThisMonthTotal(overview.taskOverview)} realizadas este mes / {overview.taskOverview.todayTotal} hoy incl. vencidas / {overview.taskOverview.overdueTotal} vencidas / {getKpiMissedDaysTotal(overview.taskOverview)} días KPI incumplidos este mes
              </span>
            </div>
            <TaskOverviewPanel
              overview={overview.taskOverview}
              kpiAlertsByUser={kpiAlertsByUser}
              kpiWeekReference={kpiWeekReference}
              kpiOverrides={overview.kpiOverrides ?? []}
              kpiOverridePeriods={overview.kpiOverridePeriods ?? []}
              savingObservedUserId={savingObservedUserId}
              savingKpiOverrideKey={savingKpiOverrideKey}
              onToggleObserved={handleToggleObserved}
              onToggleKpiOverride={handleToggleKpiOverride}
            />
          </section>

          <section className="panel supervision-panel">
            <div className="panel-header">
              <h2>Terminos por equipo</h2>
              <span>{overview.summary.terms} terminos</span>
            </div>
            <div className="supervision-bucket-grid">
              {overview.termBuckets.map((bucket) => (
                <TermBucketPanel key={bucket.key} bucket={bucket} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="panel centered-inline-message">No hay informacion disponible.</section>
      )}
    </section>
  );
}
