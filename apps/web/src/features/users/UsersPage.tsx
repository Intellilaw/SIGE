import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SPECIFIC_ROLE_OPTIONS, type ManagedTeam, type ManagedUser } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

interface UserFormState {
  displayName: string;
  username: string;
  email: string;
  password: string;
  shortName: string;
  legacyTeam: string;
  secondaryLegacyTeam: string;
  specificRole: string;
  secondarySpecificRole: string;
  isExternal: boolean;
  createLaborFile: boolean;
  isActive: boolean;
}

interface TeamFormState {
  label: string;
  executionSpaceEnabled: boolean;
}

const EMPTY_FORM: UserFormState = {
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
  createLaborFile: true,
  isActive: true
};

const EMPTY_TEAM_FORM: TeamFormState = {
  label: "",
  executionSpaceEnabled: false
};

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4 4.8M6 6.2C3.8 7.7 2.5 10 2 12c0 0 3.5 7 10 7 1.7 0 3.2-.5 4.5-1.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  ) : (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : "Nunca";
}

function getLegacyRoleLabel(role: ManagedUser["legacyRole"]) {
  switch (role) {
    case "SUPERADMIN":
      return "superadmin";
    case "INTRANET":
      return "operativo";
    default:
      return "public";
  }
}

function getSystemRoleLabel(role: ManagedUser["role"]) {
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

function isSuperadmin(
  candidate: {
    email?: string;
    username?: string;
    displayName?: string;
    shortName?: string;
    role: string;
    legacyRole: string;
  } | null | undefined
) {
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
  ].map((value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  ).join(" ");

  return normalizedIdentity.includes("eduardo") && normalizedIdentity.includes("rusconi");
}

export function UsersPage() {
  const { user } = useAuth();
  const teamSectionRef = useRef<HTMLElement | null>(null);
  const teamFormRef = useRef<HTMLFormElement | null>(null);
  const teamNameInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [teamActionId, setTeamActionId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [teamForm, setTeamForm] = useState<TeamFormState>(EMPTY_TEAM_FORM);

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
      const data = await apiGet<ManagedUser[]>("/users");
      setRows(data);
    } catch (error) {
      setFetchError(getErrorMessage(error));
    } finally {
      setLoadingUsers(false);
    }
  }

  async function fetchTeams() {
    setLoadingTeams(true);
    setTeamsError(null);

    try {
      const data = await apiGet<ManagedTeam[]>("/users/teams");
      setTeams(data);
    } catch (error) {
      setTeamsError(getErrorMessage(error));
    } finally {
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

  const metrics = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((entry) => entry.isActive).length,
      privileged: rows.filter((entry) => entry.permissions.includes("*")).length,
      pendingReset: rows.filter((entry) => entry.passwordResetRequired).length
    }),
    [rows]
  );

  const primaryTeamOptionsForUserForm = useMemo(
    () => teams.filter((team) => team.isActive || team.label === form.legacyTeam),
    [form.legacyTeam, teams]
  );
  const secondaryTeamOptionsForUserForm = useMemo(
    () => teams.filter((team) =>
      (team.isActive || team.label === form.secondaryLegacyTeam) && team.label !== form.legacyTeam
    ),
    [form.legacyTeam, form.secondaryLegacyTeam, teams]
  );

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

  function handleEditClick(target: ManagedUser) {
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
      createLaborFile: target.createLaborFile ?? !target.isExternal,
      isActive: target.isActive
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleTeamEditClick(target: ManagedTeam) {
    setFlash(null);
    setEditingTeamId(target.id);
    setTeamForm({
      label: target.label,
      executionSpaceEnabled: target.executionSpaceEnabled
    });
    scrollToTeamAdmin();
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
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
        await apiPatch<ManagedUser>(`/users/${editingUserId}`, {
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
          createLaborFile: form.createLaborFile,
          isActive: form.isActive
        });
        setFlash({ tone: "success", text: "Usuario actualizado correctamente." });
      } else {
        await apiPost<ManagedUser>("/users", {
          username: trimmedUsername,
          email: trimmedEmail || undefined,
          displayName: trimmedDisplayName,
          password: trimmedPassword,
          shortName: form.shortName.trim() || undefined,
          legacyTeam: selectedTeam || undefined,
          secondaryLegacyTeam: selectedSecondaryTeam || undefined,
          specificRole: selectedSpecificRole || undefined,
          secondarySpecificRole: selectedSecondarySpecificRole || undefined,
          isExternal: form.isExternal,
          createLaborFile: form.createLaborFile
        });
        setFlash({ tone: "success", text: `Usuario "${trimmedUsername}" creado y autorizado correctamente.` });
      }

      resetForm();
      await Promise.all([fetchUsers(), fetchTeams()]);
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTeamSave(event: FormEvent<HTMLFormElement>) {
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
        await apiPatch<ManagedTeam>(`/users/teams/${editingTeamId}`, payload);
        setFlash({ tone: "success", text: "Equipo actualizado correctamente." });
      } else {
        await apiPost<ManagedTeam>("/users/teams", payload);
        setFlash({ tone: "success", text: `Equipo "${label}" creado correctamente.` });
      }

      resetTeamForm();
      await Promise.all([fetchTeams(), fetchUsers()]);
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsSavingTeam(false);
    }
  }

  async function handleDeactivateTeam(target: ManagedTeam) {
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
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setTeamActionId(null);
    }
  }

  async function handleReactivateTeam(target: ManagedTeam) {
    setFlash(null);
    setTeamActionId(target.id);

    try {
      await apiPatch<ManagedTeam>(`/users/teams/${target.id}`, { isActive: true });
      setFlash({ tone: "success", text: `Equipo ${target.label} reactivado correctamente.` });
      await fetchTeams();
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setTeamActionId(null);
    }
  }

  async function handleDeleteTeam(target: ManagedTeam) {
    setFlash(null);

    const memberWarning = target.memberCount > 0
      ? ` Tiene ${target.memberCount} usuario(s) activo(s) asignado(s); si sigue asignado a cualquier usuario, el sistema bloqueara el borrado.`
      : "";
    if (!window.confirm(`Seguro que deseas borrar permanentemente el equipo ${target.label}?${memberWarning}`)) {
      return;
    }

    setTeamActionId(target.id);

    try {
      await apiDelete(`/users/teams/${target.id}/permanent`);
      setFlash({ tone: "success", text: `Equipo ${target.label} borrado correctamente.` });
      if (editingTeamId === target.id) {
        resetTeamForm();
      }
      await Promise.all([fetchTeams(), fetchUsers()]);
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setTeamActionId(null);
    }
  }

  async function handleDeleteTarget(target: ManagedUser) {
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
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setDeletingUserId(null);
    }
  }

  if (!canManageUsers) {
    return (
      <section className="page-stack">
        <header className="hero module-hero">
          <div className="module-hero-head">
            <span className="module-hero-icon" aria-hidden="true">
              👤
            </span>
            <div>
              <h2>Usuarios</h2>
            </div>
          </div>
          <p className="muted">
            Solo las cuentas con permisos de administracion pueden gestionar usuarios, equipos, nombre corto, rol
            especifico y onboarding.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            👤
          </span>
          <div>
            <h2>Usuarios</h2>
          </div>
        </div>
        <p className="muted">
          Administracion central de usuarios con activacion segura, reinicio de contrasena y control operativo sobre
          `username`, `short_name`, `team`, `specific_role` y el tipo de acceso del sistema.
        </p>
      </header>

      <div className="summary-grid">
        <SummaryCard label="Usuarios totales" value={metrics.total} accent="#1d4ed8" />
        <SummaryCard label="Usuarios activos" value={metrics.active} accent="#0f766e" />
        <SummaryCard label="Cuentas privilegiadas" value={metrics.privileged} accent="#9a6700" />
        <SummaryCard label="Pendientes de activacion" value={metrics.pendingReset} accent="#b42318" />
      </div>

      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>{isEditing ? "Editar usuario" : "Crear usuario"}</h2>
          {isEditing ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              Cancelar edicion
            </button>
          ) : (
            <div className="panel-header-actions">
              <span>Acceso operativo y permisos</span>
              <button className="secondary-button" type="button" onClick={scrollToTeamAdmin}>
                Administrar equipos
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="editing-banner">
            Editando a <strong>{rows.find((entry) => entry.id === editingUserId)?.displayName}</strong>. Puedes cambiar la
            contrasena aqui o dejarla en blanco para conservar la actual.
          </div>
        ) : null}

        <form className="users-form" onSubmit={handleSave}>
          <div className="users-form-grid">
            <label className="form-field">
              <span>Nombre completo</span>
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="Ej. Itari Romero Perez"
                required
              />
            </label>

            <label className="form-field">
              <span>Nombre de usuario en el sistema</span>
              <input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Ej. Itari Romero"
                required
              />
            </label>

            <label className="form-field">
              <span>Correo electronico</span>
              <input
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Ej. usuario@empresa.com"
                type="email"
              />
            </label>

            <label className="form-field">
              <span>Nombre corto</span>
              <input
                value={form.shortName}
                onChange={(event) => setForm((current) => ({ ...current, shortName: event.target.value }))}
                placeholder="Ej. EKPO"
                maxLength={10}
              />
            </label>

            <label className="form-field">
              <span>Contrasena</span>
              <span className="password-input-wrap">
                <input
                  autoComplete={isEditing ? "new-password" : "new-password"}
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={isEditing ? "Dejar en blanco para conservar la actual" : "Minimo 10 caracteres con simbolo"}
                  type={showPassword ? "text" : "password"}
                  required={!isEditing}
                />
                <button
                  aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                  aria-pressed={showPassword}
                  className="password-visibility-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </button>
              </span>
            </label>
          </div>

          <div className="users-form-grid users-form-grid-secondary">
            <div className="users-form-field-stack">
              <label className="form-field">
                <span>Equipo principal</span>
                <select
                  disabled={loadingTeams || primaryTeamOptionsForUserForm.length === 0}
                  value={form.legacyTeam}
                  onChange={(event) => setForm((current) => {
                    const legacyTeam = event.target.value;
                    const duplicateSecondaryTeam = legacyTeam && current.secondaryLegacyTeam === legacyTeam;
                    return {
                      ...current,
                      legacyTeam,
                      secondaryLegacyTeam: duplicateSecondaryTeam ? "" : current.secondaryLegacyTeam,
                      secondarySpecificRole: duplicateSecondaryTeam ? "" : current.secondarySpecificRole
                    };
                  })}
                >
                  <option value="">
                    {loadingTeams
                      ? "Cargando equipos..."
                      : primaryTeamOptionsForUserForm.length === 0
                        ? "Sin equipos registrados"
                        : "-- Seleccionar equipo --"}
                  </option>
                  {primaryTeamOptionsForUserForm.map((team) => (
                    <option key={team.key} value={team.label}>
                      {team.isActive ? team.label : `${team.label} (inactivo)`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Segundo equipo</span>
                <select
                  disabled={loadingTeams || secondaryTeamOptionsForUserForm.length === 0}
                  value={form.secondaryLegacyTeam}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    secondaryLegacyTeam: event.target.value,
                    secondarySpecificRole: event.target.value ? current.secondarySpecificRole : ""
                  }))}
                >
                  <option value="">
                    {loadingTeams
                      ? "Cargando equipos..."
                      : secondaryTeamOptionsForUserForm.length === 0
                        ? "Sin otro equipo disponible"
                        : "-- Sin segundo equipo --"}
                  </option>
                  {secondaryTeamOptionsForUserForm.map((team) => (
                    <option key={team.key} value={team.label}>
                      {team.isActive ? team.label : `${team.label} (inactivo)`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="users-form-field-stack">
              <label className="form-field">
                <span>Rol principal</span>
                <select
                  value={form.specificRole}
                  onChange={(event) => setForm((current) => ({ ...current, specificRole: event.target.value }))}
                >
                  <option value="">-- Seleccionar rol --</option>
                  {SPECIFIC_ROLE_OPTIONS.map((specificRole) => (
                    <option key={specificRole} value={specificRole}>
                      {specificRole}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Segundo rol</span>
                <select
                  disabled={!form.secondaryLegacyTeam}
                  value={form.secondarySpecificRole}
                  onChange={(event) => setForm((current) => ({ ...current, secondarySpecificRole: event.target.value }))}
                >
                  <option value="">-- Seleccionar segundo rol --</option>
                  {SPECIFIC_ROLE_OPTIONS.map((specificRole) => (
                    <option key={specificRole} value={specificRole}>
                      {specificRole}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="users-form-field-stack">
              <label className="form-field checkbox-field">
                <span>Tipo de usuario</span>
                <label className="checkbox-row">
                  <input
                    checked={form.isExternal}
                    onChange={(event) => {
                      const isExternal = event.target.checked;
                      setForm((current) => ({
                        ...current,
                        isExternal,
                        createLaborFile: isExternal ? false : true
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>{form.isExternal ? "Usuario externo" : "Usuario interno"}</span>
                </label>
              </label>

              <label className="form-field checkbox-field">
                <span>Crear expediente laboral</span>
                <label className="checkbox-row">
                  <input
                    checked={form.createLaborFile}
                    onChange={(event) => setForm((current) => ({ ...current, createLaborFile: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>{form.createLaborFile ? "Si" : "No"}</span>
                </label>
              </label>

              <label className="form-field checkbox-field">
                <span>Estado</span>
                <label className="checkbox-row">
                  <input
                    checked={form.isActive}
                    disabled={!isEditing}
                    onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>{form.isActive ? "Activo" : "Inactivo"}</span>
                </label>
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? "Procesando..." : isEditing ? "Guardar cambios" : "Crear usuario"}
            </button>
            <button className="secondary-button" onClick={() => void Promise.all([fetchUsers(), fetchTeams()])} type="button">
              Refrescar lista
            </button>
          </div>
        </form>
      </section>

      <section className="panel users-team-admin-panel" id="users-team-admin" ref={teamSectionRef}>
        <div className="panel-header">
          <h2>Administracion de equipos</h2>
          <span>{teams.length} equipos</span>
        </div>

        {editingTeamId ? (
          <div className="editing-banner">
            Editando equipo <strong>{teams.find((team) => team.id === editingTeamId)?.label}</strong>. Guarda los cambios
            en este formulario o cancela la edicion.
          </div>
        ) : null}

        {teamsError ? <div className="message-banner message-error">{teamsError}</div> : null}

        {canManageTeams ? (
          <form className="users-team-form" onSubmit={handleTeamSave} ref={teamFormRef}>
            <label className="form-field">
              <span>Nombre del equipo</span>
              <input
                ref={teamNameInputRef}
                value={teamForm.label}
                onChange={(event) => setTeamForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Ej. Auditoria"
                maxLength={80}
                required
              />
            </label>
            <div className="form-field checkbox-field users-team-execution-field">
              <span>Espacio de Ejecucion</span>
              <label className="checkbox-row" htmlFor="users-team-execution-space-enabled">
                <input
                  id="users-team-execution-space-enabled"
                  checked={teamForm.executionSpaceEnabled}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, executionSpaceEnabled: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>{teamForm.executionSpaceEnabled ? "Crear o mostrar espacio" : "No crear / ocultar espacio"}</span>
              </label>
              <small>Al ocultarlo se conserva toda la informacion capturada.</small>
            </div>
            <div className="form-actions users-team-actions">
              <button className="primary-button" disabled={isSavingTeam} type="submit">
                {isSavingTeam ? "Procesando..." : editingTeamId ? "Guardar equipo" : "Crear equipo"}
              </button>
              {editingTeamId ? (
                <button className="secondary-button" onClick={resetTeamForm} type="button">
                  Cancelar edicion
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="editing-banner">
            Solo un superadmin puede crear, editar, borrar, reactivar o desactivar equipos y espacios de Ejecucion.
          </div>
        )}

        <div className="table-scroll users-team-table-scroll">
          <table className="data-table users-team-table">
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Clave</th>
                <th>Usuarios activos</th>
                <th>Ejecucion</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingTeams ? (
                <tr>
                  <td colSpan={6}>Cargando equipos...</td>
                </tr>
              ) : teams.length === 0 ? (
                <tr>
                  <td colSpan={6}>No hay equipos registrados.</td>
                </tr>
              ) : (
                teams.map((team) => (
                  <tr className={!team.isActive ? "user-row-inactive" : undefined} key={team.id}>
                    <td>
                      <strong>{team.label}</strong>
                    </td>
                    <td>{team.key}</td>
                    <td>{team.memberCount}</td>
                    <td>
                      <span className={`status-pill ${team.executionSpaceEnabled ? "status-live" : "status-migration"}`}>
                        {team.executionSpaceEnabled ? "Visible" : "Oculto"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${team.isActive ? "status-live" : "status-warning"}`}>
                        {team.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="secondary-button"
                          disabled={!canManageTeams || Boolean(teamActionId)}
                          onClick={() => handleTeamEditClick(team)}
                          type="button"
                        >
                          Editar
                        </button>
                        {team.isActive ? (
                          <button
                            className="danger-button"
                            disabled={!canManageTeams || Boolean(teamActionId)}
                            onClick={() => void handleDeactivateTeam(team)}
                            type="button"
                          >
                            {teamActionId === team.id ? "Procesando..." : "Desactivar"}
                          </button>
                        ) : (
                          <button
                            className="secondary-button"
                            disabled={!canManageTeams || Boolean(teamActionId)}
                            onClick={() => void handleReactivateTeam(team)}
                            type="button"
                          >
                            {teamActionId === team.id ? "Procesando..." : "Reactivar"}
                          </button>
                        )}
                        <button
                          className="danger-button"
                          disabled={!canManageTeams || Boolean(teamActionId)}
                          onClick={() => void handleDeleteTeam(team)}
                          title="Borrar permanentemente el equipo"
                          type="button"
                        >
                          {teamActionId === team.id ? "Procesando..." : "Borrar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Usuarios registrados</h2>
          <span>{rows.length} registros</span>
        </div>

        {fetchError ? <div className="message-banner message-error">{fetchError}</div> : null}

        <div className="table-scroll">
          <table className="data-table users-table">
            <thead>
              <tr>
                <th>Nombre completo</th>
                <th>Nombre de usuario en el sistema</th>
                <th>Correo electronico</th>
                <th>Nombre corto</th>
                <th>Tipo de acceso</th>
                <th>Tipo de usuario</th>
                <th>Expediente laboral</th>
                <th>Rol sistema</th>
                <th>Equipo principal</th>
                <th>Rol principal</th>
                <th>Segundo equipo</th>
                <th>Segundo rol</th>
                <th>Onboarding</th>
                <th>Ultimo acceso</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan={16}>Cargando usuarios...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={16}>No hay usuarios registrados.</td>
                </tr>
              ) : (
                rows.map((entry) => (
                  <tr className={!entry.isActive ? "user-row-inactive" : undefined} key={entry.id}>
                    <td>
                      <div className="user-identity">
                        <strong>{entry.displayName}</strong>
                      </div>
                    </td>
                    <td>{entry.username}</td>
                    <td>{entry.email}</td>
                    <td>{entry.shortName ?? "-"}</td>
                    <td>
                      <span className={`status-pill ${entry.legacyRole === "SUPERADMIN" ? "status-live" : "status-migration"}`}>
                        {getLegacyRoleLabel(entry.legacyRole)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${entry.isExternal ? "status-migration" : "status-live"}`}>
                        {entry.isExternal ? "Externo" : "Interno"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${entry.createLaborFile ? "status-live" : "status-migration"}`}>
                        {entry.createLaborFile ? "Si" : "No"}
                      </span>
                    </td>
                    <td>{getSystemRoleLabel(entry.role)}</td>
                    <td>{entry.legacyTeam ?? "-"}</td>
                    <td>{entry.specificRole ?? "-"}</td>
                    <td>{entry.secondaryLegacyTeam ?? "-"}</td>
                    <td>{entry.secondarySpecificRole ?? "-"}</td>
                    <td>
                      <span className={`status-pill ${entry.passwordResetRequired ? "status-warning" : "status-live"}`}>
                        {entry.passwordResetRequired ? "Pendiente" : "Listo"}
                      </span>
                    </td>
                    <td>{formatDateTime(entry.lastLoginAt)}</td>
                    <td>{formatDateTime(entry.createdAt)}</td>
                    <td>
                      <div className="table-actions">
                        <button className="secondary-button" onClick={() => handleEditClick(entry)} type="button">
                          Editar
                        </button>
                        <button
                          className="danger-button"
                          disabled={Boolean(deletingUserId) || entry.id === user?.id}
                          onClick={() => void handleDeleteTarget(entry)}
                          type="button"
                        >
                          {deletingUserId === entry.id ? "Procesando..." : "Borrar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="users-admin-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Datos operativos</h2>
            <span>Lista para SQL</span>
          </div>
          <div className="compatibility-list">
            <div className="compatibility-item">
              <strong>Nombre completo</strong>
              <span>Se guarda como nombre visible del usuario en los modulos del sistema.</span>
            </div>
            <div className="compatibility-item">
              <strong>Nombre de usuario en el sistema</strong>
              <span>Se usa como identificador operativo y para inicio de sesion.</span>
            </div>
            <div className="compatibility-item">
              <strong>short_name</strong>
              <span>Permanece disponible para modulos que asignan responsables por nombre corto.</span>
            </div>
            <div className="compatibility-item">
              <strong>team / specific_role</strong>
              <span>Se guardan como metadata persistida para sostener el modelo actual de permisos y asignaciones.</span>
            </div>
            <div className="compatibility-item">
              <strong>Onboarding seguro</strong>
              <span>Las cuentas pueden recibir enlaces de activacion y restablecimiento sin reutilizar contrasenas previas.</span>
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
