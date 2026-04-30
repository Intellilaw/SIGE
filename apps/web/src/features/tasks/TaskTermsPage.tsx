import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import type { TaskTerm, TaskTrackingRecord } from "@sige/contracts";

import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import {
  LEGACY_TASK_MODULE_BY_SLUG,
  type LegacyTaskModuleConfig,
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

function isYes(value?: string) {
  return ["si", "sí", "yes"].includes((value ?? "").trim().toLowerCase());
}

type TermTableRow = {
  key: string;
  term: TaskTerm;
  sourceRecord?: TaskTrackingRecord;
  virtual: boolean;
};

function defaultVerification(moduleConfig: LegacyTaskModuleConfig) {
  return Object.fromEntries(moduleConfig.verificationColumns.map((column) => [column.key, "No"]));
}

function withDefaultVerification(moduleConfig: LegacyTaskModuleConfig, term: TaskTerm): TaskTerm {
  return {
    ...term,
    verification: {
      ...defaultVerification(moduleConfig),
      ...(term.verification ?? {})
    }
  };
}

function findTrackingTable(moduleConfig: LegacyTaskModuleConfig, record: TaskTrackingRecord) {
  return moduleConfig.tables.find((table) => table.slug === record.tableCode || table.sourceTable === record.sourceTable);
}

function isEscritosFondoTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === "escritos-fondo";
}

function isCompletedRecord(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (record.status === "presentado" || record.status === "concluida") {
    return true;
  }

  return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}

function getManagerTermDate(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  const explicitTerm = toDateInput(record.termDate);
  if (explicitTerm) {
    return explicitTerm;
  }

  if (table && !isEscritosFondoTable(table) && (table.autoTerm || table.termManagedDate)) {
    return toDateInput(record.dueDate);
  }

  return "";
}

function isManagerTermRecord(moduleConfig: LegacyTaskModuleConfig, record: TaskTrackingRecord) {
  const table = findTrackingTable(moduleConfig, record);
  if (!table) {
    return false;
  }

  return !isCompletedRecord(table, record)
    && Boolean(getManagerTermDate(table, record))
    && Boolean(table.autoTerm || table.termManagedDate || isEscritosFondoTable(table));
}

function getLinkedTerm(terms: TaskTerm[], record: TaskTrackingRecord) {
  return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}

function termFromTrackingRecord(
  moduleConfig: LegacyTaskModuleConfig,
  record: TaskTrackingRecord,
  linkedTerm: TaskTerm | undefined
): TaskTerm {
  const table = findTrackingTable(moduleConfig, record);

  return withDefaultVerification(moduleConfig, {
    ...(linkedTerm ?? {
      id: `manager-term-${record.id}`,
      verification: defaultVerification(moduleConfig),
      data: record.data,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }),
    moduleId: record.moduleId,
    sourceTable: record.sourceTable,
    sourceRecordId: record.id,
    matterId: record.matterId,
    matterNumber: record.matterNumber,
    clientNumber: record.clientNumber,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess,
    matterIdentifier: record.matterIdentifier,
    eventName: record.eventName || record.taskName,
    pendingTaskLabel: record.taskName,
    responsible: record.responsible,
    dueDate: record.dueDate,
    termDate: getManagerTermDate(table, record),
    status: record.status,
    recurring: false,
    reportedMonth: record.reportedMonth,
    deletedAt: record.deletedAt
  });
}

function sortTermRows(left: TermTableRow, right: TermTableRow) {
  const leftDate = toDateInput(left.term.termDate);
  const rightDate = toDateInput(right.term.termDate);

  if (!leftDate && !rightDate) {
    return left.term.clientName.localeCompare(right.term.clientName) || left.term.createdAt.localeCompare(right.term.createdAt);
  }
  if (!leftDate) {
    return 1;
  }
  if (!rightDate) {
    return -1;
  }

  return leftDate.localeCompare(rightDate) || left.term.clientName.localeCompare(right.term.clientName);
}

