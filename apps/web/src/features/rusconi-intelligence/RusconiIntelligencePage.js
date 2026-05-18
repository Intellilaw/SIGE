import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate } from "react-router-dom";
import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge, RusconiIntelligenceMark } from "./RusconiIntelligenceBadge";
const OPENAI_FRONTIER_MODEL = {
    modelId: "gpt-5.5",
    policy: "Usar el modelo OpenAI de mayor capacidad disponible en la configuracion activa.",
    configurationKey: "OPENAI_RUSCONI_INTELLIGENCE_MODEL",
    source: "Referencia vigente consultada en docs oficiales de OpenAI el 18/05/2026."
};
const INTELLIGENCE_CONNECTIONS = [
    {
        id: "RI-000",
        section: "Nucleo Rusconi Intelligence",
        surface: "Registro maestro de prompts y contexto",
        status: "base",
        promptName: "Supervisor transversal SIGE",
        promptVersion: "v0.1",
        prompt: "Verifica la seccion SIGE conectada, identifica riesgos operativos, inconsistencias, omisiones y posibles mejoras. Responde con comentarios breves, accionables y trazables al ID de conexion Rusconi Intelligence.",
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
    }
];
const STATUS_LABELS = {
    base: "Base",
    ready: "Preparada",
    active: "Activa"
};
const summaryCards = [
    { label: "Modelo frontier", value: OPENAI_FRONTIER_MODEL.modelId, tone: "model" },
    { label: "Secciones SIGE activas", value: "0", tone: "active" },
    { label: "Registro base", value: "RI-000", tone: "base" },
    { label: "Prompts gobernados", value: String(INTELLIGENCE_CONNECTIONS.length), tone: "prompt" }
];
export function RusconiIntelligencePage() {
    const { user } = useAuth();
    const canAccess = canAccessGeneralSupervision(user);
    if (!canAccess) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return (_jsxs("section", { className: "page-stack rusconi-intelligence-page", children: [_jsxs("header", { className: "hero module-hero ri-hero", children: [_jsxs("div", { className: "module-hero-head ri-hero-head", children: [_jsx(RusconiIntelligenceMark, { size: "large" }), _jsxs("div", { children: [_jsx("h2", { children: "Rusconi Intelligence" }), _jsxs("div", { className: "ri-hero-meta", children: [_jsx(RusconiIntelligenceBadge, { connectionId: "RI-000", label: "Nucleo de gobierno" }), _jsx("span", { className: "status-pill status-live", children: OPENAI_FRONTIER_MODEL.modelId })] })] })] }), _jsx("p", { className: "muted", children: "Centro de gobierno para conexiones LLM del SIGE: IDs visuales, distintivo RI, prompts, contexto y criterio de supervision." })] }), _jsx("section", { className: "ri-summary-grid", children: summaryCards.map((card) => (_jsxs("article", { className: `ri-summary-card is-${card.tone}`, children: [_jsx("span", { children: card.label }), _jsx("strong", { children: card.value })] }, card.label))) }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Politica de modelo" }), _jsx("span", { children: OPENAI_FRONTIER_MODEL.configurationKey })] }), _jsxs("div", { className: "ri-model-policy", children: [_jsxs("div", { children: [_jsx("strong", { children: OPENAI_FRONTIER_MODEL.policy }), _jsx("p", { children: OPENAI_FRONTIER_MODEL.source })] }), _jsx("span", { children: OPENAI_FRONTIER_MODEL.modelId })] })] }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Distintivo de conexion" }), _jsx("span", { children: "RI + ID" })] }), _jsxs("div", { className: "ri-identity-strip", children: [_jsx(RusconiIntelligenceBadge, { connectionId: "RI-001", label: "Vista conectada de ejemplo visual" }), _jsx(RusconiIntelligenceBadge, { connectionId: "RI-014", label: "Flujo conectado de ejemplo visual" }), _jsx(RusconiIntelligenceBadge, { connectionId: "RI-027", label: "Columna conectada de ejemplo visual" })] })] }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Conexiones SIGE" }), _jsxs("span", { children: [INTELLIGENCE_CONNECTIONS.length, " registro"] })] }), _jsx("div", { className: "ri-connection-list", children: INTELLIGENCE_CONNECTIONS.map((connection) => (_jsxs("article", { className: "ri-connection-card", children: [_jsxs("header", { className: "ri-connection-head", children: [_jsxs("div", { children: [_jsx(RusconiIntelligenceBadge, { connectionId: connection.id, label: connection.section }), _jsx("h3", { children: connection.section }), _jsx("span", { children: connection.surface })] }), _jsx("span", { className: `ri-status ri-status-${connection.status}`, children: STATUS_LABELS[connection.status] })] }), _jsxs("div", { className: "ri-connection-meta", children: [_jsxs("span", { children: ["Prompt: ", connection.promptName] }), _jsxs("span", { children: ["Version: ", connection.promptVersion] }), _jsx("span", { children: connection.cadence })] })] }, connection.id))) })] }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Prompts y contexto" }), _jsxs("span", { children: [INTELLIGENCE_CONNECTIONS.length, " entrada"] })] }), _jsx("div", { className: "ri-prompt-grid", children: INTELLIGENCE_CONNECTIONS.map((connection) => (_jsxs("article", { className: "ri-prompt-card", children: [_jsxs("div", { className: "ri-prompt-title", children: [_jsx(RusconiIntelligenceBadge, { connectionId: connection.id, label: connection.promptName }), _jsxs("div", { children: [_jsx("h3", { children: connection.promptName }), _jsx("span", { children: connection.promptVersion })] })] }), _jsxs("div", { className: "ri-prompt-block", children: [_jsx("span", { children: "Prompt" }), _jsx("p", { children: connection.prompt })] }), _jsxs("div", { className: "ri-prompt-columns", children: [_jsxs("div", { children: [_jsx("h4", { children: "Contexto utilizado" }), _jsx("ul", { children: connection.context.map((item) => (_jsx("li", { children: item }, item))) })] }), _jsxs("div", { children: [_jsx("h4", { children: "Salida esperada" }), _jsx("ul", { children: connection.output.map((item) => (_jsx("li", { children: item }, item))) })] })] })] }, connection.id))) })] })] }));
}
