import { Navigate } from "react-router-dom";

import { getModuleById } from "../../config/modules";

interface ModulePlaceholderPageProps {
  moduleId: string;
}

export function ModulePlaceholderPage({ moduleId }: ModulePlaceholderPageProps) {
  const module = getModuleById(moduleId);

  if (!module) {
    return <Navigate to="/app" replace />;
  }

  return (
    <section className="page-stack">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            {module.icon}
          </span>
          <div>
            <h2>{module.label}</h2>
          </div>
        </div>
        <p className="muted">{module.description}</p>
      </header>

      <section className="module-status-grid">
        <article className="panel">
          <div className="panel-header">
            <h3>Estado actual</h3>
            <span className={`status-pill ${module.available ? "status-live" : "status-migration"}`}>{module.phase}</span>
          </div>
          <p className="muted">
            Este modulo ya forma parte del mapa de SIGE_2 y queda listo para reconstruirse sobre una arquitectura mas segura,
            desacoplada y escalable que la aplicacion legacy.
          </p>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>Alcance heredado</h3>
            <span>{module.coverage.length} frentes</span>
          </div>
          <div className="capability-list">
            {module.coverage.map((item) => (
              <span className="capability-pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}
