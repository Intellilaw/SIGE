import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  HOLIDAY_AUTHORITIES,
  type Holiday,
  type TaskDistributionEvent,
  type TaskDistributionHistory,
  type TaskTerm,
  type TaskTrackingRecord
} from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { EXECUTION_MODULE_BY_SLUG } from "../execution/execution-config";
import {
  buildDistributionHistoryTaskNameMap,
  getTermEnabledRecordData,
  isTrackingTermEnabled,
  resolveTrackingTaskName,
  usesOptionalTermToggle,
  usesPresentationAndTermDates
} from "./task-display-utils";
import {
  LEGACY_TASK_MODULE_BY_SLUG,
  type LegacyTaskModuleConfig,
  type LegacyTaskTab,
  type LegacyTaskTableConfig
} from "./task-legacy-config";
import {
  encodeCatalogTarget,
  findLegacyTableByAnyName,
  getCatalogTargetEntries,
  getTableDisplayName,
  makeCatalogTargetEntry,
  type CatalogTargetEntry
} from "./task-distribution-utils";

type DistributorTab = "active" | "config";

type TrackingRecordPatch = Partial<Omit<TaskTrackingRecord, "dueDate" | "termDate" | "completedAt" | "deletedAt" | "reportedMonth">> & {
  dueDate?: string | null;
  termDate?: string | null;
  completedAt?: string | null;
  deletedAt?: string | null;
  reportedMonth?: string | null;
};

type RecycleTaskRow = {
  record: TaskTrackingRecord;
  table?: LegacyTaskTableConfig;
  reason: "deleted" | "completed";
  date: string;
};

type HolidaysOverview = {
  holidays: Holiday[];
};

type HolidayGuideItem = {
  date: string;
  labels: string[];
  authorities: string[];
};

