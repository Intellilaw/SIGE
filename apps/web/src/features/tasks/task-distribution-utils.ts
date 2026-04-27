import type { TaskDistributionEvent } from "@sige/contracts";

import type { LegacyTaskModuleConfig, LegacyTaskTableConfig } from "./task-legacy-config";

const ENCODED_TARGET_SEPARATOR = "::";

export interface CatalogTargetEntry {
  id: string;
  tableSlug: string;
  taskName: string;
}

function normalize(value?: string | null) {
  return (value ?? "").trim();
}

function decodeTaskName(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function findLegacyTableByAnyName(moduleConfig: LegacyTaskModuleConfig, value?: string | null) {
  const normalized = normalize(value);
  if (!normalized) {
    return undefined;
  }

  return moduleConfig.tables.find(
    (table) =>
      table.slug === normalized ||
      table.sourceTable === normalized ||
      table.title === normalized
  );
}

export function encodeCatalogTarget(entry: Pick<CatalogTargetEntry, "tableSlug" | "taskName">) {
  return `${entry.tableSlug}${ENCODED_TARGET_SEPARATOR}${encodeURIComponent(normalize(entry.taskName))}`;
}

export function decodeCatalogTarget(value: string, fallbackTaskName: string) {
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

export function makeCatalogTargetEntry(table: LegacyTaskTableConfig, taskName: string): CatalogTargetEntry {
  return {
    id: `${table.slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tableSlug: table.slug,
    taskName
  };
}

export function getCatalogTargetEntries(event: TaskDistributionEvent, moduleConfig: LegacyTaskModuleConfig) {
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
    .filter((entry): entry is CatalogTargetEntry => Boolean(entry));
}

export function getTableDisplayName(moduleConfig: LegacyTaskModuleConfig, value?: string | null) {
  return findLegacyTableByAnyName(moduleConfig, value)?.title ?? (normalize(value) || "Tabla");
}
