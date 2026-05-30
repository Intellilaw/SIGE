import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { TaskModuleDefinition } from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { buildExecutionModuleDescriptors } from "./execution-config";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudieron cargar los equipos de Ejecucion.";
}

export function ExecutionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [taskModules, setTaskModules] = useState<TaskModuleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visibleModules = useMemo(() => buildExecutionModuleDescriptors(taskModules), [taskModules]);
  const canViewIndex = Boolean(user?.permissions?.includes("*") || user?.team === "CLIENT_RELATIONS" || user?.team === "ADMIN" || user?.role === "SUPERADMIN");

  useEffect(() => {
    let active = true;

    async function loadModules() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const loadedModules = await apiGet<TaskModuleDefinition[]>("/tasks/modules");
        if (active) {
          setTaskModules(loadedModules);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadModules();

    return () => {
      active = false;
    };
  }, []);

  if (!loading && visibleModules.length === 1 && !canViewIndex) {
    return <Navigate to={`/app/execution/${visibleModules[0].slug}`} replace />;
  }

  if (!loading && visibleModules.length === 0 && !errorMessage) {
    return (
      <section className="page-stack">
        <header className="hero module-hero">
          <div className="module-hero-head">
            <span className="module-hero-icon" aria-hidden="true">
              ⚙️
            </span>
            <div>
              <h2>Ejecucion</h2>
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
            ⚙️
          </span>
          <div>
            <h2>Ejecucion</h2>
          </div>
        </div>
        <p className="muted">
          Operacion por equipo con tablero separado y visibilidad de siguientes tareas, con resaltado en rojo cuando
          falta informacion o hay vencimientos.
        </p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Equipos</h2>
          <span>{loading ? "Cargando" : `${visibleModules.length} modulos`}</span>
        </div>

        <div className="execution-module-grid">
          {visibleModules.map((module) => (
            <button
              key={module.moduleId}
              type="button"
              className="execution-module-card"
              onClick={() => navigate(`/app/execution/${module.slug}`)}
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
