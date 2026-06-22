import { Link } from "react-router-dom";

import intellilawLogo from "../../assets/intellilaw-logo.svg";
import legalFlowLogo from "../../assets/legalflow-logo.svg";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
import { getVisibleAppModules } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { useModuleAvailability } from "../modules/ModuleAvailabilityContext";

function getOrganizationLogo(slug?: string) {
  if (slug === "intellilaw") {
    return intellilawLogo;
  }

  if (slug === "legalflow") {
    return legalFlowLogo;
  }

  return rusconiLogo;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { disabledModuleIds } = useModuleAvailability();
  const visibleModules = getVisibleAppModules(user, disabledModuleIds);
  const organizationLogo = getOrganizationLogo(user?.organizationSlug);
  const organizationLogoClassName = `${user?.organizationSlug === "rusconi-consulting" ? "rusconi-logo " : ""}hero-logo-only-mark`;

  return (
    <section className="page-stack dashboard-page">
      <header className="hero hero-logo-only">
        <img className={organizationLogoClassName} src={organizationLogo} alt={user?.organizationName ?? "SIGE"} />
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Modulos del sistema</h2>
          <span>{visibleModules.length} modulos</span>
        </div>
        <div className="dashboard-module-grid">
          {visibleModules.map((module) => (
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
