import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_VERSION_LABEL } from "@sige/contracts";
import { apiGet } from "../../api/http-client";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
import { SummaryCard } from "../../components/SummaryCard";
import { appModules } from "../../config/modules";
export function DashboardPage() {
    const [summary, setSummary] = useState(null);
    useEffect(() => {
        apiGet("/dashboard/summary").then(setSummary).catch(console.error);
    }, []);
    return (_jsxs("section", { className: "page-stack", children: [_jsxs("header", { className: "hero hero-logo-only", children: [_jsx("img", { className: "rusconi-logo hero-logo-only-mark", src: rusconiLogo, alt: "Rusconi Consulting" }), _jsx("span", { className: "app-version-badge hero-logo-version", children: APP_VERSION_LABEL })] }), _jsxs("div", { className: "summary-grid", children: [_jsx(SummaryCard, { label: "Clientes", value: summary?.clients ?? 0, accent: "#d4a017" }), _jsx(SummaryCard, { label: "Cotizaciones", value: summary?.quotes ?? 0, accent: "#0b7285" }), _jsx(SummaryCard, { label: "Leads", value: summary?.leads ?? 0, accent: "#3f7d20" }), _jsx(SummaryCard, { label: "Asuntos activos", value: summary?.matters ?? 0, accent: "#8f3b76" }), _jsx(SummaryCard, { label: "Tareas pendientes", value: summary?.pendingTasks ?? 0, accent: "#c44536" })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Modulos del sistema" }), _jsxs("span", { children: [appModules.length, " modulos"] })] }), _jsx("div", { className: "dashboard-module-grid", children: appModules.map((module) => (_jsxs(Link, { to: module.path, className: `dashboard-module-card ${module.available ? "is-live" : "is-migration"}`, children: [_jsxs("div", { className: "dashboard-module-topline", children: [_jsx("span", { className: "dashboard-module-icon", "aria-hidden": "true", children: module.icon }), _jsx("span", { className: `status-pill ${module.available ? "status-live" : "status-migration"}`, children: module.phase })] }), _jsx("h3", { children: module.label }), _jsx("p", { children: module.description }), _jsx("span", { className: "dashboard-module-link", children: module.available ? "Abrir modulo" : "Ver alcance" })] }, module.id))) })] })] }));
}
