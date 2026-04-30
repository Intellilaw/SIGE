const ENCODED_TARGET_SEPARATOR = "::";
const TABLE_LOOKUP_STOP_WORDS = new Set([
    "a",
    "al",
    "de",
    "debe",
    "deben",
    "del",
    "e",
    "el",
    "en",
    "la",
    "las",
    "los",
    "por",
    "que",
    "ser",
    "y"
]);
function normalize(value) {
    return (value ?? "").trim();
}
function normalizeLookup(value) {
    return normalize(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/^\d+\s*[\).-]?\s*/, "")
        .replace(/[_-]+/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}
function lookupTokens(value) {
    return normalizeLookup(value)
        .split(" ")
        .filter((token) => token && !TABLE_LOOKUP_STOP_WORDS.has(token));
}
function hasCompatibleToken(valueTokens, tableToken) {
    if (valueTokens.has(tableToken)) {
        return true;
    }
    return [...valueTokens].some((valueToken) => {
        let commonPrefixLength = 0;
        const comparableLength = Math.min(valueToken.length, tableToken.length);
        while (commonPrefixLength < comparableLength && valueToken[commonPrefixLength] === tableToken[commonPrefixLength]) {
            commonPrefixLength += 1;
        }
        return commonPrefixLength >= 6;
    });
}
function tableMatchesValue(table, value) {
    const normalized = normalize(value);
    if (table.slug === normalized || table.sourceTable === normalized || table.title === normalized) {
        return true;
    }
    const valueLookup = normalizeLookup(value);
    const tableLookups = [table.slug, table.sourceTable, table.title].map(normalizeLookup);
    if (tableLookups.includes(valueLookup)) {
        return true;
    }
    const valueTokens = new Set(lookupTokens(value));
    const tableTokens = lookupTokens(table.title);
    return tableTokens.length > 0 && tableTokens.every((token) => hasCompatibleToken(valueTokens, token));
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
    return moduleConfig.tables.find((table) => tableMatchesValue(table, normalized));
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
