import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    return (_jsx("span", { className: `kpis-status-badge is-${props.status}`, children: STATUS_LABELS[props.status] }));
}
function KpiMetricRow(props) {
    const { metric } = props;
    return (_jsxs("section", { className: `kpis-metric-row is-${metric.status}`, children: [_jsxs("div", { className: "kpis-metric-main", children: [_jsxs("div", { className: "kpis-metric-title", children: [_jsx("strong", { children: metric.label }), _jsx(KpiStatusBadge, { status: metric.status })] }), _jsx("p", { children: metric.description }), _jsxs("div", { className: "kpis-metric-values", children: [_jsx("span", { children: metric.actualLabel }), _jsx("span", { children: metric.targetLabel })] }), metric.kind === "production" ? (_jsx("div", { className: "kpis-progress-track", "aria-label": `Avance ${metric.progressPct}%`, children: _jsx("span", { style: { width: `${metric.progressPct}%` } }) })) : null, _jsx("small", { children: metric.helper }), _jsxs("small", { children: ["Fuente: ", metric.sourceDescription] })] }), metric.incidents.length > 0 ? (_jsxs("div", { className: "kpis-incidents", children: [_jsxs("div", { className: "kpis-incidents-head", children: [_jsx("strong", { children: "Incidencias detectadas" }), _jsx("span", { children: metric.incidents.length })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table kpis-incidents-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tabla" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Termino" }), _jsx("th", { children: "Estado" })] }) }), _jsx("tbody", { children: metric.incidents.map((incident) => (_jsxs("tr", { children: [_jsx("td", { children: incident.tableLabel }), _jsx("td", { children: incident.clientName }), _jsx("td", { children: incident.subject }), _jsx("td", { children: _jsxs("div", { className: "kpis-task-cell", children: [_jsx("strong", { children: incident.taskName }), _jsx("span", { children: incident.reason })] }) }), _jsx("td", { children: formatDate(incident.termDate ?? incident.dueDate) }), _jsx("td", { children: incident.status })] }, `${incident.sourceType}-${incident.id}-${incident.reason}`))) })] }) })] })) : null] }));
}
function KpiTeamPanel(props) {
    if (props.loading) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando KPI's..." }) }));
    }
    if (!props.team) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay usuarios para mostrar." }) }));
    }
    return (_jsxs("section", { className: "panel kpis-team-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: props.team.teamLabel }), _jsx("p", { className: "muted", children: "Usuarios activos del sistema agrupados por equipo de trabajo." })] }), _jsxs("span", { children: [props.team.users.length, " usuarios"] })] }), _jsx("div", { className: "kpis-user-list", children: props.team.users.map((user) => (_jsxs("article", { className: `kpis-user-block ${user.configured ? "" : "is-unconfigured"}`, children: [_jsxs("header", { className: "kpis-user-head", children: [_jsxs("div", { children: [_jsxs("h3", { children: [user.displayName, user.shortName ? _jsx("span", { children: user.shortName }) : null] }), _jsx("p", { children: user.specificRole ?? user.teamLabel })] }), _jsx("span", { className: `kpis-user-state ${user.configured ? "is-configured" : "is-pending"}`, children: user.configured ? `${user.metrics.length} KPI's` : "KPI's pendientes" })] }), user.configured ? (_jsx("div", { className: "kpis-metric-list", children: user.metrics.map((metric) => (_jsx(KpiMetricRow, { metric: metric }, metric.id))) })) : (_jsx("div", { className: "kpis-empty-user", children: "Seccion creada para este usuario. Sus KPI's aun no estan definidos, por lo que el modulo no solicita captura manual ni genera reporter\u00EDa adicional." }))] }, user.userId))) })] }));
}
export function KpisPage() {
    const currentPeriod = getCurrentPeriod();
    const [selectedYear, setSelectedYear] = useState(currentPeriod.year);
    const [selectedMonth, setSelectedMonth] = useState(currentPeriod.month);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [activeTeamKey, setActiveTeamKey] = useState("");
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
        const missed = teams.reduce((sum, team) => sum + team.missedMetricsCount, 0);
        return { users, configuredUsers, metrics, missed };
    }, [overview]);
    const yearOptions = Array.from({ length: 7 }, (_, index) => currentPeriod.year - 3 + index);
    return (_jsxs("section", { className: "page-stack kpis-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "KPI" }), _jsx("div", { children: _jsx("h2", { children: "KPI's" }) })] }), _jsx("p", { className: "muted", children: "KPI's significa Key Performance Indicators, o indicadores clave de desempe\u00F1o. Este modulo mide metas individuales y terminos a partir de las tablas de seguimiento del sistema, sin captura manual." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel kpis-toolbar-panel", children: [_jsxs("div", { className: "kpis-toolbar", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: yearOptions.map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthLabel, index) => (_jsx("option", { value: index + 1, children: monthLabel }, monthLabel))) })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => void loadOverview(), disabled: loading, children: loading ? "Actualizando..." : "Refrescar" })] }), overview ? (_jsxs("div", { className: "kpis-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Usuarios" }), _jsx("strong", { children: totals.users })] }), _jsxs("div", { children: [_jsx("span", { children: "Usuarios con KPI's" }), _jsx("strong", { children: totals.configuredUsers })] }), _jsxs("div", { children: [_jsx("span", { children: "Indicadores activos" }), _jsx("strong", { children: totals.metrics })] }), _jsxs("div", { className: totals.missed > 0 ? "is-alert" : "", children: [_jsx("span", { children: "Fuera de meta" }), _jsx("strong", { children: totals.missed })] }), _jsxs("div", { children: [_jsx("span", { children: "Dias habiles al corte" }), _jsx("strong", { children: formatNumber(overview.businessDaysElapsed) })] })] })) : null, overview ? (_jsxs("p", { className: "muted kpis-source-note", children: ["Corte: ", formatDate(overview.cutoffDate), ". ", overview.sourceNote] })) : null] }), _jsxs("div", { className: "kpis-layout", children: [_jsxs("aside", { className: "panel kpis-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Equipos" }), _jsx("span", { children: overview?.teams.length ?? 0 })] }), _jsx("div", { className: "kpis-sidebar-list", children: (overview?.teams ?? []).map((team) => (_jsxs("button", { type: "button", className: `kpis-sidebar-button ${team.teamKey === activeTeamKey ? "is-active" : ""}`, onClick: () => setActiveTeamKey(team.teamKey), children: [_jsx("strong", { children: team.teamLabel }), _jsxs("span", { children: [team.users.length, " usuarios \u00B7 ", team.missedMetricsCount, " fuera de meta"] })] }, team.teamKey))) })] }), _jsx(KpiTeamPanel, { team: activeTeam, loading: loading })] })] }));
}
