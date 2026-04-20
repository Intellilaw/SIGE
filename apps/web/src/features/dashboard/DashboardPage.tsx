import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_VERSION_LABEL, type DashboardSummary } from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";
import { SummaryCard } from "../../components/SummaryCard";
import { appModules } from "../../config/modules";

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    apiGet<DashboardSummary>("/dashboard/summary").then(setSummary).catch(console.error);
  }, []);

  return (
    <section className="page-stack">
      <header className="hero hero-logo-only">
        <img className="rusconi-logo hero-logo-only-mark" src={rusconiLogo} alt="Rusconi Consulting" />
        <span className="app-version-badge hero-logo-version">{APP_VERSION_LABEL}</span>
      </header>

      <div className="summary-grid">
        <SummaryCard label="Clientes" value={summary?.clients ?? 0} accent="#d4a017" />
        <SummaryCard label="Cotizaciones" value={summary?.quotes ?? 0} accent="#0b7285" />
        <SummaryCard label="Leads" value={summary?.leads ?? 0} accent="#3f7d20" />
        <SummaryCard label="Asuntos activos" value={summary?.matters ?? 0} accent="#8f3b76" />
        <SummaryCard label="Tareas pendientes" value={summary?.pendingTasks ?? 0} accent="#c44536" />
      </div>

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
              <p>{module.description}</p>
              <span className="dashboard-module-link">{module.available ? "Abrir modulo" : "Ver alcance"}</span>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
