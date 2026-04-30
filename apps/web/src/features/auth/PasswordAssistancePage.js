import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
function formatExpiry(value) {
    return value ? new Date(value).toLocaleString() : null;
}
export function PasswordAssistancePage() {
    const { user, requestPasswordReset } = useAuth();
    const [identifier, setIdentifier] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    if (user) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    async function handleSubmit(event) {
        event.preventDefault();
        setError(null);
        setResult(null);
        setIsSubmitting(true);
        try {
            const response = await requestPasswordReset(identifier);
            setResult(response);
        }
        catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : "No fue posible procesar la solicitud.");
        }
        finally {
            setIsSubmitting(false);
        }
    }
    return (_jsx("main", { className: "login-page", children: _jsxs("section", { className: "login-card auth-support-card", children: [_jsx("p", { className: "eyebrow", children: "Onboarding seguro" }), _jsx("h1", { children: "Activar o restablecer contrasena" }), _jsx("p", { className: "muted", children: "Si perdiste acceso o necesitas activar tu cuenta, escribe tu usuario o correo. SIGE generara el flujo seguro definido para el ambiente actual para que recuperes tu acceso." }), _jsx("p", { className: "login-back-link", children: _jsx(Link, { to: "/intranet-login", children: "Volver al acceso RC" }) }), _jsxs("form", { className: "login-form", onSubmit: handleSubmit, children: [_jsxs("label", { children: ["Usuario o email", _jsx("input", { value: identifier, onChange: (event) => setIdentifier(event.target.value), placeholder: "ej. alejandra.mejia o alejandra.mejia@calculadora.app", type: "text" })] }), error ? _jsx("p", { className: "error-text", children: error }) : null, _jsx("button", { type: "submit", children: isSubmitting ? "Generando..." : "Solicitar enlace seguro" })] }), result ? (_jsxs("div", { className: "auth-support-result", children: [_jsx("div", { className: "message-banner message-success", children: result.message }), result.deliveryMode === "development-preview" && result.resetUrl ? (_jsxs("div", { className: "link-preview-card", children: [_jsx("p", { className: "eyebrow", children: "Vista previa local" }), _jsx("h2", { children: "Enlace listo para usar" }), _jsx("p", { className: "muted", children: "Este enlace solo aparece cuando el backend fue configurado explicitamente para exponer previews de desarrollo. En AWS debe permanecer desactivado." }), _jsx("a", { className: "preview-link", href: result.resetUrl, children: "Abrir flujo de activacion" }), _jsx("code", { children: result.resetUrl }), formatExpiry(result.expiresAt) ? (_jsxs("p", { className: "muted", children: ["Expira: ", formatExpiry(result.expiresAt)] })) : null] })) : null] })) : null] }) }));
}
