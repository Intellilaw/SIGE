import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { KpiIncident, KpiMetric, KpiMetricStatus, KpiOverview } from "@sige/contracts";

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

interface KpiWeekIncidentItem {
  key: string;
  status: KpiMetricStatus;
  label: string;
  description?: string;
}

interface GeneralSupervisionOverview {
  generatedAt: string;
  today: string;
  currentWeekStart: string;
  currentWeekDisplayStart?: string;
  currentWeekDisplayEnd?: string;
  currentWeekEnd: string;
  currentMonthStart: string;
  currentMonthEnd: string;
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
  warning: "En riesgo",
  missed: "Incumplido",
  "not-configured": "Sin configurar"
};

const KPI_ALERT_STATUSES: KpiMetricStatus[] = ["missed", "warning"];

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
  if (dailyBreakdown.some((day) => day.status === "missed")) {
    return "missed";
  }

  if (dailyBreakdown.some((day) => day.status === "warning")) {
    return "warning";
  }

  return "met";
}

function pluralizeDays(count: number) {
  return `${count} ${count === 1 ? "dia" : "dias"}`;
}

function buildRangeMetric(metric: KpiMetric, dailyBreakdown: KpiMetric["dailyBreakdown"]): KpiMetric {
  const missedDays = dailyBreakdown.filter((day) => day.status === "missed").length;
  const warningDays = dailyBreakdown.filter((day) => day.status === "warning").length;
  const metDays = dailyBreakdown.filter((day) => day.status === "met").length;
  const incidents = dailyBreakdown.flatMap((day) => day.incidents);

  return {
    ...metric,
    status: summarizeDailyStatus(dailyBreakdown),
    value: dailyBreakdown.reduce((total, day) => total + day.value, 0),
    target: dailyBreakdown.reduce((total, day) => total + day.target, 0),
    actualLabel: [
      missedDays > 0 ? `${pluralizeDays(missedDays)} incumplidos` : "",
      warningDays > 0 ? `${pluralizeDays(warningDays)} en riesgo` : "",
      missedDays === 0 && warningDays === 0 ? `${pluralizeDays(metDays)} cumplidos` : ""
    ].filter(Boolean).join(" / "),
    targetLabel: `${pluralizeDays(dailyBreakdown.length)} habiles evaluados`,
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

function countUserKpiAlerts(periods: SupervisionUserKpiAlertPeriod[]) {
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
  periodKey: SupervisionKpiPeriod["key"]
) {
  const metric = getMetricPeriod(periods, metricId, periodKey);
  const items = new Map<string, KpiWeekIncidentItem>();

  metric?.dailyBreakdown
    .filter((day) => KPI_ALERT_STATUSES.includes(day.status))
    .forEach((day) => {
      const dayIncidents = getUniqueKpiIncidents(day.incidents);

      if (dayIncidents.length > 0) {
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
        status: day.status,
        label: `${formatShortDate(day.date)} - ${day.actualLabel}`,
        description: `${day.targetLabel}. ${day.helper}`
      });
    });

  return Array.from(items.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function getKpiAlertMetrics(periods: SupervisionUserKpiAlertPeriod[]) {
  const metricsById = new Map<string, { metric: KpiMetric; periodKey: SupervisionKpiPeriod["key"] }>();

  periods.forEach((period) => {
    period.metrics.forEach((metric) => {
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

function TaskUserRow(props: {
  user: SupervisionTaskUserSummary;
  kpiAlerts: SupervisionUserKpiAlertPeriod[];
  kpiWeekReference: SupervisionKpiWeekReference;
  muted?: boolean;
  saving: boolean;
  onToggleObserved: (userId: string, isObserved: boolean) => void;
}) {
  const { user, kpiAlerts, kpiWeekReference, muted = false, saving, onToggleObserved } = props;
  const [showDetail, setShowDetail] = useState(false);
  const canToggle = canToggleUserObservation(user);
  const isObserved = isObservedTaskUser(user);
  const completedThisMonth = getCompletedThisMonth(user);
  const kpiMetDays = getKpiMetDays(user);
  const kpiMissedDays = getKpiMissedDays(user);
  const kpiAlertCount = countUserKpiAlerts(kpiAlerts);
  const kpiAlertMetrics = getKpiAlertMetrics(kpiAlerts);
  const detailId = `supervision-detail-${user.userId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

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
          onClick={() => setShowDetail((current) => !current)}
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
              <span className="supervision-task-kpi-alert-count">{kpiAlertCount} alertas</span>
            </header>
            {kpiAlertMetrics.length > 0 ? (
              <section className="supervision-task-kpi-detail-period">
                <header>
                  <strong>Semana actual</strong>
                  <span>
                    {formatDateRange(
                      kpiWeekReference.currentWeek.startDate,
                      kpiWeekReference.currentWeek.endDate
                    )} - {kpiAlertCount} alertas
                  </span>
                </header>
                <div className="supervision-kpi-list">
                  {kpiAlertMetrics.map((metric) => (
                    <KpiMetricRow
                      key={metric.id}
                      metric={metric}
                      periods={kpiAlerts}
                      weekReference={kpiWeekReference}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState>Sin KPI's no cumplidos para esta persona.</EmptyState>
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
  savingObservedUserId: string;
  onToggleObserved: (userId: string, isObserved: boolean) => void;
}) {
  const { overview, kpiAlertsByUser, kpiWeekReference, savingObservedUserId, onToggleObserved } = props;
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
                saving={savingObservedUserId === user.userId}
                onToggleObserved={onToggleObserved}
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
                  muted
                  saving={savingObservedUserId === user.userId}
                  onToggleObserved={onToggleObserved}
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
  weekReference
}: {
  metric: KpiMetric;
  periods: SupervisionUserKpiAlertPeriod[];
  weekReference: SupervisionKpiWeekReference;
}) {
  const currentWeekIncidents = getKpiWeekIncidentItems(periods, metric.id, "currentWeek");
  const lastWeekIncidents = getKpiWeekIncidentItems(periods, metric.id, "lastWeek");

  return (
    <section className={`supervision-kpi-metric is-${metric.status}`}>
      <div className="supervision-kpi-metric-head">
        <strong className="supervision-kpi-metric-title">{metric.label}</strong>
        <span className={`kpis-status-badge is-${metric.status}`}>{KPI_STATUS_LABELS[metric.status]}</span>
      </div>
      <div className="supervision-kpi-values">
        <span>{metric.actualLabel}</span>
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
        />
        <KpiWeekIncidents
          incidents={lastWeekIncidents}
          label="Semana pasada"
          startDate={weekReference.lastWeek.startDate}
          endDate={weekReference.lastWeek.endDate}
        />
      </div>
    </section>
  );
}

function KpiWeekIncidents(props: {
  label: string;
  startDate: string;
  endDate: string;
  incidents: KpiWeekIncidentItem[];
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
        <span>Sin incidencias registradas.</span>
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
  }, [canAccess, overview?.today]);

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
              savingObservedUserId={savingObservedUserId}
              onToggleObserved={handleToggleObserved}
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
