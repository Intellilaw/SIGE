import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import type { TaskTerm } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function todayInput() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isYes(value?: string) {
  return ["si", "sí", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function TaskTermsPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
  const recurrentMode = location.pathname.endsWith("/terminos-recurrentes");
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTerms() {
    if (!moduleConfig) {
      return;
    }

    setLoading(true);
    try {
      const loaded = await apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${moduleConfig.moduleId}`);
      setTerms(loaded);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTerms();
  }, [moduleConfig]);

  const visibleTerms = useMemo(
    () => terms.filter((term) => term.recurring === recurrentMode),
    [recurrentMode, terms]
  );

  async function patchTerm(term: TaskTerm, patch: Partial<TaskTerm> & Record<string, unknown>) {
    const updated = await apiPatch<TaskTerm>(`/tasks/terms/${term.id}`, patch);
    setTerms((current) => current.map((candidate) => candidate.id === term.id ? updated : candidate));
  }

  async function addTerm() {
    if (!moduleConfig) {
      return;
    }

    const verification = Object.fromEntries(moduleConfig.verificationColumns.map((column) => [column.key, "No"]));
    const created = await apiPost<TaskTerm>("/tasks/terms", {
      moduleId: moduleConfig.moduleId,
      eventName: recurrentMode ? "Termino recurrente" : "Termino",
      responsible: moduleConfig.defaultResponsible,
      dueDate: todayInput(),
      termDate: todayInput(),
      status: "pendiente",
      recurring: recurrentMode,
      verification
    });
    setTerms((current) => [created, ...current]);
  }

  async function deleteTerm(term: TaskTerm) {
    await apiDelete(`/tasks/terms/${term.id}`);
    setTerms((current) => current.filter((candidate) => candidate.id !== term.id));
  }

  if (!moduleConfig) {
    return <Navigate to="/app/tasks" replace />;
  }

  return (
    <section className="page-stack tasks-legacy-page">
      <header className="hero module-hero">
        <div className="execution-page-topline">
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}`)}>
            Volver al dashboard
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`)}>
            Abrir distribuidor
          </button>
        </div>
        <h2>{recurrentMode ? "Terminos recurrentes" : "Terminos"} ({moduleConfig.label})</h2>
        <p className="muted">
          Tabla maestra de terminos. La fila queda en rojo si falta responsable, falta fecha limite,
          la fecha esta vencida o falta alguna verificacion.
        </p>
      </header>

      <section className="panel">
        <div className="tasks-legacy-toolbar">
          <button type="button" className="primary-action-button" onClick={addTerm}>
            Agregar termino
          </button>
          {moduleConfig.hasRecurringTerms && !recurrentMode ? (
            <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/terminos-recurrentes`)}>
              Ver terminos recurrentes
            </button>
          ) : null}
        </div>

        <div className="table-scroll tasks-legacy-table-wrap">
          <table className="data-table tasks-legacy-table tasks-terms-table">
            <thead>
              <tr>
                <th>No. Cliente</th>
                <th>Cliente</th>
                <th>Asunto</th>
                <th>Proceso especifico</th>
                <th>ID Asunto</th>
                <th>{moduleConfig.termEventLabel}</th>
                <th>Responsable</th>
                <th>Fecha Presentar</th>
                <th>{moduleConfig.termDateLabel}</th>
                {moduleConfig.verificationColumns.map((column) => <th key={column.key}>{column.label}</th>)}
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="centered-inline-message">Cargando terminos...</td>
                </tr>
              ) : visibleTerms.length === 0 ? (
                <tr>
                  <td colSpan={12} className="centered-inline-message">No hay terminos en esta seccion.</td>
                </tr>
              ) : (
                visibleTerms.map((term) => {
                  const missingVerification = moduleConfig.verificationColumns.some((column) => !isYes(term.verification[column.key]));
                  const date = toDateInput(term.termDate || term.dueDate);
                  const red = term.status !== "concluida" && (!term.responsible || !date || date <= todayInput() || missingVerification);
                  const green = !red && moduleConfig.verificationColumns.every((column) => isYes(term.verification[column.key]));

                  return (
                    <tr key={term.id} className={red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined}>
                      <td>{term.clientNumber || "-"}</td>
                      <td>{term.clientName || "-"}</td>
                      <td>{term.subject || "-"}</td>
                      <td><span className="tasks-legacy-process-pill">{term.specificProcess || "N/A"}</span></td>
                      <td>{term.matterIdentifier || term.matterNumber || "-"}</td>
                      <td>
                        <textarea
                          className="tasks-legacy-textarea"
                          value={`${term.recurring ? "[Recurrente] " : ""}${term.eventName}`}
                          onChange={(event) => void patchTerm(term, { eventName: event.target.value.replace("[Recurrente] ", "") })}
                        />
                      </td>
                      <td>
                        <input
                          className="tasks-legacy-input"
                          value={term.responsible}
                          onChange={(event) => void patchTerm(term, { responsible: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="tasks-legacy-input"
                          type="date"
                          value={toDateInput(term.dueDate)}
                          onChange={(event) => void patchTerm(term, { dueDate: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="tasks-legacy-input"
                          type="date"
                          value={toDateInput(term.termDate || term.dueDate)}
                          onChange={(event) => void patchTerm(term, { termDate: event.target.value })}
                        />
                      </td>
                      {moduleConfig.verificationColumns.map((column) => (
                        <td key={column.key}>
                          <select
                            className="tasks-legacy-input"
                            value={term.verification[column.key] ?? "No"}
                            onChange={(event) =>
                              void patchTerm(term, {
                                verification: {
                                  ...term.verification,
                                  [column.key]: event.target.value
                                }
                              })
                            }
                          >
                            <option value="No">No</option>
                            <option value="Si">Si</option>
                          </select>
                        </td>
                      ))}
                      <td>
                        <div className="tasks-legacy-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void patchTerm(term, { status: term.status === "concluida" ? "pendiente" : "concluida" })}
                          >
                            {term.status === "concluida" ? "Reabrir" : "Concluir"}
                          </button>
                          <button type="button" className="danger-button" onClick={() => void deleteTerm(term)}>
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
