import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate } from "react-router-dom";
import { getModuleById } from "../../config/modules";
export function ModulePlaceholderPage({ moduleId }) {
    const module = getModuleById(moduleId);
    if (!module) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return (_jsxs("section", { className: "page-stack", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: module.icon }), _jsx("div", { children: _jsx("h2", { children: module.label }) })] }), _jsx("p", { className: "muted", children: module.description })] }), _jsxs("section", { className: "module-status-grid", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Estado actual" }), _jsx("span", { className: `status-pill ${module.available ? "status-live" : "status-migration"}`, children: module.phase })] }), _jsx("p", { className: "muted", children: "Este modulo ya forma parte del mapa de SIGE_2 y cuenta con definicion funcional para seguir creciendo sobre una arquitectura mas segura, desacoplada y escalable." })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Cobertura" }), _jsxs("span", { children: [module.coverage.length, " frentes"] })] }), _jsx("div", { className: "capability-list", children: module.coverage.map((item) => (_jsx("span", { className: "capability-pill", children: item }, item))) })] })] })] }));
}
