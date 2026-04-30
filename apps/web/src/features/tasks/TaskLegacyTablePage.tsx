import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { TaskTrackingRecord } from "@sige/contracts";

import { apiGet, apiPatch } from "../../api/http-client";
import {
  getAdjacentLegacyTaskTable,
  getLegacyTaskTable,
  LEGACY_TASK_MODULE_BY_SLUG,
  type LegacyTaskTab,
  type LegacyTaskTableConfig
} from "./task-legacy-config";

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function todayInput() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonthInput() {
  return todayInput().slice(0, 7);
}

function getRowDate(record: TaskTrackingRecord) {
  return toDateInput(record.dueDate || record.termDate);
}

function getCompletionDate(record: TaskTrackingRecord) {
  return toDateInput(record.completedAt || record.updatedAt);
}

function getCompletionMonth(record: TaskTrackingRecord) {
  return getCompletionDate(record).slice(0, 7);
}

function hasCompletedStatus(record: TaskTrackingRecord) {
  return record.status === "presentado" || record.status === "concluida";
}

function isEscritosFondoTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === "escritos-fondo";
}

function formatDisplayDate(value?: string | null) {
  const date = toDateInput(value);
  if (!date) {
    return "-";
  }

  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function isRowRed(record: TaskTrackingRecord, tab: LegacyTaskTab, showDateColumn: boolean, table: LegacyTaskTableConfig | undefined) {
  if (tab.isCompleted) {
    return false;
  }

  if (isEscritosFondoTable(table)) {
    const presentationDate = toDateInput(record.dueDate);
    const termDate = toDateInput(record.termDate);

    return !record.taskName
      || !record.responsible
      || !presentationDate
      || !termDate
      || presentationDate <= todayInput()
      || termDate <= todayInput();
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
  const [completedMonth, setCompletedMonth] = useState(currentMonthInput());
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
          const isCompleted = record.workflowStage === activeTab.stage || hasCompletedStatus(record);
          return isCompleted && getCompletionMonth(record) === completedMonth;
        }

        return record.status !== "presentado" && record.workflowStage === activeTab.stage;
      }

      if (activeTab.isCompleted) {
        return hasCompletedStatus(record) && getCompletionMonth(record) === completedMonth;
      }

      return record.status === (activeTab.status ?? "pendiente");
    });
  }, [activeTab, completedMonth, records, tableConfig]);

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

  if (!moduleConfig || !tableConfig || !activeTab) {
    return <Navigate to="/app/tasks" replace />;
  }

  const previous = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, -1);
  const next = getAdjacentLegacyTaskTable(moduleConfig, tableConfig.slug, 1);
  const showDateColumn = tableConfig.showDateColumn !== false;
  const showTermColumn = isEscritosFondoTable(tableConfig);
  const isCompletedMonthView = activeTab.isCompleted;
  const tableColumnCount =
    7 + (showDateColumn ? 1 : 0) + (tableConfig.showReportedPeriod ? 1 : 0) + (showTermColumn ? 1 : 0);

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
          Tabla de seguimiento operativa. Las filas pendientes se marcan en rojo si falta tarea, responsable, fecha
          requerida o si la fecha esta vencida.
        </p>
      </header>

      <section className="panel">
        <div className="tasks-legacy-toolbar">
          <button type="button" className="primary-action-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`)}>
            Abrir Manager de tareas
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/terminos`)}>
            Ver terminos
          </button>
        </div>
        <p className="muted matter-table-caption">
          Los registros nuevos se crean desde el Selector de Tareas en Ejecucion; las etapas y bajas se controlan desde Tareas activas del Manager de tareas.
        </p>

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

        {isCompletedMonthView ? (
          <div className="tasks-legacy-month-filter">
            <label className="form-field tasks-legacy-month-field">
              <span>Mes calendario</span>
              <input
                type="month"
                value={completedMonth}
                onChange={(event) => setCompletedMonth(event.target.value || currentMonthInput())}
              />
            </label>
            <p className="muted">
              Vista historica mensual: muestra los registros concluidos durante el mes seleccionado.
            </p>
          </div>
        ) : null}

        <div className="table-scroll tasks-legacy-table-wrap">
          <table className={`data-table tasks-legacy-table${showTermColumn ? " tasks-legacy-table-with-term" : ""}`}>
            <thead>
              <tr>
                <th>No. Cliente</th>
                <th>Cliente</th>
                <th>Asunto</th>
                <th>Proceso especifico</th>
                <th>ID Asunto</th>
                <th className="tasks-legacy-task-column">Tarea</th>
                <th>Responsable</th>
                {showDateColumn ? <th>{activeTab.isCompleted ? "Fecha completada" : tableConfig.dateLabel}</th> : null}
                {tableConfig.showReportedPeriod ? <th>{tableConfig.reportedPeriodLabel ?? "Mes reportado"}</th> : null}
                {showTermColumn ? <th>Término</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColumnCount} className="centered-inline-message">Cargando registros...</td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={tableColumnCount} className="centered-inline-message">
                    {isCompletedMonthView ? "No hay registros concluidos en el mes seleccionado." : "No hay registros en esta seccion."}
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => {
                  const red = isRowRed(record, activeTab, showDateColumn, tableConfig);
                  const green = !red && !activeTab.isCompleted;

                  return (
                    <tr key={record.id} className={red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined}>
                      <td>{record.clientNumber || "-"}</td>
                      <td>{record.clientName || "-"}</td>
                      <td>{record.subject || "-"}</td>
                      <td><span className="tasks-legacy-process-pill">{record.specificProcess || "N/A"}</span></td>
                      <td>{record.matterIdentifier || record.matterNumber || "-"}</td>
                      <td className="tasks-legacy-task-cell">
                        <div className="tasks-legacy-task-readonly">
                          {record.taskName || "-"}
                        </div>
                      </td>
                      <td className="tasks-legacy-responsible-cell">
                        <div className="tasks-legacy-readonly-value">
                          {record.responsible || "-"}
                        </div>
                      </td>
                      {showDateColumn ? (
                        <td>
                          <div className="tasks-legacy-readonly-value tasks-legacy-date-readonly">
                            {formatDisplayDate(activeTab.isCompleted ? getCompletionDate(record) : getRowDate(record))}
                          </div>
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
                      {showTermColumn ? (
                        <td>
                          <div className="tasks-legacy-readonly-value tasks-legacy-date-readonly">
                            {formatDisplayDate(record.termDate)}
                          </div>
                        </td>
                      ) : null}
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
