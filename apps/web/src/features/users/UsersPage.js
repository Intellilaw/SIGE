import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { SPECIFIC_ROLE_OPTIONS } from "@sige/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";
const EMPTY_FORM = {
    displayName: "",
    username: "",
    email: "",
    password: "",
    shortName: "",
    legacyTeam: "",
    secondaryLegacyTeam: "",
    specificRole: "",
    secondarySpecificRole: "",
    isExternal: false,
    isActive: true
};
const EMPTY_TEAM_FORM = {
    label: "",
    executionSpaceEnabled: false
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
function isSuperadmin(candidate) {
    if (!candidate) {
        return false;
    }
    if (candidate.role === "SUPERADMIN" || candidate.legacyRole === "SUPERADMIN") {
        return true;
    }
    const normalizedEmail = (candidate.email ?? "").trim().toLowerCase();
    if (normalizedEmail === "eduardo.rusconi@intellilaw.ai") {
        return true;
    }
    const normalizedIdentity = [
        candidate.username,
        candidate.displayName,
        candidate.shortName
    ].map((value) => String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()).join(" ");
    return normalizedIdentity.includes("eduardo") && normalizedIdentity.includes("rusconi");
}
export function UsersPage() {
    const { user } = useAuth();
    const teamSectionRef = useRef(null);
    const teamFormRef = useRef(null);
    const teamNameInputRef = useRef(null);
    const [rows, setRows] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingTeams, setLoadingTeams] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingTeam, setIsSavingTeam] = useState(false);
    const [deletingUserId, setDeletingUserId] = useState(null);
    const [teamActionId, setTeamActionId] = useState(null);
    const [fetchError, setFetchError] = useState(null);
    const [teamsError, setTeamsError] = useState(null);
    const [flash, setFlash] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingUserId, setEditingUserId] = useState(null);
    const [editingTeamId, setEditingTeamId] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [teamForm, setTeamForm] = useState(EMPTY_TEAM_FORM);
    const canManageUsers = Boolean(user?.permissions.includes("*") || user?.permissions.includes("users:manage"));
    const canManageTeams = canManageUsers && isSuperadmin(user);
    function scrollToTeamAdmin() {
        window.setTimeout(() => {
            const target = teamFormRef.current ?? teamSectionRef.current;
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
            window.setTimeout(() => {
                teamNameInputRef.current?.focus({ preventScroll: true });
            }, 250);
        }, 0);
    }
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
    async function fetchTeams() {
        setLoadingTeams(true);
        setTeamsError(null);
        try {
            const data = await apiGet("/users/teams");
            setTeams(data);
        }
        catch (error) {
            setTeamsError(getErrorMessage(error));
        }
        finally {
            setLoadingTeams(false);
        }
    }
    useEffect(() => {
        if (!canManageUsers) {
            setLoadingUsers(false);
            setLoadingTeams(false);
            return;
        }
        void fetchUsers();
        void fetchTeams();
    }, [canManageUsers]);
    const metrics = useMemo(() => ({
        total: rows.length,
        active: rows.filter((entry) => entry.isActive).length,
        privileged: rows.filter((entry) => entry.permissions.includes("*")).length,
        pendingReset: rows.filter((entry) => entry.passwordResetRequired).length
    }), [rows]);
    const primaryTeamOptionsForUserForm = useMemo(() => teams.filter((team) => team.isActive || team.label === form.legacyTeam), [form.legacyTeam, teams]);
    const secondaryTeamOptionsForUserForm = useMemo(() => teams.filter((team) => (team.isActive || team.label === form.secondaryLegacyTeam) && team.label !== form.legacyTeam), [form.legacyTeam, form.secondaryLegacyTeam, teams]);
    useEffect(() => {
        if (loadingTeams) {
            return;
        }
        setForm((current) => {
            const hasPrimaryTeam = !current.legacyTeam || teams.some((team) => team.label === current.legacyTeam);
            const hasSecondaryTeam = !current.secondaryLegacyTeam || teams.some((team) => team.label === current.secondaryLegacyTeam);
            const shouldClearSecondaryRole = !current.secondaryLegacyTeam && current.secondarySpecificRole;
            if (hasPrimaryTeam && hasSecondaryTeam && !shouldClearSecondaryRole) {
                return current;
            }
            return {
                ...current,
                legacyTeam: hasPrimaryTeam ? current.legacyTeam : "",
                secondaryLegacyTeam: hasSecondaryTeam ? current.secondaryLegacyTeam : "",
                secondarySpecificRole: hasSecondaryTeam && current.secondaryLegacyTeam ? current.secondarySpecificRole : ""
            };
        });
    }, [loadingTeams, teams]);
    function resetForm() {
        setIsEditing(false);
        setEditingUserId(null);
        setShowPassword(false);
        setForm(EMPTY_FORM);
    }
    function resetTeamForm() {
        setEditingTeamId(null);
        setTeamForm(EMPTY_TEAM_FORM);
    }
    function handleEditClick(target) {
        setFlash(null);
        setIsEditing(true);
        setEditingUserId(target.id);
        setShowPassword(false);
        setForm({
            displayName: target.displayName,
            username: target.username,
            email: target.email,
            password: "",
            shortName: target.shortName ?? "",
            legacyTeam: target.legacyTeam ?? "",
            secondaryLegacyTeam: target.secondaryLegacyTeam ?? "",
            specificRole: target.specificRole ?? "",
            secondarySpecificRole: target.secondarySpecificRole ?? "",
            isExternal: target.isExternal,
            isActive: target.isActive
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function handleTeamEditClick(target) {
        setFlash(null);
        setEditingTeamId(target.id);
        setTeamForm({
            label: target.label,
            executionSpaceEnabled: target.executionSpaceEnabled
        });
        scrollToTeamAdmin();
    }
    async function handleSave(event) {
        event.preventDefault();
        setFlash(null);
        const trimmedDisplayName = form.displayName.trim();
        const trimmedUsername = form.username.trim();
        const trimmedEmail = form.email.trim();
        const trimmedPassword = form.password.trim();
        if (!trimmedDisplayName) {
            setFlash({ tone: "error", text: "El nombre completo es obligatorio." });
            return;
        }
        if (!trimmedUsername) {
            setFlash({ tone: "error", text: "El nombre de usuario en el sistema es obligatorio." });
            return;
        }
        if (!isEditing && trimmedPassword.length < 10) {
            setFlash({ tone: "error", text: "La contrasena debe tener al menos 10 caracteres y cumplir la politica segura." });
            return;
        }
        if (isEditing && trimmedPassword.length > 0 && trimmedPassword.length < 10) {
            setFlash({ tone: "error", text: "La contrasena debe tener al menos 10 caracteres y cumplir la politica segura." });
            return;
        }
        const selectedTeam = form.legacyTeam.trim();
        const selectedSecondaryTeam = form.secondaryLegacyTeam.trim();
        const selectedSpecificRole = form.specificRole.trim();
        const selectedSecondarySpecificRole = selectedSecondaryTeam ? form.secondarySpecificRole.trim() : "";
        if (selectedTeam && !teams.some((team) => team.label === selectedTeam && team.isActive)) {
            setFlash({
                tone: "error",
                text: "El equipo seleccionado no existe o esta desactivado para esta empresa."
            });
            return;
        }
        if (selectedSecondaryTeam && !teams.some((team) => team.label === selectedSecondaryTeam && team.isActive)) {
            setFlash({
                tone: "error",
                text: "El segundo equipo seleccionado no existe o esta desactivado para esta empresa."
            });
            return;
        }
        if (selectedTeam && selectedSecondaryTeam && selectedTeam === selectedSecondaryTeam) {
            setFlash({ tone: "error", text: "El segundo equipo debe ser distinto del equipo principal." });
            return;
        }
        setIsSaving(true);
        try {
            if (isEditing && editingUserId) {
                await apiPatch(`/users/${editingUserId}`, {
                    username: trimmedUsername,
                    email: trimmedEmail || undefined,
                    displayName: trimmedDisplayName,
                    password: trimmedPassword || undefined,
                    shortName: form.shortName.trim() || null,
                    legacyTeam: selectedTeam || null,
                    secondaryLegacyTeam: selectedSecondaryTeam || null,
                    specificRole: selectedSpecificRole || null,
                    secondarySpecificRole: selectedSecondarySpecificRole || null,
                    isExternal: form.isExternal,
                    isActive: form.isActive
                });
                setFlash({ tone: "success", text: "Usuario actualizado correctamente." });
            }
            else {
                await apiPost("/users", {
                    username: trimmedUsername,
                    email: trimmedEmail || undefined,
                    displayName: trimmedDisplayName,
                    password: trimmedPassword,
                    shortName: form.shortName.trim() || undefined,
                    legacyTeam: selectedTeam || undefined,
                    secondaryLegacyTeam: selectedSecondaryTeam || undefined,
                    specificRole: selectedSpecificRole || undefined,
                    secondarySpecificRole: selectedSecondarySpecificRole || undefined,
                    isExternal: form.isExternal
                });
                setFlash({ tone: "success", text: `Usuario "${trimmedUsername}" creado y autorizado correctamente.` });
            }
            resetForm();
            await Promise.all([fetchUsers(), fetchTeams()]);
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setIsSaving(false);
        }
    }
    async function handleTeamSave(event) {
        event.preventDefault();
        setFlash(null);
        const label = teamForm.label.trim();
        if (!label) {
            setFlash({ tone: "error", text: "El nombre del equipo es obligatorio." });
            return;
        }
        setIsSavingTeam(true);
        try {
            const payload = {
                label,
                executionSpaceEnabled: teamForm.executionSpaceEnabled
            };
            if (editingTeamId) {
                await apiPatch(`/users/teams/${editingTeamId}`, payload);
                setFlash({ tone: "success", text: "Equipo actualizado correctamente." });
            }
            else {
                await apiPost("/users/teams", payload);
                setFlash({ tone: "success", text: `Equipo "${label}" creado correctamente.` });
            }
            resetTeamForm();
            await Promise.all([fetchTeams(), fetchUsers()]);
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setIsSavingTeam(false);
        }
    }
    async function handleDeactivateTeam(target) {
        setFlash(null);
        const memberWarning = target.memberCount > 0
            ? ` Tiene ${target.memberCount} usuario(s) activo(s); conservaran el equipo historico, pero ya no aparecera para nuevas asignaciones.`
            : "";
        if (!window.confirm(`Seguro que deseas desactivar el equipo ${target.label}?${memberWarning}`)) {
            return;
        }
        setTeamActionId(target.id);
        try {
            await apiDelete(`/users/teams/${target.id}`);
            setFlash({ tone: "success", text: `Equipo ${target.label} desactivado correctamente.` });
            if (editingTeamId === target.id) {
                resetTeamForm();
            }
            await fetchTeams();
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setTeamActionId(null);
        }
    }
    async function handleReactivateTeam(target) {
        setFlash(null);
        setTeamActionId(target.id);
        try {
            await apiPatch(`/users/teams/${target.id}`, { isActive: true });
            setFlash({ tone: "success", text: `Equipo ${target.label} reactivado correctamente.` });
            await fetchTeams();
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setTeamActionId(null);
        }
    }
    async function handleDeleteTarget(target) {
        setFlash(null);
        if (target.id === user?.id) {
            setFlash({ tone: "error", text: "No puedes borrar la sesion administrativa activa." });
            return;
        }
        if (!window.confirm(`Seguro que deseas borrar al usuario ${target.username}? Esta accion no se puede deshacer.`)) {
            return;
        }
        setDeletingUserId(target.id);
        try {
            await apiDelete(`/users/${target.id}`);
            setFlash({ tone: "success", text: `Usuario ${target.username} borrado correctamente.` });
            if (editingUserId === target.id) {
                resetForm();
            }
            await Promise.all([fetchUsers(), fetchTeams()]);
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
    return (_jsxs("section", { className: "page-stack", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\uD83D\uDC64" }), _jsx("div", { children: _jsx("h2", { children: "Usuarios" }) })] }), _jsx("p", { className: "muted", children: "Administracion central de usuarios con activacion segura, reinicio de contrasena y control operativo sobre `username`, `short_name`, `team`, `specific_role` y el tipo de acceso del sistema." })] }), _jsxs("div", { className: "summary-grid", children: [_jsx(SummaryCard, { label: "Usuarios totales", value: metrics.total, accent: "#1d4ed8" }), _jsx(SummaryCard, { label: "Usuarios activos", value: metrics.active, accent: "#0f766e" }), _jsx(SummaryCard, { label: "Cuentas privilegiadas", value: metrics.privileged, accent: "#9a6700" }), _jsx(SummaryCard, { label: "Pendientes de activacion", value: metrics.pendingReset, accent: "#b42318" })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: isEditing ? "Editar usuario" : "Crear usuario" }), isEditing ? (_jsx("button", { className: "secondary-button", type: "button", onClick: resetForm, children: "Cancelar edicion" })) : (_jsxs("div", { className: "panel-header-actions", children: [_jsx("span", { children: "Acceso operativo y permisos" }), _jsx("button", { className: "secondary-button", type: "button", onClick: scrollToTeamAdmin, children: "Administrar equipos" })] }))] }), isEditing ? (_jsxs("div", { className: "editing-banner", children: ["Editando a ", _jsx("strong", { children: rows.find((entry) => entry.id === editingUserId)?.displayName }), ". Puedes cambiar la contrasena aqui o dejarla en blanco para conservar la actual."] })) : null, _jsxs("form", { className: "users-form", onSubmit: handleSave, children: [_jsxs("div", { className: "users-form-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre completo" }), _jsx("input", { value: form.displayName, onChange: (event) => setForm((current) => ({ ...current, displayName: event.target.value })), placeholder: "Ej. Itari Romero Perez", required: true })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre de usuario en el sistema" }), _jsx("input", { value: form.username, onChange: (event) => setForm((current) => ({ ...current, username: event.target.value })), placeholder: "Ej. Itari Romero", required: true })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Correo electronico" }), _jsx("input", { autoComplete: "email", value: form.email, onChange: (event) => setForm((current) => ({ ...current, email: event.target.value })), placeholder: "Ej. usuario@empresa.com", type: "email" })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre corto" }), _jsx("input", { value: form.shortName, onChange: (event) => setForm((current) => ({ ...current, shortName: event.target.value })), placeholder: "Ej. EKPO", maxLength: 10 })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Contrasena" }), _jsxs("span", { className: "password-input-wrap", children: [_jsx("input", { autoComplete: isEditing ? "new-password" : "new-password", value: form.password, onChange: (event) => setForm((current) => ({ ...current, password: event.target.value })), placeholder: isEditing ? "Dejar en blanco para conservar la actual" : "Minimo 10 caracteres con simbolo", type: showPassword ? "text" : "password", required: !isEditing }), _jsx("button", { "aria-label": showPassword ? "Ocultar contrasena" : "Mostrar contrasena", "aria-pressed": showPassword, className: "password-visibility-toggle", onClick: () => setShowPassword((current) => !current), type: "button", children: _jsx(PasswordVisibilityIcon, { visible: showPassword }) })] })] })] }), _jsxs("div", { className: "users-form-grid users-form-grid-secondary", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Equipo principal" }), _jsxs("select", { disabled: loadingTeams || primaryTeamOptionsForUserForm.length === 0, value: form.legacyTeam, onChange: (event) => setForm((current) => {
                                                    const legacyTeam = event.target.value;
                                                    const duplicateSecondaryTeam = legacyTeam && current.secondaryLegacyTeam === legacyTeam;
                                                    return {
                                                        ...current,
                                                        legacyTeam,
                                                        secondaryLegacyTeam: duplicateSecondaryTeam ? "" : current.secondaryLegacyTeam,
                                                        secondarySpecificRole: duplicateSecondaryTeam ? "" : current.secondarySpecificRole
                                                    };
                                                }), children: [_jsx("option", { value: "", children: loadingTeams
                                                            ? "Cargando equipos..."
                                                            : primaryTeamOptionsForUserForm.length === 0
                                                                ? "Sin equipos registrados"
                                                                : "-- Seleccionar equipo --" }), primaryTeamOptionsForUserForm.map((team) => (_jsx("option", { value: team.label, children: team.isActive ? team.label : `${team.label} (inactivo)` }, team.key)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Rol principal" }), _jsxs("select", { value: form.specificRole, onChange: (event) => setForm((current) => ({ ...current, specificRole: event.target.value })), children: [_jsx("option", { value: "", children: "-- Seleccionar rol --" }), SPECIFIC_ROLE_OPTIONS.map((specificRole) => (_jsx("option", { value: specificRole, children: specificRole }, specificRole)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Segundo equipo" }), _jsxs("select", { disabled: loadingTeams || secondaryTeamOptionsForUserForm.length === 0, value: form.secondaryLegacyTeam, onChange: (event) => setForm((current) => ({
                                                    ...current,
                                                    secondaryLegacyTeam: event.target.value,
                                                    secondarySpecificRole: event.target.value ? current.secondarySpecificRole : ""
                                                })), children: [_jsx("option", { value: "", children: loadingTeams
                                                            ? "Cargando equipos..."
                                                            : secondaryTeamOptionsForUserForm.length === 0
                                                                ? "Sin otro equipo disponible"
                                                                : "-- Sin segundo equipo --" }), secondaryTeamOptionsForUserForm.map((team) => (_jsx("option", { value: team.label, children: team.isActive ? team.label : `${team.label} (inactivo)` }, team.key)))] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Segundo rol" }), _jsxs("select", { disabled: !form.secondaryLegacyTeam, value: form.secondarySpecificRole, onChange: (event) => setForm((current) => ({ ...current, secondarySpecificRole: event.target.value })), children: [_jsx("option", { value: "", children: "-- Seleccionar segundo rol --" }), SPECIFIC_ROLE_OPTIONS.map((specificRole) => (_jsx("option", { value: specificRole, children: specificRole }, specificRole)))] })] }), _jsxs("label", { className: "form-field checkbox-field", children: [_jsx("span", { children: "Tipo de usuario" }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: form.isExternal, onChange: (event) => setForm((current) => ({ ...current, isExternal: event.target.checked })), type: "checkbox" }), _jsx("span", { children: form.isExternal ? "Usuario externo" : "Usuario interno" })] })] }), _jsxs("label", { className: "form-field checkbox-field", children: [_jsx("span", { children: "Estado" }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: form.isActive, disabled: !isEditing, onChange: (event) => setForm((current) => ({ ...current, isActive: event.target.checked })), type: "checkbox" }), _jsx("span", { children: form.isActive ? "Activo" : "Inactivo" })] })] })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "primary-button", disabled: isSaving, type: "submit", children: isSaving ? "Procesando..." : isEditing ? "Guardar cambios" : "Crear usuario" }), _jsx("button", { className: "secondary-button", onClick: () => void Promise.all([fetchUsers(), fetchTeams()]), type: "button", children: "Refrescar lista" })] })] })] }), _jsxs("section", { className: "panel users-team-admin-panel", id: "users-team-admin", ref: teamSectionRef, children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Administracion de equipos" }), _jsxs("span", { children: [teams.length, " equipos"] })] }), editingTeamId ? (_jsxs("div", { className: "editing-banner", children: ["Editando equipo ", _jsx("strong", { children: teams.find((team) => team.id === editingTeamId)?.label }), ". Guarda los cambios en este formulario o cancela la edicion."] })) : null, teamsError ? _jsx("div", { className: "message-banner message-error", children: teamsError }) : null, canManageTeams ? (_jsxs("form", { className: "users-team-form", onSubmit: handleTeamSave, ref: teamFormRef, children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Nombre del equipo" }), _jsx("input", { ref: teamNameInputRef, value: teamForm.label, onChange: (event) => setTeamForm((current) => ({ ...current, label: event.target.value })), placeholder: "Ej. Auditoria", maxLength: 80, required: true })] }), _jsxs("div", { className: "form-field checkbox-field users-team-execution-field", children: [_jsx("span", { children: "Espacio de Ejecucion" }), _jsxs("label", { className: "checkbox-row", htmlFor: "users-team-execution-space-enabled", children: [_jsx("input", { id: "users-team-execution-space-enabled", checked: teamForm.executionSpaceEnabled, onChange: (event) => setTeamForm((current) => ({ ...current, executionSpaceEnabled: event.target.checked })), type: "checkbox" }), _jsx("span", { children: teamForm.executionSpaceEnabled ? "Crear o mostrar espacio" : "No crear / ocultar espacio" })] }), _jsx("small", { children: "Al ocultarlo se conserva toda la informacion capturada." })] }), _jsxs("div", { className: "form-actions users-team-actions", children: [_jsx("button", { className: "primary-button", disabled: isSavingTeam, type: "submit", children: isSavingTeam ? "Procesando..." : editingTeamId ? "Guardar equipo" : "Crear equipo" }), editingTeamId ? (_jsx("button", { className: "secondary-button", onClick: resetTeamForm, type: "button", children: "Cancelar edicion" })) : null] })] })) : (_jsx("div", { className: "editing-banner", children: "Solo un superadmin puede crear, editar, reactivar o desactivar equipos y espacios de Ejecucion." })), _jsx("div", { className: "table-scroll users-team-table-scroll", children: _jsxs("table", { className: "data-table users-team-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Equipo" }), _jsx("th", { children: "Clave" }), _jsx("th", { children: "Usuarios activos" }), _jsx("th", { children: "Ejecucion" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loadingTeams ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: "Cargando equipos..." }) })) : teams.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: "No hay equipos registrados." }) })) : (teams.map((team) => (_jsxs("tr", { className: !team.isActive ? "user-row-inactive" : undefined, children: [_jsx("td", { children: _jsx("strong", { children: team.label }) }), _jsx("td", { children: team.key }), _jsx("td", { children: team.memberCount }), _jsx("td", { children: _jsx("span", { className: `status-pill ${team.executionSpaceEnabled ? "status-live" : "status-migration"}`, children: team.executionSpaceEnabled ? "Visible" : "Oculto" }) }), _jsx("td", { children: _jsx("span", { className: `status-pill ${team.isActive ? "status-live" : "status-warning"}`, children: team.isActive ? "Activo" : "Inactivo" }) }), _jsx("td", { children: _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", disabled: !canManageTeams || Boolean(teamActionId), onClick: () => handleTeamEditClick(team), type: "button", children: "Editar" }), team.isActive ? (_jsx("button", { className: "danger-button", disabled: !canManageTeams || Boolean(teamActionId), onClick: () => void handleDeactivateTeam(team), type: "button", children: teamActionId === team.id ? "Procesando..." : "Desactivar" })) : (_jsx("button", { className: "secondary-button", disabled: !canManageTeams || Boolean(teamActionId), onClick: () => void handleReactivateTeam(team), type: "button", children: teamActionId === team.id ? "Procesando..." : "Reactivar" }))] }) })] }, team.id)))) })] }) })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Usuarios registrados" }), _jsxs("span", { children: [rows.length, " registros"] })] }), fetchError ? _jsx("div", { className: "message-banner message-error", children: fetchError }) : null, _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table users-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nombre completo" }), _jsx("th", { children: "Nombre de usuario en el sistema" }), _jsx("th", { children: "Correo electronico" }), _jsx("th", { children: "Nombre corto" }), _jsx("th", { children: "Tipo de acceso" }), _jsx("th", { children: "Tipo de usuario" }), _jsx("th", { children: "Rol sistema" }), _jsx("th", { children: "Equipo principal" }), _jsx("th", { children: "Rol principal" }), _jsx("th", { children: "Segundo equipo" }), _jsx("th", { children: "Segundo rol" }), _jsx("th", { children: "Onboarding" }), _jsx("th", { children: "Ultimo acceso" }), _jsx("th", { children: "Creado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loadingUsers ? (_jsx("tr", { children: _jsx("td", { colSpan: 15, children: "Cargando usuarios..." }) })) : rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 15, children: "No hay usuarios registrados." }) })) : (rows.map((entry) => (_jsxs("tr", { className: !entry.isActive ? "user-row-inactive" : undefined, children: [_jsx("td", { children: _jsx("div", { className: "user-identity", children: _jsx("strong", { children: entry.displayName }) }) }), _jsx("td", { children: entry.username }), _jsx("td", { children: entry.email }), _jsx("td", { children: entry.shortName ?? "-" }), _jsx("td", { children: _jsx("span", { className: `status-pill ${entry.legacyRole === "SUPERADMIN" ? "status-live" : "status-migration"}`, children: getLegacyRoleLabel(entry.legacyRole) }) }), _jsx("td", { children: _jsx("span", { className: `status-pill ${entry.isExternal ? "status-migration" : "status-live"}`, children: entry.isExternal ? "Externo" : "Interno" }) }), _jsx("td", { children: getSystemRoleLabel(entry.role) }), _jsx("td", { children: entry.legacyTeam ?? "-" }), _jsx("td", { children: entry.specificRole ?? "-" }), _jsx("td", { children: entry.secondaryLegacyTeam ?? "-" }), _jsx("td", { children: entry.secondarySpecificRole ?? "-" }), _jsx("td", { children: _jsx("span", { className: `status-pill ${entry.passwordResetRequired ? "status-warning" : "status-live"}`, children: entry.passwordResetRequired ? "Pendiente" : "Listo" }) }), _jsx("td", { children: formatDateTime(entry.lastLoginAt) }), _jsx("td", { children: formatDateTime(entry.createdAt) }), _jsx("td", { children: _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => handleEditClick(entry), type: "button", children: "Editar" }), _jsx("button", { className: "danger-button", disabled: Boolean(deletingUserId) || entry.id === user?.id, onClick: () => void handleDeleteTarget(entry), type: "button", children: deletingUserId === entry.id ? "Procesando..." : "Borrar" })] }) })] }, entry.id)))) })] }) })] }), _jsx("section", { className: "users-admin-grid", children: _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Datos operativos" }), _jsx("span", { children: "Lista para SQL" })] }), _jsxs("div", { className: "compatibility-list", children: [_jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "Nombre completo" }), _jsx("span", { children: "Se guarda como nombre visible del usuario en los modulos del sistema." })] }), _jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "Nombre de usuario en el sistema" }), _jsx("span", { children: "Se usa como identificador operativo y para inicio de sesion." })] }), _jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "short_name" }), _jsx("span", { children: "Permanece disponible para modulos que asignan responsables por nombre corto." })] }), _jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "team / specific_role" }), _jsx("span", { children: "Se guardan como metadata persistida para sostener el modelo actual de permisos y asignaciones." })] }), _jsxs("div", { className: "compatibility-item", children: [_jsx("strong", { children: "Onboarding seguro" }), _jsx("span", { children: "Las cuentas pueden recibir enlaces de activacion y restablecimiento sin reutilizar contrasenas previas." })] })] })] }) })] }));
}
