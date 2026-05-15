import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const SSO_REDIRECT_PATH = "/api/v1/sso/brief-manager";
export function BriefManagerLauncher() {
    const [hasError, setHasError] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setHasError(true);
        }, 8000);
        try {
            window.location.assign(SSO_REDIRECT_PATH);
        }
        catch {
            setHasError(true);
        }
        return () => {
            window.clearTimeout(timer);
        };
    }, []);
    return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u270D\uFE0F" }), _jsx("div", { children: _jsx("h2", { children: "Manager de escritos" }) })] }), _jsx("p", { className: "muted", children: hasError
                        ? "No fue posible iniciar la sesion en Manager de Escritos. Vuelve a intentarlo o contacta soporte."
                        : "Conectando con Manager de Escritos..." })] }) }));
}
