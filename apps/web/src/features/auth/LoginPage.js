import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
function PasswordVisibilityIcon({ visible }) {
    return visible ? (_jsx("svg", { "aria-hidden": "true", fill: "none", viewBox: "0 0 24 24", children: _jsx("path", { d: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4 4.8M6 6.2C3.8 7.7 2.5 10 2 12c0 0 3.5 7 10 7 1.7 0 3.2-.5 4.5-1.2", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8" }) })) : (_jsxs("svg", { "aria-hidden": "true", fill: "none", viewBox: "0 0 24 24", children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8" }), _jsx("circle", { cx: "12", cy: "12", r: "3", stroke: "currentColor", strokeWidth: "1.8" })] }));
}
export function LoginPage() {
    const { user, login } = useAuth();
    const [identifier, setIdentifier] = useState("Eduardo Rusconi");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(null);
    if (user) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    async function handleSubmit(event) {
        event.preventDefault();
        setError(null);
        try {
            await login(identifier.trim(), password);
        }
        catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
        }
    }
    return (_jsx("main", { className: "login-page", children: _jsxs("section", { className: "login-card", children: [_jsx("div", { className: "login-brand", children: _jsx("img", { className: "rusconi-logo login-brand-logo", src: rusconiLogo, alt: "Rusconi Consulting" }) }), _jsx("p", { className: "eyebrow", children: "Rusconi Consulting" }), _jsx("h1", { children: "Intranet RC" }), _jsx("p", { className: "muted", children: "Accede al entorno operativo de SIGE_2 para continuar con clientes, cotizaciones, leads, asuntos y tareas." }), _jsx("p", { className: "login-back-link", children: _jsx(Link, { to: "/", children: "Volver a la pantalla de entrada" }) }), _jsx("p", { className: "login-support-link", children: _jsx(Link, { to: "/intranet-password-help", children: "Activar cuenta o restablecer contrasena" }) }), _jsxs("form", { className: "login-form", onSubmit: handleSubmit, children: [_jsxs("label", { children: ["Usuario o email", _jsx("input", { autoComplete: "username", value: identifier, onChange: (event) => setIdentifier(event.target.value), type: "text" })] }), _jsxs("label", { children: ["Password", _jsxs("span", { className: "password-input-wrap", children: [_jsx("input", { value: password, autoComplete: "current-password", onChange: (event) => setPassword(event.target.value), placeholder: "Escribe tu contrasena", type: showPassword ? "text" : "password" }), _jsx("button", { "aria-label": showPassword ? "Ocultar contrasena" : "Mostrar contrasena", "aria-pressed": showPassword, className: "password-visibility-toggle", onClick: () => setShowPassword((current) => !current), type: "button", children: _jsx(PasswordVisibilityIcon, { visible: showPassword }) })] })] }), error ? _jsx("p", { className: "error-text", children: error }) : null, _jsx("button", { type: "submit", children: "Entrar a Rusconi Consulting" })] })] }) }));
}
