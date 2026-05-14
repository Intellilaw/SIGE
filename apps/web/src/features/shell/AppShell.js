import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { APP_VERSION_LABEL } from "@sige/contracts";
import { getNavigationForUser } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
export function AppShell() {
    const { user, logout } = useAuth();
    const userContext = user?.legacyTeam ?? user?.specificRole ?? user?.team ?? user?.email;
    const navigation = getNavigationForUser(user);
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("div", { className: "nav-section", children: _jsx("nav", { className: "nav-list", children: navigation.map((item) => (_jsxs(NavLink, { to: item.path, end: item.path === "/app", className: "nav-link", children: [_jsx("span", { className: "nav-link-icon", "aria-hidden": "true", children: item.icon }), _jsx("span", { className: "nav-link-label", children: item.label }), item.path === "/app" ? (_jsx("span", { className: "app-version-badge app-version-badge-sidebar", children: APP_VERSION_LABEL })) : null] }, item.path))) }) }), _jsxs("div", { className: "user-card", children: [_jsx("strong", { children: user?.displayName }), _jsx("span", { children: userContext }), _jsxs("small", { children: ["@", user?.username] }), _jsx("button", { type: "button", onClick: logout, children: "Cerrar sesion" })] })] }), _jsx("main", { className: "content", children: _jsx(Outlet, {}) })] }));
}
