import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function isYes(value) {
    return ["si", "sí", "yes"].includes((value ?? "").trim().toLowerCase());
}
function defaultVerification(moduleConfig) {
    return Object.fromEntries(moduleConfig.verificationColumns.map((column) => [column.key, "No"]));
}
function withDefaultVerification(moduleConfig, term) {
    return {
        ...term,
        verification: {
            ...defaultVerification(moduleConfig),
            ...(term.verification ?? {})
        }
    };
}
function findTrackingTable(moduleConfig, record) {
    return moduleConfig.tables.find((table) => table.slug === record.tableCode || table.sourceTable === record.sourceTable);
}
function isEscritosFondoTable(table) {
    return table?.slug === "escritos-fondo";
}
function isCompletedRecord(table, record) {
    if (record.status === "presentado" || record.status === "concluida") {
        return true;
    }
    return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}
function getManagerTermDate(table, record) {
    const explicitTerm = toDateInput(record.termDate);
    if (explicitTerm) {
        return explicitTerm;
    }
    if (table && !isEscritosFondoTable(table) && (table.autoTerm || table.termManagedDate)) {
        return toDateInput(record.dueDate);
    }
    return "";
}
function isManagerTermRecord(moduleConfig, record) {
    const table = findTrackingTable(moduleConfig, record);
    if (!table) {
        return false;
    }
    return !isCompletedRecord(table, record)
        && Boolean(getManagerTermDate(table, record))
        && Boolean(table.autoTerm || table.termManagedDate || isEscritosFondoTable(table));
}
function getLinkedTerm(terms, record) {
    return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}
function termFromTrackingRecord(moduleConfig, record, linkedTerm) {
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
function sortTermRows(left, right) {
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
    const [terms, setTerms] = useState([]);
    const [trackingRecords, setTrackingRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    async function loadTerms() {
        if (!moduleConfig) {
            return;
        }
        setLoading(true);
        try {
            const [loadedTerms, loadedTrackingRecords] = await Promise.all([
                apiGet(`/tasks/terms?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}`)
            ]);
            setTerms(loadedTerms);
            setTrackingRecords(loadedTrackingRecords);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadTerms();
    }, [moduleConfig]);
    const visibleTermRows = useMemo(() => {
        if (!moduleConfig) {
            return [];
        }
        const rows = [];
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
    function buildTermCreatePayload(row, patch) {
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
    async function patchTerm(row, patch) {
        if (row.virtual) {
            const created = await apiPost("/tasks/terms", buildTermCreatePayload(row, patch));
            setTerms((current) => [created, ...current.filter((candidate) => candidate.id !== created.id)]);
            if (row.sourceRecord) {
                const updatedRecord = await apiPatch(`/tasks/tracking-records/${row.sourceRecord.id}`, {
                    termId: created.id
                });
                if (updatedRecord) {
                    setTrackingRecords((current) => current.map((candidate) => candidate.id === updatedRecord.id ? updatedRecord : candidate));
                }
            }
            return;
        }
        const updated = await apiPatch(`/tasks/terms/${row.term.id}`, patch);
        setTerms((current) => current.map((candidate) => candidate.id === row.term.id ? updated : candidate));
    }
    if (!moduleConfig) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/distribuidor`), children: "Abrir Manager de tareas" })] }), _jsxs("h2", { children: [recurrentMode ? "Terminos recurrentes" : "Terminos", " (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Tabla maestra de terminos. Refleja los terminos activos del Manager de tareas; las filas quedan en rojo si falta responsable, falta fecha de termino, la fecha esta vencida o falta alguna verificacion. Solo las columnas de verificacion se pueden actualizar." })] }), _jsxs("section", { className: "panel", children: [moduleConfig.hasRecurringTerms && !recurrentMode ? (_jsx("div", { className: "tasks-legacy-toolbar", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/terminos-recurrentes`), children: "Ver terminos recurrentes" }) })) : null, _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: "data-table tasks-legacy-table tasks-terms-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: moduleConfig.termEventLabel }), _jsx("th", { children: "Responsable" }), _jsx("th", { children: moduleConfig.termDateLabel }), moduleConfig.verificationColumns.map((column) => _jsx("th", { children: column.label }, column.key))] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 7 + moduleConfig.verificationColumns.length, className: "centered-inline-message", children: "Cargando terminos..." }) })) : visibleTermRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7 + moduleConfig.verificationColumns.length, className: "centered-inline-message", children: "No hay terminos en esta seccion." }) })) : (visibleTermRows.map((row) => {
                                        const { term } = row;
                                        const missingVerification = moduleConfig.verificationColumns.some((column) => !isYes(term.verification[column.key]));
                                        const date = toDateInput(term.termDate);
                                        const completed = term.status === "concluida" || term.status === "presentado";
                                        const red = !completed && (!term.responsible || !date || date <= todayInput() || missingVerification);
                                        const green = !red && moduleConfig.verificationColumns.every((column) => isYes(term.verification[column.key]));
                                        return (_jsxs("tr", { className: red ? "tasks-legacy-row-red" : green ? "tasks-legacy-row-green" : undefined, children: [_jsx("td", { children: term.clientName || "-" }), _jsx("td", { children: term.subject || "-" }), _jsx("td", { children: _jsx("span", { className: "tasks-legacy-process-pill", children: term.specificProcess || "N/A" }) }), _jsx("td", { children: term.matterIdentifier || term.matterNumber || "-" }), _jsx("td", { children: _jsxs("div", { className: "tasks-legacy-task-readonly", children: [term.recurring ? "[Recurrente] " : "", term.eventName || "-"] }) }), _jsx("td", { children: _jsx("div", { className: "tasks-legacy-readonly-value", children: term.responsible || "-" }) }), _jsx("td", { children: _jsx("div", { className: "tasks-legacy-readonly-value tasks-legacy-date-readonly", children: toDateInput(term.termDate) || "-" }) }), moduleConfig.verificationColumns.map((column) => (_jsx("td", { children: _jsxs("select", { className: "tasks-legacy-input", value: term.verification[column.key] ?? "No", onChange: (event) => void patchTerm(row, {
                                                            verification: {
                                                                ...term.verification,
                                                                [column.key]: event.target.value
                                                            }
                                                        }), children: [_jsx("option", { value: "No", children: "No" }), _jsx("option", { value: "Si", children: "Si" })] }) }, column.key)))] }, row.key));
                                    })) })] }) })] })] }));
}
