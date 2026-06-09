import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { KpiMetric } from "@sige/contracts";

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

interface GeneralSupervisionOverview {
  generatedAt: string;
  today: string;
  currentWeekStart: string;
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

function TaskUserRow(props: {
  user: SupervisionTaskUserSummary;
  muted?: boolean;
  saving: boolean;
  onToggleObserved: (userId: string, isObserved: boolean) => void;
}) {
  const { user, muted = false, saving, onToggleObserved } = props;
  const canToggle = canToggleUserObservation(user);
  const isObserved = isObservedTaskUser(user);
  const completedThisMonth = getCompletedThisMonth(user);
  const kpiMetDays = getKpiMetDays(user);
  const kpiMissedDays = getKpiMissedDays(user);

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

      <div className="supervision-task-counts" aria-label={`${user.displayName}: ${formatTaskCount(completedThisMonth)} realizadas este mes, ${formatTaskCount(user.today)} para hoy incluyendo vencidas, ${formatTaskCount(user.overdue)} vencidas, ${kpiMetDays} días KPI cumplidos y ${kpiMissedDays} días KPI incumplidos`}>
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
          Días KPI cumplidos
        </span>
        <span className="is-kpi-missed">
          <strong>{kpiMissedDays}</strong>
          Días KPI incumplidos
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
      </div>
    </section>
  );
}

function TaskOverviewPanel(props: {
  overview: SupervisionTaskOverview;
  savingObservedUserId: string;
  onToggleObserved: (userId: string, isObserved: boolean) => void;
}) {
  const { overview, savingObservedUserId, onToggleObserved } = props;
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
          <span>Días KPI cumplidos</span>
          <strong>{kpiMetDaysTotal}</strong>
        </div>
        <div className="supervision-task-stat is-kpi-missed">
          <span>Días KPI incumplidos</span>
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

function KpiMetricRow({ metric }: { metric: KpiMetric }) {
  return (
    <section className={`supervision-kpi-metric is-${metric.status}`}>
      <div className="supervision-kpi-metric-head">
        <strong>{metric.label}</strong>
        <span className={`kpis-status-badge is-${metric.status}`}>{KPI_STATUS_LABELS[metric.status]}</span>
      </div>
      <div className="supervision-kpi-values">
        <span>{metric.actualLabel}</span>
        <span>{metric.targetLabel}</span>
      </div>
      <div className="kpis-progress-track" aria-label={`Avance ${metric.progressPct}%`}>
        <span style={{ width: `${metric.progressPct}%` }} />
      </div>
      {metric.incidents.length > 0 ? (
        <small>{metric.incidents.length} incidencias detectadas</small>
      ) : (
        <small>{metric.helper}</small>
      )}
    </section>
  );
}

function KpiPeriodPanel({ period }: { period: SupervisionKpiPeriod }) {
  return (
    <article className="supervision-kpi-period">
      <header className="supervision-bucket-head">
        <div>
          <h3>{period.label}</h3>
          <span>{formatDateRange(period.startDate, period.endDate)}</span>
        </div>
        <strong>{period.totalMetrics}</strong>
      </header>

      <div className="supervision-group-list">
        {period.users.length === 0 ? (
          <EmptyState>Sin KPI's fuera de meta.</EmptyState>
        ) : (
          period.users.map((user) => (
            <section key={user.userId} className="supervision-user-group">
              <div className="supervision-group-head">
                <div>
                  <h4>{user.displayName}</h4>
                  <span>{user.shortName ?? user.teamLabel}</span>
                </div>
                <strong>{user.total}</strong>
              </div>

              <div className="supervision-kpi-list">
                {user.metrics.map((metric) => (
                  <KpiMetricRow key={metric.id} metric={metric} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </article>
  );
}

export function GeneralSupervisionPage() {
  const { user } = useAuth();
  const canAccess = canAccessGeneralSupervision(user);
  const [overview, setOverview] = useState<GeneralSupervisionOverview | null>(null);
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
              <strong>{formatDateRange(overview.currentWeekStart, overview.currentWeekEnd)}</strong>
            </article>
          </section>

          <section className="panel supervision-panel">
            <div className="panel-header">
              <h2>Tareas por usuario</h2>
              <span>
                {getCompletedThisMonthTotal(overview.taskOverview)} realizadas este mes / {overview.taskOverview.todayTotal} hoy incl. vencidas / {overview.taskOverview.overdueTotal} vencidas / {getKpiMissedDaysTotal(overview.taskOverview)} días KPI incumplidos
              </span>
            </div>
            <TaskOverviewPanel
              overview={overview.taskOverview}
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

          <section className="panel supervision-panel">
            <div className="panel-header">
              <h2>KPI's no cumplidos</h2>
              <span>{overview.summary.kpiAlerts} alertas</span>
            </div>
            <div className="supervision-kpi-grid">
              {overview.kpiPeriods.map((period) => (
                <KpiPeriodPanel key={period.key} period={period} />
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
