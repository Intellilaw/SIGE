import { Navigate } from "react-router-dom";

import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge, RusconiIntelligenceMark } from "./RusconiIntelligenceBadge";

type IntelligenceConnectionStatus = "base" | "ready" | "active";

interface IntelligenceConnection {
  id: string;
  section: string;
  surface: string;
  status: IntelligenceConnectionStatus;
  promptName: string;
  promptVersion: string;
  prompt: string;
  context: string[];
  output: string[];
  cadence: string;
}

const OPENAI_FRONTIER_MODEL = {
  modelId: "gpt-5.5",
  policy: "Usar el modelo OpenAI de mayor capacidad disponible en la configuracion activa.",
  configurationKey: "OPENAI_RUSCONI_INTELLIGENCE_MODEL",
  source: "Referencia vigente consultada en docs oficiales de OpenAI el 18/05/2026."
};

const INTELLIGENCE_CONNECTIONS: IntelligenceConnection[] = [
  {
    id: "RI-000",
    section: "Nucleo Rusconi Intelligence",
    surface: "Registro maestro de prompts y contexto",
    status: "base",
    promptName: "Supervisor transversal SIGE",
    promptVersion: "v0.1",
    prompt:
      "Verifica la seccion SIGE conectada, identifica riesgos operativos, inconsistencias, omisiones y posibles mejoras. Responde con comentarios breves, accionables y trazables al ID de conexion Rusconi Intelligence.",
    context: [
      "ID de conexion RI asignado a la seccion, columna o flujo.",
      "Nombre del modulo SIGE, responsable operativo y tipo de dato evaluado.",
      "Registros visibles para el usuario y metadatos de fecha, estado y prioridad.",
      "Reglas internas del modulo y excepciones aprobadas por direccion."
    ],
    output: [
      "Comentario ejecutivo para el usuario.",
      "Nivel de atencion sugerido.",
      "Referencia del ID RI que genero el comentario."
    ],
    cadence: "Revision periodica por direccion antes de activar cada nueva seccion conectada."
  },
  {
    id: "RI-001",
    section: "Ejecucion",
    surface: "Columna Input de RI",
    status: "active",
    promptName: "Comentarios operativos de ejecucion",
    promptVersion: "v0.1",
    prompt:
      "Analiza el asunto en ejecucion y genera comentarios breves para detectar riesgos, omisiones, vencimientos, falta de contexto o pasos siguientes que deban revisarse por el equipo responsable.",
    context: [
      "Datos del asunto, cliente, cotizacion, proceso especifico e ID del asunto.",
      "Siguiente tarea, fecha de siguiente tarea, origen y canal operativo.",
      "Autoridad de dias inhabiles y datos de grupo interno cuando existan.",
      "Estado de conclusion, hito de conclusion y notas visibles del asunto."
    ],
    output: [
      "Input de RI visible en la columna de Ejecucion.",
      "Observacion accionable y breve para el equipo.",
      "Referencia visual RI-001 en el encabezado de la columna."
    ],
    cadence: "Ajuste de prompt cuando direccion refine la supervision de asuntos en ejecucion."
  },
  {
    id: "RI-002",
    section: "Ejecucion",
    surface: "Pestana emergente Crear tareas",
    status: "active",
    promptName: "Deteccion semantica de tareas duplicadas",
    promptVersion: "v0.1",
    prompt:
      "Antes de distribuir una nueva tarea, compara semanticamente su nombre, contexto del asunto y proceso especifico contra tareas vigentes del mismo proceso. Si detectas una coincidencia contextual relevante, alerta al usuario sin impedir que confirme el registro duplicado.",
    context: [
      "Nombre de la tarea seleccionada y nombres editados en los destinos de distribucion.",
      "Tareas vigentes del mismo asunto o proceso, excluyendo tareas completadas.",
      "Cliente, asunto, proceso especifico e ID del asunto visibles en la pestana emergente.",
      "Sinonimos juridicos y operativos que puedan expresar la misma obligacion con textos distintos."
    ],
    output: [
      "Alerta no bloqueante dentro de Crear tareas cuando exista posible duplicado vigente.",
      "Referencia visual RI-002 en la pestana emergente y en la alerta.",
      "Permiso explicito para registrar la tarea duplicada si el usuario confirma la excepcion."
    ],
    cadence: "Ajuste de prompt cuando direccion refine los criterios de duplicidad por equipo o tipo de proceso."
  },
  {
    id: "RI-003",
    section: "Expedientes laborales / Gastos generales",
    surface: "Salario diario en Expedientes laborales y Gastos generales / 2. Nomina",
    status: "active",
    promptName: "Validacion de salario diario contra contrato laboral",
    promptVersion: "v0.1",
    prompt:
      "Compara el salario diario capturado en el expediente laboral contra el salario vigente extraido del contrato laboral y sus addenda. Si el salario esta expresado como salario mensual bruto, toma el salario mensual mas reciente encontrado en contrato/addenda y conviertelo a salario diario dividiendolo entre 30. Cuando el mismo distintivo aparezca en Nomina, confirma adicionalmente que el salario diario de nomina coincide con el salario diario verificado de Expedientes Laborales. Si falta cualquier pieza de evidencia, marca la validacion como no coincidente.",
    context: [
      "Salario diario capturado en Informacion general del expediente laboral.",
      "Contrato laboral cargado en Word o PDF firmado cuando exista.",
      "Addenda laboral cargada en PDF cuando exista y pueda actualizar el salario contractual.",
      "Salario mensual bruto mas reciente extraido de contrato/addenda y convertido a salario diario dividiendolo entre 30.",
      "Salario diario visible en Gastos generales / 2. Nomina cuando la fila esta vinculada a un expediente laboral.",
      "Nombre del colaborador, fecha de ingreso y metadatos del documento contractual."
    ],
    output: [
      "Distintivo RI-003 visible en la tarjeta Salario diario.",
      "Distintivo RI-003 visible en el campo Salario diario de Nomina.",
      "Palomita verde cuando el salario diario coincide con el contrato laboral.",
      "Tache rojo cuando no coincide, falta contrato, falta salario legible en el contrato o la nomina no esta vinculada al expediente."
    ],
    cadence: "Ajuste de prompt cuando direccion defina tolerancias o reglas especiales por tipo de contrato laboral."
  }
];

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
