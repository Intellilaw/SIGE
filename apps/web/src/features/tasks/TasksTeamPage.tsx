import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { Client, Matter, TaskAdditionalTask, TaskTerm, TaskTrackingRecord } from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { EXECUTION_MODULE_BY_SLUG, getVisibleExecutionModules } from "../execution/execution-config";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID, type TaskDashboardMember } from "./task-dashboard-config";
import { LEGACY_TASK_MODULE_BY_ID } from "./task-legacy-config";

type DashboardTimeframe = "anteriores" | "hoy" | "manana" | "posteriores";

interface DashboardRow {
  taskId: string;
  clientNumber: string;
  clientName: string;
  subject: string;
  specificProcess: string;
  taskLabel: string;
  typeLabel: string;
  displayDate: string;
  originLabel: string;
  originPath: string;
  highlighted: boolean;
}

const TIMEFRAMES: Array<{ id: DashboardTimeframe; label: string; colorClass: string }> = [
  { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
  { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
  { id: "manana", label: "Tareas manana", colorClass: "is-tomorrow" },
  { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\/\s*/g, "/");
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function getLocalDateInput(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getEffectiveClientNumber(matter: Matter | undefined, clients: Client[]) {
  if (!matter) {
    return "";
  }

  const normalizedName = normalizeComparableText(matter.clientName);
  const match = clients.find((client) => normalizeComparableText(client.name) === normalizedName);
  return match?.clientNumber ?? normalizeText(matter.clientNumber);
}

function matchesResponsible(taskResponsible: string, member: TaskDashboardMember, sharedResponsibleAliases: string[]) {
  const normalizedResponsible = normalizeComparableText(taskResponsible);
  const memberAliases = member.aliases.map((alias) => normalizeComparableText(alias));
  const sharedAliases = sharedResponsibleAliases.map((alias) => normalizeComparableText(alias));

  return memberAliases.includes(normalizedResponsible) || sharedAliases.includes(normalizedResponsible);
}

function belongsToTimeframe(input: { state: "open" | "closed"; date: string }, timeframe: DashboardTimeframe) {
  const today = getLocalDateInput();
  const tomorrow = getLocalDateInput(1);

  if (timeframe === "anteriores") {
    return input.state === "closed";
  }

  if (input.state === "closed") {
    return false;
  }

  if (timeframe === "hoy") {
    return !input.date || input.date <= today;
  }

  if (timeframe === "manana") {
    return input.date === tomorrow;
  }

  return input.date > tomorrow;
}

function isVerificationComplete(term: TaskTerm) {
  const values = Object.values(term.verification);
  return values.length > 0 && values.every((value) => ["si", "sí", "yes"].includes(value.toLowerCase()));
}

export function TasksTeamPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const module = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const visibleModules = getVisibleExecutionModules(user);
  const dashboardConfig = module ? TASK_DASHBOARD_CONFIG_BY_MODULE_ID[module.moduleId] : undefined;
  const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;

  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [additionalTasks, setAdditionalTasks] = useState<TaskAdditionalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedView, setExpandedView] = useState<{ memberId: string; timeframe: DashboardTimeframe } | null>(null);

  const canAccess = Boolean(module && visibleModules.some((candidate) => candidate.moduleId === module.moduleId));

  useEffect(() => {
    if (!module || !canAccess) {
      return;
    }

    const currentModule = module;

    async function loadDashboard() {
      setLoading(true);

      try {
        const [loadedClients, loadedMatters, loadedTracking, loadedTerms, loadedAdditional] = await Promise.all([
          apiGet<Client[]>("/clients"),
          apiGet<Matter[]>("/matters"),
          apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${currentModule.moduleId}`),
          apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${currentModule.moduleId}`),
          apiGet<TaskAdditionalTask[]>(`/tasks/additional?moduleId=${currentModule.moduleId}`)
        ]);

        setClients(loadedClients);
        setMatters(loadedMatters.filter((matter) => matter.responsibleTeam === currentModule.team));
        setTrackingRecords(loadedTracking);
        setTerms(loadedTerms);
        setAdditionalTasks(loadedAdditional);
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [canAccess, module]);

  const matterLookup = useMemo(() => {
    const map = new Map<string, Matter>();
    matters.forEach((matter) => {
      const keys = [normalizeText(matter.id), normalizeText(matter.matterNumber)].filter(Boolean);
      keys.forEach((key) => map.set(key, matter));
    });
    return map;
  }, [matters]);

  const tableLookup = useMemo(
    () => new Map(legacyConfig?.tables.map((table) => [table.slug, table]) ?? []),
    [legacyConfig]
  );

  function buildTrackingRows(member: TaskDashboardMember, timeframe: DashboardTimeframe): DashboardRow[] {
    return trackingRecords
      .filter((record) => matchesResponsible(record.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? []))
      .filter((record) =>
        belongsToTimeframe({
          state: record.status === "presentado" ? "closed" : "open",
          date: toDateInput(record.dueDate || record.termDate)
        }, timeframe)
      )
      .map((record) => {
        const table = tableLookup.get(record.tableCode);
        const dueDate = toDateInput(record.dueDate || record.termDate);
        const highlighted = record.status !== "presentado" && (!record.taskName || !record.responsible || (table?.showDateColumn !== false && !dueDate) || Boolean(dueDate && dueDate <= getLocalDateInput()));

        return {
          taskId: `tracking-${record.id}`,
          clientNumber: record.clientNumber || "-",
          clientName: record.clientName || "-",
          subject: record.subject || "-",
          specificProcess: record.specificProcess || "-",
          taskLabel: record.taskName || record.eventName || table?.title || "Tarea",
          typeLabel: record.status === "presentado" ? "Completada" : table?.autoTerm ? "Termino / seguimiento" : highlighted ? "Vencida / incompleta" : "Seguimiento",
          displayDate: record.status === "presentado" ? toDateInput(record.completedAt || record.updatedAt) : dueDate,
          originLabel: table?.title ?? record.sourceTable,
          originPath: `/app/tasks/${slug}/${record.tableCode}`,
          highlighted
        };
      });
  }

  function buildTermRows(member: TaskDashboardMember, timeframe: DashboardTimeframe): DashboardRow[] {
    return terms
      .filter((term) => !term.sourceRecordId)
      .filter((term) => matchesResponsible(term.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? []))
      .filter((term) =>
        belongsToTimeframe({
          state: term.status === "concluida" || term.status === "presentado" ? "closed" : "open",
          date: toDateInput(term.termDate || term.dueDate)
        }, timeframe)
      )
      .map((term) => {
        const dueDate = toDateInput(term.termDate || term.dueDate);
        const completed = term.status === "concluida" || term.status === "presentado";
        const highlighted = !completed && (!term.responsible || !dueDate || dueDate <= getLocalDateInput() || !isVerificationComplete(term));

        return {
          taskId: `term-${term.id}`,
          clientNumber: term.clientNumber || "-",
          clientName: term.clientName || "-",
          subject: term.subject || "-",
          specificProcess: term.specificProcess || "-",
          taskLabel: `${term.recurring ? "[Recurrente] " : ""}${term.eventName}`,
          typeLabel: "Termino",
          displayDate: dueDate,
          originLabel: term.recurring ? "Terminos recurrentes" : "Terminos",
          originPath: `/app/tasks/${slug}/${term.recurring ? "terminos-recurrentes" : "terminos"}`,
          highlighted
        };
      });
  }

  function buildAdditionalRows(member: TaskDashboardMember, timeframe: DashboardTimeframe): DashboardRow[] {
    return additionalTasks
      .filter((task) =>
        matchesResponsible(task.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? []) ||
        matchesResponsible(task.responsible2 ?? "", member, dashboardConfig?.sharedResponsibleAliases ?? [])
      )
      .filter((task) =>
        belongsToTimeframe({
          state: task.status === "concluida" ? "closed" : "open",
          date: toDateInput(task.dueDate)
        }, timeframe)
      )
      .map((task) => {
        const dueDate = toDateInput(task.dueDate);
        const highlighted = task.status !== "concluida" && (!task.task || !task.responsible || !dueDate || dueDate < getLocalDateInput());

        return {
          taskId: `additional-${task.id}`,
          clientNumber: "-",
          clientName: "-",
          subject: "-",
          specificProcess: "-",
          taskLabel: task.task,
          typeLabel: task.status === "concluida" ? "Completada" : "Tarea adicional",
          displayDate: dueDate,
          originLabel: "Tareas adicionales",
          originPath: `/app/tasks/${slug}/adicionales`,
          highlighted
        };
      });
  }

  function buildRows(member: TaskDashboardMember, timeframe: DashboardTimeframe) {
    return [
      ...buildTrackingRows(member, timeframe),
      ...buildTermRows(member, timeframe),
      ...buildAdditionalRows(member, timeframe)
    ].sort((left, right) => left.displayDate.localeCompare(right.displayDate));
  }

  if (!module || !canAccess || !legacyConfig) {
    return <Navigate to="/app/tasks" replace />;
  }

  return (
    <section className="page-stack tasks-team-page">
      <header className="hero module-hero">
        <div className="execution-page-topline">
          <button type="button" className="secondary-button" onClick={() => navigate("/app/tasks")}>
            Volver
          </button>
          <div className="module-hero-head">
            <span className="module-hero-icon" aria-hidden="true" style={{ color: module.color }}>
              {module.icon}
            </span>
            <div>
              <h2>{module.label}</h2>
            </div>
          </div>
        </div>
        <p className="muted">
          Modulo de tareas separado por equipo: distribuidor, tablas de seguimiento, terminos y tareas adicionales.
        </p>
        <div className="tasks-legacy-toolbar">
          <button type="button" className="primary-action-button" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/distribuidor`)}>
            Distribuidor de tareas
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/terminos`)}>
            Terminos
          </button>
          {legacyConfig.hasRecurringTerms ? (
            <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/terminos-recurrentes`)}>
              Terminos recurrentes
            </button>
          ) : null}
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/adicionales`)}>
            Tareas adicionales
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Vista diaria del equipo</h2>
          <span>{dashboardConfig?.members.length ?? 0} integrantes</span>
        </div>
        <p className="muted tasks-team-board-copy">
          Cada integrante conserva sus ventanas de trabajo: realizadas, hoy, manana y posteriores. El rojo indica
          faltantes, terminos sin verificacion o fechas vencidas.
        </p>

        <div className="tasks-team-member-list">
          {(dashboardConfig?.members ?? []).map((member) => {
            const isExpanded = expandedView?.memberId === member.id;
            const rows = isExpanded && expandedView ? buildRows(member, expandedView.timeframe) : [];

            return (
              <article key={member.id} className="tasks-team-member-card">
                <div className="tasks-team-member-head">
                  <h3>{member.name}</h3>
                  <span>{member.id}</span>
                </div>

                <div className="tasks-team-timeframes">
                  {TIMEFRAMES.map((timeframe) => {
                    const isActive = expandedView?.memberId === member.id && expandedView.timeframe === timeframe.id;

                    return (
                      <button
                        key={timeframe.id}
                        type="button"
                        className={`tasks-team-timeframe-button ${timeframe.colorClass} ${isActive ? "is-active" : ""}`}
                        onClick={() =>
                          setExpandedView((current) =>
                            current?.memberId === member.id && current?.timeframe === timeframe.id
                              ? null
                              : { memberId: member.id, timeframe: timeframe.id }
                          )
                        }
                      >
                        {timeframe.label}
                      </button>
                    );
                  })}
                </div>

                {isExpanded && expandedView ? (
                  <div className="tasks-team-timeframe-panel">
                    <div className="panel-header">
                      <h3>{TIMEFRAMES.find((timeframe) => timeframe.id === expandedView.timeframe)?.label ?? "Detalle"}</h3>
                      <span>{rows.length} tareas</span>
                    </div>

                    <div className="table-scroll">
                      <table className="data-table tasks-dashboard-table">
                        <thead>
                          <tr>
                            <th>No. Cliente</th>
                            <th>Cliente</th>
                            <th>Asunto</th>
                            <th>Proceso especifico</th>
                            <th>Tarea</th>
                            <th>Tipo</th>
                            <th>Fecha</th>
                            <th>Tabla de Origen</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan={9} className="centered-inline-message">
                                Cargando tareas...
                              </td>
                            </tr>
                          ) : rows.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="centered-inline-message">
                                No hay tareas en esta categoria.
                              </td>
                            </tr>
                          ) : (
                            rows.map((row) => (
                              <tr key={row.taskId} className={row.highlighted ? "tasks-dashboard-row-overdue" : undefined}>
                                <td>{row.clientNumber || "-"}</td>
                                <td>{row.clientName}</td>
                                <td>{row.subject}</td>
                                <td>{row.specificProcess}</td>
                                <td className={row.highlighted ? "tasks-dashboard-title-overdue" : undefined}>{row.taskLabel}</td>
                                <td>
                                  <span className={`tasks-dashboard-type-pill ${row.typeLabel === "Completada" ? "is-completed" : row.highlighted ? "is-overdue" : "is-pending"}`}>
                                    {row.typeLabel}
                                  </span>
                                </td>
                                <td>{row.displayDate || "-"}</td>
                                <td>{row.originLabel}</td>
                                <td>
                                  <button type="button" className="secondary-button matter-inline-button" onClick={() => navigate(row.originPath)}>
                                    Ir a tabla
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Tablas de seguimiento</h2>
          <span>{legacyConfig.tables.length} tablas</span>
        </div>
        <div className="tasks-table-card-grid">
          {legacyConfig.tables.map((table) => (
            <button key={table.slug} type="button" className="tasks-table-card" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/${table.slug}`)}>
              <strong>{table.title}</strong>
              <span>{table.sourceTable}</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
