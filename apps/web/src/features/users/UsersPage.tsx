import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SPECIFIC_ROLE_OPTIONS, TEAM_OPTIONS, type ManagedUser } from "@sige/contracts";

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
  username: string;
  password: string;
  shortName: string;
  legacyTeam: string;
  specificRole: string;
  isActive: boolean;
}

const EMPTY_FORM: UserFormState = {
  username: "",
  password: "",
  shortName: "",
  legacyTeam: "",
  specificRole: "",
  isActive: true
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

export function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);

  const canManageUsers = Boolean(user?.permissions.includes("*") || user?.permissions.includes("users:manage"));

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

  useEffect(() => {
    if (!canManageUsers) {
      setLoadingUsers(false);
      return;
    }

    void fetchUsers();
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

  function resetForm() {
    setIsEditing(false);
    setEditingUserId(null);
    setShowPassword(false);
    setForm(EMPTY_FORM);
  }

  function handleEditClick(target: ManagedUser) {
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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
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
        await apiPatch<ManagedUser>(`/users/${editingUserId}`, {
          password: trimmedPassword || undefined,
          shortName: form.shortName.trim() || null,
          legacyTeam: form.legacyTeam || null,
          specificRole: form.specificRole || null,
          isActive: form.isActive
        });
        setFlash({ tone: "success", text: "Usuario actualizado correctamente." });
      } else {
        await apiPost<ManagedUser>("/users", {
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
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteTarget(target: ManagedUser) {
    setFlash(null);

    if (target.id === user?.id) {
      setFlash({ tone: "error", text: "No puedes dar de baja la sesion administrativa activa." });
      return;
    }

    if (!window.confirm(`Seguro que deseas dar de baja al usuario ${target.username}?`)) {
      return;
    }

    setDeletingUserId(target.id);

    try {
      await apiDelete(`/users/${target.id}`);
      setFlash({ tone: "success", text: `Usuario ${target.username} dado de baja correctamente.` });
      if (editingUserId === target.id) {
        resetForm();
      }
      await fetchUsers();
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
            <span>Acceso operativo y permisos</span>
          )}
        </div>

        {isEditing ? (
          <div className="editing-banner">
            Editando a <strong>{rows.find((entry) => entry.id === editingUserId)?.username}</strong>. Puedes cambiar la
            contrasena aqui o dejarla en blanco para conservar la actual.
          </div>
        ) : null}

        <form className="users-form" onSubmit={handleSave}>
          <div className="users-form-grid">
            <label className="form-field">
              <span>Username (nombre y primer apellido)</span>
              <input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Ej. Eduardo Rusconi"
                disabled={isEditing}
                required={!isEditing}
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
            <label className="form-field">
              <span>Equipo</span>
              <select
                value={form.legacyTeam}
                onChange={(event) => setForm((current) => ({ ...current, legacyTeam: event.target.value }))}
              >
                <option value="">-- Seleccionar equipo --</option>
                {TEAM_OPTIONS.map((team) => (
                  <option key={team.key} value={team.label}>
                    {team.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Rol especifico</span>
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

          <div className="form-actions">
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? "Procesando..." : isEditing ? "Guardar cambios" : "Crear usuario"}
            </button>
            <button className="secondary-button" onClick={fetchUsers} type="button">
              Refrescar lista
            </button>
          </div>
        </form>
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
                <th>Usuario</th>
                <th>Nombre corto</th>
                <th>Tipo de acceso</th>
                <th>Rol sistema</th>
                <th>Equipo</th>
                <th>Rol especifico</th>
                <th>Onboarding</th>
                <th>Ultimo acceso</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan={10}>Cargando usuarios...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10}>No hay usuarios registrados.</td>
                </tr>
              ) : (
                rows.map((entry) => (
                  <tr className={!entry.isActive ? "user-row-inactive" : undefined} key={entry.id}>
                    <td>
                      <div className="user-identity">
                        <strong>{entry.username}</strong>
                      </div>
                    </td>
                    <td>{entry.shortName ?? "-"}</td>
                    <td>
                      <span className={`status-pill ${entry.legacyRole === "SUPERADMIN" ? "status-live" : "status-migration"}`}>
                        {getLegacyRoleLabel(entry.legacyRole)}
                      </span>
                    </td>
                    <td>{getSystemRoleLabel(entry.role)}</td>
                    <td>{entry.legacyTeam ?? "-"}</td>
                    <td>{entry.specificRole ?? "-"}</td>
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
                          {deletingUserId === entry.id ? "Procesando..." : "Dar de baja"}
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
              <strong>Username</strong>
              <span>Se guarda en formato nombre y primer apellido para que sea legible en la operacion diaria.</span>
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
