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
function TaskUserRow(props) {
    const { user, muted = false, saving, onToggleObserved } = props;
    const canToggle = canToggleUserObservation(user);
    const isObserved = isObservedTaskUser(user);
    const completedThisMonth = getCompletedThisMonth(user);
    const kpiMetDays = getKpiMetDays(user);
    const kpiMissedDays = getKpiMissedDays(user);
    return (_jsxs("section", { className: `supervision-task-user-row ${muted ? "is-muted" : ""}`, children: [_jsxs("div", { className: "supervision-task-user-main", children: [_jsx("h4", { children: user.displayName }), _jsx("span", { children: user.shortName ?? user.teamLabel })] }), _jsxs("label", { className: `supervision-observe-toggle ${canToggle ? "" : "is-locked"}`, children: [canToggle ? (_jsx("input", { type: "checkbox", checked: isObserved, disabled: saving, onChange: (event) => onToggleObserved(user.userId, event.currentTarget.checked) })) : null, _jsx("span", { children: canToggle ? "Observar" : "Automatico abajo" })] }), _jsxs("div", { className: "supervision-task-counts", "aria-label": `${user.displayName}: ${formatTaskCount(completedThisMonth)} realizadas este mes, ${formatTaskCount(user.today)} para hoy incluyendo vencidas, ${formatTaskCount(user.overdue)} vencidas, ${kpiMetDays} días KPI cumplidos y ${kpiMissedDays} días KPI incumplidos`, children: [_jsxs("span", { className: "is-total", children: [_jsx("strong", { children: completedThisMonth }), "Realizadas mes"] }), _jsxs("span", { children: [_jsx("strong", { children: user.today }), "Hoy + vencidas"] }), _jsxs("span", { className: "is-overdue", children: [_jsx("strong", { children: user.overdue }), "Vencidas"] }), _jsxs("span", { className: "is-kpi-met", children: [_jsx("strong", { children: kpiMetDays }), "D\u00EDas KPI cumplidos"] }), _jsxs("span", { className: "is-kpi-missed", children: [_jsx("strong", { children: kpiMissedDays }), "D\u00EDas KPI incumplidos"] })] }), _jsx("div", { className: "supervision-task-link-list", children: user.dashboardLinks.length > 0 ? (user.dashboardLinks.map((link) => (_jsx(Link, { className: "secondary-button supervision-task-dashboard-link", to: link.path, children: user.dashboardLinks.length === 1 ? "Ir al dashboard" : link.label }, link.moduleId)))) : (_jsx(Link, { className: "secondary-button supervision-task-dashboard-link", to: "/app/kpis", children: "Ir a KPI's" })) })] }));
}
function TaskOverviewPanel(props) {
    const { overview, savingObservedUserId, onToggleObserved } = props;
    const [showUnobserved, setShowUnobserved] = useState(false);
    const observedUsers = overview.users.filter(isObservedTaskUser);
    const unobservedUsers = overview.users.filter((user) => !isObservedTaskUser(user));
    const completedThisMonthTotal = getCompletedThisMonthTotal(overview);
    const kpiMetDaysTotal = getKpiMetDaysTotal(overview);
    const kpiMissedDaysTotal = getKpiMissedDaysTotal(overview);
    return (_jsxs("article", { className: "supervision-task-overview", children: [_jsxs("header", { className: "supervision-task-overview-head", children: [_jsxs("div", { className: "supervision-task-stat is-total", children: [_jsx("span", { children: "Realizadas este mes" }), _jsx("strong", { children: completedThisMonthTotal })] }), _jsxs("div", { className: "supervision-task-stat is-today", children: [_jsx("span", { children: "Para hoy incl. vencidas" }), _jsx("strong", { children: overview.todayTotal })] }), _jsxs("div", { className: "supervision-task-stat is-overdue", children: [_jsx("span", { children: "Vencidas" }), _jsx("strong", { children: overview.overdueTotal })] }), _jsxs("div", { className: "supervision-task-stat is-kpi-met", children: [_jsx("span", { children: "D\u00EDas KPI cumplidos" }), _jsx("strong", { children: kpiMetDaysTotal })] }), _jsxs("div", { className: "supervision-task-stat is-kpi-missed", children: [_jsx("span", { children: "D\u00EDas KPI incumplidos" }), _jsx("strong", { children: kpiMissedDaysTotal })] })] }), _jsxs("section", { className: "supervision-observed-panel is-primary", children: [_jsx("header", { className: "supervision-observed-panel-head", children: _jsxs("div", { children: [_jsx("h3", { children: "Personas que observo" }), _jsxs("span", { children: [observedUsers.length, " personas"] })] }) }), _jsx("div", { className: "supervision-task-user-list", children: observedUsers.length === 0 ? (_jsx(EmptyState, { children: "Sin personas observadas con alertas." })) : (observedUsers.map((user) => (_jsx(TaskUserRow, { user: user, saving: savingObservedUserId === user.userId, onToggleObserved: onToggleObserved }, user.userId)))) })] }), _jsxs("section", { className: "supervision-observed-panel is-secondary", children: [_jsxs("header", { className: "supervision-observed-panel-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Personas que no observo" }), _jsxs("span", { children: [unobservedUsers.length, " personas"] })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => setShowUnobserved((current) => !current), children: showUnobserved ? "Ocultar" : "Mostrar" })] }), showUnobserved ? (_jsx("div", { className: "supervision-task-user-list is-muted", children: unobservedUsers.length === 0 ? (_jsx(EmptyState, { children: "Sin personas fuera de observacion." })) : (unobservedUsers.map((user) => (_jsx(TaskUserRow, { user: user, muted: true, saving: savingObservedUserId === user.userId, onToggleObserved: onToggleObserved }, user.userId)))) })) : null] })] }));
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
    const summaryCards = useMemo(() => {
        if (!overview) {
            return [];
        }
        return [
            { label: "Realizadas este mes", value: getCompletedThisMonthTotal(overview.taskOverview), tone: "tasks" },
            { label: "Para hoy incl. vencidas", value: overview.taskOverview.todayTotal, tone: "tasks" },
            { label: "Tareas vencidas", value: overview.taskOverview.overdueTotal, tone: "overdue" },
            { label: "Días KPI incumplidos", value: getKpiMissedDaysTotal(overview.taskOverview), tone: "kpi-month" },
            { label: "Terminos abiertos", value: overview.summary.terms, tone: "terms" },
            { label: "KPI's fuera de meta", value: overview.summary.kpiAlerts, tone: "kpis" }
        ];
    }, [overview]);
    if (!canAccess) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return (_jsxs("section", { className: "page-stack general-supervision-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: "Supervision general" }) }) }), _jsx("p", { className: "muted", children: "Panel ejecutivo de EMRT para revisar tareas, terminos y KPI's semanales que requieren atencion." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, loading ? (_jsx("section", { className: "panel centered-inline-message", children: "Cargando supervision general..." })) : overview ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "supervision-summary-grid", children: [summaryCards.map((card) => (_jsxs("article", { className: `supervision-summary-card is-${card.tone}`, children: [_jsx("span", { children: card.label }), _jsx("strong", { children: card.value })] }, card.label))), _jsxs("article", { className: "supervision-summary-card is-week", children: [_jsx("span", { children: "Semana natural" }), _jsx("strong", { children: formatDateRange(overview.currentWeekStart, overview.currentWeekEnd) })] })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Tareas por usuario" }), _jsxs("span", { children: [getCompletedThisMonthTotal(overview.taskOverview), " realizadas este mes / ", overview.taskOverview.todayTotal, " hoy incl. vencidas / ", overview.taskOverview.overdueTotal, " vencidas / ", getKpiMissedDaysTotal(overview.taskOverview), " d\u00EDas KPI incumplidos"] })] }), _jsx(TaskOverviewPanel, { overview: overview.taskOverview, savingObservedUserId: savingObservedUserId, onToggleObserved: handleToggleObserved })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Terminos por equipo" }), _jsxs("span", { children: [overview.summary.terms, " terminos"] })] }), _jsx("div", { className: "supervision-bucket-grid", children: overview.termBuckets.map((bucket) => (_jsx(TermBucketPanel, { bucket: bucket }, bucket.key))) })] }), _jsxs("section", { className: "panel supervision-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "KPI's no cumplidos" }), _jsxs("span", { children: [overview.summary.kpiAlerts, " alertas"] })] }), _jsx("div", { className: "supervision-kpi-grid", children: overview.kpiPeriods.map((period) => (_jsx(KpiPeriodPanel, { period: period }, period.key))) })] })] })) : (_jsx("section", { className: "panel centered-inline-message", children: "No hay informacion disponible." }))] }));
}
