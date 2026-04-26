import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth, type PasswordResetRequestResponse } from "./AuthContext";

function formatExpiry(value?: string) {
  return value ? new Date(value).toLocaleString() : null;
}

export function PasswordAssistancePage() {
  const { user, requestPasswordReset } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [result, setResult] = useState<PasswordResetRequestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/app" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset(identifier);
      setResult(response);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No fue posible procesar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card auth-support-card">
        <p className="eyebrow">Onboarding seguro</p>
        <h1>Activar o restablecer contrasena</h1>
        <p className="muted">
          Si tu cuenta fue migrada desde Intranet o perdiste acceso, escribe tu usuario o correo. SIGE_2 generara el
          flujo seguro definido para el ambiente actual sin reutilizar contrasenas legacy.
        </p>
        <p className="login-back-link">
          <Link to="/intranet-login">Volver al acceso RC</Link>
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Usuario o email
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="ej. alejandra.mejia o alejandra.mejia@calculadora.app"
              type="text"
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit">{isSubmitting ? "Generando..." : "Solicitar enlace seguro"}</button>
        </form>

        {result ? (
          <div className="auth-support-result">
            <div className="message-banner message-success">{result.message}</div>
            {result.deliveryMode === "development-preview" && result.resetUrl ? (
              <div className="link-preview-card">
                <p className="eyebrow">Vista previa local</p>
                <h2>Enlace listo para usar</h2>
                <p className="muted">
                  Este enlace solo aparece cuando el backend fue configurado explicitamente para exponer previews de
                  desarrollo. En AWS debe permanecer desactivado.
                </p>
                <a className="preview-link" href={result.resetUrl}>
                  Abrir flujo de activacion
                </a>
                <code>{result.resetUrl}</code>
                {formatExpiry(result.expiresAt) ? (
                  <p className="muted">Expira: {formatExpiry(result.expiresAt)}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
