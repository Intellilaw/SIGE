import { Link } from "react-router-dom";

import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
import { getVisibleAppModules } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { useModuleAvailability } from "../modules/ModuleAvailabilityContext";
import { openBriefManagerWindow, reportBriefManagerOpenError } from "../modules/openBriefManagerWindow";

export function DashboardPage() {
  const { user } = useAuth();
  const { disabledModuleIds } = useModuleAvailability();
  const visibleModules = getVisibleAppModules(user, disabledModuleIds);

  const handleOpenBriefManager = () => {
    void openBriefManagerWindow().catch(reportBriefManagerOpenError);
  };

  return (
    <section className="page-stack dashboard-page">
      <header className="hero hero-logo-only">
        <img className="rusconi-logo hero-logo-only-mark" src={rusconiLogo} alt="Rusconi Consulting" />
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Modulos del sistema</h2>
          <span>{visibleModules.length} modulos</span>
        </div>
        <div className="dashboard-module-grid">
          {visibleModules.map((module) => {
            const moduleContent = (
              <>
                <div className="dashboard-module-topline">
                  <span className="dashboard-module-icon" aria-hidden="true">
                    {module.icon}
                  </span>
                  <span className={`status-pill ${module.available ? "status-live" : "status-migration"}`}>{module.phase}</span>
                </div>
                <h3>{module.label}</h3>
                <span className="dashboard-module-link">{module.available ? "Abrir modulo" : "Ver alcance"}</span>
              </>
            );

            if (module.id === "brief-manager") {
              return (
                <button
                  key={module.id}
                  type="button"
                  className={`dashboard-module-card dashboard-module-card-button ${module.available ? "is-live" : "is-migration"}`}
                  onClick={handleOpenBriefManager}
                >
                  {moduleContent}
                </button>
              );
            }

            return (
              <Link
                key={module.id}
                to={module.path}
                className={`dashboard-module-card ${module.available ? "is-live" : "is-migration"}`}
              >
                {moduleContent}
              </Link>
            );
          })}
        </div>
      </section>
    </section>
  );
}
