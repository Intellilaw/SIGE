import {
  EXECUTION_HOLIDAY_AUTHORITIES,
  EXECUTION_HOLIDAY_NOT_APPLICABLE,
  MATTER_PROMOTION_COMMANDS,
  getExecutionMatterMissingFields,
  type Client,
  type ExecutionHolidayAuthorityShortName,
  type Holiday,
  type Matter,
  type TaskState,
  type TaskTerm,
  type TaskTrackingRecord
} from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import { resolveTrackingTaskName } from "../tasks/task-display-utils";

export type HolidayDateKeysByAuthority = Partial<Record<ExecutionHolidayAuthorityShortName, Set<string>>>;

export type ExecutionMatterTaskView = {
  id: string;
  moduleId: string;
  trackId: string;
  clientName: string;
  matterId?: string;
  matterNumber?: string;
  subject: string;
  responsible: string;
  dueDate: string;
  state: TaskState;
  recurring: boolean;
  createdAt?: string;
  updatedAt?: string;
  trackLabel: string;
  sourceLabel: string;
  isMatterFallback?: boolean;
  sourceType: "tracking" | "term" | "matter";
};

type HolidayListResponse = {
  holidays: Holiday[];
};

const EXECUTION_HOLIDAY_AUTHORITY_SET = new Set<string>(EXECUTION_HOLIDAY_AUTHORITIES);
const MATTER_PROMOTION_COMMAND_SET = new Set<string>(MATTER_PROMOTION_COMMANDS);
const HOLIDAY_AUTHORITY_QUERY_SHORT_NAME: Record<string, string> = {
  PJF: "PJF",
  TSJCDMX: "TSJCDMX",
  PJEdoMex: "PJEdoMex",
  TFJA: "TFJA",
  TJACDMX: "TJACDMX",
  FGJCDMX: "FGJCDMX",
  FGR: "FGR",
  TFCyA: "TFCyA",
  JLCyA: "JLCyA",
  IMPI: "IMPI",
  RPPCDMX: "RPPCDMX",
  PJPuebla: "PJPuebla",
  PROFECO: "PROFECO",
  SAT: "SAT",
  APF: "APF",
  APCDMX: "APCDMX"
};

export function normalizeExecutionText(value?: string | null) {
  return (value ?? "").trim();
}

