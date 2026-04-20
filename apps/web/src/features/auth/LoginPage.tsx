import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "./AuthContext";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";

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

export function LoginPage() {
  const { user, login } = useAuth();
  const [identifier, setIdentifier] = useState("director");
  const [password, setPassword] = useState("ChangeMe123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/app" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await login(identifier, password);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <img className="rusconi-logo login-brand-logo" src={rusconiLogo} alt="Rusconi Consulting" />
        </div>
        <p className="eyebrow">Rusconi Consulting</p>
        <h1>Intranet RC</h1>
        <p className="muted">
          Accede al entorno operativo de SIGE_2 para continuar con clientes, cotizaciones, leads, asuntos y tareas.
        </p>
        <p className="login-back-link">
          <Link to="/">Volver a la pantalla de entrada</Link>
        </p>
        <p className="login-support-link">
          <Link to="/intranet-password-help">Activar cuenta o restablecer contrasena</Link>
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Usuario o email
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} type="text" />
          </label>
          <label>
            Password
            <span className="password-input-wrap">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
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
          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit">Entrar a Rusconi Consulting</button>
        </form>
      </section>
    </main>
  );
}
