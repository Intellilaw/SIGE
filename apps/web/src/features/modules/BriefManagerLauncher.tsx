import { useEffect, useState } from "react";

const SSO_REDIRECT_PATH = "/api/v1/sso/brief-manager";

export function BriefManagerLauncher() {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHasError(true);
    }, 8000);

    try {
      window.location.assign(SSO_REDIRECT_PATH);
    } catch {
      setHasError(true);
    }

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section className="page-stack">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            {"\u270D\uFE0F"}
          </span>
          <div>
            <h2>Manager de escritos</h2>
          </div>
        </div>
        <p className="muted">
          {hasError
            ? "No fue posible iniciar la sesion en Manager de Escritos. Vuelve a intentarlo o contacta soporte."
            : "Conectando con Manager de Escritos..."}
        </p>
      </header>
    </section>
  );
}
