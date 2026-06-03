import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import intellilawLogo from "../../assets/intellilaw-logo.svg";
import legalFlowLogo from "../../assets/legalflow-logo.svg";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
import { getVisibleAppModules } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { useModuleAvailability } from "../modules/ModuleAvailabilityContext";
import { openBriefManagerWindow, reportBriefManagerOpenError } from "../modules/openBriefManagerWindow";
function getOrganizationLogo(slug) {
    if (slug === "intellilaw") {
        return intellilawLogo;
    }
    if (slug === "legalflow") {
        return legalFlowLogo;
    }
    return rusconiLogo;
}
export function DashboardPage() {
    const { user } = useAuth();
    const { disabledModuleIds } = useModuleAvailability();
    const visibleModules = getVisibleAppModules(user, disabledModuleIds);
    const organizationLogo = getOrganizationLogo(user?.organizationSlug);
    const organizationLogoClassName = `${user?.organizationSlug === "rusconi-consulting" ? "rusconi-logo " : ""}hero-logo-only-mark`;
    const handleOpenBriefManager = () => {
        void openBriefManagerWindow().catch(reportBriefManagerOpenError);
    };
    return (_jsxs("section", { className: "page-stack dashboard-page", children: [_jsx("header", { className: "hero hero-logo-only", children: _jsx("img", { className: organizationLogoClassName, src: organizationLogo, alt: user?.organizationName ?? "SIGE" }) }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Modulos del sistema" }), _jsxs("span", { children: [visibleModules.length, " modulos"] })] }), _jsx("div", { className: "dashboard-module-grid", children: visibleModules.map((module) => {
                            const moduleContent = (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dashboard-module-topline", children: [_jsx("span", { className: "dashboard-module-icon", "aria-hidden": "true", children: module.icon }), _jsx("span", { className: `status-pill ${module.available ? "status-live" : "status-migration"}`, children: module.phase })] }), _jsx("h3", { children: module.label }), _jsx("span", { className: "dashboard-module-link", children: module.available ? "Abrir modulo" : "Ver alcance" })] }));
                            if (module.id === "brief-manager") {
                                return (_jsx("button", { type: "button", className: `dashboard-module-card dashboard-module-card-button ${module.available ? "is-live" : "is-migration"}`, onClick: handleOpenBriefManager, children: moduleContent }, module.id));
                            }
                            return (_jsx(Link, { to: module.path, className: `dashboard-module-card ${module.available ? "is-live" : "is-migration"}`, children: moduleContent }, module.id));
                        }) })] })] }));
}
