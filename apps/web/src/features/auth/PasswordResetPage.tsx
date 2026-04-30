import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { apiPost } from "../../api/http-client";
import { useAuth } from "./AuthContext";

interface PasswordResetVerification {
  email: string;
  displayName: string;
  expiresAt: string;
  passwordResetRequired: boolean;
}

const PASSWORD_REQUIREMENTS =
  "Usa al menos 10 caracteres, incluyendo mayuscula, minuscula, numero y simbolo.";

function formatExpiry(value: string) {
  return new Date(value).toLocaleString();
}

export function PasswordResetPage() {
  const { user, completePasswordReset } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [verification, setVerification] = useState<PasswordResetVerification | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("El enlace no contiene un token valido.");
      return;
    }

    setLoading(true);
    setError(null);

    apiPost<PasswordResetVerification>("/auth/password-resets/verify", { token })
      .then((payload) => setVerification(payload))
      .catch((caughtError) => {
        setVerification(null);
        setError(caughtError instanceof Error ? caughtError.message : "No fue posible validar el enlace.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (user) {
    return <Navigate to="/app" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No fue posible actualizar la contrasena.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card auth-support-card">
        <p className="eyebrow">Acceso protegido</p>
        <h1>{verification?.passwordResetRequired ? "Activar cuenta" : "Definir nueva contrasena"}</h1>
        <p className="muted">
          Este paso define tu nueva contrasena y abre una sesion nueva en SIGE.
        </p>
        <p className="login-back-link">
          <Link to="/intranet-login">Volver al acceso RC</Link>
        </p>

        {loading ? <div className="centered-inline-message">Validando enlace seguro...</div> : null}
        {!loading && error ? <div className="message-banner message-error">{error}</div> : null}

        {!loading && verification ? (
          <>
            <div className="reset-identity-card">
              <strong>{verification.displayName}</strong>
              <span>{verification.email}</span>
              <small>Expira: {formatExpiry(verification.expiresAt)}</small>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <label>
                Nueva contrasena
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={PASSWORD_REQUIREMENTS}
                  type="password"
                />
              </label>
              <label>
                Confirmar contrasena
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                />
              </label>
              <p className="muted password-hint">{PASSWORD_REQUIREMENTS}</p>
              {error ? <p className="error-text">{error}</p> : null}
              <button type="submit">{isSubmitting ? "Guardando..." : "Entrar a SIGE"}</button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
