import { Navigate } from "react-router-dom";
import {
  OPENAI_FRONTIER_MODEL,
  RUSCONI_INTELLIGENCE_CONNECTIONS,
  type IntelligenceConnectionStatus
} from "@sige/contracts";

import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge, RusconiIntelligenceMark } from "./RusconiIntelligenceBadge";

const INTELLIGENCE_CONNECTIONS = RUSCONI_INTELLIGENCE_CONNECTIONS;

const STATUS_LABELS: Record<IntelligenceConnectionStatus, string> = {
  base: "Base",
  ready: "Preparada",
  active: "Activa"
};

const summaryCards = [
  { label: "Modelo frontier", value: OPENAI_FRONTIER_MODEL.modelId, tone: "model" },
  { label: "Secciones SIGE activas", value: String(INTELLIGENCE_CONNECTIONS.filter((connection) => connection.status === "active").length), tone: "active" },
  { label: "Registro base", value: "RI-000", tone: "base" },
  { label: "Prompts gobernados", value: String(INTELLIGENCE_CONNECTIONS.length), tone: "prompt" }
];

const sigeConnections = INTELLIGENCE_CONNECTIONS.filter((connection) => connection.id !== "RI-000");
const visibleConnectionBadges = sigeConnections;

export function RusconiIntelligenceContent() {
  return (
    <section className="page-stack rusconi-intelligence-page">
      <header className="hero module-hero ri-hero">
        <div className="module-hero-head ri-hero-head">
          <RusconiIntelligenceMark size="large" />
          <div>
            <h2>Rusconi Intelligence</h2>
            <div className="ri-hero-meta">
              <RusconiIntelligenceBadge connectionId="RI-000" label="Nucleo de gobierno" />
              <span className="status-pill status-live">{OPENAI_FRONTIER_MODEL.modelId}</span>
            </div>
          </div>
        </div>
        <p className="muted">
          Centro de gobierno para conexiones LLM del SIGE: IDs visuales, distintivo RI, prompts, contexto y criterio de supervision.
        </p>
      </header>

      <section className="ri-summary-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className={`ri-summary-card is-${card.tone}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel ri-panel">
        <div className="panel-header">
          <h2>Politica de modelo</h2>
          <span>{OPENAI_FRONTIER_MODEL.configurationKey}</span>
        </div>
        <div className="ri-model-policy">
          <div>
            <strong>{OPENAI_FRONTIER_MODEL.policy}</strong>
            <p>{OPENAI_FRONTIER_MODEL.source}</p>
          </div>
          <span>{OPENAI_FRONTIER_MODEL.modelId}</span>
        </div>
      </section>

      <section className="panel ri-panel">
        <div className="panel-header">
          <h2>Distintivo de conexion</h2>
          <span>RI + ID</span>
        </div>
        <div className="ri-identity-strip">
          {visibleConnectionBadges.map((connection) => (
            <RusconiIntelligenceBadge key={connection.id} connectionId={connection.id} label={`${connection.section} / ${connection.surface}`} />
          ))}
        </div>
      </section>

      <section className="panel ri-panel">
        <div className="panel-header">
          <h2>Conexiones SIGE</h2>
          <span>{sigeConnections.length} registro</span>
        </div>
        <div className="ri-connection-list">
          {sigeConnections.map((connection) => (
            <article key={connection.id} className="ri-connection-card">
              <header className="ri-connection-head">
                <div>
                  <RusconiIntelligenceBadge connectionId={connection.id} label={connection.section} />
                  <h3>{connection.section}</h3>
                  <span>{connection.surface}</span>
                </div>
                <span className={`ri-status ri-status-${connection.status}`}>{STATUS_LABELS[connection.status]}</span>
              </header>
              <div className="ri-connection-meta">
                <span>Prompt: {connection.promptName}</span>
                <span>Version: {connection.promptVersion}</span>
                <span>{connection.cadence}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel ri-panel">
        <div className="panel-header">
          <h2>Prompts y contexto</h2>
          <span>{INTELLIGENCE_CONNECTIONS.length} entrada</span>
        </div>
        <div className="ri-prompt-grid">
          {INTELLIGENCE_CONNECTIONS.map((connection) => (
            <article key={connection.id} className="ri-prompt-card">
              <div className="ri-prompt-title">
                <RusconiIntelligenceBadge connectionId={connection.id} label={connection.promptName} />
                <div>
                  <h3>{connection.promptName}</h3>
                  <span>{connection.promptVersion}</span>
                </div>
              </div>
              <div className="ri-prompt-block">
                <span>Prompt</span>
                <p>{connection.prompt}</p>
              </div>
              <div className="ri-prompt-columns">
                <div>
                  <h4>Contexto utilizado</h4>
                  <ul>
                    {connection.context.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Salida esperada</h4>
                  <ul>
                    {connection.output.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export function RusconiIntelligencePage() {
  const { user } = useAuth();
  const canAccess = canAccessGeneralSupervision(user);

  if (!canAccess) {
    return <Navigate to="/app" replace />;
  }

  return <RusconiIntelligenceContent />;
}
