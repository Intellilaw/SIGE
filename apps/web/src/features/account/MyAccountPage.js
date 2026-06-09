import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { getModuleById } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
const EMPTY_PASSWORD_FORM = {
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
};
const PASSWORD_REQUIREMENTS = "Usa al menos 10 caracteres, incluyendo mayuscula, minuscula, numero y simbolo.";
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
function getRoleLabel(role, legacyRole) {
    if (role === "SUPERADMIN" || legacyRole === "SUPERADMIN") {
        return "Superadmin";
    }
    if (role === "DIRECTOR") {
        return "Direccion";
    }
    if (role === "TEAM_LEAD") {
        return "Lider de equipo";
    }
    if (role === "AUDITOR") {
        return "Auditoria";
    }
    return "Operacion";
}
function hasStrongPasswordShape(password) {
    const value = password.trim();
    return value.length >= 10
        && /[A-Z]/.test(value)
        && /[a-z]/.test(value)
        && /\d/.test(value)
        && /[^A-Za-z0-9]/.test(value);
}
export function MyAccountPage() {
    const { user, changePassword } = useAuth();
    const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
    const [flash, setFlash] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const module = getModuleById("my-account");
    const accountRows = useMemo(() => {
        if (!user) {
            return [];
        }
        return [
            { label: "Nombre", value: user.displayName || user.username },
            { label: "Usuario", value: user.username },
            { label: "Correo", value: user.email },
            { label: "Nombre corto", value: user.shortName ?? "-" },
            { label: "Organizacion", value: user.organizationName },
            { label: "Equipo principal", value: user.legacyTeam ?? "-" },
            { label: "Rol principal", value: user.specificRole ?? getRoleLabel(user.role, user.legacyRole) },
            { label: "Segundo equipo", value: user.secondaryLegacyTeam ?? "-" },
            { label: "Segundo rol", value: user.secondarySpecificRole ?? "-" }
        ];
    }, [user]);
    if (!user) {
        return null;
    }
    function updatePasswordField(field, value) {
        setPasswordForm((current) => ({ ...current, [field]: value }));
    }
    async function handlePasswordSubmit(event) {
        event.preventDefault();
        setFlash(null);
        const currentPassword = passwordForm.currentPassword;
        const newPassword = passwordForm.newPassword;
        const confirmPassword = passwordForm.confirmPassword;
        if (!currentPassword) {
            setFlash({ tone: "error", text: "Ingresa tu contrasena actual." });
            return;
        }
        if (!hasStrongPasswordShape(newPassword)) {
            setFlash({ tone: "error", text: PASSWORD_REQUIREMENTS });
            return;
        }
        if (newPassword !== confirmPassword) {
            setFlash({ tone: "error", text: "La confirmacion no coincide con la nueva contrasena." });
            return;
        }
        if (currentPassword === newPassword) {
            setFlash({ tone: "error", text: "La nueva contrasena debe ser distinta a la actual." });
            return;
        }
        setIsSaving(true);
        try {
            await changePassword(currentPassword, newPassword);
            setPasswordForm(EMPTY_PASSWORD_FORM);
            setFlash({ tone: "success", text: "Tu contrasena se actualizo correctamente." });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setIsSaving(false);
        }
    }
    return (_jsxs("section", { className: "page-stack my-account-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: module?.icon ?? "\u{1F510}" }), _jsx("div", { children: _jsx("h2", { children: "Mi cuenta" }) })] }), _jsx("p", { className: "muted", children: module?.description })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, _jsxs("section", { className: "my-account-grid", children: [_jsxs("article", { className: "panel my-account-profile-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Datos de cuenta" }), _jsx("span", { className: `status-pill ${user.isActive ? "status-live" : "status-warning"}`, children: user.isActive ? "Activa" : "Inactiva" })] }), _jsxs("div", { className: "my-account-identity", children: [_jsx("strong", { children: user.displayName || user.username }), _jsx("span", { children: user.email })] }), _jsx("dl", { className: "my-account-detail-list", children: accountRows.map((row) => (_jsxs("div", { children: [_jsx("dt", { children: row.label }), _jsx("dd", { children: row.value })] }, row.label))) })] }), _jsxs("article", { className: "panel my-account-security-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Contrasena" }), _jsx("span", { children: "Sesion actual" })] }), _jsxs("form", { className: "my-account-password-form", onSubmit: handlePasswordSubmit, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Contrasena actual" }), _jsx("input", { autoComplete: "current-password", value: passwordForm.currentPassword, onChange: (event) => updatePasswordField("currentPassword", event.target.value), type: "password", required: true })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nueva contrasena" }), _jsx("input", { autoComplete: "new-password", value: passwordForm.newPassword, onChange: (event) => updatePasswordField("newPassword", event.target.value), placeholder: "Minimo 10 caracteres con simbolo", type: "password", required: true })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Confirmar nueva contrasena" }), _jsx("input", { autoComplete: "new-password", value: passwordForm.confirmPassword, onChange: (event) => updatePasswordField("confirmPassword", event.target.value), type: "password", required: true })] }), _jsx("p", { className: "muted password-hint", children: PASSWORD_REQUIREMENTS }), _jsx("div", { className: "form-actions", children: _jsx("button", { className: "primary-button", disabled: isSaving, type: "submit", children: isSaving ? "Guardando..." : "Cambiar contrasena" }) })] })] })] })] }));
}
