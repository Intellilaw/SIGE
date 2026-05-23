import { useEffect, useState } from "react";

import { apiGet } from "../../api/http-client";

const localManagerUrl = import.meta.env.VITE_MANAGER_DE_ESCRITOS_URL ?? "http://localhost:8080";

interface ManagerSsoResponse {
  redirectUrl: string;
  expiresAt: string;
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function ManagerSsoBridgePage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (isLocalHost(window.location.hostname)) {
      window.location.replace(`${localManagerUrl.replace(/\/$/, "")}/?fromSige=1`);
      return () => {
        isMounted = false;
      };
    }

    apiGet<ManagerSsoResponse>("/auth/sso/manager-de-escritos")
      .then((payload) => {
        if (isMounted) {
          window.location.replace(payload.redirectUrl);
        }
      })
      .catch((caughtError) => {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "No se pudo abrir el Manager de Escritos.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="login-page">
      <section className="login-card auth-support-card">
        <p className="eyebrow">SIGE</p>
        <h1>Abriendo Manager de Escritos</h1>
        <p className="muted">Preparando acceso seguro.</p>
        {error ? <div className="message-banner message-error">{error}</div> : null}
      </section>
    </main>
  );
}
