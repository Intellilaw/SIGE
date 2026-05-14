import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { KpiMetric } from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";

interface SupervisionTask {
  id: string;
  moduleId: string;
  moduleLabel: string;
  teamLabel: string;
  taskLabel: string;
  clientName: string;
  subject: string;
  responsible: string;
  dueDate: string;
  statusLabel: string;
  sourceLabel: string;
  originPath: string;
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

interface SupervisionUserGroup {
  userId: string;
  displayName: string;
  shortName?: string;
  teamLabel: string;
  specificRole?: string;
  total: number;
  tasks: SupervisionTask[];
}

interface SupervisionTeamGroup {
  moduleId: string;
  teamLabel: string;
  total: number;
  terms: SupervisionTerm[];
}

interface SupervisionTaskBucket {
  key: "today" | "tomorrow" | "restOfWeek";
  label: string;
  startDate: string;
  endDate: string;
  total: number;
  users: SupervisionUserGroup[];
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
  taskBuckets: SupervisionTaskBucket[];
  termBuckets: SupervisionTermBucket[];
  kpiPeriods: SupervisionKpiPeriod[];
  summary: {
    tasks: number;
    terms: number;
    kpiAlerts: number;
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

function TaskBucketPanel({ bucket }: { bucket: SupervisionTaskBucket }) {
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
        {bucket.users.length === 0 ? (
          <EmptyState>Sin tareas en esta ventana.</EmptyState>
        ) : (
          bucket.users.map((user) => (
            <section key={user.userId} className="supervision-user-group">
              <div className="supervision-group-head">
                <div>
                  <h4>{user.displayName}</h4>
                  <span>{user.shortName ?? user.teamLabel}</span>
                </div>
                <strong>{user.total}</strong>
              </div>

              <div className="supervision-row-list">
                {user.tasks.map((task) => (
                  <Link key={task.id} className="supervision-list-row" to={task.originPath}>
                    <div>
                      <strong>{task.taskLabel}</strong>
                      <EntityMeta clientName={task.clientName} subject={task.subject} sourceLabel={task.sourceLabel} />
                    </div>
                    <span>{formatShortDate(task.dueDate)}</span>
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

  const summaryCards = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      { label: "Tareas por hacer", value: overview.summary.tasks, tone: "tasks" },
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
              <span>{overview.summary.tasks} tareas</span>
            </div>
            <div className="supervision-bucket-grid">
              {overview.taskBuckets.map((bucket) => (
                <TaskBucketPanel key={bucket.key} bucket={bucket} />
              ))}
            </div>
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
