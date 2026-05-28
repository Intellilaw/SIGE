import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiGet } from "../../api/http-client";
import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
const KPI_STATUS_LABELS = {
    met: "Cumplido",
    warning: "En riesgo",
    missed: "Incumplido",
    "not-configured": "Sin configurar"
};
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
function TaskOverviewPanel({ overview }) {
    return (_jsxs("article", { className: "supervision-task-overview", children: [_jsxs("header", { className: "supervision-task-overview-head", children: [_jsxs("div", { className: "supervision-task-stat is-total", children: [_jsx("span", { children: "Total critico" }), _jsx("strong", { children: overview.total })] }), _jsxs("div", { className: "supervision-task-stat is-today", children: [_jsx("span", { children: "Para hoy" }), _jsx("strong", { children: overview.todayTotal })] }), _jsxs("div", { className: "supervision-task-stat is-overdue", children: [_jsx("span", { children: "Vencidas / sin fecha" }), _jsx("strong", { children: overview.overdueTotal })] }), _jsxs("div", { className: "supervision-task-stat is-kpi-month", children: [_jsx("span", { children: "KPI's incumplidos este mes" }), _jsx("strong", { children: overview.monthlyKpiMissesTotal })] })] }), _jsx("div", { className: "supervision-task-user-list", children: overview.users.length === 0 ? (_jsx(EmptyState, { children: "Sin tareas urgentes por usuario." })) : (overview.users.map((user) => (_jsxs("section", { className: "supervision-task-user-row", children: [_jsxs("div", { className: "supervision-task-user-main", children: [_jsx("h4", { children: user.displayName }), _jsx("span", { children: user.shortName ?? user.teamLabel })] }), _jsxs("div", { className: "supervision-task-counts", "aria-label": `${user.displayName}: ${formatTaskCount(user.total)} criticas, ${formatTaskCount(user.today)} para hoy, ${formatTaskCount(user.overdue)} vencidas y ${user.monthlyKpiMisses} KPI's incumplidos este mes`, children: [_jsxs("span", { className: "is-total", children: [_jsx("strong", { children: user.total }), "Total"] }), _jsxs("span", { children: [_jsx("strong", { children: user.today }), "Hoy"] }), _jsxs("span", { className: "is-overdue", children: [_jsx("strong", { children: user.overdue }), "Vencidas"] }), _jsxs("span", { className: "is-kpi-month", children: [_jsx("strong", { children: user.monthlyKpiMisses }), "KPI mes"] })] }), _jsx("div", { className: "supervision-task-link-list", children: user.dashboardLinks.map((link) => (_jsx(Link, { className: "secondary-button supervision-task-dashboard-link", to: link.path, children: user.dashboardLinks.length === 1 ? "Ir al dashboard" : link.label }, link.moduleId))) })] }, user.userId)))) })] }));
}
function TermBucketPanel({ bucket }) {
    return (_jsxs("article", { className: "supervision-bucket-card", children: [_jsxs("header", { className: "supervision-bucket-head", children: [_jsxs("div", { children: [_jsx("h3", { children: bucket.label }), _jsx("span", { children: formatDateRange(bucket.startDate, bucket.endDate) })] }), _jsx("strong", { children: bucket.total })] }), _jsx("div", { className: "supervision-group-list", children: bucket.teams.length === 0 ? (_jsx(EmptyState, { children: "Sin terminos en esta ventana." })) : (bucket.teams.map((team) => (_jsxs("section", { className: "supervision-user-group", children: [_jsxs("div", { className: "supervision-group-head", children: [_jsxs("div", { children: [_jsx("h4", { children: team.teamLabel }), _jsxs("span", { children: [team.total, " terminos"] })] }), _jsx("strong", { children: team.total })] }), _jsx("div", { className: "supervision-row-list", children: team.terms.map((term) => (_jsxs(Link, { className: "supervision-list-row is-term", to: term.originPath, children: [_jsxs("div", { children: [_jsx("strong", { children: term.termLabel }), _jsx(EntityMeta, { clientName: term.clientName, subject: term.subject, sourceLabel: term.sourceLabel }), _jsx("small", { children: term.responsible || "Sin responsable" })] }), _jsx("span", { children: formatShortDate(term.termDate) })] }, term.id))) })] }, team.moduleId)))) })] }));
}
function KpiMetricRow({ metric }) {
    return (_jsxs("section", { className: `supervision-kpi-metric is-${metric.status}`, children: [_jsxs("div", { className: "supervision-kpi-metric-head", children: [_jsx("strong", { children: metric.label }), _jsx("span", { className: `kpis-status-badge is-${metric.status}`, children: KPI_STATUS_LABELS[metric.status] })] }), _jsxs("div", { className: "supervision-kpi-values", children: [_jsx("span", { children: metric.actualLabel }), _jsx("span", { children: metric.targetLabel })] }), _jsx("div", { className: "kpis-progress-track", "aria-label": `Avance ${metric.progressPct}%`, children: _jsx("span", { style: { width: `${metric.progressPct}%` } }) }), metric.incidents.length > 0 ? (_jsxs("small", { children: [metric.incidents.length, " incidencias detectadas"] })) : (_jsx("small", { children: metric.helper }))] }));
}
function KpiPeriodPanel({ period }) {
    return (_jsxs("article", { className: "supervision-kpi-period", children: [_jsxs("header", { className: "supervision-bucket-head", children: [_jsxs("div", { children: [_jsx("h3", { children: period.label }), _jsx("span", { children: formatDateRange(period.startDate, period.endDate) })] }), _jsx("strong", { children: period.totalMetrics })] }), _jsx("div", { className: "supervision-group-list", children: period.users.length === 0 ? (_jsx(EmptyState, { children: "Sin KPI's fuera de meta." })) : (period.users.map((user) => (_jsxs("section", { className: "supervision-user-group", children: [_jsxs("div", { className: "supervision-group-head", children: [_jsxs("div", { children: [_jsx("h4", { children: user.displayName }), _jsx("span", { children: user.shortName ?? user.teamLabel })] }), _jsx("strong", { children: user.total })] }), _jsx("div", { className: "supervision-kpi-list", children: user.metrics.map((metric) => (_jsx(KpiMetricRow, { metric: metric }, metric.id))) })] }, user.userId)))) })] }));
}
export function GeneralSupervisionPage() {
    const { user } = useAuth();
    const canAccess = canAccessGeneralSupervision(user);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    useEffect(() => {
        if (!canAccess) {
            setLoading(false);
            return;
        }
        let mounted = true;
        async function loadOverview() {
            setLoading(true);
            setErrorMessage("");
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
    const summaryCards = useMemo(() => {
        if (!overview) {
            return [];
        }
        return [
            { label: "Tareas para hoy", value: overview.taskOverview.todayTotal, tone: "tasks" },
            { label: "Vencidas / sin fecha", value: overview.taskOverview.overdueTotal, tone: "overdue" },
            { label: "KPI's incumplidos este mes", value: overview.taskOverview.monthlyKpiMissesTotal, tone: "kpi-month" },
            { label: "Terminos abiertos", value: overview.summary.terms, tone: "terms" },
            { label: "KPI's fuera de meta", value: overview.summary.kpiAlerts, tone: "kpis" }
        ];
    }, [overview]);
    if (!canAccess) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return (_jsxs("section", { className: "page-stack general-supervision-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: "Supervision general" }) }) }), _jsx("p", { className: "muted", children: "Panel ejecutivo de EMRT para revisar tareas, terminos y KPI's semanales que requieren atencion." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, loading ? (_jsx("section", { className: "panel centered-inline-message", children: "Cargando supervision general..." })) : overview ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "supervision-summary-grid", children: [summaryCards.map((card) => (_jsxs("article", { className: `supervision-summary-card is-${card.tone}`, children: [_jsx("span", { children: card.label }), _jsx("strong", { children: card.value })] }, card.label))), _jsxs("article", { className: "supervision-summary-card is-week", children: [_jsx("span", { children: "Semana natural" }), _jsx("strong", { children: formatDateRange(overview.currentWeekStart, overview.currentWeekEnd) })] })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Tareas por usuario" }), _jsxs("span", { children: [overview.taskOverview.total, " criticas: ", overview.taskOverview.todayTotal, " hoy / ", overview.taskOverview.overdueTotal, " vencidas o sin fecha / ", overview.taskOverview.monthlyKpiMissesTotal, " KPI's mes"] })] }), _jsx(TaskOverviewPanel, { overview: overview.taskOverview })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Terminos por equipo" }), _jsxs("span", { children: [overview.summary.terms, " terminos"] })] }), _jsx("div", { className: "supervision-bucket-grid", children: overview.termBuckets.map((bucket) => (_jsx(TermBucketPanel, { bucket: bucket }, bucket.key))) })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "KPI's no cumplidos" }), _jsxs("span", { children: [overview.summary.kpiAlerts, " alertas"] })] }), _jsx("div", { className: "supervision-kpi-grid", children: overview.kpiPeriods.map((period) => (_jsx(KpiPeriodPanel, { period: period }, period.key))) })] })] })) : (_jsx("section", { className: "panel centered-inline-message", children: "No hay informacion disponible." }))] }));
}
