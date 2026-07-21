import { useEffect, useMemo, useState } from "react";
import type { KpiMetric, KpiOverview, KpiTeamSummary } from "@sige/contracts";

import { apiGet } from "../../api/http-client";

type KpiUserSummary = KpiTeamSummary["users"][number];

function getCurrentPeriod() {
  const date = new Date();
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

function KpiDefinitionList(props: { metrics: KpiMetric[] }) {
  return (
    <section className="kpis-user-section">
      <div className="kpis-user-section-head">
        <h4>KPI's medidos</h4>
        <span>{props.metrics.length}</span>
      </div>
      <div className="kpis-definition-list">
        {props.metrics.map((metric) => (
          <article className="kpis-definition-item" key={metric.id}>
            <strong>{metric.label}</strong>
            <div className="kpis-definition-field">
              <span>Meta</span>
              <p>{metric.description}</p>
            </div>
            <div className="kpis-definition-field">
              <span>Fuente automática</span>
              <p>{metric.sourceDescription}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function KpiUserCard(props: {
  isExpanded: boolean;
  onToggle: () => void;
  user: KpiUserSummary;
}) {
  const { user } = props;
  const detailId = `kpis-user-definitions-${user.userId}`;

  return (
    <article
      className={`kpis-user-block ${user.configured ? "" : "is-unconfigured"} ${
        props.isExpanded ? "is-expanded" : "is-collapsed"
      }`}
    >
      <header className="kpis-user-head">
        <button
          type="button"
          className="kpis-user-toggle"
          aria-expanded={props.isExpanded}
          aria-controls={detailId}
          onClick={props.onToggle}
        >
          <span className="kpis-user-main">
            <h3>
              {user.displayName}
              {user.shortName ? <span>{user.shortName}</span> : null}
            </h3>
            <p>{user.specificRole ?? user.teamLabel}</p>
          </span>
          <span className="kpis-user-summary">
            <span className={`kpis-user-state ${user.configured ? "is-configured" : "is-pending"}`}>
              {user.configured ? `${user.metrics.length} KPI's` : "Sin KPI's definidos"}
            </span>
            <span className="kpis-user-chevron" aria-hidden="true" />
          </span>
        </button>
      </header>

      {props.isExpanded ? (
        <div className="kpis-user-detail" id={detailId}>
          {user.configured ? (
            <KpiDefinitionList metrics={user.metrics} />
          ) : (
            <div className="kpis-empty-user">
              Esta persona aún no tiene KPI's definidos. El módulo no solicita captura manual.
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function KpiTeamPanel(props: { team: KpiTeamSummary | undefined; loading: boolean }) {
  const teamUserIds = useMemo(() => props.team?.users.map((user) => user.userId) ?? [], [props.team]);
  const teamUserIdsSignature = teamUserIds.join("|");
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedUserIds([]);
  }, [props.team?.teamKey, teamUserIdsSignature]);

  const expandedUserIdSet = useMemo(() => new Set(expandedUserIds), [expandedUserIds]);
  const allUsersExpanded = teamUserIds.length > 0 && teamUserIds.every((userId) => expandedUserIdSet.has(userId));
  const noUsersExpanded = !teamUserIds.some((userId) => expandedUserIdSet.has(userId));

  function toggleUser(userId: string) {
    setExpandedUserIds((current) =>
      current.includes(userId) ? current.filter((currentUserId) => currentUserId !== userId) : [...current, userId]
    );
  }

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
          <h2>KPI's medidos - {props.team.teamLabel}</h2>
          <p className="muted">Indicadores definidos para cada integrante del equipo.</p>
        </div>
        <div className="kpis-team-panel-actions">
          <span>{props.team.users.length} usuarios</span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setExpandedUserIds(teamUserIds)}
              disabled={allUsersExpanded || teamUserIds.length === 0}
            >
              Expandir todo
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setExpandedUserIds([])}
              disabled={noUsersExpanded || teamUserIds.length === 0}
            >
              Colapsar todo
            </button>
          </div>
        </div>
      </div>

      <div className="kpis-user-list">
        {props.team.users.length === 0 ? (
          <div className="kpis-empty-user">No hay usuarios activos asignados a este equipo.</div>
        ) : null}
        {props.team.users.map((user) => (
          <KpiUserCard
            key={user.userId}
            user={user}
            isExpanded={expandedUserIdSet.has(user.userId)}
            onToggle={() => toggleUser(user.userId)}
          />
        ))}
      </div>
    </section>
  );
}

export function KpisPage() {
  const currentPeriod = getCurrentPeriod();
  const [overview, setOverview] = useState<KpiOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTeamKey, setActiveTeamKey] = useState<string>("");

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const loaded = await apiGet<KpiOverview>(
          `/kpis/overview?year=${currentPeriod.year}&month=${currentPeriod.month}`
        );
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
      } catch (error) {
        if (active) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
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

  const activeTeam = useMemo(
    () => overview?.teams.find((team) => team.teamKey === activeTeamKey),
    [activeTeamKey, overview]
  );

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
          KPI significa Key Performance Indicator, o indicador clave de desempeño. Este módulo muestra los indicadores
          medidos automáticamente para cada persona; su evaluación se consulta en Supervisión General.
        </p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

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
                <span>{team.users.length} usuarios</span>
              </button>
            ))}
          </div>
        </aside>

        <KpiTeamPanel team={activeTeam} loading={loading} />
      </div>
    </section>
  );
}
