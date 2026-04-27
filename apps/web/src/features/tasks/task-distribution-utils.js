const ENCODED_TARGET_SEPARATOR = "::";
function normalize(value) {
    return (value ?? "").trim();
}
function decodeTaskName(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
export function findLegacyTableByAnyName(moduleConfig, value) {
    const normalized = normalize(value);
    if (!normalized) {
        return undefined;
    }
    return moduleConfig.tables.find((table) => table.slug === normalized ||
        table.sourceTable === normalized ||
        table.title === normalized);
}
export function encodeCatalogTarget(entry) {
    return `${entry.tableSlug}${ENCODED_TARGET_SEPARATOR}${encodeURIComponent(normalize(entry.taskName))}`;
}
export function decodeCatalogTarget(value, fallbackTaskName) {
    const separatorIndex = value.indexOf(ENCODED_TARGET_SEPARATOR);
    if (separatorIndex < 0) {
        return {
            tableSlug: value,
            taskName: fallbackTaskName
        };
    }
    return {
        tableSlug: value.slice(0, separatorIndex),
        taskName: decodeTaskName(value.slice(separatorIndex + ENCODED_TARGET_SEPARATOR.length)) || fallbackTaskName
    };
}
export function makeCatalogTargetEntry(table, taskName) {
    return {
        id: `${table.slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        tableSlug: table.slug,
        taskName
    };
}
export function getCatalogTargetEntries(event, moduleConfig) {
    const fallbackTaskName = event.defaultTaskName || event.name || "Tarea";
    return event.targetTables
        .map((rawValue, index) => {
        const decoded = decodeCatalogTarget(rawValue, fallbackTaskName);
        const table = findLegacyTableByAnyName(moduleConfig, decoded.tableSlug);
        if (!table) {
            return null;
        }
        return {
            id: `${event.id}-${index}-${table.slug}`,
            tableSlug: table.slug,
            taskName: decoded.taskName || fallbackTaskName
        };
    })
        .filter((entry) => Boolean(entry));
}
export function getTableDisplayName(moduleConfig, value) {
    return findLegacyTableByAnyName(moduleConfig, value)?.title ?? (normalize(value) || "Tabla");
}