function normalize(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeResponsibleOption(value?: string | null) {
  return normalize(value).toUpperCase();
}

function splitResponsibleOptions(value?: string | null) {
  return normalize(value)
    .split(/[\/,;]/)
    .map(normalizeResponsibleOption)
    .filter(Boolean);
}

function dedupeResponsibleOptions(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map(normalizeResponsibleOption).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function normalizeComparableText(value?: string | null) {
  return normalize(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getSearchWords(value?: string | null) {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function matchesSearchWords(value: string, searchWords: string[]) {
  if (searchWords.length === 0) {
    return true;
  }

  const haystack = normalizeComparableText(value);
  return searchWords.every((word) => haystack.includes(word));
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function todayInput() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

function getHolidayGuideRange() {
  const start = new Date();
  start.setHours(12, 0, 0, 0);

  return {
    start: toDateKey(start),
    end: toDateKey(addDays(start, 60))
  };
}

function getHolidayGuidePeriods(startKey: string, endKey: string) {
  const [startYear, startMonth] = startKey.split("-").map(Number);
  const [endYear, endMonth] = endKey.split("-").map(Number);
  const periods: Array<{ year: number; month: number }> = [];

  if (!startYear || !startMonth || !endYear || !endMonth) {
    return periods;
  }

  let cursorYear = startYear;
  let cursorMonth = startMonth;

  while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
    periods.push({ year: cursorYear, month: cursorMonth });
    cursorMonth += 1;

    if (cursorMonth > 12) {
      cursorMonth = 1;
      cursorYear += 1;
    }
  }

  return periods;
}

function toDisplayDate(value?: string | null) {
  const date = toDateInput(value);
  if (!date) {
    return "-";
  }

  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function buildHolidayGuideItems(holidays: Holiday[], startKey: string, endKey: string) {
  const grouped = new Map<string, { labels: Set<string>; authorities: Set<string> }>();

  holidays.forEach((holiday) => {
    const date = toDateInput(holiday.date);
    if (!date || date < startKey || date > endKey || holiday.source === "WEEKEND") {
      return;
    }

    const entry = grouped.get(date) ?? { labels: new Set<string>(), authorities: new Set<string>() };
    entry.labels.add(holiday.label || "Dia inhabil");
    entry.authorities.add(holiday.authorityShortName);
    grouped.set(date, entry);
  });

  return Array.from(grouped.entries())
    .map(([date, entry]) => ({
      date,
      labels: Array.from(entry.labels).sort((left, right) => left.localeCompare(right)),
      authorities: Array.from(entry.authorities).sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function summarizeHolidayLabels(labels: string[]) {
  if (labels.length === 0) {
    return "Dia inhabil";
  }

  if (labels.length <= 2) {
    return labels.join(" / ");
  }

  return `${labels.slice(0, 2).join(" / ")} +${labels.length - 2}`;
}

function summarizeHolidayAuthorities(authorities: string[]) {
  if (authorities.length >= HOLIDAY_AUTHORITIES.length) {
    return "Todas las autoridades";
  }

  if (authorities.length <= 3) {
    return authorities.join(", ");
  }

  return `${authorities.slice(0, 3).join(", ")} +${authorities.length - 3}`;
}

function getRowDate(record: TaskTrackingRecord) {
  return [toDateInput(record.dueDate), toDateInput(record.termDate)]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function getRecycleDate(record: TaskTrackingRecord) {
  return toDateInput(record.deletedAt || record.completedAt || record.updatedAt);
}

function isWithinRecycleWindow(record: TaskTrackingRecord) {
  const date = getRecycleDate(record);
  if (!date) {
    return false;
  }

  const recycleTime = new Date(`${date}T12:00:00`).getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return Number.isFinite(recycleTime) && Date.now() - recycleTime <= thirtyDaysMs;
}

function isYes(value?: string) {
  return ["si", "yes"].includes(
    (value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
}

function defaultVerification(moduleConfig: LegacyTaskModuleConfig) {
  return Object.fromEntries(moduleConfig.verificationColumns.map((column) => [column.key, "No"]));
}

function getTermVerification(moduleConfig: LegacyTaskModuleConfig, term: TaskTerm | undefined) {
  return {
    ...defaultVerification(moduleConfig),
    ...(term?.verification ?? {})
  };
}

function shouldShowTermVerification(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  return isTrackingTermEnabled(record, table);
}

function hasIncompleteTermVerification(moduleConfig: LegacyTaskModuleConfig, term: TaskTerm | undefined) {
  const verification = getTermVerification(moduleConfig, term);
  return moduleConfig.verificationColumns.some((column) => !isYes(verification[column.key]));
}

function isCompletedRecord(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (record.status === "presentado" || record.status === "concluida") {
    return true;
  }

  return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}

function isTrackingRecordRed(
  table: LegacyTaskTableConfig | undefined,
  record: TaskTrackingRecord,
  taskNamesByRecordId?: Map<string, string>
) {
  if (isCompletedRecord(table, record)) {
    return false;
  }

  const taskName = resolveTrackingTaskName(record, table, taskNamesByRecordId);
  const dueDate = getRowDate(record);
  const requiresDate = table?.showDateColumn !== false;

  if (usesPresentationAndTermDates(table)) {
    const presentationDate = toDateInput(record.dueDate);
    const termDate = toDateInput(record.termDate);
    const termEnabled = isTrackingTermEnabled(record, table);

    return !taskName
      || !record.responsible
      || !presentationDate
      || presentationDate <= todayInput()
      || (termEnabled && (!termDate || termDate <= todayInput()));
  }

  return !taskName || !record.responsible || (requiresDate && !dueDate) || (Boolean(dueDate) && dueDate <= todayInput());
}

function getStageLabel(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (!table) {
    return record.status;
  }

  if (table.mode === "workflow") {
    return table.tabs.find((tab) => Number(tab.stage) === Number(record.workflowStage || 1))?.label ?? "Etapa pendiente";
  }

  return table.tabs.find((tab) => tab.status === record.status)?.label ?? record.status;
}

function getRecordTabKey(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (!table) {
    return "";
  }

  if (table.mode === "workflow") {
    const completedStage = table.tabs.find((tab) => tab.isCompleted)?.stage;
    const currentStage = record.status === "presentado" && completedStage ? completedStage : record.workflowStage || 1;

    return table.tabs.find((tab) => Number(tab.stage) === Number(currentStage))?.key ?? "";
  }

  return table.tabs.find((tab) => tab.status === record.status)?.key ?? "";
}

function getPreviousActivePatch(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord): TrackingRecordPatch {
  if (table?.mode === "workflow") {
    const completedStage = table.tabs.find((tab) => tab.isCompleted)?.stage ?? table.tabs.length;
    const previousStage = Math.max(1, completedStage - 1);

    return {
      workflowStage: previousStage,
      status: "pendiente",
      completedAt: null,
      deletedAt: null
    };
  }

  return {
    workflowStage: record.workflowStage,
    status: "pendiente",
    completedAt: null,
    deletedAt: null
  };
}

function getLinkedTerm(terms: TaskTerm[], record: TaskTrackingRecord) {
  return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}

export function TaskDistributorPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
  const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
  const [activeTab, setActiveTab] = useState<DistributorTab>(
    searchParams.get("tab") === "config" ? "config" : "active"
  );
  const [events, setEvents] = useState<TaskDistributionEvent[]>([]);
  const [history, setHistory] = useState<TaskDistributionHistory[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [catalogName, setCatalogName] = useState("");
  const [catalogEntries, setCatalogEntries] = useState<CatalogTargetEntry[]>([]);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [wordSearch, setWordSearch] = useState("");
  const [clientSearch, setClientSearch] = useState(searchParams.get("client") ?? "");
  const [holidayGuideItems, setHolidayGuideItems] = useState<HolidayGuideItem[]>([]);
  const [holidayGuideLoading, setHolidayGuideLoading] = useState(false);
  const [holidayGuideError, setHolidayGuideError] = useState<string | null>(null);
  const [responsibleOptions, setResponsibleOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDistributor() {
    if (!moduleConfig) {
      return;
    }

    setLoading(true);
    try {
      const [loadedEvents, loadedHistory, loadedTrackingRecords, loadedTerms] = await Promise.all([
        apiGet<TaskDistributionEvent[]>(`/tasks/distribution-events?moduleId=${moduleConfig.moduleId}`),
        apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${moduleConfig.moduleId}`),
        apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}&includeDeleted=true`),
        apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${moduleConfig.moduleId}`)
      ]);
      setEvents(loadedEvents);
      setHistory(loadedHistory);
      setTrackingRecords(loadedTrackingRecords);
      setTerms(loadedTerms);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDistributor();
  }, [moduleConfig]);

  useEffect(() => {
    if (!moduleConfig) {
      setHolidayGuideItems([]);
      return;
    }

    let cancelled = false;

    async function loadHolidayGuide() {
      const { start, end } = getHolidayGuideRange();
      const periods = getHolidayGuidePeriods(start, end);

      setHolidayGuideLoading(true);
      setHolidayGuideError(null);

      try {
        const responses = await Promise.all(
          periods.map((period) =>
            apiGet<HolidaysOverview>(`/holidays?year=${period.year}&month=${period.month}`)
          )
        );
        const holidays = responses.flatMap((response) => response.holidays);
        const items = buildHolidayGuideItems(holidays, start, end);

        if (!cancelled) {
          setHolidayGuideItems(items);
        }
      } catch {
        if (!cancelled) {
          setHolidayGuideItems([]);
          setHolidayGuideError("No se pudieron cargar los dias inhabiles.");
        }
      } finally {
        if (!cancelled) {
          setHolidayGuideLoading(false);
        }
      }
    }

    void loadHolidayGuide();

    return () => {
      cancelled = true;
    };
  }, [moduleConfig]);

  useEffect(() => {
    if (!moduleConfig) {
      setResponsibleOptions([]);
      return;
    }

    let cancelled = false;
    const team = moduleConfig.team;
    const fallbackOptions = splitResponsibleOptions(moduleConfig.defaultResponsible);

    async function loadResponsibleOptions() {
      try {
        const loaded = await apiGet<string[]>(`/users/team-short-names?team=${encodeURIComponent(team)}`);
        const nextOptions = dedupeResponsibleOptions([...loaded, ...fallbackOptions]);
        if (!cancelled) {
          setResponsibleOptions(nextOptions.length > 0 ? nextOptions : fallbackOptions);
        }
      } catch {
        if (!cancelled) {
          setResponsibleOptions(fallbackOptions);
        }
      }
    }

    void loadResponsibleOptions();

    return () => {
      cancelled = true;
    };
  }, [moduleConfig]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    setActiveTab(requestedTab === "config" ? "config" : "active");

    const requestedClient = searchParams.get("client");
    if (requestedClient !== null) {
      setClientSearch(requestedClient);
    }
  }, [searchParams]);

  function resolveRecordTable(record: TaskTrackingRecord) {
    if (!moduleConfig) {
      return undefined;
    }

    return findLegacyTableByAnyName(moduleConfig, record.tableCode)
      ?? findLegacyTableByAnyName(moduleConfig, record.sourceTable);
  }

  const trackingById = useMemo(
    () => new Map(trackingRecords.map((record) => [record.id, record])),
    [trackingRecords]
  );

  function resolveHistoryRecord(item: TaskDistributionHistory, tableValue: string, index: number, usedIds: Set<string>) {
    if (!moduleConfig) {
      return undefined;
    }

    const table = findLegacyTableByAnyName(moduleConfig, tableValue);
    const possibleKeys = [
      `${table?.slug ?? tableValue}_${index}`,
      `${table?.sourceTable ?? tableValue}_${index}`,
      `${tableValue}_${index}`,
      table?.slug,
      table?.sourceTable,
      tableValue
    ].filter((key): key is string => Boolean(key));

    for (const key of possibleKeys) {
      const recordId = item.createdIds[key];
      const record = recordId ? trackingById.get(recordId) : undefined;
      if (record && !usedIds.has(record.id)) {
        usedIds.add(record.id);
        return record;
      }
    }

    const expectedName = normalize(item.eventNamesPerTable[index] || item.eventName);
    const record = trackingRecords.find((candidate) => {
      if (usedIds.has(candidate.id)) {
        return false;
      }

      const sameTable = candidate.tableCode === table?.slug || candidate.sourceTable === table?.sourceTable || candidate.tableCode === tableValue || candidate.sourceTable === tableValue;
      const sameMatter =
        candidate.matterId === item.matterId ||
        candidate.matterNumber === item.matterNumber ||
        candidate.matterIdentifier === item.matterIdentifier;
      const candidateTaskName = normalize(resolveTrackingTaskName(
        candidate,
        table,
        undefined,
        item.eventNamesPerTable[index] || item.eventName
      ));
      const sameTask = !expectedName || candidateTaskName === expectedName || candidate.eventName === item.eventName;

      return sameTable && sameMatter && sameTask;
    });

    if (record) {
      usedIds.add(record.id);
    }

    return record;
  }

  function historyHasOpenRecords(item: TaskDistributionHistory) {
    if (!moduleConfig) {
      return false;
    }

    const usedIds = new Set<string>();

    return item.targetTables.some((targetTable, index) => {
      const record = resolveHistoryRecord(item, targetTable, index, usedIds);
      const table = record ? resolveRecordTable(record) : findLegacyTableByAnyName(moduleConfig, targetTable);

      return Boolean(record && !record.deletedAt && !isCompletedRecord(table, record));
    });
  }

  function getOpenHistoryRecords(item: TaskDistributionHistory) {
    if (!moduleConfig) {
      return [];
    }

    const usedIds = new Set<string>();

    return item.targetTables
      .map((targetTable, index) => {
        const record = resolveHistoryRecord(item, targetTable, index, usedIds);
        const table = record ? resolveRecordTable(record) : findLegacyTableByAnyName(moduleConfig, targetTable);

        return record && !record.deletedAt && !isCompletedRecord(table, record) ? record : null;
      })
      .filter((record): record is TaskTrackingRecord => Boolean(record));
  }

  function makeVirtualHistory(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined): TaskDistributionHistory {
    const tableKey = table?.slug ?? record.tableCode;
    const sourceKey = table?.sourceTable ?? record.sourceTable;
    const taskName = resolveTrackingTaskName(record, table, taskNamesByRecordId, record.eventName);

    return {
      id: `tracking-${record.id}`,
      moduleId: record.moduleId,
      matterId: record.matterId,
      matterNumber: record.matterNumber,
      clientNumber: record.clientNumber,
      clientName: record.clientName,
      subject: record.subject,
      specificProcess: record.specificProcess,
      matterIdentifier: record.matterIdentifier,
      eventName: taskName || record.eventName || table?.title || "Tarea",
      targetTables: [tableKey],
      eventNamesPerTable: [taskName || record.eventName || table?.title || "Tarea"],
      createdIds: {
        [`${tableKey}_0`]: record.id,
        [`${sourceKey}_0`]: record.id,
        [tableKey]: record.id,
        [sourceKey]: record.id
      },
      data: record.data ?? {},
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  function getHistoryRecordIds(items: TaskDistributionHistory[]) {
    const ids = new Set<string>();

    items.forEach((item) => {
      const usedIds = new Set<string>();
      item.targetTables.forEach((targetTable, index) => {
        const record = resolveHistoryRecord(item, targetTable, index, usedIds);
        if (record) {
          ids.add(record.id);
        }
      });
    });

    return ids;
  }

  function getEarliestOpenDate(item: TaskDistributionHistory) {
    return getOpenHistoryRecords(item)
      .map(getRowDate)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))[0] ?? "";
  }

  function matchesDistributorClientSearch(item: TaskDistributionHistory, searchWords: string[]) {
    return matchesSearchWords([item.clientName, item.clientNumber].join(" "), searchWords);
  }

  function matchesDistributorWordSearch(
    item: TaskDistributionHistory,
    openRecords: TaskTrackingRecord[],
    searchWords: string[]
  ) {
    if (searchWords.length === 0) {
      return true;
    }

    const recordText = openRecords.flatMap((record) => {
      const table = resolveRecordTable(record);
      const taskName = resolveTrackingTaskName(record, table, taskNamesByRecordId);

      return [
        taskName,
        record.taskName,
        record.eventName,
        record.tableCode,
        record.sourceTable,
        record.status,
        record.matterIdentifier,
        record.matterNumber,
        getStageLabel(table, record),
        table?.title,
        record.dueDate,
        record.termDate,
        getRowDate(record)
      ];
    });

    return matchesSearchWords(
      [
        item.clientNumber,
        item.clientName,
        item.subject,
        item.specificProcess,
        item.matterIdentifier,
        item.matterNumber,
        item.eventName,
        item.eventNamesPerTable.join(" "),
        item.targetTables.join(" "),
        item.createdAt,
        getEarliestOpenDate(item),
        ...recordText
      ].join(" "),
      searchWords
    );
  }

  const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
  const wordSearchWords = useMemo(() => getSearchWords(wordSearch), [wordSearch]);
  const taskNamesByRecordId = useMemo(() => buildDistributionHistoryTaskNameMap(history), [history]);
  const fallbackResponsibleOptions = useMemo(
    () => splitResponsibleOptions(moduleConfig?.defaultResponsible),
    [moduleConfig]
  );
  const moduleResponsibleOptions = useMemo(
    () => dedupeResponsibleOptions([...responsibleOptions, ...fallbackResponsibleOptions]),
    [responsibleOptions, fallbackResponsibleOptions]
  );

  const managerHistory = useMemo(() => {
    if (!moduleConfig) {
      return history;
    }

    const historyRecordIds = getHistoryRecordIds(history);
    const virtualHistory = trackingRecords
      .filter((record) => {
        const table = resolveRecordTable(record);
        return !historyRecordIds.has(record.id) && !record.deletedAt && !isCompletedRecord(table, record);
      })
      .map((record) => makeVirtualHistory(record, resolveRecordTable(record)));

    return [...history, ...virtualHistory];
  }, [history, moduleConfig, taskNamesByRecordId, trackingRecords]);

  const activeHistory = useMemo(() => {
    return managerHistory
      .filter(historyHasOpenRecords)
      .filter((item) => matchesDistributorClientSearch(item, clientSearchWords))
      .filter((item) => matchesDistributorWordSearch(item, getOpenHistoryRecords(item), wordSearchWords))
      .sort((left, right) => {
        const leftDate = getEarliestOpenDate(left);
        const rightDate = getEarliestOpenDate(right);

        if (!leftDate && !rightDate) {
          return left.createdAt.localeCompare(right.createdAt);
        }
        if (!leftDate) {
          return 1;
        }
        if (!rightDate) {
          return -1;
        }

        return leftDate.localeCompare(rightDate) || left.createdAt.localeCompare(right.createdAt);
      });
  }, [clientSearchWords, managerHistory, moduleConfig, taskNamesByRecordId, trackingById, trackingRecords, wordSearchWords]);

  const recycleRows = useMemo<RecycleTaskRow[]>(() => {
    if (!moduleConfig) {
      return [];
    }

    return trackingRecords
      .reduce<RecycleTaskRow[]>((rows, record) => {
        const table = resolveRecordTable(record);
        const reason: RecycleTaskRow["reason"] | null = record.deletedAt ? "deleted" : isCompletedRecord(table, record) ? "completed" : null;
        const date = getRecycleDate(record);

        if (reason && isWithinRecycleWindow(record)) {
          rows.push({ record, table, reason, date });
        }

        return rows;
      }, [])
      .sort((left, right) => right.date.localeCompare(left.date) || left.record.clientName.localeCompare(right.record.clientName));
  }, [moduleConfig, trackingRecords]);

  function resetCatalogForm() {
    setCatalogName("");
    setCatalogEntries([]);
    setEditingCatalogId(null);
  }

  function startCatalogEdit(event: TaskDistributionEvent) {
    if (!moduleConfig) {
      return;
    }

    setEditingCatalogId(event.id);
    setCatalogName(event.name);
    setCatalogEntries(getCatalogTargetEntries(event, moduleConfig));
  }

  function addCatalogEntry(table: LegacyTaskTableConfig) {
    setCatalogEntries((current) => [
      ...current,
      makeCatalogTargetEntry(table, catalogName || table.title)
    ]);
  }

  function removeCatalogEntry(table: LegacyTaskTableConfig) {
    setCatalogEntries((current) => {
      const index = current.map((entry) => entry.tableSlug).lastIndexOf(table.slug);
      if (index < 0) {
        return current;
      }

      return current.filter((_, entryIndex) => entryIndex !== index);
    });
  }

  async function saveCatalogEvent() {
    if (!moduleConfig || !catalogName.trim() || catalogEntries.length === 0) {
      return;
    }

    const payload = {
      moduleId: moduleConfig.moduleId,
      name: catalogName.trim(),
      targetTables: catalogEntries.map((entry) => encodeCatalogTarget({
        tableSlug: entry.tableSlug,
        taskName: entry.taskName.trim() || catalogName.trim()
      })),
      defaultTaskName: catalogName.trim()
    };

    if (editingCatalogId) {
      const updated = await apiPatch<TaskDistributionEvent>(`/tasks/distribution-events/${editingCatalogId}`, payload);
      setEvents((current) => current.map((event) => event.id === editingCatalogId ? updated : event));
    } else {
      const created = await apiPost<TaskDistributionEvent>("/tasks/distribution-events", payload);
      setEvents((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
    }

    resetCatalogForm();
  }

  async function deleteCatalogEvent(event: TaskDistributionEvent) {
    if (!window.confirm(`Eliminar la tarea configurada "${event.name}"?`)) {
      return;
    }

    await apiDelete(`/tasks/distribution-events/${event.id}`);
    setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
    if (editingCatalogId === event.id) {
      resetCatalogForm();
    }
  }

  async function patchRecord(record: TaskTrackingRecord, patch: TrackingRecordPatch) {
    const updated = await apiPatch<TaskTrackingRecord | null>(`/tasks/tracking-records/${record.id}`, patch);
    if (!updated) {
      return;
    }

    setTrackingRecords((current) => current.map((candidate) => candidate.id === record.id ? updated : candidate));

    const linkedTerm = getLinkedTerm(terms, record);
    if (linkedTerm && ("dueDate" in patch || "termDate" in patch || "responsible" in patch || "status" in patch || "deletedAt" in patch)) {
      setTerms((current) =>
        current.map((term) =>
          term.id === linkedTerm.id
            ? {
                ...term,
                dueDate: patch.dueDate === undefined ? term.dueDate : patch.dueDate ?? undefined,
                termDate: patch.termDate === undefined ? term.termDate : patch.termDate ?? undefined,
                responsible: patch.responsible === undefined ? term.responsible : patch.responsible,
                status: patch.status === undefined ? term.status : patch.status,
                deletedAt: patch.deletedAt === undefined ? term.deletedAt : patch.deletedAt ?? undefined
              }
            : term
        )
      );
    }
  }

  async function patchTermEnabled(record: TaskTrackingRecord, enabled: boolean) {
    const patch: TrackingRecordPatch = {
      data: getTermEnabledRecordData(record, enabled),
      ...(enabled ? {} : { termDate: null })
    };

    await patchRecord(record, patch);

    if (enabled || !moduleConfig) {
      return;
    }

    const linkedTerm = getLinkedTerm(terms, record);
    if (!linkedTerm) {
      return;
    }

    const updated = await apiPatch<TaskTerm>(`/tasks/terms/${linkedTerm.id}`, {
      termDate: null,
      verification: defaultVerification(moduleConfig)
    });
    setTerms((current) => current.map((term) => term.id === updated.id ? updated : term));
  }

  function getResponsibleSelectOptions(record: TaskTrackingRecord) {
    return dedupeResponsibleOptions([
      ...moduleResponsibleOptions,
      record.responsible
    ]);
  }

  async function patchTermVerification(
    record: TaskTrackingRecord,
    table: LegacyTaskTableConfig | undefined,
    taskName: string,
    key: string,
    value: string
  ) {
    if (!moduleConfig) {
      return;
    }

    const linkedTerm = getLinkedTerm(terms, record);
    const verification = {
      ...getTermVerification(moduleConfig, linkedTerm),
      [key]: value
    };

    if (linkedTerm) {
      const updated = await apiPatch<TaskTerm>(`/tasks/terms/${linkedTerm.id}`, { verification });
      setTerms((current) => current.map((term) => term.id === updated.id ? updated : term));
      return;
    }

    const created = await apiPost<TaskTerm>("/tasks/terms", {
      moduleId: moduleConfig.moduleId,
      sourceTable: record.sourceTable,
      sourceRecordId: record.id,
      matterId: record.matterId ?? null,
      matterNumber: record.matterNumber ?? null,
      clientNumber: record.clientNumber ?? null,
      clientName: record.clientName,
      subject: record.subject,
      specificProcess: record.specificProcess ?? null,
      matterIdentifier: record.matterIdentifier ?? null,
      eventName: taskName || record.eventName || table?.title || "Termino",
      pendingTaskLabel: taskName || null,
      responsible: record.responsible || moduleConfig.defaultResponsible,
      dueDate: record.dueDate ?? null,
      termDate: record.termDate ?? record.dueDate ?? null,
      status: record.status,
      recurring: false,
      reportedMonth: record.reportedMonth ?? null,
      verification,
      data: record.data ?? {}
    });

    setTerms((current) => [created, ...current.filter((term) => term.id !== created.id)]);

    const updatedRecord = await apiPatch<TaskTrackingRecord | null>(`/tasks/tracking-records/${record.id}`, {
      termId: created.id
    });

    if (updatedRecord) {
      setTrackingRecords((current) =>
        current.map((candidate) => candidate.id === updatedRecord.id ? updatedRecord : candidate)
      );
    }
  }

  function renderTermVerificationControls(
    record: TaskTrackingRecord,
    table: LegacyTaskTableConfig | undefined,
    taskName: string
  ) {
    if (!moduleConfig || !shouldShowTermVerification(table, record)) {
      return null;
    }

    const linkedTerm = getLinkedTerm(terms, record);
    const verification = getTermVerification(moduleConfig, linkedTerm);

    return (
      <div className="tasks-active-term-guide-stack">
        <div className="tasks-active-term-verifications" aria-label="Verificaciones del termino">
          {moduleConfig.verificationColumns.map((column) => (
            <label key={column.key} className="tasks-active-term-verification">
              <span>{column.label}</span>
              <select
                className="tasks-active-term-verification-select"
                value={verification[column.key] ?? "No"}
                onChange={(event) => void patchTermVerification(record, table, taskName, column.key, event.target.value)}
              >
                <option value="No">No</option>
                <option value="Si">Si</option>
              </select>
            </label>
          ))}
        </div>

        <div className="tasks-active-holiday-guide" aria-label="Dias inhabiles proximos 60 dias">
          <div className="tasks-active-holiday-guide-head">
            <strong>Dias inhabiles</strong>
            <span>60 dias</span>
          </div>
          {holidayGuideLoading ? (
            <p>Cargando guia...</p>
          ) : holidayGuideError ? (
            <p>{holidayGuideError}</p>
          ) : holidayGuideItems.length === 0 ? (
            <p>Sin dias inhabiles registrados en los proximos 60 dias.</p>
          ) : (
            <div className="tasks-active-holiday-guide-list">
              {holidayGuideItems.map((holiday) => (
                <span
                  key={holiday.date}
                  className="tasks-active-holiday-guide-chip"
                  title={`${summarizeHolidayLabels(holiday.labels)} - ${summarizeHolidayAuthorities(holiday.authorities)}`}
                >
                  <strong>{toDisplayDate(holiday.date)}</strong>
                  <small>{summarizeHolidayLabels(holiday.labels)}</small>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  async function handleMoveToTab(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined, tab: LegacyTaskTab) {
    if (!table) {
      return;
    }

    const completed = tab.isCompleted || tab.status === "presentado";

    await patchRecord(record, {
      workflowStage: table.mode === "workflow" ? tab.stage ?? record.workflowStage : record.workflowStage,
      status: tab.status ?? (completed ? "presentado" : "pendiente"),
      completedAt: completed ? record.completedAt ?? new Date().toISOString() : null
    });
  }

  async function handleRestoreDeletedRecord(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined) {
    await patchRecord(record, record.status === "presentado" || record.status === "concluida"
      ? getPreviousActivePatch(table, record)
      : { deletedAt: null });
  }

  async function handleReturnCompletedRecord(record: TaskTrackingRecord, table: LegacyTaskTableConfig | undefined) {
    await patchRecord(record, getPreviousActivePatch(table, record));
  }

  async function handleDeleteDistribution(item: TaskDistributionHistory) {
    if (!window.confirm(`Quitar todos los registros activos de "${item.eventName}"?`)) {
      return;
    }

    const usedIds = new Set<string>();
    const records = item.targetTables
      .map((targetTable, index) => resolveHistoryRecord(item, targetTable, index, usedIds))
      .filter((record): record is TaskTrackingRecord => Boolean(record));

    const deletedAt = new Date().toISOString();
    await Promise.all(records.map((record) => apiDelete(`/tasks/tracking-records/${record.id}`)));
    setTrackingRecords((current) =>
      current.map((record) => records.some((deleted) => deleted.id === record.id) ? { ...record, deletedAt } : record)
    );
    setTerms((current) =>
      current.map((term) => records.some((record) => term.id === record.termId || term.sourceRecordId === record.id) ? { ...term, deletedAt } : term)
    );
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
        </div>
        <h2>Manager de tareas ({moduleConfig.label})</h2>
        <p className="muted">
          La pestaña de tareas activas es la fuente operativa: sus registros alimentan las tablas de seguimiento y
          el modulo de ejecucion. La configuracion define el catalogo usado por el Selector de Tareas.
        </p>
      </header>

      <section className="panel">
        <div className="tasks-legacy-tabs tasks-distributor-tabs">
          <button
            type="button"
            className={activeTab === "active" ? "is-active" : ""}
            onClick={() => setActiveTab("active")}
          >
            Tareas activas
          </button>
          <button
            type="button"
            className={activeTab === "config" ? "is-active" : ""}
            onClick={() => setActiveTab("config")}
          >
            Configuración
          </button>
        </div>

        {activeTab === "active" ? (
          <div className="tasks-distributor-active">
            <div className="panel-header">
              <div>
                <h2>Tareas activas ({moduleConfig.label})</h2>
                <p className="muted">
                  Registro de tareas distribuidas. Editar aqui actualiza la informacion que se ve en seguimiento y ejecucion.
                </p>
              </div>
              <span>{activeHistory.length} activas</span>
            </div>

            <div className="tasks-distributor-search-panel">
              <div className="matters-toolbar execution-search-toolbar">
                <div className="matters-filters leads-search-filters matters-active-search-filters execution-search-filters">
                  <label className="form-field matters-search-field">
                    <span>Buscar por palabra</span>
                    <input
                      type="text"
                      value={wordSearch}
                      onChange={(event) => setWordSearch(event.target.value)}
                      placeholder="ID, asunto, tarea, tabla..."
                    />
                  </label>

                  <label className="form-field matters-search-field">
                    <span>Buscador por cliente</span>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                      placeholder="Buscar palabra del cliente..."
                    />
                  </label>
                </div>

                <div className="matters-toolbar-actions tasks-distributor-search-actions">
                  <span className="muted">
                    Filtra las tareas activas por cliente o por cualquier dato del asunto, tarea, tabla o vencimiento.
                  </span>
                  {executionModule ? (
                    <button type="button" className="secondary-button" onClick={() => navigate(`/app/execution/${executionModule.slug}`)}>
                      Ir a Ejecución
                    </button>
                  ) : null}
                  <button type="button" className="secondary-button" onClick={() => document.getElementById("tasks-recycle-bin")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    Ir a papelera
                  </button>
                </div>
              </div>
            </div>

            <div className="table-scroll tasks-legacy-table-wrap">
              <table className="data-table tasks-legacy-table tasks-distributor-active-table">
                <thead>
                  <tr>
                    <th>No. Cliente</th>
                    <th>Cliente</th>
                    <th>Asunto</th>
                    <th>Proceso especifico</th>
                    <th>ID Asunto</th>
                    <th>Tablas / tareas</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="centered-inline-message">Cargando tareas activas...</td>
                    </tr>
                  ) : activeHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="centered-inline-message">No hay tareas activas en este equipo.</td>
                    </tr>
                  ) : (
                    activeHistory.map((item) => {
                      const usedIds = new Set<string>();

                      return (
                        <tr key={item.id}>
                          <td>{item.clientNumber || "-"}</td>
                          <td>{item.clientName || "-"}</td>
                          <td>{item.subject || "-"}</td>
                          <td><span className="tasks-legacy-process-pill">{item.specificProcess || "N/A"}</span></td>
                          <td>{item.matterIdentifier || item.matterNumber || "-"}</td>
                          <td>
                            <div className="tasks-active-target-list">
                              <div className="tasks-active-target-toolbar">
                                <span>Fecha más próxima: {getEarliestOpenDate(item) || "sin fecha"}</span>
                                <button type="button" className="danger-button tasks-distributor-small-button" onClick={() => void handleDeleteDistribution(item)}>
                                  Borrar tarea completamente
                                </button>
                              </div>
                              {item.targetTables.map((targetTable, index) => {
                                const record = resolveHistoryRecord(item, targetTable, index, usedIds);
                                const table = record ? resolveRecordTable(record) : findLegacyTableByAnyName(moduleConfig, targetTable);
                                const completed = record ? isCompletedRecord(table, record) : false;
                                const currentTabKey = record ? getRecordTabKey(table, record) : "";
                                const showPresentationAndTermDates = usesPresentationAndTermDates(table);
                                const taskName = record
                                  ? resolveTrackingTaskName(record, table, taskNamesByRecordId, item.eventNamesPerTable[index] || item.eventName)
                                  : item.eventNamesPerTable[index] || item.eventName;
                                const linkedTerm = record ? getLinkedTerm(terms, record) : undefined;
                                const termEnabled = record ? isTrackingTermEnabled(record, table) : false;
                                const showTermToggle = usesOptionalTermToggle(table);
                                const showTermVerification = record ? shouldShowTermVerification(table, record) : false;
                                const danger = record
                                  ? isTrackingRecordRed(table, record, taskNamesByRecordId)
                                    || (showTermVerification && hasIncompleteTermVerification(moduleConfig, linkedTerm))
                                  : true;

                                if (!record || record.deletedAt || completed) {
                                  return null;
                                }

                                return (
                                  <article
                                    key={`${item.id}-${targetTable}-${index}`}
                                    className={`tasks-active-target-card ${danger ? "is-danger" : completed ? "is-completed" : ""}`}
                                  >
                                    <div className="tasks-active-target-head">
                                      <div>
                                        <strong>{taskName || "-"}</strong>
                                      </div>
                                      {record && table ? (
                                        <div className="tasks-active-target-link-panel">
                                          <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => navigate(`/app/tasks/${moduleConfig.slug}/${table.slug}`)}>
                                            Ir a tabla de seguimiento
                                          </button>
                                          <strong>{table.title}</strong>
                                        </div>
                                      ) : null}
                                    </div>

                                    {record ? (
                                      <>
                                        <div className={`tasks-active-target-fields${showPresentationAndTermDates ? " tasks-active-target-fields-with-term" : ""}${showPresentationAndTermDates && !showTermToggle ? " tasks-active-target-fields-required-term" : ""}`}>
                                          <label className="tasks-active-target-field">
                                            <span>Tarea</span>
                                            <input
                                            className="tasks-legacy-input"
                                            value={taskName}
                                            onChange={(event) => void patchRecord(record, { taskName: event.target.value })}
                                            aria-label="Nombre de la tarea"
                                            />
                                          </label>
                                          <label className="tasks-active-target-field">
                                            <span>Responsable</span>
                                            <select
                                              className="tasks-legacy-input"
                                              value={record.responsible}
                                              onChange={(event) => void patchRecord(record, { responsible: event.target.value })}
                                              aria-label="Responsable"
                                            >
                                              <option value="">Seleccionar responsable</option>
                                              {getResponsibleSelectOptions(record).map((responsible) => (
                                                <option key={responsible} value={responsible}>
                                                  {responsible}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          {table?.showReportedPeriod ? (
                                            <label className="tasks-active-target-field">
                                              <span>{table.reportedPeriodLabel ?? "Mes reportado"}</span>
                                              <input
                                                className="tasks-legacy-input"
                                                type="month"
                                                value={record.reportedMonth ?? ""}
                                                onChange={(event) => void patchRecord(record, { reportedMonth: event.target.value || null })}
                                                aria-label={table.reportedPeriodLabel ?? "Mes reportado"}
                                              />
                                            </label>
                                          ) : null}
                                          {showPresentationAndTermDates ? (
                                            <>
                                              <label className="tasks-active-target-field">
                                                <span>{table?.dateLabel ?? "Fecha debe presentarse"}</span>
                                                <input
                                                  className="tasks-legacy-input"
                                                  type="date"
                                                  value={toDateInput(record.dueDate)}
                                                  onChange={(event) => void patchRecord(record, { dueDate: event.target.value || null })}
                                                  aria-label="Fecha debe presentarse"
                                                />
                                              </label>
                                              {showTermToggle ? (
                                                <label className="tasks-active-target-field tasks-active-term-toggle-field">
                                                  <span>Es término</span>
                                                  <input
                                                    className="tasks-active-term-toggle-input"
                                                    type="checkbox"
                                                    checked={termEnabled}
                                                    onChange={(event) => void patchTermEnabled(record, event.target.checked)}
                                                    aria-label="Habilitar término"
                                                  />
                                                </label>
                                              ) : null}
                                              <label className="tasks-active-target-field">
                                                <span>{table?.termDateLabel ?? "Término"}</span>
                                                <input
                                                  className="tasks-legacy-input"
                                                  type="date"
                                                  value={toDateInput(record.termDate)}
                                                  onChange={(event) => void patchRecord(record, { termDate: event.target.value || null })}
                                                  disabled={showTermToggle && !termEnabled}
                                                  aria-label={table?.termDateLabel ?? "Término"}
                                                />
                                              </label>
                                              <div className="tasks-active-term-verification-row">
                                                {renderTermVerificationControls(record, table, taskName)}
                                              </div>
                                            </>
                                          ) : null}
                                          {showPresentationAndTermDates || table?.showDateColumn === false ? null : (
                                            <>
                                              <label className="tasks-active-target-field">
                                                <span>{table?.dateLabel ?? "Fecha límite"}</span>
                                                <input
                                                  className="tasks-legacy-input"
                                                  type="date"
                                                  value={toDateInput(record.dueDate) || getRowDate(record)}
                                                  onChange={(event) => void patchRecord(record, {
                                                    dueDate: event.target.value || null,
                                                    termDate: null
                                                  })}
                                                  aria-label={table?.dateLabel ?? "Fecha límite"}
                                                />
                                              </label>
                                              <div className="tasks-active-term-verification-row tasks-active-term-verification-row-date-only">
                                               {renderTermVerificationControls(record, table, taskName)}
                                              </div>
                                            </>
                                          )}
                                        </div>
                                        <div className="tasks-active-stage-field">
                                          <span className="tasks-active-stage-label">Pestaña en tabla de seguimiento</span>
                                          <div className="tasks-active-stage-actions" aria-label="Mover tarea entre pestañas">
                                            {table?.tabs.map((tab) => {
                                              const current = tab.key === currentTabKey;

                                              return (
                                                <button
                                                  key={tab.key}
                                                  type="button"
                                                  className={`secondary-button tasks-distributor-small-button tasks-active-stage-button ${current ? "is-current" : ""}`}
                                                  onClick={() => void handleMoveToTab(record, table, tab)}
                                                  disabled={current}
                                                  aria-pressed={current}
                                                >
                                                  {tab.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </>
                                    ) : null}
                                  </article>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <section id="tasks-recycle-bin" className="tasks-recycle-section">
              <div className="panel-header">
                <div>
                  <h2>Papelera de reciclaje</h2>
                  <p className="muted">
                    Muestra tareas borradas o completadas durante los ultimos 30 dias. Desde aqui puedes recuperarlas
                    al flujo activo del Manager de tareas.
                  </p>
                </div>
                <span>{recycleRows.length} disponibles</span>
              </div>

              <div className="table-scroll tasks-legacy-table-wrap">
                <table className="data-table tasks-recycle-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Cliente</th>
                      <th>Asunto</th>
                      <th>ID Asunto</th>
                      <th>Tabla</th>
                      <th>Tarea</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recycleRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="centered-inline-message">No hay tareas en la papelera de los ultimos 30 dias.</td>
                      </tr>
                    ) : (
                      recycleRows.map(({ record, table, reason, date }) => (
                        <tr key={`${reason}-${record.id}`}>
                          <td>{toDisplayDate(date)}</td>
                          <td>
                            <span className={`tasks-recycle-status ${reason === "deleted" ? "is-deleted" : "is-completed"}`}>
                              {reason === "deleted" ? "Borrada" : "Completada"}
                            </span>
                          </td>
                          <td>{record.clientName || "-"}</td>
                          <td>{record.subject || "-"}</td>
                          <td>{record.matterIdentifier || record.matterNumber || "-"}</td>
                          <td>{table?.title ?? record.tableCode}</td>
                          <td>{resolveTrackingTaskName(record, table, taskNamesByRecordId) || "-"}</td>
                          <td>
                            {reason === "deleted" ? (
                              <button
                                type="button"
                                className="secondary-button tasks-distributor-small-button"
                                onClick={() => void handleRestoreDeletedRecord(record, table)}
                              >
                                Recuperar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="secondary-button tasks-distributor-small-button"
                                onClick={() => void handleReturnCompletedRecord(record, table)}
                              >
                                Regresar a penultima pestana
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <div className="tasks-distributor-config">
            <div className="panel-header">
              <div>
                <h2>Gestión de Catálogo de Tareas</h2>
                <p className="muted">
                  Define la tarea maestra y cuantas filas debe crear en cada tabla de seguimiento.
                </p>
              </div>
              <span>{events.length} configuradas</span>
            </div>

            <div className="tasks-distributor-config-layout">
              <article className="tasks-distributor-card">
                <label>
                  Nombre de la Tarea
                  <input
                    className="tasks-legacy-input"
                    value={catalogName}
                    onChange={(event) => setCatalogName(event.target.value)}
                    placeholder="Ej. Desahogar prevención"
                  />
                </label>

                <div className="tasks-distributor-table-count-grid">
                  {moduleConfig.tables.map((table) => {
                    const entries = catalogEntries.filter((entry) => entry.tableSlug === table.slug);

                    return (
                      <div key={table.slug} className="tasks-distributor-table-count-card">
                        <div className="tasks-distributor-target-head">
                          <strong>{table.title}</strong>
                          <div className="tasks-distributor-count-controls">
                            <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => removeCatalogEntry(table)}>
                              -
                            </button>
                            <span>{entries.length}</span>
                            <button type="button" className="secondary-button tasks-distributor-small-button" onClick={() => addCatalogEntry(table)}>
                              +
                            </button>
                          </div>
                        </div>
                        {entries.length > 0 ? (
                          <div className="tasks-distributor-entry-name-list">
                            {entries.map((entry) => (
                              <input
                                key={entry.id}
                                className="tasks-legacy-input"
                                value={entry.taskName}
                                onChange={(event) =>
                                  setCatalogEntries((current) =>
                                    current.map((candidate) =>
                                      candidate.id === entry.id ? { ...candidate, taskName: event.target.value } : candidate
                                    )
                                  )
                                }
                                placeholder="Nombre para esta tabla"
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="tasks-legacy-actions">
                  <button type="button" className="primary-action-button" onClick={() => void saveCatalogEvent()} disabled={!catalogName.trim() || catalogEntries.length === 0}>
                    {editingCatalogId ? "Guardar cambios" : "Guardar tarea"}
                  </button>
                  {editingCatalogId ? (
                    <button type="button" className="secondary-button" onClick={resetCatalogForm}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </article>

              <article className="tasks-distributor-card">
                <div className="panel-header">
                  <h3>Catálogo guardado</h3>
                  <span>{events.length}</span>
                </div>
                <div className="tasks-distributor-event-list">
                  {events.length === 0 ? (
                    <div className="centered-inline-message">Aun no hay tareas configuradas.</div>
                  ) : (
                    events.map((event) => {
                      const entries = getCatalogTargetEntries(event, moduleConfig);

                      return (
                        <div key={event.id} className="tasks-distributor-event-row tasks-distributor-catalog-row">
                          <div>
                            <strong>{event.name}</strong>
                            <span>{entries.length} destino{entries.length === 1 ? "" : "s"}</span>
                            <div className="tasks-legacy-chip-list">
                              {entries.map((entry) => (
                                <span key={entry.id}>{getTableDisplayName(moduleConfig, entry.tableSlug)}: {entry.taskName}</span>
                              ))}
                            </div>
                          </div>
                          <button type="button" className="secondary-button" onClick={() => startCatalogEdit(event)}>
                            Configurar
                          </button>
                          <button type="button" className="danger-button" onClick={() => void deleteCatalogEvent(event)}>
                            Eliminar
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
