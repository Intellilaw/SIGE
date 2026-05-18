import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiGet } from "../../api/http-client";

interface BriefManagerSsoResponse {
  redirectUrl: string;
  expiresAt: string;
}

export function BriefManagerRedirectPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiGet<BriefManagerSsoResponse>("/auth/sso/manager-de-escritos")
      .then((response) => {
        if (!cancelled) {
          window.location.replace(response.redirectUrl);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return;
        }

        setError(reason instanceof Error ? reason.message : "No se pudo abrir Manager de escritos.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="page-stack">
        <header className="hero module-hero">
          <div className="module-hero-head">
            <span className="module-hero-icon" aria-hidden="true">
              &#9997;
            </span>
            <div>
              <h2>Manager de escritos</h2>
            </div>
          </div>
          <p className="muted">{error}</p>
        </header>

        <section className="panel">
          <div className="tasks-legacy-toolbar">
            <button type="button" className="primary-action-button" onClick={() => window.location.reload()}>
              Reintentar
            </button>
            <Link className="secondary-button" to="/app">
              Volver al menu
            </Link>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            &#9997;
          </span>
          <div>
            <h2>Manager de escritos</h2>
          </div>
        </div>
        <p className="muted">Redirigiendo a Manager de escritos...</p>
      </header>
    </section>
  );
}
