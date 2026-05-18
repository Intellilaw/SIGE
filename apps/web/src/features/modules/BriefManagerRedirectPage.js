import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../api/http-client";
export function BriefManagerRedirectPage() {
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        apiGet("/auth/sso/manager-de-escritos")
            .then((response) => {
            if (!cancelled) {
                window.location.replace(response.redirectUrl);
            }
        })
            .catch((reason) => {
            if (cancelled) {
                return;
            }
            setError(reason instanceof Error ? reason.message : "No se pudo abrir Manager de escritos.");
        });
        return () => {
            cancelled = true;
        };
    }, []);
    if (error) {
        return (_jsxs("section", { className: "page-stack", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u270D" }), _jsx("div", { children: _jsx("h2", { children: "Manager de escritos" }) })] }), _jsx("p", { className: "muted", children: error })] }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "tasks-legacy-toolbar", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => window.location.reload(), children: "Reintentar" }), _jsx(Link, { className: "secondary-button", to: "/app", children: "Volver al menu" })] }) })] }));
    }
    return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u270D" }), _jsx("div", { children: _jsx("h2", { children: "Manager de escritos" }) })] }), _jsx("p", { className: "muted", children: "Redirigiendo a Manager de escritos..." })] }) }));
}