export function normalizeExecutionComparableText(value?: string | null) {
  return normalizeExecutionText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function toExecutionDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function toExecutionLocalDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isExecutionDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getExecutionHolidayAuthority(value?: string | null) {
  const normalized = normalizeExecutionText(value) === "PJCDMX" ? "TSJCDMX" : normalizeExecutionText(value);
  return EXECUTION_HOLIDAY_AUTHORITY_SET.has(normalized)
    ? (normalized as ExecutionHolidayAuthorityShortName)
    : "";
}

export function getMatterPromotionCommand(value?: string | null) {
  const normalized = normalizeExecutionText(value);
  return MATTER_PROMOTION_COMMAND_SET.has(normalized)
    ? (normalized as Matter["promotionCommand"])
    : "";
}

function toUtcDateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = toUtcDateFromDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getNextMonthKey(dateKey: string) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function isWeekendDateKey(dateKey: string) {
  const weekday = toUtcDateFromDateKey(dateKey).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function isNonBusinessDate(
  dateKey: string,
  authority: ExecutionHolidayAuthorityShortName,
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  if (authority === EXECUTION_HOLIDAY_NOT_APPLICABLE) {
    return false;
  }

  return isWeekendDateKey(dateKey) || Boolean(holidayDateKeysByAuthority[authority]?.has(dateKey));
}

export function getEffectiveTaskDueDate(
  task: ExecutionMatterTaskView,
  matter: Matter,
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  const dueDate = toExecutionDateInput(task.dueDate);
  const authority = getExecutionHolidayAuthority(matter.holidayAuthorityShortName);
  if (!dueDate || !authority || authority === EXECUTION_HOLIDAY_NOT_APPLICABLE || !isExecutionDateKey(dueDate)) {
    return dueDate;
  }

  let effectiveDate = dueDate;
  for (let guard = 0; guard < 31; guard += 1) {
    if (!isNonBusinessDate(effectiveDate, authority, holidayDateKeysByAuthority)) {
      return effectiveDate;
    }
    effectiveDate = addDaysToDateKey(effectiveDate, 1);
  }

  return effectiveDate;
}

export function getExecutionMatterTasks(matter: Matter, taskMap: Map<string, ExecutionMatterTaskView[]>) {
  return taskMap.get(normalizeExecutionText(matter.id)) ??
    taskMap.get(normalizeExecutionText(matter.matterNumber)) ??
    taskMap.get(normalizeExecutionText(matter.matterIdentifier)) ??
    [];
}

export function collectExecutionHolidayFetchPlan(matters: Matter[], taskMap: Map<string, ExecutionMatterTaskView[]>) {
  const monthsByAuthority = new Map<ExecutionHolidayAuthorityShortName, Set<string>>();

  matters.forEach((matter) => {
    const authority = getExecutionHolidayAuthority(matter.holidayAuthorityShortName);
    if (!authority || authority === EXECUTION_HOLIDAY_NOT_APPLICABLE) {
      return;
    }

    getExecutionMatterTasks(matter, taskMap).forEach((task) => {
      const dueDate = toExecutionDateInput(task.dueDate);
      if (!isExecutionDateKey(dueDate)) {
        return;
      }

      const months = monthsByAuthority.get(authority) ?? new Set<string>();
      months.add(dueDate.slice(0, 7));
      months.add(getNextMonthKey(dueDate));
      monthsByAuthority.set(authority, months);
    });
  });

  return monthsByAuthority;
}

export function serializeExecutionHolidayFetchPlan(fetchPlan: Map<ExecutionHolidayAuthorityShortName, Set<string>>) {
  return Array.from(fetchPlan.entries())
    .map(([authority, months]) => `${authority}:${Array.from(months).sort().join(",")}`)
    .sort()
    .join("|");
}

export async function fetchExecutionHolidayDateKeysByAuthority(fetchPlan: Map<ExecutionHolidayAuthorityShortName, Set<string>>) {
  const requests = Array.from(fetchPlan.entries()).flatMap(([authority, months]) =>
    Array.from(months).map(async (monthKey) => {
      const [yearText, monthText] = monthKey.split("-");
      const response = await apiGet<HolidayListResponse>(
        `/holidays?year=${Number(yearText)}&month=${Number(monthText)}&authorityShortName=${encodeURIComponent(
          HOLIDAY_AUTHORITY_QUERY_SHORT_NAME[authority]
        )}`
      );

      return {
        authority,
        holidays: response.holidays
      };
    })
  );

  const results = await Promise.all(requests);
  const dateKeysByAuthority: HolidayDateKeysByAuthority = {};

  results.forEach(({ authority, holidays }) => {
    const dateKeys = dateKeysByAuthority[authority] ?? new Set<string>();
    holidays.forEach((holiday) => {
      const dateKey = toExecutionDateInput(holiday.date);
      if (isExecutionDateKey(dateKey)) {
        dateKeys.add(dateKey);
      }
    });
    dateKeysByAuthority[authority] = dateKeys;
  });

  return dateKeysByAuthority;
}

export function getEffectiveClientNumber(matter: Matter, clients: Client[]) {
  const normalizedName = normalizeExecutionComparableText(matter.clientName);
  const match = clients.find((client) => normalizeExecutionComparableText(client.name) === normalizedName);
  return match?.clientNumber ?? normalizeExecutionText(matter.clientNumber);
}

export function sortActiveExecutionMatters(items: Matter[], clients: Client[]) {
  return [...items].sort((left, right) => {
    const leftNumber = Number.parseInt(getEffectiveClientNumber(left, clients), 10);
    const rightNumber = Number.parseInt(getEffectiveClientNumber(right, clients), 10);

    if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    if (Number.isNaN(leftNumber)) {
      return 1;
    }
    if (Number.isNaN(rightNumber)) {
      return -1;
    }

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function getSortedTaskViews(tasks: ExecutionMatterTaskView[]) {
  return tasks.slice().sort((left, right) => {
    const leftDate = toExecutionDateInput(left.dueDate);
    const rightDate = toExecutionDateInput(right.dueDate);

    if (!leftDate && !rightDate) {
      return left.id.localeCompare(right.id);
    }
    if (!leftDate) {
      return 1;
    }
    if (!rightDate) {
      return -1;
    }

    return leftDate.localeCompare(rightDate);
  });
}

function getTaskViewIdentity(task: ExecutionMatterTaskView) {
  return `${task.sourceType}:${task.moduleId}:${task.trackId}:${task.id}`;
}

function addTaskViewToMap(
  taskMap: Map<string, ExecutionMatterTaskView[]>,
  keys: string[],
  view: ExecutionMatterTaskView
) {
  const uniqueKeys = [...new Set(keys.map(normalizeExecutionText).filter(Boolean))];
  const viewIdentity = getTaskViewIdentity(view);

  uniqueKeys.forEach((key) => {
    const current = taskMap.get(key) ?? [];

    if (current.some((task) => getTaskViewIdentity(task) === viewIdentity)) {
      return;
    }

    taskMap.set(key, [...current, view]);
  });
}

export function mergeExecutionTaskMaps(...maps: Map<string, ExecutionMatterTaskView[]>[]) {
  const merged = new Map<string, ExecutionMatterTaskView[]>();

  maps.forEach((taskMap) => {
    taskMap.forEach((tasks, key) => {
      const current = merged.get(key) ?? [];
      const knownTaskIds = new Set(current.map(getTaskViewIdentity));
      const uniqueTasks = tasks.filter((task) => {
        const taskIdentity = getTaskViewIdentity(task);
        if (knownTaskIds.has(taskIdentity)) {
          return false;
        }

        knownTaskIds.add(taskIdentity);
        return true;
      });

      merged.set(key, getSortedTaskViews([...current, ...uniqueTasks]));
    });
  });

  return merged;
}

export function buildExecutionTrackingRecordTaskMap(
  records: TaskTrackingRecord[],
  trackLabels: Map<string, string>,
  sourcePrefix: string,
  taskNamesByRecordId: Map<string, string>,
  includeCompleted = false
) {
  const taskMap = new Map<string, ExecutionMatterTaskView[]>();
  const filteredRecords = records
    .filter((record) => (includeCompleted ? true : record.status === "pendiente" && !record.deletedAt))
    .slice()
    .sort((left, right) => {
      const leftDate = toExecutionDateInput(left.dueDate ?? left.termDate);
      const rightDate = toExecutionDateInput(right.dueDate ?? right.termDate);
      return leftDate.localeCompare(rightDate);
    });

  filteredRecords.forEach((record) => {
    const trackLabel = trackLabels.get(record.tableCode) ?? record.sourceTable ?? record.tableCode;
    const view: ExecutionMatterTaskView = {
      id: record.id,
      moduleId: record.moduleId,
      trackId: record.tableCode,
      clientName: record.clientName,
      matterId: record.matterId,
      matterNumber: record.matterNumber,
      subject: resolveTrackingTaskName(record, undefined, taskNamesByRecordId, trackLabel),
      responsible: record.responsible,
      dueDate: record.dueDate ?? record.termDate ?? "",
      state: record.status === "pendiente" ? "PENDING" : "COMPLETED",
      recurring: Boolean(record.data?.recurring),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      trackLabel,
      sourceLabel: `${sourcePrefix}: ${trackLabel}`,
      sourceType: "tracking"
    };

    addTaskViewToMap(
      taskMap,
      [record.matterId ?? "", record.matterNumber ?? "", record.matterIdentifier ?? ""],
      view
    );
  });

  return taskMap;
}

export function buildExecutionTermTaskMap(terms: TaskTerm[], sourcePrefix: string, includeCompleted = false) {
  const taskMap = new Map<string, ExecutionMatterTaskView[]>();
  const filteredTerms = terms
    .filter((term) => !term.sourceRecordId)
    .filter((term) => (includeCompleted ? true : term.status === "pendiente" && !term.deletedAt))
    .slice()
    .sort((left, right) => {
      const leftDate = toExecutionDateInput(left.dueDate ?? left.termDate);
      const rightDate = toExecutionDateInput(right.dueDate ?? right.termDate);
      return leftDate.localeCompare(rightDate);
    });

  filteredTerms.forEach((term) => {
    const trackLabel = "Terminos";
    const view: ExecutionMatterTaskView = {
      id: term.id,
      moduleId: term.moduleId,
      trackId: "legacy-term",
      clientName: term.clientName,
      matterId: term.matterId,
      matterNumber: term.matterNumber,
      subject: term.pendingTaskLabel || term.eventName || term.subject || trackLabel,
      responsible: term.responsible,
      dueDate: term.dueDate ?? term.termDate ?? "",
      state: term.status === "pendiente" ? "PENDING" : "COMPLETED",
      recurring: Boolean(term.recurring),
      createdAt: term.createdAt,
      updatedAt: term.updatedAt,
      trackLabel,
      sourceLabel: `${sourcePrefix}: ${trackLabel}`,
      sourceType: "term"
    };

    addTaskViewToMap(
      taskMap,
      [term.matterId ?? "", term.matterNumber ?? "", term.matterIdentifier ?? ""],
      view
    );
  });

  return taskMap;
}

function addMissingField(missing: string[], field: string) {
  if (!missing.includes(field)) {
    missing.push(field);
  }
}

export function evaluateExecutionMatterRow(
  matter: Matter,
  clientNumber: string,
  tasks: ExecutionMatterTaskView[],
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  const missing = getExecutionMatterMissingFields({
    clientNumber,
    clientName: matter.clientName,
    quoteNumber: matter.quoteNumber,
    subject: matter.subject,
    matterIdentifier: matter.matterIdentifier,
    communicationChannel: matter.communicationChannel,
    milestone: matter.milestone,
    taskCount: tasks.length
  });

  const today = toExecutionLocalDateInput(new Date());
  if (!getExecutionHolidayAuthority(matter.holidayAuthorityShortName)) {
    addMissingField(missing, "Órgano para efectos de días inhábiles");
  }
  if (!normalizeExecutionText(matter.internalTelegramGroupId)) {
    addMissingField(missing, "ID del grupo interno de Telegram");
  }
  if (!normalizeExecutionText(matter.internalTelegramGroupName)) {
    addMissingField(missing, "Nombre del grupo interno de Telegram");
  }
  if (!normalizeExecutionText(matter.executionPrompt)) {
    addMissingField(missing, "Input de RI");
  }
  if (!getMatterPromotionCommand(matter.promotionCommand)) {
    addMissingField(missing, "Comando promoción");
  }

  tasks.forEach((task) => {
    const taskName = normalizeExecutionText(task.subject) || normalizeExecutionText(task.trackLabel);
    const dueDate = getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority);

    if (!taskName) {
      addMissingField(missing, "Siguiente tarea");
    }
    if (!dueDate || !isExecutionDateKey(dueDate)) {
      addMissingField(missing, "Fecha sig. tarea");
    } else if (dueDate < today) {
      addMissingField(missing, "Fecha sig. tarea vencida");
    }
  });

  const isOverdue = tasks.some((task) => {
    const dueDate = getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority);
    return Boolean(dueDate) && isExecutionDateKey(dueDate) && dueDate < today;
  });
  const nextBusinessDate = getNextBusinessDate(
    holidayDateKeysByAuthority,
    getExecutionHolidayAuthority(matter.holidayAuthorityShortName)
  );
  const isNextBusinessDay = !isOverdue && tasks.some((task) =>
    getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority) === nextBusinessDate
  );

  return {
    missing,
    isOverdue,
    isNextBusinessDay
  };
}

function getNextBusinessDate(
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority,
  authority?: ExecutionHolidayAuthorityShortName | ""
) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  do {
    date.setDate(date.getDate() + 1);
  } while (
    date.getDay() === 0 ||
    date.getDay() === 6 ||
    Boolean(authority && holidayDateKeysByAuthority[authority]?.has(toExecutionLocalDateInput(date)))
  );

  return toExecutionLocalDateInput(date);
}
