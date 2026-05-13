import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { APP_VERSION_LABEL, APP_VERSION_TEXT } from "@sige/contracts";
import { appModules } from "../../config/modules";
import { navigation } from "../../config/navigation";
import { useAuth } from "../auth/AuthContext";
import { canReadAppHome, canReadModule } from "../auth/permissions";
export function AppShell() {
    const { user, logout } = useAuth();
    const userContext = user?.legacyTeam ?? user?.specificRole ?? user?.team ?? user?.email;
    const visibleNavigation = navigation.filter((item) => {
        if (item.path === "/app") {
            return canReadAppHome(user);
        }
        const module = appModules.find((candidate) => candidate.path === item.path);
        return module ? canReadModule(user, module.id) : false;
    });
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("div", { className: "nav-section", children: _jsx("nav", { className: "nav-list", children: visibleNavigation.map((item) => (_jsxs(NavLink, { to: item.path, end: item.path === "/app", className: "nav-link", children: [_jsx("span", { className: "nav-link-icon", "aria-hidden": "true", children: item.icon }), _jsx("span", { children: item.label }), item.path === "/app" ? (_jsx("span", { className: "app-version-badge app-version-badge-sidebar", "aria-label": APP_VERSION_TEXT, title: APP_VERSION_TEXT, children: APP_VERSION_LABEL })) : null] }, item.path))) }) }), _jsxs("div", { className: "user-card", children: [_jsx("strong", { children: user?.displayName }), _jsx("span", { children: userContext }), _jsxs("small", { children: ["@", user?.username] }), _jsx("button", { type: "button", onClick: logout, children: "Cerrar sesion" })] })] }), _jsx("main", { className: "content", children: _jsx(Outlet, {}) })] }));
}
