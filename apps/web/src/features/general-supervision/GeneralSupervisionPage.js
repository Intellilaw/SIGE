import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiGet, apiPatch } from "../../api/http-client";
import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
const KPI_STATUS_LABELS = {
    met: "Cumplido",
    warning: "En riesgo",
    missed: "Incumplido",
    "not-configured": "Sin configurar"
};
const KPI_ALERT_STATUSES = ["missed", "warning"];
const NON_EVALUATED_KPI_DAY_UNIT = "dias-no-evaluados";
function formatDate(value) {
    if (!value) {
        return "-";
    }
    const [year, month, day] = value.slice(0, 10).split("-");
    if (!year || !month || !day) {
        return value;
    }
    return `${day}/${month}/${year}`;
}
function formatShortDate(value) {
    if (!value) {
        return "-";
    }
    const [, month, day] = value.slice(0, 10).split("-");
    return month && day ? `${day}/${month}` : value;
}
function formatDateRange(startDate, endDate) {
    if (endDate < startDate) {
        return "Sin dias restantes";
    }
    if (startDate === endDate) {
        return formatDate(startDate);
    }
    return `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`;
}
function formatCompactDateRange(startDate, endDate) {
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
function capitalizeFirst(value) {
    return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
function formatLongWeekDate(value) {
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
function formatReadableWeekRange(startDate, endDate) {
    if (endDate < startDate) {
        return "Sin dias restantes";
    }
    if (startDate === endDate) {
        return formatLongWeekDate(startDate);
    }
    return `${formatLongWeekDate(startDate)} - ${formatLongWeekDate(endDate)}`;
}
function dateFromKey(value) {
    return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}
function addDaysKey(value, offset) {
    const date = dateFromKey(value);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}
function getWeekStartKey(value) {
    const date = dateFromKey(value);
    const day = date.getUTCDay();
    return addDaysKey(value, day === 0 ? -6 : 1 - day);
}
function isWeekdayDateKey(value) {
    const day = dateFromKey(value).getUTCDay();
    return day !== 0 && day !== 6;
}
function isWeekendDateKey(value) {
    return !isWeekdayDateKey(value);
}
function getBusinessWeekRange(value) {
    const startDate = getWeekStartKey(value);
    return {
        startDate,
        endDate: addDaysKey(startDate, 4)
    };
}
function buildClientKpiRanges(today) {
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
function buildKpiWeekReference(today) {
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
function getMonthKey(value) {
    return value.slice(0, 7);
}
function getMonthPeriodsForRanges(ranges) {
    const periods = new Map();
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
function getFirstWeekdayDateKey(startDate, endDate) {
    let cursor = startDate;
    while (cursor <= endDate) {
        if (isWeekdayDateKey(cursor)) {
            return cursor;
        }
        cursor = addDaysKey(cursor, 1);
    }
    return startDate;
}
function getLastWeekdayDateKey(startDate, endDate) {
    let cursor = endDate;
    while (cursor >= startDate) {
        if (isWeekdayDateKey(cursor)) {
            return cursor;
        }
        cursor = addDaysKey(cursor, -1);
    }
    return endDate;
}
function formatOverviewWeekRange(overview) {
    if (isWeekendDateKey(overview.today)) {
        const nextWeek = getBusinessWeekRange(addDaysKey(getWeekStartKey(overview.today), 7));
        return formatReadableWeekRange(nextWeek.startDate, nextWeek.endDate);
    }
    return formatReadableWeekRange(overview.currentWeekDisplayStart ?? getFirstWeekdayDateKey(overview.currentWeekStart, overview.currentWeekEnd), overview.currentWeekDisplayEnd ?? getLastWeekdayDateKey(overview.currentWeekStart, overview.currentWeekEnd));
}
function EntityMeta(props) {
    const entity = [props.clientName, props.subject].filter((value) => value && value !== "-").join(" / ");
    return (_jsxs("span", { children: [entity || "Sin cliente/asunto", " - ", props.sourceLabel] }));
}
function EmptyState(props) {
    return _jsx("div", { className: "supervision-empty-state", children: props.children });
}
function formatTaskCount(value) {
    return `${value} ${value === 1 ? "tarea" : "tareas"}`;
}
function isAutomaticUnobservedUser(user) {
    return user.isSynthetic ?? user.userId.startsWith("responsible:");
}
function canToggleUserObservation(user) {
    return user.canToggleObservation ?? !isAutomaticUnobservedUser(user);
}
function isObservedTaskUser(user) {
    return user.isObserved ?? canToggleUserObservation(user);
}
function getCompletedThisMonth(user) {
    return user.completedThisMonth ?? user.total;
}
function getKpiMetDays(user) {
    return user.kpiMetDays ?? 0;
}
function getKpiMissedDays(user) {
    return user.kpiMissedDays ?? user.monthlyKpiMisses ?? 0;
}
function getCompletedThisMonthTotal(overview) {
    return overview.completedThisMonthTotal ?? overview.total;
}
function getKpiMetDaysTotal(overview) {
    return overview.kpiMetDaysTotal ?? 0;
}
function getKpiMissedDaysTotal(overview) {
    return overview.kpiMissedDaysTotal ?? overview.monthlyKpiMissesTotal ?? 0;
}
function buildKpiAlertsByUser(periods) {
    const alertsByUser = new Map();
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
function summarizeDailyStatus(dailyBreakdown) {
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
function isNonEvaluatedKpiDay(day) {
    return day.status === "not-configured" && day.unit === NON_EVALUATED_KPI_DAY_UNIT;
}
function metricHasNonEvaluatedDays(metric) {
    return metric.dailyBreakdown.some(isNonEvaluatedKpiDay);
}
function pluralizeDays(count) {
    return `${count} ${count === 1 ? "dia" : "dias"}`;
}
function buildRangeMetric(metric, dailyBreakdown) {
    const evaluatedDays = dailyBreakdown.filter((day) => !isNonEvaluatedKpiDay(day));
    const nonEvaluatedDays = dailyBreakdown.filter(isNonEvaluatedKpiDay);
    const missedDays = evaluatedDays.filter((day) => day.status === "missed").length;
    const warningDays = evaluatedDays.filter((day) => day.status === "warning").length;
    const metDays = evaluatedDays.filter((day) => day.status === "met").length;
    const incidents = evaluatedDays.flatMap((day) => day.incidents);
    const actualLabel = [
        missedDays > 0 ? `${pluralizeDays(missedDays)} incumplidos` : "",
        warningDays > 0 ? `${pluralizeDays(warningDays)} en riesgo` : "",
        missedDays === 0 && warningDays === 0 && metDays > 0 ? `${pluralizeDays(metDays)} cumplidos` : "",
        nonEvaluatedDays.length > 0 ? `${pluralizeDays(nonEvaluatedDays.length)} no evaluados` : ""
    ].filter(Boolean).join(" / ") || "Sin dias evaluados";
    return {
        ...metric,
        status: summarizeDailyStatus(dailyBreakdown),
        value: evaluatedDays.reduce((total, day) => total + day.value, 0),
        target: evaluatedDays.reduce((total, day) => total + day.target, 0),
        actualLabel,
        targetLabel: [
            `${pluralizeDays(evaluatedDays.length)} habiles evaluados`,
            nonEvaluatedDays.length > 0 ? `${pluralizeDays(nonEvaluatedDays.length)} no evaluados` : ""
        ].filter(Boolean).join(" / "),
        progressPct: metric.progressPct,
        helper: `Periodo evaluado: ${formatDateRange(dailyBreakdown[0]?.date ?? "", dailyBreakdown.at(-1)?.date ?? "")}`,
        incidents,
        dailyBreakdown
    };
}
function buildKpiPeriodsFromMonthlyOverviews(ranges, overviews) {
    return ranges.map((range) => {
        const users = new Map();
        overviews.forEach((overview) => {
            overview.teams.forEach((team) => {
                team.users.forEach((user) => {
                    user.metrics.forEach((metric) => {
                        const rangeDays = metric.dailyBreakdown.filter((day) => day.date >= range.startDate
                            && day.date <= range.endDate);
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
                            metricsById: new Map()
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
            totalIncidents: periodUsers.reduce((total, user) => total + user.metrics.reduce((metricTotal, metric) => metricTotal + metric.incidents.length, 0), 0),
            users: periodUsers
        };
    });
}
function countKpiAlerts(periods) {
    return periods.reduce((total, period) => total + period.totalMetrics, 0);
}
function getMetricPeriod(periods, metricId, periodKey) {
    return periods.find((period) => period.key === periodKey)
        ?.metrics.find((metric) => metric.id === metricId);
}
function getKpiIncidentDate(incident) {
    return incident.dueDate ?? incident.termDate ?? incident.completedAt?.slice(0, 10) ?? "";
}
function getKpiIncidentKey(incident) {
    return [
        getKpiIncidentDate(incident),
        incident.sourceType,
        incident.id,
        incident.reason
    ].join(":");
}
function getUniqueKpiIncidents(incidents) {
    const lookup = new Map();
    incidents.forEach((incident) => {
        lookup.set(getKpiIncidentKey(incident), incident);
    });
    return Array.from(lookup.values());
}
function formatKpiIncident(incident) {
    const date = getKpiIncidentDate(incident);
    const details = [
        incident.clientName && incident.clientName !== "-" ? incident.clientName : "",
        incident.subject && incident.subject !== "-" ? incident.subject : "",
        incident.taskName
    ].filter(Boolean).join(" / ");
    return [date ? formatShortDate(date) : "", details || incident.reason].filter(Boolean).join(" - ");
}
function getKpiWeekIncidentItems(periods, metricId, periodKey, view) {
    const metric = getMetricPeriod(periods, metricId, periodKey);
    const items = new Map();
    const includedStatuses = view === "met" ? ["met"] : KPI_ALERT_STATUSES;
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
            status: day.status,
            label: `${formatShortDate(day.date)} - ${day.actualLabel}`,
            description: `${day.targetLabel}. ${day.helper}`
        });
    });
    return Array.from(items.values()).sort((left, right) => left.key.localeCompare(right.key));
}
function getKpiUnmetMetrics(periods) {
    const metricsById = new Map();
    periods.forEach((period) => {
        period.metrics.forEach((metric) => {
            if (!KPI_ALERT_STATUSES.includes(metric.status) && !metricHasNonEvaluatedDays(metric)) {
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
function getKpiMetMetrics(periods) {
    const metricsById = new Map();
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
function getKpiDetailCountLabel(view, metrics) {
    const primaryCount = view === "unmet"
        ? metrics.filter((metric) => KPI_ALERT_STATUSES.includes(metric.status)).length
        : metrics.filter((metric) => metric.status === "met").length;
    const nonEvaluatedOnlyCount = metrics.filter((metric) => {
        const isPrimary = view === "unmet"
            ? KPI_ALERT_STATUSES.includes(metric.status)
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
function TaskUserRow(props) {
    const { user, kpiAlerts, kpiWeekReference, muted = false, saving, onToggleObserved } = props;
    const [showDetail, setShowDetail] = useState(false);
    const [kpiDetailView, setKpiDetailView] = useState("unmet");
    const canToggle = canToggleUserObservation(user);
    const isObserved = isObservedTaskUser(user);
    const completedThisMonth = getCompletedThisMonth(user);
    const kpiMetDays = getKpiMetDays(user);
    const kpiMissedDays = getKpiMissedDays(user);
    const kpiUnmetMetrics = getKpiUnmetMetrics(kpiAlerts);
    const kpiMetMetrics = getKpiMetMetrics(kpiAlerts);
    const displayedKpiMetrics = kpiDetailView === "unmet" ? kpiUnmetMetrics : kpiMetMetrics;
    const displayedKpiCountLabel = getKpiDetailCountLabel(kpiDetailView, displayedKpiMetrics);
    const detailPeriodTitle = kpiDetailView === "met" ? "Semanas evaluadas" : "Semana actual";
    const detailPeriodRange = kpiDetailView === "met"
        ? `${formatDateRange(kpiWeekReference.lastWeek.startDate, kpiWeekReference.lastWeek.endDate)} / ${formatDateRange(kpiWeekReference.currentWeek.startDate, kpiWeekReference.currentWeek.endDate)}`
        : formatDateRange(kpiWeekReference.currentWeek.startDate, kpiWeekReference.currentWeek.endDate);
    const detailId = `supervision-detail-${user.userId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    return (_jsxs("section", { className: `supervision-task-user-row ${muted ? "is-muted" : ""}`, children: [_jsxs("div", { className: "supervision-task-user-main", children: [_jsx("h4", { children: user.displayName }), _jsx("span", { children: user.shortName ?? user.teamLabel })] }), _jsxs("label", { className: `supervision-observe-toggle ${canToggle ? "" : "is-locked"}`, children: [canToggle ? (_jsx("input", { type: "checkbox", checked: isObserved, disabled: saving, onChange: (event) => onToggleObserved(user.userId, event.currentTarget.checked) })) : null, _jsx("span", { children: canToggle ? "Observar" : "Automatico abajo" })] }), _jsxs("div", { className: "supervision-task-counts", "aria-label": `${user.displayName}: ${formatTaskCount(completedThisMonth)} realizadas este mes, ${formatTaskCount(user.today)} para hoy incluyendo vencidas, ${formatTaskCount(user.overdue)} vencidas, ${kpiMetDays} días KPI cumplidos este mes y ${kpiMissedDays} días KPI incumplidos este mes`, children: [_jsxs("span", { className: "is-total", children: [_jsx("strong", { children: completedThisMonth }), "Realizadas mes"] }), _jsxs("span", { children: [_jsx("strong", { children: user.today }), "Hoy + vencidas"] }), _jsxs("span", { className: "is-overdue", children: [_jsx("strong", { children: user.overdue }), "Vencidas"] }), _jsxs("span", { className: "is-kpi-met", children: [_jsx("strong", { children: kpiMetDays }), "D\u00EDas KPI cumplidos este mes"] }), _jsxs("span", { className: "is-kpi-missed", children: [_jsx("strong", { children: kpiMissedDays }), "D\u00EDas KPI incumplidos este mes"] })] }), _jsxs("div", { className: "supervision-task-link-list", children: [user.dashboardLinks.length > 0 ? (user.dashboardLinks.map((link) => (_jsx(Link, { className: "secondary-button supervision-task-dashboard-link", to: link.path, children: user.dashboardLinks.length === 1 ? "Ir al dashboard" : link.label }, link.moduleId)))) : (_jsx(Link, { className: "secondary-button supervision-task-dashboard-link", to: "/app/kpis", children: "Ir a KPI's" })), _jsx("button", { "aria-controls": detailId, "aria-expanded": showDetail, className: "secondary-button supervision-task-detail-button", onClick: () => setShowDetail((current) => !current), type: "button", children: showDetail ? "Ocultar detalle" : "Ver detalle" })] }), showDetail ? (_jsxs("div", { className: "supervision-task-user-detail", id: detailId, children: [user.dashboardLinks.length > 0 ? (_jsx("div", { className: "supervision-task-detail-list", children: user.dashboardLinks.map((link) => (_jsx("div", { className: "supervision-task-detail-row", children: _jsx("div", { children: _jsx("strong", { children: link.label }) }) }, link.moduleId))) })) : (_jsx(EmptyState, { children: "Sin dashboards asociados para esta persona." })), _jsxs("section", { className: "supervision-task-kpi-card", "aria-label": `Key Performance Indicators de ${user.displayName}`, children: [_jsxs("header", { className: "supervision-task-kpi-card-head", children: [_jsx("div", { children: _jsx("strong", { children: "Key Performance Indicators" }) }), _jsxs("div", { className: "supervision-task-kpi-card-actions", children: [_jsxs("div", { className: "supervision-kpi-view-toggle", role: "group", "aria-label": "Vista de KPI", children: [_jsx("button", { type: "button", className: kpiDetailView === "unmet" ? "is-active" : "", "aria-pressed": kpiDetailView === "unmet", onClick: () => setKpiDetailView("unmet"), children: "Ver KPI's incumplidos" }), _jsx("button", { type: "button", className: kpiDetailView === "met" ? "is-active" : "", "aria-pressed": kpiDetailView === "met", onClick: () => setKpiDetailView("met"), children: "Ver KPI's cumplidos" })] }), _jsx("span", { className: `supervision-task-kpi-alert-count ${kpiDetailView === "met" ? "is-met" : ""}`, children: displayedKpiCountLabel })] })] }), displayedKpiMetrics.length > 0 ? (_jsxs("section", { className: "supervision-task-kpi-detail-period", children: [_jsxs("header", { children: [_jsx("strong", { children: detailPeriodTitle }), _jsxs("span", { children: [detailPeriodRange, " - ", displayedKpiCountLabel] })] }), _jsx("div", { className: "supervision-kpi-list", children: displayedKpiMetrics.map((metric) => (_jsx(KpiMetricRow, { metric: metric, periods: kpiAlerts, weekReference: kpiWeekReference, view: kpiDetailView }, metric.id))) })] })) : (_jsx(EmptyState, { children: kpiDetailView === "unmet"
                                    ? "Sin KPI's incumplidos para esta persona."
                                    : "Sin KPI's cumplidos para esta persona en la semana actual o pasada." }))] })] })) : null] }));
}
function TaskOverviewPanel(props) {
    const { overview, kpiAlertsByUser, kpiWeekReference, savingObservedUserId, onToggleObserved } = props;
    const [showUnobserved, setShowUnobserved] = useState(false);
    const observedUsers = overview.users.filter(isObservedTaskUser);
    const unobservedUsers = overview.users.filter((user) => !isObservedTaskUser(user));
    const completedThisMonthTotal = getCompletedThisMonthTotal(overview);
    const kpiMetDaysTotal = getKpiMetDaysTotal(overview);
    const kpiMissedDaysTotal = getKpiMissedDaysTotal(overview);
    return (_jsxs("article", { className: "supervision-task-overview", children: [_jsxs("header", { className: "supervision-task-overview-head", children: [_jsxs("div", { className: "supervision-task-stat is-total", children: [_jsx("span", { children: "Realizadas este mes" }), _jsx("strong", { children: completedThisMonthTotal })] }), _jsxs("div", { className: "supervision-task-stat is-today", children: [_jsx("span", { children: "Para hoy incl. vencidas" }), _jsx("strong", { children: overview.todayTotal })] }), _jsxs("div", { className: "supervision-task-stat is-overdue", children: [_jsx("span", { children: "Vencidas" }), _jsx("strong", { children: overview.overdueTotal })] }), _jsxs("div", { className: "supervision-task-stat is-kpi-met", children: [_jsx("span", { children: "D\u00EDas KPI cumplidos este mes" }), _jsx("strong", { children: kpiMetDaysTotal })] }), _jsxs("div", { className: "supervision-task-stat is-kpi-missed", children: [_jsx("span", { children: "D\u00EDas KPI incumplidos este mes" }), _jsx("strong", { children: kpiMissedDaysTotal })] })] }), _jsxs("section", { className: "supervision-observed-panel is-primary", children: [_jsx("header", { className: "supervision-observed-panel-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Personas que observo" }), _jsxs("span", { children: [observedUsers.length, " personas"] })] }) }), _jsx("div", { className: "supervision-task-user-list", children: observedUsers.length === 0 ? (_jsx(EmptyState, { children: "Sin personas observadas con alertas." })) : (observedUsers.map((user) => (_jsx(TaskUserRow, { user: user, kpiAlerts: kpiAlertsByUser.get(user.userId) ?? [], kpiWeekReference: kpiWeekReference, saving: savingObservedUserId === user.userId, onToggleObserved: onToggleObserved }, user.userId)))) })] }), _jsxs("section", { className: "supervision-observed-panel is-secondary", children: [_jsxs("header", { className: "supervision-observed-panel-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Personas que no observo" }), _jsxs("span", { children: [unobservedUsers.length, " personas"] })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => setShowUnobserved((current) => !current), children: showUnobserved ? "Ocultar" : "Mostrar" })] }), showUnobserved ? (_jsx("div", { className: "supervision-task-user-list is-muted", children: unobservedUsers.length === 0 ? (_jsx(EmptyState, { children: "Sin personas fuera de observacion." })) : (unobservedUsers.map((user) => (_jsx(TaskUserRow, { user: user, kpiAlerts: kpiAlertsByUser.get(user.userId) ?? [], kpiWeekReference: kpiWeekReference, muted: true, saving: savingObservedUserId === user.userId, onToggleObserved: onToggleObserved }, user.userId)))) })) : null] })] }));
}
function TermBucketPanel({ bucket }) {
    return (_jsxs("article", { className: "supervision-bucket-card", children: [_jsxs("header", { className: "supervision-bucket-head", children: [_jsxs("div", { children: [_jsx("h3", { children: bucket.label }), _jsx("span", { children: formatDateRange(bucket.startDate, bucket.endDate) })] }), _jsx("strong", { children: bucket.total })] }), _jsx("div", { className: "supervision-group-list", children: bucket.teams.length === 0 ? (_jsx(EmptyState, { children: "Sin terminos en esta ventana." })) : (bucket.teams.map((team) => (_jsxs("section", { className: "supervision-user-group", children: [_jsxs("div", { className: "supervision-group-head", children: [_jsxs("div", { children: [_jsx("h4", { children: team.teamLabel }), _jsxs("span", { children: [team.total, " terminos"] })] }), _jsx("strong", { children: team.total })] }), _jsx("div", { className: "supervision-row-list", children: team.terms.map((term) => (_jsxs(Link, { className: "supervision-list-row is-term", to: term.originPath, children: [_jsxs("div", { children: [_jsx("strong", { children: term.termLabel }), _jsx(EntityMeta, { clientName: term.clientName, subject: term.subject, sourceLabel: term.sourceLabel }), _jsx("small", { children: term.responsible || "Sin responsable" })] }), _jsx("span", { children: formatShortDate(term.termDate) })] }, term.id))) })] }, team.moduleId)))) })] }));
}
function KpiMetricRow({ metric, periods, weekReference, view }) {
    const currentWeekIncidents = getKpiWeekIncidentItems(periods, metric.id, "currentWeek", view);
    const lastWeekIncidents = getKpiWeekIncidentItems(periods, metric.id, "lastWeek", view);
    const emptyLabel = view === "met" ? "Sin KPI's cumplidos registrados." : "Sin incidencias registradas.";
    const statusLabel = metric.status === "not-configured" && metricHasNonEvaluatedDays(metric)
        ? "No evaluado"
        : KPI_STATUS_LABELS[metric.status];
    return (_jsxs("section", { className: `supervision-kpi-metric is-${metric.status}`, children: [_jsxs("div", { className: "supervision-kpi-metric-head", children: [_jsx("strong", { className: "supervision-kpi-metric-title", children: metric.label }), _jsx("span", { className: `kpis-status-badge is-${metric.status}`, children: statusLabel })] }), _jsx("div", { className: "supervision-kpi-values", children: _jsx("span", { children: metric.actualLabel }) }), _jsx("div", { className: "kpis-progress-track", "aria-label": `Avance ${metric.progressPct}%`, children: _jsx("span", { style: { width: `${metric.progressPct}%` } }) }), metric.incidents.length > 0 ? (_jsxs("small", { children: [metric.incidents.length, " incidencias detectadas"] })) : (_jsx("small", { children: metric.helper })), _jsxs("div", { className: "supervision-kpi-week-reference", children: [_jsx(KpiWeekIncidents, { incidents: currentWeekIncidents, label: "Semana actual", startDate: weekReference.currentWeek.startDate, endDate: weekReference.currentWeek.endDate, emptyLabel: emptyLabel }), _jsx(KpiWeekIncidents, { incidents: lastWeekIncidents, label: "Semana pasada", startDate: weekReference.lastWeek.startDate, endDate: weekReference.lastWeek.endDate, emptyLabel: emptyLabel })] })] }));
}
function KpiWeekIncidents(props) {
    return (_jsxs("section", { className: "supervision-kpi-week-incident-group", children: [_jsxs("strong", { children: [props.label, " (", formatCompactDateRange(props.startDate, props.endDate), "):"] }), props.incidents.length > 0 ? (_jsx("ul", { children: props.incidents.map((incident) => (_jsxs("li", { className: `is-${incident.status}`, children: [_jsx("span", { children: incident.label }), incident.description ? _jsx("small", { children: incident.description }) : null] }, incident.key))) })) : (_jsx("span", { children: props.emptyLabel }))] }));
}
export function GeneralSupervisionPage() {
    const { user } = useAuth();
    const canAccess = canAccessGeneralSupervision(user);
    const [overview, setOverview] = useState(null);
    const [clientKpiPeriods, setClientKpiPeriods] = useState(null);
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
                const loaded = await apiGet("/general-supervision/overview");
                if (mounted) {
                    setOverview(loaded);
                }
            }
            catch (error) {
                if (mounted) {
                    setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar supervision general.");
                }
            }
            finally {
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
                const monthlyOverviews = await Promise.all(monthPeriods.map((period) => apiGet(`/kpis/overview?year=${period.year}&month=${period.month}`)));
                if (mounted) {
                    setClientKpiPeriods(buildKpiPeriodsFromMonthlyOverviews(ranges, monthlyOverviews));
                }
            }
            catch {
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
    async function handleToggleObserved(userId, isObserved) {
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
                users: overview.taskOverview.users.map((taskUser) => taskUser.userId === userId ? { ...taskUser, isObserved, canToggleObservation: true } : taskUser)
            }
        });
        try {
            const saved = await apiPatch("/general-supervision/observed-users", { userId, isObserved });
            setOverview((current) => current ? {
                ...current,
                taskOverview: {
                    ...current.taskOverview,
                    users: current.taskOverview.users.map((taskUser) => taskUser.userId === userId || taskUser.userId === saved.userId
                        ? { ...taskUser, userId: saved.userId, isObserved: saved.isObserved, canToggleObservation: true }
                        : taskUser)
                }
            } : current);
        }
        catch (error) {
            setOverview(previousOverview);
            setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la preferencia de observacion.");
        }
        finally {
            setSavingObservedUserId("");
        }
    }
    const effectiveKpiPeriods = useMemo(() => clientKpiPeriods ?? overview?.kpiPeriods ?? [], [clientKpiPeriods, overview]);
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
    const kpiAlertsByUser = useMemo(() => {
        return buildKpiAlertsByUser(effectiveKpiPeriods);
    }, [effectiveKpiPeriods]);
    const kpiWeekReference = useMemo(() => {
        return buildKpiWeekReference(overview?.today ?? new Date().toISOString().slice(0, 10));
    }, [overview?.today]);
    if (!canAccess) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return (_jsxs("section", { className: "page-stack general-supervision-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: "Supervision general" }) }) }), _jsx("p", { className: "muted", children: "Panel ejecutivo de EMRT para revisar tareas, terminos y KPI's semanales que requieren atencion." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, loading ? (_jsx("section", { className: "panel centered-inline-message", children: "Cargando supervision general..." })) : overview ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "supervision-summary-grid", children: [summaryCards.map((card) => (_jsxs("article", { className: `supervision-summary-card is-${card.tone}`, children: [_jsx("span", { children: card.label }), _jsx("strong", { children: card.value })] }, card.label))), _jsxs("article", { className: "supervision-summary-card is-week", children: [_jsx("span", { children: "Semana natural" }), _jsx("strong", { children: formatOverviewWeekRange(overview) })] })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Tareas por usuario" }), _jsxs("span", { children: [getCompletedThisMonthTotal(overview.taskOverview), " realizadas este mes / ", overview.taskOverview.todayTotal, " hoy incl. vencidas / ", overview.taskOverview.overdueTotal, " vencidas / ", getKpiMissedDaysTotal(overview.taskOverview), " d\u00EDas KPI incumplidos este mes"] })] }), _jsx(TaskOverviewPanel, { overview: overview.taskOverview, kpiAlertsByUser: kpiAlertsByUser, kpiWeekReference: kpiWeekReference, savingObservedUserId: savingObservedUserId, onToggleObserved: handleToggleObserved })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Terminos por equipo" }), _jsxs("span", { children: [overview.summary.terms, " terminos"] })] }), _jsx("div", { className: "supervision-bucket-grid", children: overview.termBuckets.map((bucket) => (_jsx(TermBucketPanel, { bucket: bucket }, bucket.key))) })] })] })) : (_jsx("section", { className: "panel centered-inline-message", children: "No hay informacion disponible." }))] }));
}
