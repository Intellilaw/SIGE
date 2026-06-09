import { useMemo, useState, type FormEvent } from "react";

import { getModuleById } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

const PASSWORD_REQUIREMENTS =
  "Usa al menos 10 caracteres, incluyendo mayuscula, minuscula, numero y simbolo.";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

function getRoleLabel(role?: string, legacyRole?: string) {
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

function hasStrongPasswordShape(password: string) {
  const value = password.trim();
  return value.length >= 10
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

export function MyAccountPage() {
  const { user, changePassword } = useAuth();
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [flash, setFlash] = useState<FlashState>(null);
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

  function updatePasswordField(field: keyof PasswordFormState, value: string) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
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
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="page-stack my-account-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            {module?.icon ?? "\u{1F510}"}
          </span>
          <div>
            <h2>Mi cuenta</h2>
          </div>
        </div>
        <p className="muted">{module?.description}</p>
      </header>

      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}

      <section className="my-account-grid">
        <article className="panel my-account-profile-panel">
          <div className="panel-header">
            <h2>Datos de cuenta</h2>
            <span className={`status-pill ${user.isActive ? "status-live" : "status-warning"}`}>
              {user.isActive ? "Activa" : "Inactiva"}
            </span>
          </div>

          <div className="my-account-identity">
            <strong>{user.displayName || user.username}</strong>
            <span>{user.email}</span>
          </div>

          <dl className="my-account-detail-list">
            {accountRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="panel my-account-security-panel">
          <div className="panel-header">
            <h2>Contrasena</h2>
            <span>Sesion actual</span>
          </div>

          <form className="my-account-password-form" onSubmit={handlePasswordSubmit}>
            <label className="form-field">
              <span>Contrasena actual</span>
              <input
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(event) => updatePasswordField("currentPassword", event.target.value)}
                type="password"
                required
              />
            </label>

            <label className="form-field">
              <span>Nueva contrasena</span>
              <input
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(event) => updatePasswordField("newPassword", event.target.value)}
                placeholder="Minimo 10 caracteres con simbolo"
                type="password"
                required
              />
            </label>

            <label className="form-field">
              <span>Confirmar nueva contrasena</span>
              <input
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(event) => updatePasswordField("confirmPassword", event.target.value)}
                type="password"
                required
              />
            </label>

            <p className="muted password-hint">{PASSWORD_REQUIREMENTS}</p>

            <div className="form-actions">
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Guardando..." : "Cambiar contrasena"}
              </button>
            </div>
          </form>
        </article>
      </section>
    </section>
  );
}
