import { useEffect, useMemo, useState } from "react";
import type { KpiMetric, KpiMetricStatus, KpiOverview, KpiTeamSummary } from "@sige/contracts";

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

const STATUS_LABELS: Record<KpiMetricStatus, string> = {
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

function KpiStatusBadge(props: { status: KpiMetricStatus }) {
  return (
    <span className={`kpis-status-badge is-${props.status}`}>
      {STATUS_LABELS[props.status]}
    </span>
  );
}

function KpiMetricRow(props: { metric: KpiMetric }) {
  const { metric } = props;

  return (
    <section className={`kpis-metric-row is-${metric.status}`}>
      <div className="kpis-metric-main">
        <div className="kpis-metric-title">
          <strong>{metric.label}</strong>
          <KpiStatusBadge status={metric.status} />
        </div>
        <p>{metric.description}</p>
        <div className="kpis-metric-values">
          <span>{metric.actualLabel}</span>
          <span>{metric.targetLabel}</span>
        </div>
        {metric.kind === "production" ? (
          <div className="kpis-progress-track" aria-label={`Avance ${metric.progressPct}%`}>
            <span style={{ width: `${metric.progressPct}%` }} />
          </div>
        ) : null}
        <small>{metric.helper}</small>
        <small>Fuente: {metric.sourceDescription}</small>
      </div>

      {metric.incidents.length > 0 ? (
        <div className="kpis-incidents">
          <div className="kpis-incidents-head">
            <strong>Incidencias detectadas</strong>
            <span>{metric.incidents.length}</span>
          </div>
          <div className="table-scroll">
            <table className="data-table kpis-incidents-table">
              <thead>
                <tr>
                  <th>Tabla</th>
                  <th>Cliente</th>
                  <th>Asunto</th>
                  <th>Tarea</th>
                  <th>Termino</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {metric.incidents.map((incident) => (
                  <tr key={`${incident.sourceType}-${incident.id}-${incident.reason}`}>
                    <td>{incident.tableLabel}</td>
                    <td>{incident.clientName}</td>
                    <td>{incident.subject}</td>
                    <td>
                      <div className="kpis-task-cell">
                        <strong>{incident.taskName}</strong>
                        <span>{incident.reason}</span>
                      </div>
                    </td>
                    <td>{formatDate(incident.termDate ?? incident.dueDate)}</td>
                    <td>{incident.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function KpiTeamPanel(props: { team: KpiTeamSummary | undefined; loading: boolean }) {
  if (props.loading) {
    return (
      <section className="panel">
        <div className="centered-inline-message">Cargando KPI's...</div>
      </section>
    );
  }

  if (!props.team) {
    return (
      <section className="panel">
        <div className="centered-inline-message">No hay usuarios para mostrar.</div>
      </section>
    );
  }

  return (
    <section className="panel kpis-team-panel">
      <div className="panel-header">
        <div>
          <h2>{props.team.teamLabel}</h2>
          <p className="muted">Usuarios activos del sistema agrupados por equipo de trabajo.</p>
        </div>
        <span>{props.team.users.length} usuarios</span>
      </div>

      <div className="kpis-user-list">
        {props.team.users.map((user) => (
          <article key={user.userId} className={`kpis-user-block ${user.configured ? "" : "is-unconfigured"}`}>
            <header className="kpis-user-head">
              <div>
                <h3>
                  {user.displayName}
                  {user.shortName ? <span>{user.shortName}</span> : null}
                </h3>
                <p>{user.specificRole ?? user.teamLabel}</p>
              </div>
              <span className={`kpis-user-state ${user.configured ? "is-configured" : "is-pending"}`}>
                {user.configured ? `${user.metrics.length} KPI's` : "KPI's pendientes"}
              </span>
            </header>

            {user.configured ? (
              <div className="kpis-metric-list">
                {user.metrics.map((metric) => (
                  <KpiMetricRow key={metric.id} metric={metric} />
                ))}
              </div>
            ) : (
              <div className="kpis-empty-user">
                Seccion creada para este usuario. Sus KPI's aun no estan definidos, por lo que el modulo no solicita
                captura manual ni genera reportería adicional.
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function KpisPage() {
  const currentPeriod = getCurrentPeriod();
  const [selectedYear, setSelectedYear] = useState(currentPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(currentPeriod.month);
  const [overview, setOverview] = useState<KpiOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTeamKey, setActiveTeamKey] = useState<string>("");

  async function loadOverview() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const loaded = await apiGet<KpiOverview>(`/kpis/overview?year=${selectedYear}&month=${selectedMonth}`);
      setOverview(loaded);
      setActiveTeamKey((current) => {
        if (current && loaded.teams.some((team) => team.teamKey === current)) {
          return current;
        }

        return loaded.teams[0]?.teamKey ?? "";
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, [selectedYear, selectedMonth]);

  const activeTeam = useMemo(
    () => overview?.teams.find((team) => team.teamKey === activeTeamKey),
    [activeTeamKey, overview]
  );

  const totals = useMemo(() => {
    const teams = overview?.teams ?? [];
    const users = teams.reduce((sum, team) => sum + team.users.length, 0);
    const configuredUsers = teams.reduce((sum, team) => sum + team.users.filter((user) => user.configured).length, 0);
    const metrics = teams.reduce((sum, team) => sum + team.configuredMetricsCount, 0);
    const missed = teams.reduce((sum, team) => sum + team.missedMetricsCount, 0);

    return { users, configuredUsers, metrics, missed };
  }, [overview]);

  const yearOptions = Array.from({ length: 7 }, (_, index) => currentPeriod.year - 3 + index);

  return (
    <section className="page-stack kpis-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            KPI
          </span>
          <div>
            <h2>KPI's</h2>
          </div>
        </div>
        <p className="muted">
          KPI's significa Key Performance Indicators, o indicadores clave de desempeño. Este modulo mide metas
          individuales y terminos a partir de las tablas de seguimiento del sistema, sin captura manual.
        </p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel kpis-toolbar-panel">
        <div className="kpis-toolbar">
          <label className="form-field">
            <span>Ano</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Mes</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              {MONTH_NAMES.map((monthLabel, index) => (
                <option key={monthLabel} value={index + 1}>
                  {monthLabel}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={() => void loadOverview()} disabled={loading}>
            {loading ? "Actualizando..." : "Refrescar"}
          </button>
        </div>

        {overview ? (
          <div className="kpis-summary-grid">
            <div>
              <span>Usuarios</span>
              <strong>{totals.users}</strong>
            </div>
            <div>
              <span>Usuarios con KPI's</span>
              <strong>{totals.configuredUsers}</strong>
            </div>
            <div>
              <span>Indicadores activos</span>
              <strong>{totals.metrics}</strong>
            </div>
            <div className={totals.missed > 0 ? "is-alert" : ""}>
              <span>Fuera de meta</span>
              <strong>{totals.missed}</strong>
            </div>
            <div>
              <span>Dias habiles al corte</span>
              <strong>{formatNumber(overview.businessDaysElapsed)}</strong>
            </div>
          </div>
        ) : null}

        {overview ? (
          <p className="muted kpis-source-note">
            Corte: {formatDate(overview.cutoffDate)}. {overview.sourceNote}
          </p>
        ) : null}
      </section>

      <div className="kpis-layout">
        <aside className="panel kpis-sidebar">
          <div className="panel-header">
            <h2>Equipos</h2>
            <span>{overview?.teams.length ?? 0}</span>
          </div>
          <div className="kpis-sidebar-list">
            {(overview?.teams ?? []).map((team) => (
              <button
                type="button"
                key={team.teamKey}
                className={`kpis-sidebar-button ${team.teamKey === activeTeamKey ? "is-active" : ""}`}
                onClick={() => setActiveTeamKey(team.teamKey)}
              >
                <strong>{team.teamLabel}</strong>
                <span>
                  {team.users.length} usuarios · {team.missedMetricsCount} fuera de meta
                </span>
              </button>
            ))}
          </div>
        </aside>

        <KpiTeamPanel team={activeTeam} loading={loading} />
      </div>
    </section>
  );
}
