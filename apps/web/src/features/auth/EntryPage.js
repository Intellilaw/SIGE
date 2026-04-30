import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { APP_VERSION_TEXT } from "@sige/contracts";
import { useAuth } from "./AuthContext";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
export function EntryPage() {
    const { user } = useAuth();
    const activePath = user ? "/app" : "/intranet-login";
    return (_jsx("main", { className: "entry-page", children: _jsx("div", { className: "entry-shell", children: _jsxs("section", { className: "entry-card", children: [_jsx("div", { className: "entry-accent", "aria-hidden": "true" }), _jsxs("div", { className: "entry-brand", children: [_jsx("div", { className: "entry-brand-mark", children: "IL" }), _jsx("p", { className: "entry-brand-name", children: "INTELLILAW" })] }), _jsx("h1", { className: "entry-title", children: "SIGE" }), _jsx("p", { className: "entry-version", children: APP_VERSION_TEXT }), _jsx("p", { className: "entry-subtitle", children: "Sistema Integral de Administracion Empresarial" }), _jsxs("div", { className: "entry-actions", children: [_jsxs("div", { className: "entry-option", children: [_jsx("div", { className: "entry-option-mark entry-option-mark-muted", children: "IL" }), _jsx("button", { type: "button", className: "entry-button entry-button-disabled", disabled: true, "aria-disabled": "true", title: "El acceso de Intellilaw estara disponible proximamente.", children: "Acceso Intellilaw" })] }), _jsxs("div", { className: "entry-option", children: [_jsx("div", { className: "entry-option-logo-shell", children: _jsx("img", { className: "rusconi-logo entry-option-logo", src: rusconiLogo, alt: "Rusconi Consulting" }) }), _jsx(Link, { to: activePath, className: "entry-button entry-button-primary", children: "Acceso Rusconi Consulting" })] })] })] }) }) }));
}
