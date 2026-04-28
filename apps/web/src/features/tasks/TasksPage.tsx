import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { getVisibleExecutionModules } from "../execution/execution-config";

export function TasksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const visibleModules = getVisibleExecutionModules(user);

  if (visibleModules.length === 1 && user?.team !== "CLIENT_RELATIONS" && user?.team !== "ADMIN" && user?.role !== "SUPERADMIN") {
    return <Navigate to={`/app/tasks/${visibleModules[0].slug}`} replace />;
  }

  if (visibleModules.length === 0) {
    return (
      <section className="page-stack">
        <header className="hero module-hero">
          <div className="module-hero-head">
            <span className="module-hero-icon" aria-hidden="true">
              T
            </span>
            <div>
              <h2>Tareas</h2>
            </div>
          </div>
          <p className="muted">Tu equipo actual no tiene acceso a este modulo.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            T
          </span>
          <div>
            <h2>Tareas</h2>
          </div>
        </div>
        <p className="muted">
          Operacion por equipo con vista diaria por integrante, tablero de seguimiento e historial con resaltado rojo
          cuando falta informacion o hay vencimientos.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Equipos</h2>
          <span>{visibleModules.length} modulos</span>
        </div>

        <div className="execution-module-grid">
          {visibleModules.map((module) => (
            <button
              key={module.moduleId}
              type="button"
              className="execution-module-card"
              onClick={() => navigate(`/app/tasks/${module.slug}`)}
            >
              <span className="execution-module-icon" style={{ color: module.color }}>
                {module.icon}
              </span>
              <strong>{module.label}</strong>
              <p>{module.description}</p>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
