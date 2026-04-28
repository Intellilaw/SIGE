import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { apiPost } from "../../api/http-client";
import { useAuth } from "./AuthContext";
const PASSWORD_REQUIREMENTS = "Usa al menos 10 caracteres, incluyendo mayuscula, minuscula, numero y simbolo.";
function formatExpiry(value) {
    return new Date(value).toLocaleString();
}
export function PasswordResetPage() {
    const { user, completePasswordReset } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
    const [verification, setVerification] = useState(null);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!token) {
            setLoading(false);
            setError("El enlace no contiene un token valido.");
            return;
        }
        setLoading(true);
        setError(null);
        apiPost("/auth/password-resets/verify", { token })
            .then((payload) => setVerification(payload))
            .catch((caughtError) => {
            setVerification(null);
            setError(caughtError instanceof Error ? caughtError.message : "No fue posible validar el enlace.");
        })
            .finally(() => setLoading(false));
    }, [token]);
    if (user) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    async function handleSubmit(event) {
        event.preventDefault();
        setError(null);
        if (password !== confirmPassword) {
            setError("La confirmacion no coincide con la nueva contrasena.");
            return;
        }
        setIsSubmitting(true);
        try {
            await completePasswordReset(token, password);
            navigate("/app", { replace: true });
        }
        catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : "No fue posible actualizar la contrasena.");
        }
        finally {
            setIsSubmitting(false);
        }
    }
    return (_jsx("main", { className: "login-page", children: _jsxs("section", { className: "login-card auth-support-card", children: [_jsx("p", { className: "eyebrow", children: "Acceso protegido" }), _jsx("h1", { children: verification?.passwordResetRequired ? "Activar cuenta" : "Definir nueva contrasena" }), _jsx("p", { className: "muted", children: "Este paso define tu nueva contrasena y abre una sesion nueva en SIGE_2." }), _jsx("p", { className: "login-back-link", children: _jsx(Link, { to: "/intranet-login", children: "Volver al acceso RC" }) }), loading ? _jsx("div", { className: "centered-inline-message", children: "Validando enlace seguro..." }) : null, !loading && error ? _jsx("div", { className: "message-banner message-error", children: error }) : null, !loading && verification ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "reset-identity-card", children: [_jsx("strong", { children: verification.displayName }), _jsx("span", { children: verification.email }), _jsxs("small", { children: ["Expira: ", formatExpiry(verification.expiresAt)] })] }), _jsxs("form", { className: "login-form", onSubmit: handleSubmit, children: [_jsxs("label", { children: ["Nueva contrasena", _jsx("input", { value: password, onChange: (event) => setPassword(event.target.value), placeholder: PASSWORD_REQUIREMENTS, type: "password" })] }), _jsxs("label", { children: ["Confirmar contrasena", _jsx("input", { value: confirmPassword, onChange: (event) => setConfirmPassword(event.target.value), type: "password" })] }), _jsx("p", { className: "muted password-hint", children: PASSWORD_REQUIREMENTS }), error ? _jsx("p", { className: "error-text", children: error }) : null, _jsx("button", { type: "submit", children: isSubmitting ? "Guardando..." : "Entrar a SIGE_2" })] })] })) : null] }) }));
}
