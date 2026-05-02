export const TERM_ENABLED_DATA_KEY = "termEnabled";
const LEGACY_TASK_PLACEHOLDERS = new Set([
    "tarea legacy",
    "termino legacy",
    "distribucion legacy",
    "evento legacy"
]);
const LEGACY_TASK_NAME_KEYS = [
    "tarea",
    "task_name",
    "taskName",
    "nombre",
    "nombre_tarea",
    "escrito",
    "evento_escrito",
    "evento_nombre",
    "event_name",
    "evento",
    "tramite",
    "reporte",
    "actividad",
    "concepto",
    "descripcion",
    "detalle",
    "tarea_pendiente",
    "pending_task_label"
];
function normalize(value) {
    return (value ?? "").trim();
}
function normalizeComparable(value) {
    return normalize(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function normalizeBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const normalized = normalizeComparable(value);
        if (["1", "true", "si", "yes"].includes(normalized)) {
            return true;
        }
        if (["0", "false", "no"].includes(normalized)) {
            return false;
        }
    }
    return undefined;
}
export function isAlwaysTermTable(table) {
    return table?.slug === "desahogo-prevenciones" || table?.slug === "albacea";
}
export function isNeverTermTable(table) {
    return table?.slug === "jueces-magistrados"
        || table?.slug === "sentencias"
        || table?.slug === "audiencias"
        || table?.slug === "citas-actuarios"
        || table?.slug === "notificaciones"
        || table?.slug === "apelaciones-preventiva"
        || table?.slug === "amparos"
        || table?.slug === "copias"
        || table?.slug === "publicaciones"
        || table?.slug === "esperar-resolucion"
        || table?.slug === "archivo-judicial"
        || table?.slug === "devoluciones"
        || table?.slug === "escaneados"
        || table?.slug === "delegados"
        || table?.slug === "terceros-ajenos"
        || table?.slug === "otros-tramites";
}
export function usesOptionalTermToggle(table) {
    return table?.slug === "escritos-fondo"
        || table?.slug === "escritos"
        || table?.slug === "oficios";
}
export function usesPresentationAndTermDates(table) {
    return usesOptionalTermToggle(table) || isAlwaysTermTable(table);
}
export function isTrackingTermEnabled(record, table) {
    if (!table) {
        return Boolean(record.termDate);
    }
    if (isNeverTermTable(table)) {
        return false;
    }
    if (isAlwaysTermTable(table)) {
        return true;
    }
    if (!usesPresentationAndTermDates(table) && !table.autoTerm && !table.termManagedDate) {
        return false;
    }
    const configured = normalizeBoolean(record.data?.[TERM_ENABLED_DATA_KEY]);
    if (configured !== undefined) {
        return configured;
    }
    if (usesPresentationAndTermDates(table)) {
        return Boolean(record.termDate);
    }
    return Boolean(table.autoTerm) || Boolean(table.termManagedDate);
}
export function getTermEnabledRecordData(record, enabled) {
    return {
        ...(record.data ?? {}),
        [TERM_ENABLED_DATA_KEY]: enabled
    };
}
export function hasMeaningfulTaskLabel(value) {
    const normalized = normalize(value);
    if (!normalized) {
        return false;
    }
    return !LEGACY_TASK_PLACEHOLDERS.has(normalizeComparable(normalized));
}
function getRecordDataText(record, key) {
    const value = record.data?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return typeof value === "string" ? normalize(value) : "";
}
function getLegacyDataTaskName(record) {
    return LEGACY_TASK_NAME_KEYS.map((key) => getRecordDataText(record, key)).find(hasMeaningfulTaskLabel) ?? "";
}
export function getTableTaskFallback(table) {
    return normalize(table?.title).replace(/^\d+\s*[\).-]?\s*/, "");
}
export function buildDistributionHistoryTaskNameMap(histories) {
    const taskNamesByRecordId = new Map();
    histories.forEach((history) => {
        Object.entries(history.createdIds ?? {}).forEach(([key, createdId]) => {
            if (key.startsWith("term-")) {
                return;
            }
            const recordId = normalize(String(createdId));
            if (!recordId) {
                return;
            }
            const match = key.match(/_(\d+)$/);
            const index = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;
            const historyTaskName = Number.isNaN(index) ? undefined : history.eventNamesPerTable[index];
            if (hasMeaningfulTaskLabel(historyTaskName)) {
                taskNamesByRecordId.set(recordId, normalize(historyTaskName));
            }
        });
    });
    return taskNamesByRecordId;
}
function historyMatterMatches(record, history) {
    const recordMatterKeys = [
        record.matterId,
        record.matterNumber,
        record.matterIdentifier
    ].map(normalize).filter(Boolean);
    const historyMatterKeys = [
        history.matterId,
        history.matterNumber,
        history.matterIdentifier
    ].map(normalize).filter(Boolean);
    if (recordMatterKeys.length > 0 && recordMatterKeys.some((key) => historyMatterKeys.includes(key))) {
        return true;
    }
    return normalizeComparable(record.clientName) === normalizeComparable(history.clientName)
        && normalizeComparable(record.subject) === normalizeComparable(history.subject);
}
function targetTableMatches(record, table, targetTable) {
    const normalizedTarget = normalize(targetTable);
    const targetSlug = normalizedTarget.split("::")[0] ?? normalizedTarget;
    const candidates = [
        record.tableCode,
        record.sourceTable,
        table?.slug,
        table?.sourceTable,
        table?.title
    ].map(normalize).filter(Boolean);
    return candidates.includes(normalizedTarget) || candidates.includes(targetSlug);
}
export function resolveHistoryTaskName(record, histories, table) {
    for (const history of histories) {
        if (!historyMatterMatches(record, history)) {
            continue;
        }
        const targetIndex = history.targetTables.findIndex((targetTable) => targetTableMatches(record, table, targetTable));
        if (targetIndex < 0) {
            continue;
        }
        const taskName = history.eventNamesPerTable[targetIndex] || history.eventName;
        if (hasMeaningfulTaskLabel(taskName)) {
            return normalize(taskName);
        }
    }
    return "";
}
export function resolveTrackingTaskName(record, table, taskNamesByRecordId, fallback) {
    const candidates = [
        record.taskName,
        getLegacyDataTaskName(record),
        taskNamesByRecordId?.get(record.id),
        record.eventName,
        fallback,
        getTableTaskFallback(table)
    ];
    return candidates.find(hasMeaningfulTaskLabel) ?? "";
}
