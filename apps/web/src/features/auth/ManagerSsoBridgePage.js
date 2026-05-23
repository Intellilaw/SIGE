import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { apiGet } from "../../api/http-client";
export function ManagerSsoBridgePage() {
    const [error, setError] = useState(null);
    useEffect(() => {
        let isMounted = true;
        apiGet("/auth/sso/manager-de-escritos")
            .then((payload) => {
            if (isMounted) {
                window.location.replace(payload.redirectUrl);
            }
        })
            .catch((caughtError) => {
            if (isMounted) {
                setError(caughtError instanceof Error ? caughtError.message : "No se pudo abrir el Manager de Escritos.");
            }
        });
        return () => {
            isMounted = false;
        };
    }, []);
    return (_jsx("main", { className: "login-page", children: _jsxs("section", { className: "login-card auth-support-card", children: [_jsx("p", { className: "eyebrow", children: "SIGE" }), _jsx("h1", { children: "Abriendo Manager de Escritos" }), _jsx("p", { className: "muted", children: "Preparando acceso seguro." }), error ? _jsx("div", { className: "message-banner message-error", children: error }) : null] }) }));
}
