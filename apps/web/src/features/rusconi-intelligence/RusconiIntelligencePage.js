import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate } from "react-router-dom";
import { OPENAI_FRONTIER_MODEL, RUSCONI_INTELLIGENCE_CONNECTIONS } from "@sige/contracts";
import { canAccessGeneralSupervision } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { RusconiIntelligenceBadge, RusconiIntelligenceMark } from "./RusconiIntelligenceBadge";
const INTELLIGENCE_CONNECTIONS = RUSCONI_INTELLIGENCE_CONNECTIONS;
const STATUS_LABELS = {
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
    return (_jsxs("section", { className: "page-stack rusconi-intelligence-page", children: [_jsxs("header", { className: "hero module-hero ri-hero", children: [_jsxs("div", { className: "module-hero-head ri-hero-head", children: [_jsx(RusconiIntelligenceMark, { size: "large" }), _jsxs("div", { children: [_jsx("h2", { children: "Rusconi Intelligence" }), _jsxs("div", { className: "ri-hero-meta", children: [_jsx(RusconiIntelligenceBadge, { connectionId: "RI-000", label: "Nucleo de gobierno" }), _jsx("span", { className: "status-pill status-live", children: OPENAI_FRONTIER_MODEL.modelId })] })] })] }), _jsx("p", { className: "muted", children: "Centro de gobierno para conexiones LLM del SIGE: IDs visuales, distintivo RI, prompts, contexto y criterio de supervision." })] }), _jsx("section", { className: "ri-summary-grid", children: summaryCards.map((card) => (_jsxs("article", { className: `ri-summary-card is-${card.tone}`, children: [_jsx("span", { children: card.label }), _jsx("strong", { children: card.value })] }, card.label))) }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Politica de modelo" }), _jsx("span", { children: OPENAI_FRONTIER_MODEL.configurationKey })] }), _jsxs("div", { className: "ri-model-policy", children: [_jsxs("div", { children: [_jsx("strong", { children: OPENAI_FRONTIER_MODEL.policy }), _jsx("p", { children: OPENAI_FRONTIER_MODEL.source })] }), _jsx("span", { children: OPENAI_FRONTIER_MODEL.modelId })] })] }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Distintivo de conexion" }), _jsx("span", { children: "RI + ID" })] }), _jsx("div", { className: "ri-identity-strip", children: visibleConnectionBadges.map((connection) => (_jsx(RusconiIntelligenceBadge, { connectionId: connection.id, label: `${connection.section} / ${connection.surface}` }, connection.id))) })] }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Conexiones SIGE" }), _jsxs("span", { children: [sigeConnections.length, " registro"] })] }), _jsx("div", { className: "ri-connection-list", children: sigeConnections.map((connection) => (_jsxs("article", { className: "ri-connection-card", children: [_jsxs("header", { className: "ri-connection-head", children: [_jsxs("div", { children: [_jsx(RusconiIntelligenceBadge, { connectionId: connection.id, label: connection.section }), _jsx("h3", { children: connection.section }), _jsx("span", { children: connection.surface })] }), _jsx("span", { className: `ri-status ri-status-${connection.status}`, children: STATUS_LABELS[connection.status] })] }), _jsxs("div", { className: "ri-connection-meta", children: [_jsxs("span", { children: ["Prompt: ", connection.promptName] }), _jsxs("span", { children: ["Version: ", connection.promptVersion] }), _jsx("span", { children: connection.cadence })] })] }, connection.id))) })] }), _jsxs("section", { className: "panel ri-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Prompts y contexto" }), _jsxs("span", { children: [INTELLIGENCE_CONNECTIONS.length, " entrada"] })] }), _jsx("div", { className: "ri-prompt-grid", children: INTELLIGENCE_CONNECTIONS.map((connection) => (_jsxs("article", { className: "ri-prompt-card", children: [_jsxs("div", { className: "ri-prompt-title", children: [_jsx(RusconiIntelligenceBadge, { connectionId: connection.id, label: connection.promptName }), _jsxs("div", { children: [_jsx("h3", { children: connection.promptName }), _jsx("span", { children: connection.promptVersion })] })] }), _jsxs("div", { className: "ri-prompt-block", children: [_jsx("span", { children: "Prompt" }), _jsx("p", { children: connection.prompt })] }), _jsxs("div", { className: "ri-prompt-columns", children: [_jsxs("div", { children: [_jsx("h4", { children: "Contexto utilizado" }), _jsx("ul", { children: connection.context.map((item) => (_jsx("li", { children: item }, item))) })] }), _jsxs("div", { children: [_jsx("h4", { children: "Salida esperada" }), _jsx("ul", { children: connection.output.map((item) => (_jsx("li", { children: item }, item))) })] })] })] }, connection.id))) })] })] }));
}
export function RusconiIntelligencePage() {
    const { user } = useAuth();
    const canAccess = canAccessGeneralSupervision(user);
    if (!canAccess) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return _jsx(RusconiIntelligenceContent, {});
}
