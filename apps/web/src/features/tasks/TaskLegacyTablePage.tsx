import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { TaskTrackingRecord } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import {
  getAdjacentLegacyTaskTable,
  getLegacyTaskTable,
  LEGACY_TASK_MODULE_BY_SLUG,
  type LegacyTaskTab
} from "./task-legacy-config";

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function todayInput() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getRowDate(record: TaskTrackingRecord) {
  return toDateInput(record.dueDate || record.termDate);
}

function isRowRed(record: TaskTrackingRecord, tab: LegacyTaskTab, showDateColumn: boolean) {
  if (tab.isCompleted) {
    return false;
  }

  const dueDate = getRowDate(record);
  return !record.taskName || !record.responsible || (showDateColumn && !dueDate) || (Boolean(dueDate) && dueDate <= todayInput());
}

type TrackingRecordPatch = Partial<Omit<TaskTrackingRecord, "dueDate" | "termDate" | "completedAt">> & {
  dueDate?: string | null;
  termDate?: string | null;
  completedAt?: string | null;
};

export function TaskLegacyTablePage() {
  const { slug, tableId } = useParams();
  const navigate = useNavigate();
  const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
  const tableConfig = moduleConfig ? getLegacyTaskTable(moduleConfig, tableId) : undefined;
  const [records, setRecords] = useState<TaskTrackingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const activeTab = tableConfig?.tabs.find((tab) => tab.key === activeTabKey) ?? tableConfig?.tabs[0];

  useEffect(() => {
    if (!moduleConfig || !tableConfig) {
      return;
    }

    setActiveTabKey(tableConfig.tabs[0]?.key ?? null);
  }, [moduleConfig, tableConfig]);

  async function loadRecords() {
    if (!moduleConfig || !tableConfig) {
      return;
    }

    setLoading(true);
    try {
      const loaded = await apiGet<TaskTrackingRecord[]>(
        `/tasks/tracking-records?moduleId=${moduleConfig.moduleId}&tableCode=${tableConfig.slug}`
      );
      setRecords(loaded);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, [moduleConfig, tableConfig]);

  const visibleRecords = useMemo(() => {
    if (!activeTab || !tableConfig) {
      return [];
    }

    return records.filter((record) => {
      if (activeTab.stage) {
        if (activeTab.isCompleted) {
          return record.workflowStage === activeTab.stage || record.status === "presentado";
        }

        return record.status !== "presentado" && record.workflowStage === activeTab.stage;
      }

      return record.status === (activeTab.status ?? "pendiente");
    });
  }, [activeTab, records, tableConfig]);

  async function patchRecord(record: TaskTrackingRecord, patch: TrackingRecordPatch) {
    const updated = await apiPatch<TaskTrackingRecord>(`/tasks/tracking-records/${record.id}`, patch);
    setRecords((current) => current.map((candidate) => candidate.id === record.id ? updated : candidate));

    if (record.termId && ("dueDate" in patch || "termDate" in patch || "responsible" in patch)) {
      await apiPatch(`/tasks/terms/${record.termId}`, {
        dueDate: patch.dueDate,
        termDate: patch.termDate ?? patch.dueDate,
        responsible: patch.responsible
      });
    }
  }

  async function handleDateChange(record: TaskTrackingRecord, value: string) {
    await patchRecord(record, {
      dueDate: value || null,
      termDate: tableConfig?.termManagedDate ? value || null : record.termDate ?? null
    });
  }

  async function handleAdvance(record: TaskTrackingRecord) {
    if (!tableConfig) {
      return;
    }

    if (tableConfig.mode === "workflow") {
      const finalStage = tableConfig.tabs.length;
      const nextStage = Math.min((record.workflowStage || 1) + 1, finalStage);
      await patchRecord(record, {
        workflowStage: nextStage,
        status: nextStage >= finalStage ? "presentado" : "pendiente",
        completedAt: nextStage >= finalStage ? new Date().toISOString() : undefined
      });
      return;
    }

    await patchRecord(record, {
      status: "presentado",
      completedAt: new Date().toISOString()
    });
  }

  async function handleReopen(record: TaskTrackingRecord) {
    const finalStage = tableConfig?.tabs.length ?? 1;
    await patchRecord(record, {
      status: "pendiente",
      completedAt: null,
      workflowStage: tableConfig?.mode === "workflow" ? Math.max(1, finalStage - 1) : record.workflowStage
    });
  }

  async function handleDelete(record: TaskTrackingRecord) {
    await apiDelete(`/tasks/tracking-records/${record.id}`);
    setRecords((current) => current.filter((candidate) => candidate.id !== record.id));
  }

  async function handleManualAdd() {
    if (!moduleConfig || !tableConfig) {
      return;
    }

    const created = await apiPost<TaskTrackingRecord>("/tasks/tracking-records", {
      moduleId: moduleConfig.moduleId,
      tableCode: tableConfig.slug,
      sourceTable: tableConfig.sourceTable,
      clientName: "",
      subject: "",
      taskName: "Tarea",
      responsible: moduleConfig.defaultResponsible,
      dueDate: tableConfig.showDateColumn === false ? null : todayInput(),
      termDate: tableConfig.autoTerm ? todayInput() : null,
      status: "pendiente",
      workflowStage: 1
    });
    setRecords((current) => [created, ...current]);
  }

  if (!moduleConfig || !tableConfig || !activeTab) {
    return <Navigate to="/app/tasks" replace />;
  }

  const previous = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, -1);
  const next = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, 1);
  const showDateColumn = tableConfig.showDateColumn !== false;

  return (
    <section className="page-stack tasks-legacy-page">
      <header className="hero module-hero">
        <div className="execution-page-topline">
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}`)}>
            Volver al dashboard
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/${previous.slug}`)}>
            Ir a tabla anterior
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/${next.slug}`)}>
            Ir a siguiente tabla
          </button>
        </div>
        <h2>{tableConfig.title}</h2>
        <p className="muted">
          Tabla de seguimiento equivalente a Intranet. Las filas pendientes se marcan en rojo si falta tarea,
          responsable, fecha requerida o si la fecha esta vencida.
        </p>
      </header>

      <section className="panel">
        <div className="tasks-legacy-toolbar">
          <button type="button" className="primary-action-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`)}>
            Abrir distribuidor
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/terminos`)}>
            Ver terminos
          </button>
          <button type="button" className="secondary-button" onClick={handleManualAdd}>
            Agregar registro
          </button>
        </div>

        <div className="tasks-legacy-tabs">
          {tableConfig.tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeTab.key ? "is-active" : ""}
              onClick={() => setActiveTabKey(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="table-scroll tasks-legacy-table-wrap">
          <table className="data-table tasks-legacy-table">
            <thead>
              <tr>
                <th>No. Cliente</th>
                <th>Cliente</th>
                <th>Asunto</th>
                <th>Proceso especifico</th>
                <th>ID Asunto</th>
                <th>Tarea</th>
                <th>Responsable</th>
                {showDateColumn ? <th>{activeTab.isCompleted ? "Fecha completada" : tableConfig.dateLabel}</th> : null}
                {tableConfig.showReportedPeriod ? <th>{tableConfig.reportedPeriodLabel ?? "Mes reportado"}</th> : null}
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="centered-inline-message">Cargando registros...</td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="centered-inline-message">No hay registros en esta seccion.</td>
                </tr>
              ) : (
                visibleRecords.map((record) => {
                  const red = isRowRed(record, activeTab, showDateColumn);
                  const green = !red && !activeTab.isCompleted;

                  return (
                    <tr key={record.id} className={red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined}>
                      <td>{record.clientNumber || "-"}</td>
                      <td>{record.clientName || "-"}</td>
                      <td>{record.subject || "-"}</td>
                      <td><span className="tasks-legacy-process-pill">{record.specificProcess || "N/A"}</span></td>
                      <td>{record.matterIdentifier || record.matterNumber || "-"}</td>
                      <td>
                        <textarea
                          className="tasks-legacy-textarea"
                          value={record.taskName}
                          onChange={(event) => void patchRecord(record, { taskName: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="tasks-legacy-input"
                          value={record.responsible}
                          onChange={(event) => void patchRecord(record, { responsible: event.target.value })}
                        />
                      </td>
                      {showDateColumn ? (
                        <td>
                          {activeTab.isCompleted ? (
                            toDateInput(record.completedAt || record.updatedAt)
                          ) : (
                            <input
                              className="tasks-legacy-input"
                              type="date"
                              value={getRowDate(record)}
                              onChange={(event) => void handleDateChange(record, event.target.value)}
                            />
                          )}
                        </td>
                      ) : null}
                      {tableConfig.showReportedPeriod ? (
                        <td>
                          <input
                            className="tasks-legacy-input"
                            type="month"
                            value={record.reportedMonth ?? ""}
                            onChange={(event) => void patchRecord(record, { reportedMonth: event.target.value })}
                          />
                        </td>
                      ) : null}
                      <td>
                        <div className="tasks-legacy-actions">
                          {activeTab.isCompleted ? (
                            <button type="button" className="secondary-button" onClick={() => void handleReopen(record)}>
                              Reabrir
                            </button>
                          ) : (
                            <button type="button" className="secondary-button" onClick={() => void handleAdvance(record)}>
                              {tableConfig.mode === "workflow" ? "Avanzar" : "Marcar completada"}
                            </button>
                          )}
                          <button type="button" className="danger-button" onClick={() => void handleDelete(record)}>
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
