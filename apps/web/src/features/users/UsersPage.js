import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { SPECIFIC_ROLE_OPTIONS, TEAM_OPTIONS } from "@sige/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";
const EMPTY_FORM = {
    username: "",
    password: "",
    shortName: "",
    legacyTeam: "",
    specificRole: "",
    isActive: true
};
function PasswordVisibilityIcon({ visible }) {
    return visible ? (_jsx("svg", { "aria-hidden": "true", fill: "none", viewBox: "0 0 24 24", children: _jsx("path", { d: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4 4.8M6 6.2C3.8 7.7 2.5 10 2 12c0 0 3.5 7 10 7 1.7 0 3.2-.5 4.5-1.2", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8" }) })) : (_jsxs("svg", { "aria-hidden": "true", fill: "none", viewBox: "0 0 24 24", children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8" }), _jsx("circle", { cx: "12", cy: "12", r: "3", stroke: "currentColor", strokeWidth: "1.8" })] }));
}
function formatDateTime(value) {
    return value ? new Date(value).toLocaleString() : "Nunca";
}
function getLegacyRoleLabel(role) {
    switch (role) {
        case "SUPERADMIN":
            return "superadmin";
        case "INTRANET":
            return "operativo";
        default:
            return "public";
    }
}
function getSystemRoleLabel(role) {
    switch (role) {
        case "SUPERADMIN":
            return "Superadmin";
        case "DIRECTOR":
            return "Direccion";
        case "TEAM_LEAD":
            return "Lider";
        case "AUDITOR":
            return "Auditor";
        default:
            return "Analista";
    }
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
export function UsersPage() {
    const { user } = useAuth();
    const [rows, setRows] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingUserId, setDeletingUserId] = useState(null);
    const [fetchError, setFetchError] = useState(null);
    const [flash, setFlash] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingUserId, setEditingUserId] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const canManageUsers = Boolean(user?.permissions.includes("*") || user?.permissions.includes("users:manage"));
    async function fetchUsers() {
        setLoadingUsers(true);
        setFetchError(null);
        try {
            const data = await apiGet("/users");
            setRows(data);
        }
        catch (error) {
            setFetchError(getErrorMessage(error));
        }
        finally {
            setLoadingUsers(false);
        }
    }
    useEffect(() => {
        if (!canManageUsers) {
            setLoadingUsers(false);
            return;
        }
        void fetchUsers();
    }, [canManageUsers]);
    const metrics = useMemo(() => ({
        total: rows.length,
        active: rows.filter((entry) => entry.isActive).length,
        privileged: rows.filter((entry) => entry.permissions.includes("*")).length,
        pendingReset: rows.filter((entry) => entry.passwordResetRequired).length
    }), [rows]);
    function resetForm() {
        setIsEditing(false);
        setEditingUserId(null);
        setShowPassword(false);
        setForm(EMPTY_FORM);
    }
    function handleEditClick(target) {
        setFlash(null);
        setIsEditing(true);
        setEditingUserId(target.id);
        setShowPassword(false);
        setForm({
            username: target.username,
            password: "",
            shortName: target.shortName ?? "",
            legacyTeam: target.legacyTeam ?? "",
            specificRole: target.specificRole ?? "",
            isActive: target.isActive
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    async function handleSave(event) {
        event.preventDefault();
        setFlash(null);
        const trimmedPassword = form.password.trim();
        if (!isEditing && trimmedPassword.length < 10) {
            setFlash({ tone: "error", text: "La contrasena debe tener al menos 10 caracteres y cumplir la politica segura." });
            return;
        }
        if (isEditing && trimmedPassword.length > 0 && trimmedPassword.length < 10) {
            setFlash({ tone: "error", text: "La contrasena debe tener al menos 10 caracteres y cumplir la politica segura." });
            return;
        }
        setIsSaving(true);
        try {
            if (isEditing && editingUserId) {
                await apiPatch(`/users/${editingUserId}`, {
                    password: trimmedPassword || undefined,
                    shortName: form.shortName.trim() || null,
                    legacyTeam: form.legacyTeam || null,
                    specificRole: form.specificRole || null,
                    isActive: form.isActive
                });
                setFlash({ tone: "success", text: "Usuario actualizado correctamente." });
            }
            else {
                await apiPost("/users", {
                    username: form.username,
                    password: trimmedPassword,
                    shortName: form.shortName.trim() || undefined,
                    legacyTeam: form.legacyTeam || undefined,
                    specificRole: form.specificRole || undefined
                });
                setFlash({ tone: "success", text: `Usuario "${form.username}" creado y autorizado correctamente.` });
            }
            resetForm();
            await fetchUsers();
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setIsSaving(false);
        }
    }
    async function handleDeleteTarget(target) {
        setFlash(null);
        if (target.id === user?.id) {
            setFlash({ tone: "error", text: "No puedes eliminar la sesion administrativa activa." });
            return;
        }
        if (!window.confirm(`Seguro que deseas eliminar al usuario ${target.username}?`)) {
            return;
        }
        setDeletingUserId(target.id);
        try {
            await apiDelete(`/users/${target.id}`);
            setFlash({ tone: "success", text: `Usuario ${target.username} eliminado correctamente.` });
            if (editingUserId === target.id) {
                resetForm();
            }
            await fetchUsers();
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setDeletingUserId(null);
        }
    }
    if (!canManageUsers) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\uD83D\uDC64" }), _jsx("div", { children: _jsx("h2", { children: "Usuarios" }) })] }), _jsx("p", { className: "muted", children: "Solo las cuentas con permisos de administracion pueden gestionar usuarios, equipos, nombre corto, rol especifico y onboarding." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\uD83D\uDC64" }), _jsx("div", { children: _jsx("h2", { children: "Usuarios" }) })] }), _jsx("p", { className: "muted", children: "Administracion central de usuarios con activacion segura, reinicio de contrasena y control operativo sobre `username`, `short_name`, `team`, `specific_role` y el tipo de acceso del sistema." })] }), _jsxs("div", { className: "summary-grid", children: [_jsx(SummaryCard, { label: "Usuarios totales", value: metrics.total, accent: "#1d4ed8" }), _jsx(SummaryCard, { label: "Usuarios activos", value: metrics.active, accent: "#0f766e" }), _jsx(SummaryCard, { label: "Cuentas privilegiadas", value: metrics.privileged, accent: "#9a6700" }), _jsx(SummaryCard, { label: "Pendientes de activacion", value: metrics.pendingReset, accent: "#b42318" })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: isEditing ? "Editar usuario" : "Crear usuario" }), isEditing ? (_jsx("button", { className: "secondary-button", type: "button", onClick: resetForm, children: "Cancelar edicion" })) : (_jsx("span", { children: "Acceso operativo y permisos" }))] }), isEditing ? (_jsxs("div", { className: "editing-banner", children: ["Editando a ", _jsx("strong", { children: rows.find((entry) => entry.id === editingUserId)?.username }), ". Puedes cambiar la contrasena aqui o dejarla en blanco para conservar la actual."] })) : null, _jsxs("form", { className: "users-form", onSubmit: handleSave, children: [_jsxs("div", { className: "users-form-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Username (nombre y primer apellido)" }), _jsx("input", { value: form.username, onChange: (event) => setForm((current) => ({ ...current, username: event.target.value })), placeholder: "Ej. Eduardo Rusconi", disabled: isEditing, required: !isEditing })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre corto" }), _jsx("input", { value: form.shortName, onChange: (event) => setForm((current) => ({ ...current, shortName: event.target.value })), placeholder: "Ej. EKPO", maxLength: 10 })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Contrasena" }), _jsxs("span", { className: "password-input-wrap", children: [_jsx("input", { autoComplete: isEditing ? "new-password" : "new-password", value: form.password, onChange: (event) => setForm((current) => ({ ...current, password: event.target.value })), placeholder: isEditing ? "Dejar en blanco para conservar la actual" : "Minimo 10 caracteres con simbolo", type: showPassword ? "text" : "password", required: !isEditing }), _jsx("button", { "aria-label": showPassword ? "Ocultar contrasena" : "Mostrar contrasena", "aria-pressed": showPassword, className: "password-visibility-toggle", onClick: () => setShowPassword((current) => !current), type: "button", children: _jsx(PasswordVisibilityIcon, { visible: showPassword }) })] })] })] }), _jsxs("div", { className: "users-form-grid users-form-grid-secondary", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Equipo" }), _jsxs("select", { value: form.legacyTeam, onChange: (event) => setForm((current) => ({ ...current, legacyTeam: event.target.value })), children: [_jsx("option", { value: "", children: "-- Seleccionar equipo --" }), TEAM_OPTIONS.map((team) => (_jsx("option", { value: team.label, children: team.label }, team.key)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Rol especifico" }), _jsxs("select", { value: form.specificRole, onChange: (event) => setForm((current) => ({ ...current, specificRole: event.target.value })), children: [_jsx("option", { value: "", children: "-- Seleccionar rol --" }), SPECIFIC_ROLE_OPTIONS.map((specificRole) => (_jsx("option", { value: specificRole, children: specificRole }, specificRole)))] })] }), _jsxs("label", { className: "form-field checkbox-field", children: [_jsx("span", { children: "Estado" }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: form.isActive, disabled: !isEditing, onChange: (event) => setForm((current) => ({ ...current, isActive: event.target.checked })), type: "checkbox" }), _jsx("span", { children: form.isActive ? "Activo" : "Inactivo" })] })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: isSaving, type: "submit", children: isSaving ? "Procesando..." : isEditing ? "Guardar cambios" : "Crear usuario" }), _jsx("button", { className: "secondary-button", onClick: fetchUsers, type: "button", children: "Refrescar lista" })] })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Usuarios registrados" }), _jsxs("span", { children: [rows.length, " registros"] })] }), fetchError ? _jsx("div", { className: "message-banner message-error", children: fetchError }) : null, _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table users-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Usuario" }), _jsx("th", { children: "Nombre corto" }), _jsx("th", { children: "Tipo de acceso" }), _jsx("th", { children: "Rol sistema" }), _jsx("th", { children: "Equipo" }), _jsx("th", { children: "Rol especifico" }), _jsx("th", { children: "Onboarding" }), _jsx("th", { children: "Ultimo acceso" }), _jsx("th", { children: "Creado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loadingUsers ? (_jsx("tr", { children: _jsx("td", { colSpan: 10, children: "Cargando usuarios..." }) })) : rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 10, children: "No hay usuarios registrados." }) })) : (rows.map((entry) => (_jsxs("tr", { className: !entry.isActive ? "user-row-inactive" : undefined, children: [_jsx("td", { children: _jsx("div", { className: "user-identity", children: _jsx("strong", { children: entry.username }) }) }), _jsx("td", { children: entry.shortName ?? "-" }), _jsx("td", { children: _jsx("span", { className: `status-pill ${entry.legacyRole === "SUPERADMIN" ? "status-live" : "status-migration"}`, children: getLegacyRoleLabel(entry.legacyRole) }) }), _jsx("td", { children: getSystemRoleLabel(entry.role) }), _jsx("td", { children: entry.legacyTeam ?? "-" }), _jsx("td", { children: entry.specificRole ?? "-" }), _jsx("td", { children: _jsx("span", { className: `status-pill ${entry.passwordResetRequired ? "status-warning" : "status-live"}`, children: entry.passwordResetRequired ? "Pendiente" : "Listo" }) }), _jsx("td", { children: formatDateTime(entry.lastLoginAt) }), _jsx("td", { children: formatDateTime(entry.createdAt) }), _jsx("td", { children: _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => handleEditClick(entry), type: "button", children: "Editar" }), _jsx("button", { className: "danger-button", disabled: Boolean(deletingUserId) || entry.id === user?.id, onClick: () => void handleDeleteTarget(entry), type: "button", children: deletingUserId === entry.id ? "Borrando..." : "Borrar" })] }) })] }, entry.id)))) })] }) })] }), _jsx("section", { className: "users-admin-grid", children: _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Datos operativos" }), _jsx("span", { children: "Lista para SQL" })] }), _jsxs("div", { className: "compatibility-list", children: [_jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "Username" }), _jsx("span", { children: "Se guarda en formato nombre y primer apellido para que sea legible en la operacion diaria." })] }), _jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "short_name" }), _jsx("span", { children: "Permanece disponible para modulos que asignan responsables por nombre corto." })] }), _jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "team / specific_role" }), _jsx("span", { children: "Se guardan como metadata persistida para sostener el modelo actual de permisos y asignaciones." })] }), _jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "Onboarding seguro" }), _jsx("span", { children: "Las cuentas pueden recibir enlaces de activacion y restablecimiento sin reutilizar contrasenas previas." })] })] })] }) })] }));
}
