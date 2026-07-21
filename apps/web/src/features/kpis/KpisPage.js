import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/http-client";
function getCurrentPeriod() {
    const date = new Date();
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1
    };
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
function KpiDefinitionList(props) {
    return (_jsxs("section", { className: "kpis-user-section", children: [_jsxs("div", { className: "kpis-user-section-head", children: [_jsx("h4", { children: "KPI's medidos" }), _jsx("span", { children: props.metrics.length })] }), _jsx("div", { className: "kpis-definition-list", children: props.metrics.map((metric) => (_jsxs("article", { className: "kpis-definition-item", children: [_jsx("strong", { children: metric.label }), _jsxs("div", { className: "kpis-definition-field", children: [_jsx("span", { children: "Meta" }), _jsx("p", { children: metric.description })] }), _jsxs("div", { className: "kpis-definition-field", children: [_jsx("span", { children: "Fuente autom\u00E1tica" }), _jsx("p", { children: metric.sourceDescription })] })] }, metric.id))) })] }));
}
function KpiUserCard(props) {
    const { user } = props;
    const detailId = `kpis-user-definitions-${user.userId}`;
    return (_jsxs("article", { className: `kpis-user-block ${user.configured ? "" : "is-unconfigured"} ${props.isExpanded ? "is-expanded" : "is-collapsed"}`, children: [_jsx("header", { className: "kpis-user-head", children: _jsxs("button", { type: "button", className: "kpis-user-toggle", "aria-expanded": props.isExpanded, "aria-controls": detailId, onClick: props.onToggle, children: [_jsxs("span", { className: "kpis-user-main", children: [_jsxs("h3", { children: [user.displayName, user.shortName ? _jsx("span", { children: user.shortName }) : null] }), _jsx("p", { children: user.specificRole ?? user.teamLabel })] }), _jsxs("span", { className: "kpis-user-summary", children: [_jsx("span", { className: `kpis-user-state ${user.configured ? "is-configured" : "is-pending"}`, children: user.configured ? `${user.metrics.length} KPI's` : "Sin KPI's definidos" }), _jsx("span", { className: "kpis-user-chevron", "aria-hidden": "true" })] })] }) }), props.isExpanded ? (_jsx("div", { className: "kpis-user-detail", id: detailId, children: user.configured ? (_jsx(KpiDefinitionList, { metrics: user.metrics })) : (_jsx("div", { className: "kpis-empty-user", children: "Esta persona a\u00FAn no tiene KPI's definidos. El m\u00F3dulo no solicita captura manual." })) })) : null] }));
}
function KpiTeamPanel(props) {
    const teamUserIds = useMemo(() => props.team?.users.map((user) => user.userId) ?? [], [props.team]);
    const teamUserIdsSignature = teamUserIds.join("|");
    const [expandedUserIds, setExpandedUserIds] = useState([]);
    useEffect(() => {
        setExpandedUserIds([]);
    }, [props.team?.teamKey, teamUserIdsSignature]);
    const expandedUserIdSet = useMemo(() => new Set(expandedUserIds), [expandedUserIds]);
    const allUsersExpanded = teamUserIds.length > 0 && teamUserIds.every((userId) => expandedUserIdSet.has(userId));
    const noUsersExpanded = !teamUserIds.some((userId) => expandedUserIdSet.has(userId));
    function toggleUser(userId) {
        setExpandedUserIds((current) => current.includes(userId) ? current.filter((currentUserId) => currentUserId !== userId) : [...current, userId]);
    }
    if (props.loading) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando KPI's..." }) }));
    }
    if (!props.team) {
        return (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No hay usuarios para mostrar." }) }));
    }
    return (_jsxs("section", { className: "panel kpis-team-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsxs("h2", { children: ["KPI's medidos - ", props.team.teamLabel] }), _jsx("p", { className: "muted", children: "Indicadores definidos para cada integrante del equipo." })] }), _jsxs("div", { className: "kpis-team-panel-actions", children: [_jsxs("span", { children: [props.team.users.length, " usuarios"] }), _jsxs("div", { children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => setExpandedUserIds(teamUserIds), disabled: allUsersExpanded || teamUserIds.length === 0, children: "Expandir todo" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => setExpandedUserIds([]), disabled: noUsersExpanded || teamUserIds.length === 0, children: "Colapsar todo" })] })] })] }), _jsxs("div", { className: "kpis-user-list", children: [props.team.users.length === 0 ? (_jsx("div", { className: "kpis-empty-user", children: "No hay usuarios activos asignados a este equipo." })) : null, props.team.users.map((user) => (_jsx(KpiUserCard, { user: user, isExpanded: expandedUserIdSet.has(user.userId), onToggle: () => toggleUser(user.userId) }, user.userId)))] })] }));
}
export function KpisPage() {
    const currentPeriod = getCurrentPeriod();
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [activeTeamKey, setActiveTeamKey] = useState("");
    useEffect(() => {
        let active = true;
        async function loadOverview() {
            setLoading(true);
            setErrorMessage(null);
            try {
                const loaded = await apiGet(`/kpis/overview?year=${currentPeriod.year}&month=${currentPeriod.month}`);
                if (!active) {
                    return;
                }
                setOverview(loaded);
                setActiveTeamKey((current) => {
                    if (current && loaded.teams.some((team) => team.teamKey === current)) {
                        return current;
                    }
                    return loaded.teams[0]?.teamKey ?? "";
                });
            }
            catch (error) {
                if (active) {
                    setErrorMessage(getErrorMessage(error));
                }
            }
            finally {
                if (active) {
                    setLoading(false);
                }
            }
        }
        void loadOverview();
        return () => {
            active = false;
        };
    }, [currentPeriod.month, currentPeriod.year]);
    const activeTeam = useMemo(() => overview?.teams.find((team) => team.teamKey === activeTeamKey), [activeTeamKey, overview]);
    return (_jsxs("section", { className: "page-stack kpis-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "KPI" }), _jsx("div", { children: _jsx("h2", { children: "KPI's" }) })] }), _jsx("p", { className: "muted", children: "KPI significa Key Performance Indicator, o indicador clave de desempe\u00F1o. Este m\u00F3dulo muestra los indicadores medidos autom\u00E1ticamente para cada persona; su evaluaci\u00F3n se consulta en Supervisi\u00F3n General." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("div", { className: "kpis-layout", children: [_jsxs("aside", { className: "panel kpis-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Equipos" }), _jsx("span", { children: overview?.teams.length ?? 0 })] }), _jsx("div", { className: "kpis-sidebar-list", children: (overview?.teams ?? []).map((team) => (_jsxs("button", { type: "button", className: `kpis-sidebar-button ${team.teamKey === activeTeamKey ? "is-active" : ""}`, onClick: () => setActiveTeamKey(team.teamKey), children: [_jsx("strong", { children: team.teamLabel }), _jsxs("span", { children: [team.users.length, " usuarios"] })] }, team.teamKey))) })] }), _jsx(KpiTeamPanel, { team: activeTeam, loading: loading })] })] }));
}
