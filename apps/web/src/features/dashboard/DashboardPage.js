import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
import { appModules } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { canReadModule } from "../auth/permissions";
export function DashboardPage() {
    const { user } = useAuth();
    const visibleModules = appModules.filter((module) => canReadModule(user, module.id));
    return (_jsxs("section", { className: "page-stack dashboard-page", children: [_jsx("header", { className: "hero hero-logo-only", children: _jsx("img", { className: "rusconi-logo hero-logo-only-mark", src: rusconiLogo, alt: "Rusconi Consulting" }) }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Modulos del sistema" }), _jsxs("span", { children: [visibleModules.length, " modulos"] })] }), _jsx("div", { className: "dashboard-module-grid", children: visibleModules.map((module) => (_jsxs(Link, { to: module.path, className: `dashboard-module-card ${module.available ? "is-live" : "is-migration"}`, children: [_jsxs("div", { className: "dashboard-module-topline", children: [_jsx("span", { className: "dashboard-module-icon", "aria-hidden": "true", children: module.icon }), _jsx("span", { className: `status-pill ${module.available ? "status-live" : "status-migration"}`, children: module.phase })] }), _jsx("h3", { children: module.label }), _jsx("span", { className: "dashboard-module-link", children: module.available ? "Abrir modulo" : "Ver alcance" })] }, module.id))) })] })] }));
}
