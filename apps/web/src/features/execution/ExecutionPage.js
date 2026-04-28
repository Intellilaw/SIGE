import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getVisibleExecutionModules } from "./execution-config";
export function ExecutionPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const visibleModules = getVisibleExecutionModules(user);
    if (visibleModules.length === 1 && user?.team !== "CLIENT_RELATIONS" && user?.team !== "ADMIN" && user?.role !== "SUPERADMIN") {
        return _jsx(Navigate, { to: `/app/execution/${visibleModules[0].slug}`, replace: true });
    }
    if (visibleModules.length === 0) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u2699\uFE0F" }), _jsx("div", { children: _jsx("h2", { children: "Ejecucion" }) })] }), _jsx("p", { className: "muted", children: "Tu equipo actual no tiene acceso a este modulo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u2699\uFE0F" }), _jsx("div", { children: _jsx("h2", { children: "Ejecucion" }) })] }), _jsx("p", { className: "muted", children: "Operacion por equipo con tablero separado y visibilidad de siguientes tareas, con resaltado en rojo cuando falta informacion o hay vencimientos." })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Equipos" }), _jsxs("span", { children: [visibleModules.length, " modulos"] })] }), _jsx("div", { className: "execution-module-grid", children: visibleModules.map((module) => (_jsxs("button", { type: "button", className: "execution-module-card", onClick: () => navigate(`/app/execution/${module.slug}`), children: [_jsx("span", { className: "execution-module-icon", style: { color: module.color }, children: module.icon }), _jsx("strong", { children: module.label }), _jsx("p", { children: module.description })] }, module.moduleId))) })] })] }));
}
