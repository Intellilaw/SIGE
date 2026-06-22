import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/http-client";
const MONTH_NAMES = [
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
];
const STATUS_LABELS = {
    met: "En meta",
    warning: "En observacion",
    missed: "Fuera de meta",
    "not-configured": "Sin configurar"
};
const NON_EVALUATED_KPI_DAY_UNIT = "dias-no-evaluados";
function isNonEvaluatedKpiDay(day) {
    return day.status === "not-configured" && day.unit === NON_EVALUATED_KPI_DAY_UNIT;
}
function getCurrentPeriod() {
    const date = new Date();
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1
    };
}
function formatNumber(value) {
    return new Intl.NumberFormat("es-MX", {
        maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
        minimumFractionDigits: Number.isInteger(value) ? 0 : 1
    }).format(value);
}
function formatDate(value) {
    if (!value) {
        return "-";
    }
    const [year, month, day] = value.slice(0, 10).split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
function KpiStatusBadge(props) {
    return (_jsx("span", { className: `kpis-status-badge is-${props.status}`, children: props.label ?? STATUS_LABELS[props.status] }));
}
function KpiMetricRow(props) {
    const { metric } = props;
    return (_jsxs("section", { className: `kpis-metric-row is-${metric.status}`, children: [_jsxs("div", { className: "kpis-metric-main", children: [_jsxs("div", { className: "kpis-metric-title", children: [_jsx("strong", { children: metric.label }), _jsx(KpiStatusBadge, { status: metric.status })] }), _jsx("p", { children: metric.description }), _jsxs("div", { className: "kpis-metric-values", children: [_jsx("span", { children: metric.actualLabel }), _jsx("span", { children: metric.targetLabel })] }), metric.kind === "production" ? (_jsx("div", { className: "kpis-progress-track", "aria-label": `Avance ${metric.progressPct}%`, children: _jsx("span", { style: { width: `${metric.progressPct}%` } }) })) : null, _jsx("small", { children: metric.helper }), _jsxs("small", { children: ["Fuente: ", metric.sourceDescription] })] }), metric.incidents.length > 0 ? (_jsxs("div", { className: "kpis-incidents", children: [_jsxs("div", { className: "kpis-incidents-head", children: [_jsx("strong", { children: "Incidencias detectadas" }), _jsx("span", { children: metric.incidents.length })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table kpis-incidents-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tabla" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Termino" }), _jsx("th", { children: "Estado" })] }) }), _jsx("tbody", { children: metric.incidents.map((incident) => (_jsxs("tr", { children: [_jsx("td", { children: incident.tableLabel }), _jsx("td", { children: incident.clientName }), _jsx("td", { children: incident.subject }), _jsx("td", { children: _jsxs("div", { className: "kpis-task-cell", children: [_jsx("strong", { children: incident.taskName }), _jsx("span", { children: incident.reason })] }) }), _jsx("td", { children: formatDate(incident.termDate ?? incident.dueDate) }), _jsx("td", { children: incident.status })] }, `${incident.sourceType}-${incident.id}-${incident.reason}`))) })] }) })] })) : null] }));
}
function KpiDailyMetricTable(props) {
    const { metric } = props;
    const failedDays = metric.dailyBreakdown.filter((entry) => entry.status === "missed").length;
    const warningDays = metric.dailyBreakdown.filter((entry) => entry.status === "warning").length;
    const nonEvaluatedDays = metric.dailyBreakdown.filter(isNonEvaluatedKpiDay).length;
    const summaryLabel = failedDays > 0
        ? `${failedDays} dias con falla`
        : warningDays > 0
            ? `${warningDays} en observacion`
            : nonEvaluatedDays > 0
                ? `${nonEvaluatedDays} no evaluados`
                : "Sin fallas";
    return (_jsxs("section", { className: "kpis-daily-metric", children: [_jsxs("div", { className: "kpis-daily-metric-head", children: [_jsxs("div", { children: [_jsx("strong", { children: metric.label }), _jsx("p", { children: metric.description })] }), _jsx("span", { className: failedDays > 0 ? "is-alert" : warningDays > 0 ? "is-warning" : "", children: summaryLabel })] }), metric.dailyBreakdown.length > 0 ? (_jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table kpis-daily-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Dia" }), _jsx("th", { children: "Resultado" }), _jsx("th", { children: "Real" }), _jsx("th", { children: "Meta del dia/corte" }), _jsx("th", { children: "Detalle" })] }) }), _jsx("tbody", { children: metric.dailyBreakdown.map((entry) => (_jsxs("tr", { className: `kpis-daily-row is-${entry.status}`, children: [_jsx("td", { children: formatDate(entry.date) }), _jsx("td", { children: _jsx(KpiStatusBadge, { status: entry.status, label: isNonEvaluatedKpiDay(entry) ? "No evaluado" : undefined }) }), _jsx("td", { children: entry.actualLabel }), _jsx("td", { children: entry.targetLabel }), _jsx("td", { children: _jsxs("div", { className: "kpis-daily-detail", children: [_jsx("span", { children: entry.helper }), entry.incidents.length > 0 ? (_jsx("ul", { children: entry.incidents.map((incident) => (_jsxs("li", { children: [incident.clientName, " - ", incident.taskName] }, `${incident.sourceType}-${incident.id}-${incident.reason}`))) })) : null] }) })] }, `${metric.id}-${entry.date}`))) })] }) })) : (_jsx("div", { className: "kpis-empty-user", children: "No hay dias habiles evaluados para esta metrica en el periodo seleccionado." }))] }));
}
function KpiDefinitionList(props) {
    return (_jsxs("section", { className: "kpis-user-section", children: [_jsxs("div", { className: "kpis-user-section-head", children: [_jsx("h4", { children: "KPI's definidos" }), _jsx("span", { children: props.metrics.length })] }), _jsx("div", { className: "kpis-definition-list", children: props.metrics.map((metric) => (_jsxs("div", { className: "kpis-definition-item", children: [_jsx("strong", { children: metric.label }), _jsx("p", { children: metric.description }), _jsx("small", { children: metric.targetLabel })] }, `${metric.id}-definition`))) })] }));
}
function KpiResultGroup(props) {
    return (_jsxs("div", { className: `kpis-result-group is-${props.tone}`, children: [_jsxs("div", { className: "kpis-result-group-head", children: [_jsx("h5", { children: props.title }), _jsx("span", { children: props.metrics.length })] }), _jsxs("div", { className: "kpis-result-list", children: [props.metrics.length === 0 ? _jsx("div", { className: "kpis-result-empty", children: props.emptyText }) : null, props.metrics.map((metric) => (_jsxs("div", { className: "kpis-result-row", children: [_jsxs("div", { children: [_jsx("strong", { children: metric.label }), _jsx("span", { children: metric.actualLabel })] }), _jsx(KpiStatusBadge, { status: metric.status })] }, `${metric.id}-result`)))] })] }));
}
function KpiResultSummary(props) {
    const metMetrics = props.metrics.filter((metric) => metric.status === "met");
    const missedMetrics = props.metrics.filter((metric) => metric.status === "missed");
    const warningMetrics = props.metrics.filter((metric) => metric.status === "warning");
    const unconfiguredMetrics = props.metrics.filter((metric) => metric.status === "not-configured");
    return (_jsxs("section", { className: "kpis-user-section", children: [_jsxs("div", { className: "kpis-user-section-head", children: [_jsx("h4", { children: "Cumplimiento al corte" }), _jsxs("span", { children: [metMetrics.length, " de ", props.metrics.length] })] }), _jsxs("div", { className: "kpis-results-grid", children: [_jsx(KpiResultGroup, { emptyText: "Sin KPI's cumplidos al corte.", metrics: metMetrics, title: "Cumplidos", tone: "met" }), _jsx(KpiResultGroup, { emptyText: "Sin KPI's incumplidos.", metrics: missedMetrics, title: "No cumplidos", tone: "missed" }), _jsx(KpiResultGroup, { emptyText: "Sin KPI's en observacion.", metrics: warningMetrics, title: "En observacion", tone: "warning" }), unconfiguredMetrics.length > 0 ? (_jsx(KpiResultGroup, { emptyText: "Sin KPI's pendientes.", metrics: unconfiguredMetrics, title: "Sin configurar", tone: "not-configured" })) : null] })] }));
}
function KpiUserSummarySections(props) {
    return (_jsxs(_Fragment, { children: [_jsx(KpiDefinitionList, { metrics: props.metrics }), _jsx(KpiResultSummary, { metrics: props.metrics })] }));
}
function KpiTeamPanel(props) {
    if (props.loading) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando KPI's..." }) }));
    }
    if (!props.team) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay usuarios para mostrar." }) }));
    }
    return (_jsxs("section", { className: "panel kpis-team-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsxs("h2", { children: ["Vista mensual - ", props.team.teamLabel] }), _jsx("p", { className: "muted", children: "KPI's definidos y cumplimiento mensual por usuario." })] }), _jsxs("span", { children: [props.team.users.length, " usuarios"] })] }), _jsxs("div", { className: "kpis-user-list", children: [props.team.users.length === 0 ? (_jsx("div", { className: "kpis-empty-user", children: "Equipo creado. Sus usuarios y KPI's se mostraran cuando sean asignados." })) : null, props.team.users.map((user) => (_jsxs("article", { className: `kpis-user-block ${user.configured ? "" : "is-unconfigured"}`, children: [_jsxs("header", { className: "kpis-user-head", children: [_jsxs("div", { children: [_jsxs("h3", { children: [user.displayName, user.shortName ? _jsx("span", { children: user.shortName }) : null] }), _jsx("p", { children: user.specificRole ?? user.teamLabel })] }), _jsx("span", { className: `kpis-user-state ${user.configured ? "is-configured" : "is-pending"}`, children: user.configured ? `${user.metrics.length} KPI's` : "KPI's pendientes" })] }), user.configured ? (_jsxs("div", { className: "kpis-user-sections", children: [_jsx(KpiUserSummarySections, { metrics: user.metrics }), _jsxs("section", { className: "kpis-user-section", children: [_jsxs("div", { className: "kpis-user-section-head", children: [_jsx("h4", { children: "Detalle mensual" }), _jsxs("span", { children: [user.metrics.length, " KPI's"] })] }), _jsx("div", { className: "kpis-metric-list", children: user.metrics.map((metric) => (_jsx(KpiMetricRow, { metric: metric }, metric.id))) })] })] })) : (_jsx("div", { className: "kpis-empty-user", children: "Seccion creada para este usuario. Sus KPI's aun no estan definidos, por lo que el modulo no solicita captura manual ni genera reporter\u00EDa adicional." }))] }, user.userId)))] })] }));
}
function KpiTeamDailyPanel(props) {
    if (props.loading) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando detalle diario..." }) }));
    }
    if (!props.team) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay usuarios para mostrar." }) }));
    }
    return (_jsxs("section", { className: "panel kpis-team-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsxs("h2", { children: ["Vista diaria - ", props.team.teamLabel] }), _jsx("p", { className: "muted", children: "Cumplimiento diario calculado desde seguimiento, terminos, dias inhabiles y vacaciones." })] }), _jsxs("span", { children: [props.team.users.length, " usuarios"] })] }), _jsxs("div", { className: "kpis-user-list", children: [props.team.users.length === 0 ? (_jsx("div", { className: "kpis-empty-user", children: "No hay usuarios activos asignados a este equipo." })) : null, props.team.users.map((user) => (_jsxs("article", { className: `kpis-user-block ${user.configured ? "" : "is-unconfigured"}`, children: [_jsxs("header", { className: "kpis-user-head", children: [_jsxs("div", { children: [_jsxs("h3", { children: [user.displayName, user.shortName ? _jsx("span", { children: user.shortName }) : null] }), _jsx("p", { children: user.specificRole ?? user.teamLabel })] }), _jsx("span", { className: `kpis-user-state ${user.configured ? "is-configured" : "is-pending"}`, children: user.configured ? `${user.metrics.length} KPI's` : "KPI's pendientes" })] }), user.configured ? (_jsxs("div", { className: "kpis-user-sections", children: [_jsx(KpiUserSummarySections, { metrics: user.metrics }), _jsxs("section", { className: "kpis-user-section", children: [_jsxs("div", { className: "kpis-user-section-head", children: [_jsx("h4", { children: "Detalle diario" }), _jsxs("span", { children: [user.metrics.length, " KPI's"] })] }), _jsx("div", { className: "kpis-daily-metric-list", children: user.metrics.map((metric) => (_jsx(KpiDailyMetricTable, { metric: metric }, metric.id))) })] })] })) : (_jsx("div", { className: "kpis-empty-user", children: "No hay KPI's definidos para desglosar por dia." }))] }, user.userId)))] })] }));
}
export function KpisPage() {
    const currentPeriod = getCurrentPeriod();
    const [selectedYear, setSelectedYear] = useState(currentPeriod.year);
    const [selectedMonth, setSelectedMonth] = useState(currentPeriod.month);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [activeTeamKey, setActiveTeamKey] = useState("");
    const [viewMode, setViewMode] = useState("monthly");
    async function loadOverview() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const loaded = await apiGet(`/kpis/overview?year=${selectedYear}&month=${selectedMonth}`);
            setOverview(loaded);
            setActiveTeamKey((current) => {
                if (current && loaded.teams.some((team) => team.teamKey === current)) {
                    return current;
                }
                return loaded.teams[0]?.teamKey ?? "";
            });
        }
        catch (error) {
            setErrorMessage(getErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadOverview();
    }, [selectedYear, selectedMonth]);
    const activeTeam = useMemo(() => overview?.teams.find((team) => team.teamKey === activeTeamKey), [activeTeamKey, overview]);
    const totals = useMemo(() => {
        const teams = overview?.teams ?? [];
        const users = teams.reduce((sum, team) => sum + team.users.length, 0);
        const configuredUsers = teams.reduce((sum, team) => sum + team.users.filter((user) => user.configured).length, 0);
        const metrics = teams.reduce((sum, team) => sum + team.configuredMetricsCount, 0);
        const met = teams.reduce((sum, team) => sum + team.users.reduce((userSum, user) => userSum + user.metrics.filter((metric) => metric.status === "met").length, 0), 0);
        const warning = teams.reduce((sum, team) => sum + team.users.reduce((userSum, user) => userSum + user.metrics.filter((metric) => metric.status === "warning").length, 0), 0);
        const missed = teams.reduce((sum, team) => sum + team.missedMetricsCount, 0);
        return { users, configuredUsers, metrics, met, warning, missed };
    }, [overview]);
    const yearOptions = Array.from({ length: 7 }, (_, index) => currentPeriod.year - 3 + index);
    return (_jsxs("section", { className: "page-stack kpis-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "KPI" }), _jsx("div", { children: _jsx("h2", { children: "KPI's" }) })] }), _jsx("p", { className: "muted", children: "KPI's significa Key Performance Indicators, o indicadores clave de desempe\u00F1o. Este modulo mide metas individuales y terminos a partir de las tablas de seguimiento del sistema, sin captura manual." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel kpis-toolbar-panel", children: [_jsxs("div", { className: "kpis-toolbar", children: [_jsxs("div", { className: "kpis-view-tabs", role: "tablist", "aria-label": "Vista de KPI's", children: [_jsx("button", { type: "button", className: `kpis-view-tab ${viewMode === "monthly" ? "is-active" : ""}`, onClick: () => setViewMode("monthly"), children: "Mensual" }), _jsx("button", { type: "button", className: `kpis-view-tab ${viewMode === "daily" ? "is-active" : ""}`, onClick: () => setViewMode("daily"), children: "Diaria" })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: yearOptions.map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthLabel, index) => (_jsx("option", { value: index + 1, children: monthLabel }, monthLabel))) })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => void loadOverview(), disabled: loading, children: loading ? "Actualizando..." : "Refrescar" })] }), overview ? (_jsxs("div", { className: "kpis-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Usuarios" }), _jsx("strong", { children: totals.users })] }), _jsxs("div", { children: [_jsx("span", { children: "Usuarios con KPI's" }), _jsx("strong", { children: totals.configuredUsers })] }), _jsxs("div", { children: [_jsx("span", { children: "KPI's definidos" }), _jsx("strong", { children: totals.metrics })] }), _jsxs("div", { children: [_jsx("span", { children: "Cumplidos" }), _jsx("strong", { children: totals.met })] }), _jsxs("div", { className: totals.warning > 0 ? "is-warning" : "", children: [_jsx("span", { children: "En observacion" }), _jsx("strong", { children: totals.warning })] }), _jsxs("div", { className: totals.missed > 0 ? "is-alert" : "", children: [_jsx("span", { children: "No cumplidos" }), _jsx("strong", { children: totals.missed })] }), _jsxs("div", { children: [_jsx("span", { children: "Dias habiles al corte" }), _jsx("strong", { children: formatNumber(overview.businessDaysElapsed) })] })] })) : null, overview ? (_jsxs("p", { className: "muted kpis-source-note", children: ["Corte: ", formatDate(overview.cutoffDate), ". ", overview.sourceNote] })) : null] }), _jsxs("div", { className: "kpis-layout", children: [_jsxs("aside", { className: "panel kpis-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Equipos" }), _jsx("span", { children: overview?.teams.length ?? 0 })] }), _jsx("div", { className: "kpis-sidebar-list", children: (overview?.teams ?? []).map((team) => (_jsxs("button", { type: "button", className: `kpis-sidebar-button ${team.teamKey === activeTeamKey ? "is-active" : ""}`, onClick: () => setActiveTeamKey(team.teamKey), children: [_jsx("strong", { children: team.teamLabel }), _jsxs("span", { children: [team.users.length, " usuarios - ", team.missedMetricsCount, " fuera de meta"] })] }, team.teamKey))) })] }), viewMode === "monthly" ? (_jsx(KpiTeamPanel, { team: activeTeam, loading: loading })) : (_jsx(KpiTeamDailyPanel, { team: activeTeam, loading: loading }))] })] }));
}