export function TaskTermsPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
  const recurrentMode = location.pathname.endsWith("/terminos-recurrentes");
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TaskTrackingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTerms() {
    if (!moduleConfig) {
      return;
    }

    setLoading(true);
    try {
      const [loadedTerms, loadedTrackingRecords] = await Promise.all([
        apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${moduleConfig.moduleId}`),
        apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}`)
      ]);
      setTerms(loadedTerms);
      setTrackingRecords(loadedTrackingRecords);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTerms();
  }, [moduleConfig]);

  const visibleTermRows = useMemo<TermTableRow[]>(() => {
    if (!moduleConfig) {
      return [];
    }

    const rows: TermTableRow[] = [];

    if (!recurrentMode) {
      trackingRecords.forEach((record) => {
        if (!isManagerTermRecord(moduleConfig, record)) {
          return;
        }

        const linkedTerm = getLinkedTerm(terms, record);
        const term = termFromTrackingRecord(moduleConfig, record, linkedTerm);

        rows.push({
          key: `manager-${record.id}`,
          term,
          sourceRecord: record,
          virtual: !linkedTerm
        });
      });

      return rows.sort(sortTermRows);
    }

    terms.forEach((term) => {
      if (term.recurring !== recurrentMode) {
        return;
      }

      rows.push({
        key: `term-${term.id}`,
        term: withDefaultVerification(moduleConfig, term),
        virtual: false
      });
    });

    return rows.sort(sortTermRows);
  }, [moduleConfig, recurrentMode, terms, trackingRecords]);

  function buildTermCreatePayload(row: TermTableRow, patch: Partial<TaskTerm> & Record<string, unknown>) {
    const term = {
      ...row.term,
      ...patch,
      verification: patch.verification ?? row.term.verification
    };
    const sourceRecord = row.sourceRecord;
    const table = sourceRecord && moduleConfig ? findTrackingTable(moduleConfig, sourceRecord) : undefined;

    return {
      moduleId: moduleConfig?.moduleId ?? term.moduleId,
      sourceTable: sourceRecord?.sourceTable ?? term.sourceTable ?? null,
      sourceRecordId: sourceRecord?.id ?? term.sourceRecordId ?? null,
      matterId: sourceRecord?.matterId ?? term.matterId ?? null,
      matterNumber: sourceRecord?.matterNumber ?? term.matterNumber ?? null,
      clientNumber: sourceRecord?.clientNumber ?? term.clientNumber ?? null,
      clientName: sourceRecord?.clientName ?? term.clientName ?? "",
      subject: sourceRecord?.subject ?? term.subject ?? "",
      specificProcess: sourceRecord?.specificProcess ?? term.specificProcess ?? null,
      matterIdentifier: sourceRecord?.matterIdentifier ?? term.matterIdentifier ?? null,
      eventName: sourceRecord?.eventName || sourceRecord?.taskName || term.eventName || "Termino",
      pendingTaskLabel: sourceRecord?.taskName ?? term.pendingTaskLabel ?? null,
      responsible: sourceRecord?.responsible ?? term.responsible ?? moduleConfig?.defaultResponsible ?? "",
      dueDate: sourceRecord?.dueDate ?? term.dueDate ?? null,
      termDate: sourceRecord ? (getManagerTermDate(table, sourceRecord) || term.termDate || null) : (term.termDate ?? null),
      status: sourceRecord?.status ?? term.status ?? "pendiente",
      recurring: false,
      reportedMonth: sourceRecord?.reportedMonth ?? term.reportedMonth ?? null,
      verification: term.verification ?? (moduleConfig ? defaultVerification(moduleConfig) : {}),
      data: term.data ?? sourceRecord?.data ?? {}
    };
  }

  async function patchTerm(row: TermTableRow, patch: Partial<TaskTerm> & Record<string, unknown>) {
    if (row.virtual) {
      const created = await apiPost<TaskTerm>("/tasks/terms", buildTermCreatePayload(row, patch));
      setTerms((current) => [created, ...current.filter((candidate) => candidate.id !== created.id)]);

      if (row.sourceRecord) {
        const updatedRecord = await apiPatch<TaskTrackingRecord | null>(`/tasks/tracking-records/${row.sourceRecord.id}`, {
          termId: created.id
        });
        if (updatedRecord) {
          setTrackingRecords((current) =>
            current.map((candidate) => candidate.id === updatedRecord.id ? updatedRecord : candidate)
          );
        }
      }
      return;
    }

    const updated = await apiPatch<TaskTerm>(`/tasks/terms/${row.term.id}`, patch);
    setTerms((current) => current.map((candidate) => candidate.id === row.term.id ? updated : candidate));
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
            Abrir Manager de tareas
          </button>
        </div>
        <h2>{recurrentMode ? "Terminos recurrentes" : "Terminos"} ({moduleConfig.label})</h2>
        <p className="muted">
          Tabla maestra de terminos. Refleja los terminos activos del Manager de tareas; las filas quedan en rojo si falta responsable,
          falta fecha de termino, la fecha esta vencida o falta alguna verificacion. Solo las columnas de verificacion se pueden actualizar.
        </p>
      </header>

      <section className="panel">
        {moduleConfig.hasRecurringTerms && !recurrentMode ? (
          <div className="tasks-legacy-toolbar">
            <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/terminos-recurrentes`)}>
              Ver terminos recurrentes
            </button>
          </div>
        ) : null}

        <div className="table-scroll tasks-legacy-table-wrap">
          <table className="data-table tasks-legacy-table tasks-terms-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Asunto</th>
                <th>Proceso especifico</th>
                <th>ID Asunto</th>
                <th>{moduleConfig.termEventLabel}</th>
                <th>Responsable</th>
                <th>{moduleConfig.termDateLabel}</th>
                {moduleConfig.verificationColumns.map((column) => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7 + moduleConfig.verificationColumns.length} className="centered-inline-message">Cargando terminos...</td>
                </tr>
              ) : visibleTermRows.length === 0 ? (
                <tr>
                  <td colSpan={7 + moduleConfig.verificationColumns.length} className="centered-inline-message">No hay terminos en esta seccion.</td>
                </tr>
              ) : (
                visibleTermRows.map((row) => {
                  const { term } = row;
                  const missingVerification = moduleConfig.verificationColumns.some((column) => !isYes(term.verification[column.key]));
                  const date = toDateInput(term.termDate);
                  const completed = term.status === "concluida" || term.status === "presentado";
                  const red = !completed && (!term.responsible || !date || date <= todayInput() || missingVerification);
                  const green = !red && moduleConfig.verificationColumns.every((column) => isYes(term.verification[column.key]));

                  return (
                    <tr key={row.key} className={red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined}>
                      <td>{term.clientName || "-"}</td>
                      <td>{term.subject || "-"}</td>
                      <td><span className="tasks-legacy-process-pill">{term.specificProcess || "N/A"}</span></td>
                      <td>{term.matterIdentifier || term.matterNumber || "-"}</td>
                      <td>
                        <div className="tasks-legacy-task-readonly">
                          {term.recurring ? "[Recurrente] " : ""}{term.eventName || "-"}
                        </div>
                      </td>
                      <td>
                        <div className="tasks-legacy-readonly-value">{term.responsible || "-"}</div>
                      </td>
                      <td>
                        <div className="tasks-legacy-readonly-value tasks-legacy-date-readonly">{toDateInput(term.termDate) || "-"}</div>
                      </td>
                      {moduleConfig.verificationColumns.map((column) => (
                        <td key={column.key}>
                          <select
                            className="tasks-legacy-input"
                            value={term.verification[column.key] ?? "No"}
                            onChange={(event) =>
                              void patchTerm(row, {
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
