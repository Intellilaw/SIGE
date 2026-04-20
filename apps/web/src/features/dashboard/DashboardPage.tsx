import { Link } from "react-router-dom";
import { APP_VERSION_LABEL } from "@sige/contracts";

import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
import { appModules } from "../../config/modules";

export function DashboardPage() {
  return (
    <section className="page-stack dashboard-page">
      <header className="hero hero-logo-only">
        <img className="rusconi-logo hero-logo-only-mark" src={rusconiLogo} alt="Rusconi Consulting" />
        <span className="app-version-badge hero-logo-version">{APP_VERSION_LABEL}</span>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Modulos del sistema</h2>
          <span>{appModules.length} modulos</span>
        </div>
        <div className="dashboard-module-grid">
          {appModules.map((module) => (
            <Link
              key={module.id}
              to={module.path}
              className={`dashboard-module-card ${module.available ? "is-live" : "is-migration"}`}
            >
              <div className="dashboard-module-topline">
                <span className="dashboard-module-icon" aria-hidden="true">
                  {module.icon}
                </span>
                <span className={`status-pill ${module.available ? "status-live" : "status-migration"}`}>{module.phase}</span>
              </div>
              <h3>{module.label}</h3>
              <span className="dashboard-module-link">{module.available ? "Abrir modulo" : "Ver alcance"}</span>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
