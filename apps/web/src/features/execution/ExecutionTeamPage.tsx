import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  EXECUTION_HOLIDAY_AUTHORITIES,
  MATTER_PROMOTION_COMMANDS,
  getExecutionMatterMissingFields,
  type Client,
  type ExecutionSubmatter,
  type ExecutionHolidayAuthorityShortName,
  type Holiday,
  type Matter,
  type TaskModuleDefinition,
  type TaskDistributionEvent,
  type TaskDistributionHistory,
  type TaskState,
  type TaskTerm,
  type TaskTrackingRecord
} from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { RusconiIntelligenceBadge } from "../rusconi-intelligence/RusconiIntelligenceBadge";
import { buildLegacyTaskModuleConfig } from "../tasks/task-legacy-config";
import { ExecutionTaskPanel } from "./ExecutionTaskPanel";
import { findExecutionModuleDescriptorBySlug } from "./execution-config";

type MatterPatchPayload = {
  executionPrompt?: string | null;
  expirationDate?: string | null;
  expirationRiOutput?: string | null;
  promotionCommand?: Matter["promotionCommand"] | null;
  holidayAuthorityShortName?: ExecutionHolidayAuthorityShortName | null;
  internalTelegramGroupId?: string | null;
  concluded?: boolean;
  notes?: string | null;
};

type ExecutionSubmatterPatchPayload = {
  sortOrder?: number;
  specificProcess?: string | null;
  matterIdentifier?: string | null;
  communicationChannel?: Matter["communicationChannel"];
  executionPrompt?: string | null;
  expirationDate?: string | null;
  expirationRiOutput?: string | null;
  promotionCommand?: Matter["promotionCommand"] | null;
  holidayAuthorityShortName?: ExecutionHolidayAuthorityShortName | null;
  internalTelegramGroupId?: string | null;
  internalTelegramGroupName?: string | null;
  milestone?: string | null;
  concluded?: boolean;
  notes?: string | null;
};

type MatterTaskView = {
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
  executionSubmatterId?: string;
  executionSubmatterLabel?: string;
  isMatterFallback?: boolean;
  sourceType: "tracking" | "term" | "matter";
};

type HolidayDateKeysByAuthority = Partial<Record<ExecutionHolidayAuthorityShortName, Set<string>>>;

type HolidayListResponse = {
  holidays: Holiday[];
};

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  WECHAT: "WeChat",
  EMAIL: "Correo-e",
  PHONE: "Telefono"
};
const CHANNEL_VALUES = Object.keys(CHANNEL_LABELS) as Array<Matter["communicationChannel"]>;
const LEGACY_TASK_PLACEHOLDERS = new Set(["tarea legacy", "termino legacy", "distribucion legacy", "evento legacy"]);
const CADUCIDAD_RI_CONNECTION_ID = "RI-004";
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
  SAT: "SAT",
  APF: "APF",
  APCDMX: "APCDMX"
};

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getSearchWords(value?: string | null) {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function matchesClientSearch(matter: Matter, searchWords: string[]) {
  if (searchWords.length === 0) {
    return true;
  }

  const clientName = normalizeComparableText(matter.clientName);
  return searchWords.every((word) => clientName.includes(word));
}

function matchesWordSearch(
  matter: Matter,
  clientNumber: string,
  tasks: MatterTaskView[],
  searchWords: string[],
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  if (searchWords.length === 0) {
    return true;
  }

  const haystack = normalizeComparableText(
    [
      clientNumber,
      matter.clientName,
      matter.quoteNumber,
      matter.subject,
      matter.specificProcess,
      matter.matterIdentifier,
      matter.executionPrompt,
      getCaducidadColumnValue(matter),
      matter.promotionCommand,
      matter.notes,
      matter.milestone,
      matter.holidayAuthorityShortName,
      matter.internalTelegramGroupId,
      matter.internalTelegramGroupName,
      matter.nextAction,
      matter.nextActionSource,
      toDateInput(matter.nextActionDueAt),
      getChannelLabel(matter.communicationChannel),
      ...(matter.executionSubmatters ?? []).flatMap((submatter) => [
        submatter.specificProcess,
        submatter.matterIdentifier,
        submatter.executionPrompt,
        getSubmatterCaducidadColumnValue(submatter),
        submatter.promotionCommand,
        submatter.notes,
        submatter.milestone,
        submatter.holidayAuthorityShortName,
        submatter.internalTelegramGroupId,
        submatter.internalTelegramGroupName,
        getChannelLabel(submatter.communicationChannel)
      ]),
      ...tasks.flatMap((task) => [
        task.subject,
        task.trackLabel,
        task.sourceLabel,
        task.executionSubmatterLabel,
        task.responsible,
        toDateInput(task.dueDate),
        getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority)
      ])
    ]
      .filter(Boolean)
      .join(" ")
  );

  return searchWords.every((word) => haystack.includes(word));
}

function hasMeaningfulTaskLabel(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  return !LEGACY_TASK_PLACEHOLDERS.has(normalizeComparableText(normalized));
}

function getLegacyDataText(data: TaskTrackingRecord["data"], key: string) {
  const value = data?.[key];
  return typeof value === "string" ? normalizeText(value) : "";
}

function getLegacyDataString(data: TaskTrackingRecord["data"] | TaskTerm["data"] | TaskDistributionHistory["data"], key: string) {
  const value = data?.[key];
  return typeof value === "string" ? normalizeText(value) : "";
}

function getExecutionSubmatterIdFromData(data: TaskTrackingRecord["data"] | TaskTerm["data"] | TaskDistributionHistory["data"]) {
  return getLegacyDataString(data, "executionSubmatterId");
}

function getExecutionSubmatterLabelFromData(data: TaskTrackingRecord["data"] | TaskTerm["data"] | TaskDistributionHistory["data"]) {
  return getLegacyDataString(data, "executionSubmatterLabel");
}

function buildDistributionHistoryTaskNameMap(histories: TaskDistributionHistory[]) {
  const taskNamesByRecordId = new Map<string, string>();

  histories.forEach((history) => {
    Object.entries(history.createdIds ?? {}).forEach(([key, createdId]) => {
      if (key.startsWith("term-")) {
        return;
      }

      const createdIdText = normalizeText(String(createdId));
      if (!createdIdText) {
        return;
      }

      const match = key.match(/_(\d+)$/);
      const index = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;
      const historyTaskName = Number.isNaN(index) ? undefined : history.eventNamesPerTable[index];

      if (hasMeaningfulTaskLabel(historyTaskName)) {
        taskNamesByRecordId.set(createdIdText, normalizeText(historyTaskName));
      }
    });
  });

  return taskNamesByRecordId;
}

function resolveTrackingRecordSubject(
  record: TaskTrackingRecord,
  trackLabel: string,
  taskNamesByRecordId: Map<string, string>
) {
  const candidates = [
    taskNamesByRecordId.get(record.id),
    getLegacyDataText(record.data, "escrito"),
    getLegacyDataText(record.data, "tarea"),
    getLegacyDataText(record.data, "nombre_tarea"),
    getLegacyDataText(record.data, "taskName"),
    getLegacyDataText(record.data, "evento_nombre"),
    getLegacyDataText(record.data, "evento"),
    getLegacyDataText(record.data, "tramite"),
    getLegacyDataText(record.data, "reporte"),
    getLegacyDataText(record.data, "declaracion"),
    getLegacyDataText(record.data, "entregable"),
    record.taskName,
    record.eventName,
    record.subject
  ];

  return candidates.find((candidate) => hasMeaningfulTaskLabel(candidate)) ?? trackLabel;
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function getCaducidadColumnValue(matter: Matter) {
  return normalizeText(matter.expirationRiOutput) || toDateInput(matter.expirationDate);
}

function getSubmatterCaducidadColumnValue(submatter: ExecutionSubmatter) {
  return normalizeText(submatter.expirationRiOutput) || toDateInput(submatter.expirationDate);
}

function getSubmatterLabel(submatter: ExecutionSubmatter) {
  return normalizeText(submatter.specificProcess) || normalizeText(submatter.matterIdentifier) || "Subasunto";
}

function toLocalDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getExecutionHolidayAuthority(value?: string | null) {
  const normalized = normalizeText(value) === "PJCDMX" ? "TSJCDMX" : normalizeText(value);
  return EXECUTION_HOLIDAY_AUTHORITY_SET.has(normalized)
    ? (normalized as ExecutionHolidayAuthorityShortName)
    : "";
}

function getMatterPromotionCommand(value?: string | null) {
  const normalized = normalizeText(value);
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
  return isWeekendDateKey(dateKey) || Boolean(holidayDateKeysByAuthority[authority]?.has(dateKey));
}

function getEffectiveTaskDueDateForAuthority(
  task: MatterTaskView,
  authorityValue: string | null | undefined,
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  const dueDate = toDateInput(task.dueDate);
  const authority = getExecutionHolidayAuthority(authorityValue);
  if (!dueDate || !authority || !isDateKey(dueDate)) {
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

function getEffectiveTaskDueDate(
  task: MatterTaskView,
  matter: Matter,
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  return getEffectiveTaskDueDateForAuthority(task, matter.holidayAuthorityShortName, holidayDateKeysByAuthority);
}

function getEffectiveSubmatterTaskDueDate(
  task: MatterTaskView,
  submatter: ExecutionSubmatter,
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  return getEffectiveTaskDueDateForAuthority(task, submatter.holidayAuthorityShortName, holidayDateKeysByAuthority);
}

function collectHolidayFetchPlan(matters: Matter[], taskMap: Map<string, MatterTaskView[]>) {
  const monthsByAuthority = new Map<ExecutionHolidayAuthorityShortName, Set<string>>();

  function addTaskMonths(authority: ExecutionHolidayAuthorityShortName, tasks: MatterTaskView[]) {
    tasks.forEach((task) => {
      const dueDate = toDateInput(task.dueDate);
      if (!isDateKey(dueDate)) {
        return;
      }

      const months = monthsByAuthority.get(authority) ?? new Set<string>();
      months.add(dueDate.slice(0, 7));
      months.add(getNextMonthKey(dueDate));
      monthsByAuthority.set(authority, months);
    });
  }

  matters.forEach((matter) => {
    const authority = getExecutionHolidayAuthority(matter.holidayAuthorityShortName);
    if (authority) {
      addTaskMonths(authority, getMatterTasks(matter, taskMap));
    }

    (matter.executionSubmatters ?? []).forEach((submatter) => {
      const submatterAuthority = getExecutionHolidayAuthority(submatter.holidayAuthorityShortName);
      if (!submatterAuthority) {
        return;
      }

      addTaskMonths(submatterAuthority, getSubmatterTasks(matter, submatter, taskMap));
    });
  });

  return monthsByAuthority;
}

function serializeHolidayFetchPlan(fetchPlan: Map<ExecutionHolidayAuthorityShortName, Set<string>>) {
  return Array.from(fetchPlan.entries())
    .map(([authority, months]) => `${authority}:${Array.from(months).sort().join(",")}`)
    .sort()
    .join("|");
}

async function fetchHolidayDateKeysByAuthority(fetchPlan: Map<ExecutionHolidayAuthorityShortName, Set<string>>) {
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
      const dateKey = toDateInput(holiday.date);
      if (isDateKey(dateKey)) {
        dateKeys.add(dateKey);
      }
    });
    dateKeysByAuthority[authority] = dateKeys;
  });

  return dateKeysByAuthority;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function getChannelLabel(value?: string | null) {
  return CHANNEL_LABELS[normalizeText(value)] ?? "WhatsApp";
}

function getEffectiveClientNumber(matter: Matter, clients: Client[]) {
  const normalizedName = normalizeComparableText(matter.clientName);
  const match = clients.find((client) => normalizeComparableText(client.name) === normalizedName);
  return match?.clientNumber ?? normalizeText(matter.clientNumber);
}

function sortActiveMatters(items: Matter[], clients: Client[]) {
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

function sortDeletedMatters(items: Matter[]) {
  return [...items].sort((left, right) =>
    (right.deletedAt ?? right.updatedAt).localeCompare(left.deletedAt ?? left.updatedAt)
  );
}

function replaceMatter(items: Matter[], updated: Matter) {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function getSortedTaskViews(tasks: MatterTaskView[]) {
  return tasks.slice().sort((left, right) => {
    const leftDate = toDateInput(left.dueDate);
    const rightDate = toDateInput(right.dueDate);

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

function getTaskViewIdentity(task: MatterTaskView) {
  return `${task.sourceType}:${task.moduleId}:${task.trackId}:${task.id}`;
}

function addTaskViewToMap(taskMap: Map<string, MatterTaskView[]>, keys: string[], view: MatterTaskView) {
  const uniqueKeys = [...new Set(keys.map(normalizeText).filter(Boolean))];
  const viewIdentity = getTaskViewIdentity(view);

  uniqueKeys.forEach((key) => {
    const current = taskMap.get(key) ?? [];

    if (current.some((task) => getTaskViewIdentity(task) === viewIdentity)) {
      return;
    }

    taskMap.set(key, [...current, view]);
  });
}

function mergeTaskMaps(...maps: Map<string, MatterTaskView[]>[]) {
  const merged = new Map<string, MatterTaskView[]>();

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

function buildTrackingRecordTaskMap(
  records: TaskTrackingRecord[],
  trackLabels: Map<string, string>,
  sourcePrefix: string,
  taskNamesByRecordId: Map<string, string>,
  includeCompleted = false
) {
  const taskMap = new Map<string, MatterTaskView[]>();
  const filteredRecords = records
    .filter((record) => (includeCompleted ? true : record.status === "pendiente" && !record.deletedAt))
    .slice()
    .sort((left, right) => {
      const leftDate = toDateInput(left.dueDate ?? left.termDate);
      const rightDate = toDateInput(right.dueDate ?? right.termDate);
      return leftDate.localeCompare(rightDate);
    });

  filteredRecords.forEach((record) => {
    const trackLabel = trackLabels.get(record.tableCode) ?? record.sourceTable ?? record.tableCode;
    const view: MatterTaskView = {
      id: record.id,
      moduleId: record.moduleId,
      trackId: record.tableCode,
      clientName: record.clientName,
      matterId: record.matterId,
      matterNumber: record.matterNumber,
      subject: resolveTrackingRecordSubject(record, trackLabel, taskNamesByRecordId),
      responsible: record.responsible,
      dueDate: record.dueDate ?? record.termDate ?? "",
      state: record.status === "pendiente" ? "PENDING" : "COMPLETED",
      recurring: Boolean(record.data?.recurring),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      trackLabel,
      sourceLabel: `${sourcePrefix}: ${trackLabel}`,
      executionSubmatterId: getExecutionSubmatterIdFromData(record.data) || undefined,
      executionSubmatterLabel: getExecutionSubmatterLabelFromData(record.data) || undefined,
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

function buildTermTaskMap(terms: TaskTerm[], sourcePrefix: string, includeCompleted = false) {
  const taskMap = new Map<string, MatterTaskView[]>();
  const filteredTerms = terms
    .filter((term) => !term.sourceRecordId)
    .filter((term) => (includeCompleted ? true : term.status === "pendiente" && !term.deletedAt))
    .slice()
    .sort((left, right) => {
      const leftDate = toDateInput(left.dueDate ?? left.termDate);
      const rightDate = toDateInput(right.dueDate ?? right.termDate);
      return leftDate.localeCompare(rightDate);
    });

  filteredTerms.forEach((term) => {
    const trackLabel = "Terminos";
    const view: MatterTaskView = {
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
      executionSubmatterId: getExecutionSubmatterIdFromData(term.data) || undefined,
      executionSubmatterLabel: getExecutionSubmatterLabelFromData(term.data) || undefined,
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

function getMatterTasks(matter: Matter, taskMap: Map<string, MatterTaskView[]>) {
  const linkedTasks =
    taskMap.get(normalizeText(matter.id)) ??
    taskMap.get(normalizeText(matter.matterNumber)) ??
    taskMap.get(normalizeText(matter.matterIdentifier)) ??
    [];
  return linkedTasks.filter((task) => !task.executionSubmatterId);
}

function getAllMatterTasks(matter: Matter, taskMap: Map<string, MatterTaskView[]>) {
  return taskMap.get(normalizeText(matter.id)) ??
    taskMap.get(normalizeText(matter.matterNumber)) ??
    taskMap.get(normalizeText(matter.matterIdentifier)) ??
    [];
}

function getSubmatterTasks(matter: Matter, submatter: ExecutionSubmatter, taskMap: Map<string, MatterTaskView[]>) {
  return getAllMatterTasks(matter, taskMap).filter((task) => task.executionSubmatterId === submatter.id);
}

function getTaskDistributorPath(teamSlug: string, matter: Matter) {
  const params = new URLSearchParams({ tab: "active" });
  const clientName = normalizeText(matter.clientName);
  if (clientName) {
    params.set("client", clientName);
  }

  return `/app/tasks/${teamSlug}/distribuidor?${params.toString()}`;
}

function getTaskSourcePath(teamSlug: string, task: MatterTaskView) {
  if (task.sourceType === "term") {
    return `/app/tasks/${teamSlug}/terminos`;
  }

  return `/app/tasks/${teamSlug}/${task.trackId}`;
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
    Boolean(authority && holidayDateKeysByAuthority[authority]?.has(toLocalDateInput(date)))
  );

  return toLocalDateInput(date);
}

function addMissingField(missing: string[], field: string) {
  if (!missing.includes(field)) {
    missing.push(field);
  }
}

function evaluateMatterRow(
  matter: Matter,
  clientNumber: string,
  tasks: MatterTaskView[],
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

  const today = toLocalDateInput(new Date());
  if (!getExecutionHolidayAuthority(matter.holidayAuthorityShortName)) {
    addMissingField(missing, "Órgano para efectos de días inhábiles");
  }
  if (!normalizeText(matter.internalTelegramGroupId)) {
    addMissingField(missing, "ID del grupo interno de Telegram");
  }
  if (!normalizeText(matter.internalTelegramGroupName)) {
    addMissingField(missing, "Nombre del grupo interno de Telegram");
  }
  if (!normalizeText(matter.executionPrompt)) {
    addMissingField(missing, "Input de RI");
  }
  if (!getMatterPromotionCommand(matter.promotionCommand)) {
    addMissingField(missing, "Comando promoción");
  }

  tasks.forEach((task) => {
    const taskName = normalizeText(task.subject) || normalizeText(task.trackLabel);
    const dueDate = getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority);

    if (!taskName) {
      addMissingField(missing, "Siguiente tarea");
    }
    if (!dueDate || !isDateKey(dueDate)) {
      addMissingField(missing, "Fecha sig. tarea");
    } else if (dueDate < today) {
      addMissingField(missing, "Fecha sig. tarea vencida");
    }
  });

  const isOverdue = tasks.some((task) => {
    const dueDate = getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority);
    return Boolean(dueDate) && isDateKey(dueDate) && dueDate < today;
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

function evaluateSubmatterRow(
  submatter: ExecutionSubmatter,
  tasks: MatterTaskView[],
  holidayDateKeysByAuthority: HolidayDateKeysByAuthority
) {
  const missing: string[] = [];
  const today = toLocalDateInput(new Date());

  if (!normalizeText(submatter.matterIdentifier)) {
    addMissingField(missing, "ID Asunto");
  }
  if (!normalizeText(submatter.communicationChannel)) {
    addMissingField(missing, "Canal");
  }
  if (!normalizeText(submatter.milestone)) {
    addMissingField(missing, "Hito conclusion");
  }
  if (tasks.length === 0) {
    addMissingField(missing, "Sin siguientes tareas");
  }
  if (!getExecutionHolidayAuthority(submatter.holidayAuthorityShortName)) {
    addMissingField(missing, "Órgano para efectos de días inhábiles");
  }
  if (!normalizeText(submatter.internalTelegramGroupId)) {
    addMissingField(missing, "ID del grupo interno de Telegram");
  }
  if (!normalizeText(submatter.internalTelegramGroupName)) {
    addMissingField(missing, "Nombre del grupo interno de Telegram");
  }
  if (!normalizeText(submatter.executionPrompt)) {
    addMissingField(missing, "Input de RI");
  }
  if (!getMatterPromotionCommand(submatter.promotionCommand)) {
    addMissingField(missing, "Comando promoción");
  }

  tasks.forEach((task) => {
    const taskName = normalizeText(task.subject) || normalizeText(task.trackLabel);
    const dueDate = getEffectiveSubmatterTaskDueDate(task, submatter, holidayDateKeysByAuthority);

    if (!taskName) {
      addMissingField(missing, "Siguiente tarea");
    }
    if (!dueDate || !isDateKey(dueDate)) {
      addMissingField(missing, "Fecha sig. tarea");
    } else if (dueDate < today) {
      addMissingField(missing, "Fecha sig. tarea vencida");
    }
  });

  const isOverdue = tasks.some((task) => {
    const dueDate = getEffectiveSubmatterTaskDueDate(task, submatter, holidayDateKeysByAuthority);
    return Boolean(dueDate) && isDateKey(dueDate) && dueDate < today;
  });
  const nextBusinessDate = getNextBusinessDate(
    holidayDateKeysByAuthority,
    getExecutionHolidayAuthority(submatter.holidayAuthorityShortName)
  );
  const isNextBusinessDay = !isOverdue && tasks.some((task) =>
    getEffectiveSubmatterTaskDueDate(task, submatter, holidayDateKeysByAuthority) === nextBusinessDate
  );

  return {
    missing,
    isOverdue,
    isNextBusinessDay
  };
}

interface ExecutionTeamWorkspaceProps {
  backPath?: string;
  fallbackPath?: string;
  titlePrefix?: string;
  description?: string;
  showHero?: boolean;
}

export function ExecutionTeamWorkspace({
  backPath = "/app/execution",
  fallbackPath = "/app/execution",
  titlePrefix = "",
  description = "Tablero operativo asunto por asunto, con siguientes tareas, resaltado rojo por faltantes o vencimientos y separacion completa por equipo.",
  showHero = true
}: ExecutionTeamWorkspaceProps) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusMatterId = normalizeText(searchParams.get("matterId"));
  const focusTarget = normalizeText(searchParams.get("focus"));

  const [taskModules, setTaskModules] = useState<TaskModuleDefinition[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [activeMatters, setActiveMatters] = useState<Matter[]>([]);
  const [deletedMatters, setDeletedMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [distributionEvents, setDistributionEvents] = useState<TaskDistributionEvent[]>([]);
  const [distributionHistory, setDistributionHistory] = useState<TaskDistributionHistory[]>([]);
  const [holidayDateKeysByAuthority, setHolidayDateKeysByAuthority] = useState<HolidayDateKeysByAuthority>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wordSearch, setWordSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [panelMatter, setPanelMatter] = useState<Matter | null>(null);
  const [panelSubmatter, setPanelSubmatter] = useState<ExecutionSubmatter | null>(null);
  const [panelMode, setPanelMode] = useState<"create" | "history" | null>(null);
  const [generatingRiMatterIds, setGeneratingRiMatterIds] = useState<Set<string>>(() => new Set());
  const [generatingCaducidadRiMatterIds, setGeneratingCaducidadRiMatterIds] = useState<Set<string>>(() => new Set());
  const [dirtyMatterIds, setDirtyMatterIds] = useState<Set<string>>(() => new Set());
  const automaticRiAttemptKeysRef = useRef<Set<string>>(new Set());
  const automaticCaducidadRiAttemptKeysRef = useRef<Set<string>>(new Set());

  const module = useMemo(
    () => findExecutionModuleDescriptorBySlug(taskModules, slug),
    [slug, taskModules]
  );
  const legacyConfig = useMemo(
    () => module ? buildLegacyTaskModuleConfig(module.definition, module.slug) : undefined,
    [module]
  );
  const canAccess = Boolean(module);

  useEffect(() => {
    let active = true;

    async function loadModules() {
      setLoadingModules(true);
      setErrorMessage(null);

      try {
        const loadedModules = await apiGet<TaskModuleDefinition[]>("/tasks/modules");
        if (active) {
          setTaskModules(loadedModules);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(toErrorMessage(error));
        }
      } finally {
        if (active) {
          setLoadingModules(false);
        }
      }
    }

    void loadModules();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loadingModules || !module || !canAccess) {
      return;
    }

    const currentModule = module;

    async function loadBoard() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const [
          loadedMatters,
          loadedDeleted,
          loadedClients,
          loadedTrackingRecords,
          loadedTerms,
          loadedDistributionEvents,
          loadedDistributionHistory
        ] = await Promise.all([
          apiGet<Matter[]>("/matters"),
          apiGet<Matter[]>("/matters/recycle-bin"),
          apiGet<Client[]>("/clients"),
          apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${currentModule.moduleId}`),
          apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${currentModule.moduleId}`),
          apiGet<TaskDistributionEvent[]>(`/tasks/distribution-events?moduleId=${currentModule.moduleId}`),
          apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${currentModule.moduleId}`)
        ]);

        const teamMatters = loadedMatters.filter((matter) => matter.responsibleTeam === currentModule.team);
        const teamDeleted = loadedDeleted.filter((matter) => matter.responsibleTeam === currentModule.team);

        setClients(loadedClients);
        setTrackingRecords(loadedTrackingRecords);
        setTerms(loadedTerms);
        setDistributionEvents(loadedDistributionEvents);
        setDistributionHistory(loadedDistributionHistory);
        setActiveMatters(sortActiveMatters(teamMatters, loadedClients));
        setDeletedMatters(sortDeletedMatters(teamDeleted));
        setDirtyMatterIds(new Set());
        setGeneratingRiMatterIds(new Set());
        setGeneratingCaducidadRiMatterIds(new Set());
        automaticRiAttemptKeysRef.current.clear();
        automaticCaducidadRiAttemptKeysRef.current.clear();
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void loadBoard();
  }, [loadingModules, module?.moduleId, module?.team, canAccess]);

  const trackLabels = useMemo(
    () => new Map(module?.definition.tracks.map((track) => [track.id, track.label]) ?? []),
    [module]
  );
  const sourcePrefix = module?.shortLabel ?? "Ejecucion";
  const taskNamesByRecordId = useMemo(
    () => buildDistributionHistoryTaskNameMap(distributionHistory),
    [distributionHistory]
  );
  const activeTrackingMap = useMemo(
    () => buildTrackingRecordTaskMap(trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId),
    [trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId]
  );
  const allTrackingMap = useMemo(
    () => buildTrackingRecordTaskMap(trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId, true),
    [trackingRecords, trackLabels, sourcePrefix, taskNamesByRecordId]
  );
  const activeTermMap = useMemo(
    () => buildTermTaskMap(terms, sourcePrefix),
    [terms, sourcePrefix]
  );
  const allTermMap = useMemo(
    () => buildTermTaskMap(terms, sourcePrefix, true),
    [terms, sourcePrefix]
  );
  const activeTaskMap = useMemo(
    () => mergeTaskMaps(activeTermMap, activeTrackingMap),
    [activeTermMap, activeTrackingMap]
  );
  const allTaskMap = useMemo(
    () => mergeTaskMaps(allTermMap, allTrackingMap),
    [allTermMap, allTrackingMap]
  );
  const holidayFetchPlan = useMemo(
    () => collectHolidayFetchPlan([...activeMatters, ...deletedMatters], allTaskMap),
    [activeMatters, allTaskMap, deletedMatters]
  );
  const holidayFetchSignature = useMemo(
    () => serializeHolidayFetchPlan(holidayFetchPlan),
    [holidayFetchPlan]
  );

  useEffect(() => {
    if (holidayFetchPlan.size === 0) {
      setHolidayDateKeysByAuthority({});
      return;
    }

    let isCancelled = false;

    async function loadHolidayDateKeys() {
      try {
        const dateKeys = await fetchHolidayDateKeysByAuthority(holidayFetchPlan);
        if (!isCancelled) {
          setHolidayDateKeysByAuthority(dateKeys);
        }
      } catch (error) {
        if (!isCancelled) {
          setHolidayDateKeysByAuthority({});
        }
      }
    }

    void loadHolidayDateKeys();

    return () => {
      isCancelled = true;
    };
  }, [holidayFetchSignature]);

  const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
  const wordSearchWords = useMemo(() => getSearchWords(wordSearch), [wordSearch]);
  const filteredMatters = useMemo(
    () =>
      activeMatters.filter((matter) => {
        const clientNumber = getEffectiveClientNumber(matter, clients);
        const matterTasks = getAllMatterTasks(matter, activeTaskMap);
        return (
          matchesClientSearch(matter, clientSearchWords) &&
          matchesWordSearch(matter, clientNumber, matterTasks, wordSearchWords, holidayDateKeysByAuthority)
        );
      }),
    [activeMatters, activeTaskMap, clientSearchWords, clients, holidayDateKeysByAuthority, wordSearchWords]
  );
  const filteredDeletedMatters = useMemo(
    () =>
      deletedMatters.filter((matter) => {
        const clientNumber = getEffectiveClientNumber(matter, clients);
        const matterTasks = getAllMatterTasks(matter, allTaskMap);
        return (
          matchesClientSearch(matter, clientSearchWords) &&
          matchesWordSearch(matter, clientNumber, matterTasks, wordSearchWords, holidayDateKeysByAuthority)
        );
      }),
    [allTaskMap, clientSearchWords, clients, deletedMatters, holidayDateKeysByAuthority, wordSearchWords]
  );

  useEffect(() => {
    if (loading || !focusMatterId) {
      return;
    }

    const row = document.getElementById(`execution-matter-row-${focusMatterId}`);
    if (!row) {
      return;
    }

    row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

    const target = focusTarget === "promotionCommand"
      ? row.querySelector<HTMLSelectElement>("[data-execution-focus='promotionCommand']")
      : focusTarget === "missing"
        ? row.querySelector<HTMLElement>("[data-execution-focus='missing']")
        : null;

    window.setTimeout(() => {
      target?.focus({ preventScroll: true });
    }, 350);
  }, [filteredMatters, focusMatterId, focusTarget, loading]);

  useEffect(() => {
    if (loading || !module || !legacyConfig || generatingRiMatterIds.size > 0) {
      return;
    }

    const candidate = activeMatters.find((matter) => {
      const telegramGroupId = normalizeText(matter.internalTelegramGroupId);
      const riInput = normalizeText(matter.executionPrompt);
      const attemptKey = `${matter.id}:${telegramGroupId}`;

      return Boolean(telegramGroupId)
        && !riInput
        && !dirtyMatterIds.has(matter.id)
        && !automaticRiAttemptKeysRef.current.has(attemptKey);
    });

    if (!candidate) {
      return;
    }

    const attemptKey = `${candidate.id}:${normalizeText(candidate.internalTelegramGroupId)}`;
    automaticRiAttemptKeysRef.current.add(attemptKey);
    void handleGenerateRiInput(candidate.id);
  }, [activeMatters, dirtyMatterIds, generatingRiMatterIds, legacyConfig, loading, module]);

  useEffect(() => {
    if (loading || !module || !legacyConfig || generatingRiMatterIds.size > 0 || generatingCaducidadRiMatterIds.size > 0) {
      return;
    }

    const candidate = activeMatters.find((matter) => {
      const telegramGroupId = normalizeText(matter.internalTelegramGroupId);
      const caducidadValue = getCaducidadColumnValue(matter);
      const attemptKey = [
        matter.id,
        telegramGroupId,
        normalizeText(matter.subject),
        normalizeText(matter.specificProcess)
      ].join(":");

      return Boolean(telegramGroupId)
        && !caducidadValue
        && !dirtyMatterIds.has(matter.id)
        && !automaticCaducidadRiAttemptKeysRef.current.has(attemptKey);
    });

    if (!candidate) {
      return;
    }

    const attemptKey = [
      candidate.id,
      normalizeText(candidate.internalTelegramGroupId),
      normalizeText(candidate.subject),
      normalizeText(candidate.specificProcess)
    ].join(":");
    automaticCaducidadRiAttemptKeysRef.current.add(attemptKey);
    void handleGenerateRiExpiration(candidate.id);
  }, [
    activeMatters,
    dirtyMatterIds,
    generatingCaducidadRiMatterIds,
    generatingRiMatterIds,
    legacyConfig,
    loading,
    module
  ]);

  if (loadingModules) {
    return <div className="centered-message">Cargando ejecucion...</div>;
  }

  if (!module || !canAccess || !legacyConfig) {
    if (errorMessage) {
      return (
        <section className="page-stack">
          <div className="message-banner message-error">{errorMessage}</div>
        </section>
      );
    }

    return <Navigate to={fallbackPath} replace />;
  }

  function updateMatterLocal(matterId: string, updater: (matter: Matter) => Matter) {
    const current = activeMatters.find((item) => item.id === matterId);
    if (!current) {
      return null;
    }

    const updated = updater({ ...current });
    setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
    return updated;
  }

  async function persistMatter(matterId: string, payload: MatterPatchPayload) {
    try {
      const updated = await apiPatch<Matter>(`/matters/${matterId}`, payload);
      setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
      setDirtyMatterIds((current) => {
        const next = new Set(current);
        next.delete(matterId);
        return next;
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleLocalChange(matterId: string, field: keyof MatterPatchPayload, value: string) {
    setDirtyMatterIds((current) => new Set(current).add(matterId));
    void updateMatterLocal(matterId, (matter) => {
      const draft = matter as Matter & Record<string, unknown>;
      draft[field as string] = value;
      return matter;
    });
  }

  function handleBlur(matterId: string) {
    const matter = activeMatters.find((item) => item.id === matterId);
    if (!matter) {
      return;
    }

    void persistMatter(matterId, {
      executionPrompt: normalizeText(matter.executionPrompt) ? matter.executionPrompt ?? null : null,
      expirationDate: normalizeText(matter.expirationDate) ? matter.expirationDate ?? null : null,
      expirationRiOutput: normalizeText(matter.expirationRiOutput) ? matter.expirationRiOutput ?? null : null,
      promotionCommand: normalizeText(matter.promotionCommand) ? matter.promotionCommand ?? null : null,
      internalTelegramGroupId: normalizeText(matter.internalTelegramGroupId)
        ? matter.internalTelegramGroupId ?? null
        : null,
      notes: normalizeText(matter.notes) ? matter.notes ?? null : null
    });
  }

  function updateSubmatterLocal(
    matterId: string,
    submatterId: string,
    updater: (submatter: ExecutionSubmatter) => ExecutionSubmatter
  ) {
    return updateMatterLocal(matterId, (matter) => ({
      ...matter,
      executionSubmatters: (matter.executionSubmatters ?? []).map((submatter) =>
        submatter.id === submatterId ? updater({ ...submatter }) : submatter
      )
    }));
  }

  async function persistSubmatter(matterId: string, submatterId: string, payload: ExecutionSubmatterPatchPayload) {
    try {
      const updated = await apiPatch<Matter>(`/matters/${matterId}/execution-submatters/${submatterId}`, payload);
      setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
      setPanelSubmatter((current) =>
        current?.id === submatterId
          ? updated.executionSubmatters?.find((submatter) => submatter.id === submatterId) ?? current
          : current
      );
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleSubmatterLocalChange(
    matterId: string,
    submatterId: string,
    field: keyof ExecutionSubmatterPatchPayload,
    value: string
  ) {
    void updateSubmatterLocal(matterId, submatterId, (submatter) => {
      const draft = submatter as ExecutionSubmatter & Record<string, unknown>;
      draft[field as string] = value;
      return submatter;
    });
  }

  function handleSubmatterBlur(matterId: string, submatterId: string) {
    const matter = activeMatters.find((item) => item.id === matterId);
    const submatter = matter?.executionSubmatters?.find((item) => item.id === submatterId);
    if (!submatter) {
      return;
    }

    void persistSubmatter(matterId, submatterId, {
      specificProcess: normalizeText(submatter.specificProcess) ? submatter.specificProcess ?? null : null,
      matterIdentifier: normalizeText(submatter.matterIdentifier) ? submatter.matterIdentifier ?? null : null,
      communicationChannel: submatter.communicationChannel,
      executionPrompt: normalizeText(submatter.executionPrompt) ? submatter.executionPrompt ?? null : null,
      expirationDate: normalizeText(submatter.expirationDate) ? submatter.expirationDate ?? null : null,
      expirationRiOutput: normalizeText(submatter.expirationRiOutput) ? submatter.expirationRiOutput ?? null : null,
      promotionCommand: normalizeText(submatter.promotionCommand) ? submatter.promotionCommand ?? null : null,
      holidayAuthorityShortName: normalizeText(submatter.holidayAuthorityShortName)
        ? submatter.holidayAuthorityShortName ?? null
        : null,
      internalTelegramGroupId: normalizeText(submatter.internalTelegramGroupId)
        ? submatter.internalTelegramGroupId ?? null
        : null,
      internalTelegramGroupName: normalizeText(submatter.internalTelegramGroupName)
        ? submatter.internalTelegramGroupName ?? null
        : null,
      milestone: normalizeText(submatter.milestone) ? submatter.milestone ?? null : null,
      concluded: submatter.concluded,
      notes: normalizeText(submatter.notes) ? submatter.notes ?? null : null
    });
  }

  async function handleAddSubmatter(matter: Matter) {
    try {
      setErrorMessage(null);
      const updated = await apiPost<Matter>(`/matters/${matter.id}/execution-submatters`, {});
      setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleDeleteSubmatter(matterId: string, submatterId: string) {
    if (!window.confirm("Eliminar esta subfila de ejecucion?")) {
      return;
    }

    try {
      setErrorMessage(null);
      await apiDelete(`/matters/${matterId}/execution-submatters/${submatterId}`);
      updateMatterLocal(matterId, (matter) => ({
        ...matter,
        executionSubmatters: (matter.executionSubmatters ?? []).filter((submatter) => submatter.id !== submatterId)
      }));
      setPanelSubmatter((current) => (current?.id === submatterId ? null : current));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleSubmatterToggleConcluded(matterId: string, submatterId: string, concluded: boolean) {
    updateSubmatterLocal(matterId, submatterId, (submatter) => {
      submatter.concluded = concluded;
      return submatter;
    });

    await persistSubmatter(matterId, submatterId, { concluded });
  }

  async function handleSubmatterHolidayAuthorityChange(matterId: string, submatterId: string, value: string) {
    const holidayAuthorityShortName = getExecutionHolidayAuthority(value) || null;
    updateSubmatterLocal(matterId, submatterId, (submatter) => {
      submatter.holidayAuthorityShortName = holidayAuthorityShortName ?? undefined;
      return submatter;
    });

    await persistSubmatter(matterId, submatterId, { holidayAuthorityShortName });
  }

  async function handleSubmatterPromotionCommandChange(matterId: string, submatterId: string, value: string) {
    const promotionCommand = getMatterPromotionCommand(value) || null;
    updateSubmatterLocal(matterId, submatterId, (submatter) => {
      submatter.promotionCommand = promotionCommand ?? undefined;
      return submatter;
    });

    await persistSubmatter(matterId, submatterId, { promotionCommand });
  }

  async function handleGenerateRiInput(matterId: string) {
    setGeneratingRiMatterIds((current) => new Set(current).add(matterId));
    setErrorMessage(null);

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/generate-ri-input`, {});
      setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setGeneratingRiMatterIds((current) => {
        const next = new Set(current);
        next.delete(matterId);
        return next;
      });
    }
  }

  async function handleGenerateRiExpiration(matterId: string) {
    setGeneratingCaducidadRiMatterIds((current) => new Set(current).add(matterId));
    setErrorMessage(null);

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/generate-ri-expiration`, {});
      setActiveMatters((items) => sortActiveMatters(replaceMatter(items, updated), clients));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setGeneratingCaducidadRiMatterIds((current) => {
        const next = new Set(current);
        next.delete(matterId);
        return next;
      });
    }
  }

  async function handleToggleConcluded(matterId: string, concluded: boolean) {
    updateMatterLocal(matterId, (matter) => {
      matter.concluded = concluded;
      return matter;
    });

    await persistMatter(matterId, { concluded });
  }

  async function handleHolidayAuthorityChange(matterId: string, value: string) {
    const holidayAuthorityShortName = getExecutionHolidayAuthority(value) || null;
    updateMatterLocal(matterId, (matter) => {
      matter.holidayAuthorityShortName = holidayAuthorityShortName ?? undefined;
      return matter;
    });

    await persistMatter(matterId, { holidayAuthorityShortName });
  }

  async function handlePromotionCommandChange(matterId: string, value: string) {
    const promotionCommand = getMatterPromotionCommand(value) || null;
    updateMatterLocal(matterId, (matter) => {
      matter.promotionCommand = promotionCommand ?? undefined;
      return matter;
    });

    await persistMatter(matterId, { promotionCommand });
  }

  async function handleRestore(matterId: string) {
    if (!window.confirm("Restaurar este asunto a activos?")) {
      return;
    }

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/restore`, {});
      setDeletedMatters((items) => sortDeletedMatters(items.filter((item) => item.id !== updated.id)));
      setActiveMatters((items) => sortActiveMatters([...items, updated], clients));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleCreateTask(payload: {
    eventName: string;
    responsible: string;
    dueDate: string;
    targets: Array<{
      tableCode: string;
      taskName: string;
      dueDate: string;
      termDate: string;
      reportedMonth: string;
    }>;
  }) {
    if (!panelMatter || !module || !legacyConfig) {
      return;
    }

    try {
      setErrorMessage(null);
      const submatterLabel = panelSubmatter ? getSubmatterLabel(panelSubmatter) : "";
      const eventName = payload.eventName.trim() || submatterLabel || panelMatter.subject || "Tarea de ejecucion";
      const submatterTaskData = panelSubmatter
        ? {
            executionSubmatterId: panelSubmatter.id,
            executionSubmatterLabel: submatterLabel,
            executionSubmatterIdentifier: panelSubmatter.matterIdentifier ?? null,
            parentMatterId: panelMatter.id,
            parentMatterIdentifier: panelMatter.matterIdentifier ?? null
          }
        : {};

      await apiPost("/tasks/distributions", {
        moduleId: module.moduleId,
        matterId: panelMatter.id,
        matterNumber: panelMatter.matterNumber,
        clientNumber: getEffectiveClientNumber(panelMatter, clients),
        clientName: panelMatter.clientName || "Sin cliente",
        subject: panelMatter.subject || "",
        specificProcess: panelSubmatter?.specificProcess ?? panelMatter.specificProcess ?? null,
        matterIdentifier: panelMatter.matterIdentifier ?? null,
        eventName,
        responsible: payload.responsible,
        data: {
          source: "execution-selector",
          activeSource: "tasks-distributor",
          ...submatterTaskData
        },
        targets: payload.targets.map((target) => {
          const table = legacyConfig.tables.find((candidate) => candidate.slug === target.tableCode);
          const taskName = target.taskName.trim() || table?.title || eventName;
          const requiresResponsibleAssignment = table?.slug === "escritos-fondo" || table?.slug === "desahogo-prevenciones";
          const targetResponsible = table?.fixedResponsible ?? (requiresResponsibleAssignment ? "" : payload.responsible);

          return {
            tableCode: target.tableCode,
            sourceTable: table?.sourceTable ?? target.tableCode,
            tableLabel: table?.title ?? target.tableCode,
            taskName,
            responsible: targetResponsible,
            dueDate: payload.dueDate,
            termDate: table?.autoTerm ? target.termDate || payload.dueDate : target.termDate || null,
            status: "pendiente",
            workflowStage: 1,
            reportedMonth: target.reportedMonth || null,
            createTerm: Boolean(table?.autoTerm),
            data: {
              source: "execution-selector",
              tableTitle: table?.title,
              activeSource: "tasks-distributor",
              ...submatterTaskData
            }
          };
        })
      });

      const [loadedTrackingRecords, loadedTerms, loadedDistributionHistory] = await Promise.all([
        apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${module.moduleId}`),
        apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${module.moduleId}`),
        apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${module.moduleId}`)
      ]);
      setTrackingRecords(loadedTrackingRecords);
      setTerms(loadedTerms);
      setDistributionHistory(loadedDistributionHistory);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      throw error;
    }
  }

  async function handleUpdateTaskState(task: MatterTaskView, state: TaskState) {
    if (task.sourceType === "tracking") {
      try {
        const updated = await apiPatch<TaskTrackingRecord | null>(`/tasks/tracking-records/${task.id}`, {
          status: state === "COMPLETED" ? "presentado" : "pendiente",
          completedAt: state === "COMPLETED" ? new Date().toISOString() : null
        });
        if (!updated) {
          return;
        }

        setTrackingRecords((items) =>
          items
            .map((record) => (record.id === updated.id ? updated : record))
            .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))
        );
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
      return;
    }

    if (task.sourceType === "term") {
      try {
        const updated = await apiPatch<TaskTerm | null>(`/tasks/terms/${task.id}`, {
          status: state === "COMPLETED" ? "concluida" : "pendiente"
        });
        if (!updated) {
          return;
        }

        setTerms((items) =>
          items
            .map((term) => (term.id === updated.id ? updated : term))
            .sort((left, right) => (left.dueDate ?? left.termDate ?? "").localeCompare(right.dueDate ?? right.termDate ?? ""))
        );
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
      return;
    }
  }

  const panelTasks = panelMatter
    ? panelSubmatter
      ? getSubmatterTasks(panelMatter, panelSubmatter, allTaskMap)
      : getMatterTasks(panelMatter, allTaskMap)
    : [];

  return (
    <section className="page-stack execution-page">
      {showHero ? (
        <header className="hero module-hero">
          <div className="execution-page-topline">
            <button type="button" className="secondary-button" onClick={() => navigate(backPath)}>
              Volver
            </button>
            <div className="module-hero-head">
              <span className="module-hero-icon" aria-hidden="true" style={{ color: module.color }}>
                {module.icon}
              </span>
              <div>
                <h2>{`${titlePrefix}${module.label}`}</h2>
              </div>
            </div>
          </div>
          <p className="muted">{description}</p>
        </header>
      ) : null}

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Asuntos en ejecucion</h2>
          <span>{filteredMatters.length} registros</span>
        </div>

        <div className="matters-toolbar execution-search-toolbar">
          <div className="matters-filters leads-search-filters matters-active-search-filters execution-search-filters">
            <label className="form-field matters-search-field">
              <span>Buscar por palabra</span>
              <input
                type="text"
                value={wordSearch}
                onChange={(event) => setWordSearch(event.target.value)}
                placeholder="ID, asunto, tarea, nota..."
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

          <div className="matters-toolbar-actions">
            <span className="muted">
              Filtra por cliente y abre cada asunto para crear o consultar tareas del equipo.
            </span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Asuntos en ejecucion</h2>
          <span>{filteredMatters.length} registros</span>
        </div>

        <div className="lead-table-shell">
          <div className="lead-table-wrapper">
            <table className="lead-table execution-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>No. Cliente</th>
                  <th>Cliente</th>
                  <th>No. Cotizacion</th>
                  <th className="execution-wide-text-column">Asunto</th>
                  <th className="execution-wide-text-column">Proceso especifico</th>
                  <th>ID Asunto</th>
                  <th>Enviar</th>
                  <th>Canal</th>
                  <th>Siguiente tarea</th>
                  <th>Fecha sig. tarea</th>
                  <th>Origen</th>
                  <th>Ir a tareas activas</th>
                  <th>Órgano para efectos de días inhábiles</th>
                  <th>ID del grupo interno de Telegram</th>
                  <th>Nombre del grupo interno de Telegram</th>
                  <th>
                    <span className="ri-table-column-label">
                      Input de RI
                      <RusconiIntelligenceBadge connectionId="RI-001" label="Ejecucion / Input de RI" />
                    </span>
                  </th>
                  <th>
                    <span className="ri-table-column-label">
                      Caducidad
                      <RusconiIntelligenceBadge connectionId={CADUCIDAD_RI_CONNECTION_ID} label="Ejecucion / Caducidad" />
                    </span>
                  </th>
                  <th>Comando promoción</th>
                  <th>Hito conclusion</th>
                  <th>¿Concluyo?</th>
                  <th>Comentarios</th>
                  <th>Faltantes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={23} className="centered-inline-message">
                      Cargando ejecucion...
                    </td>
                  </tr>
                ) : filteredMatters.length === 0 ? (
                  <tr>
                    <td colSpan={23} className="centered-inline-message">
                      No hay asuntos del equipo en esta vista.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredMatters.map((matter, index) => {
                      const clientNumber = getEffectiveClientNumber(matter, clients);
                      const matterTasks = getMatterTasks(matter, activeTaskMap);
                      const validation = evaluateMatterRow(matter, clientNumber, matterTasks, holidayDateKeysByAuthority);
                      const caducidadRiOutput = normalizeText(matter.expirationRiOutput);
                      const isGeneratingCaducidadRi = generatingCaducidadRiMatterIds.has(matter.id);
                      const isFocusedMatter = matter.id === focusMatterId;
                      const isPromotionCommandFocus = isFocusedMatter && focusTarget === "promotionCommand";
                      const rowClassName = [
                        validation.missing.length > 0 || validation.isOverdue
                          ? "execution-row-danger"
                          : validation.isNextBusinessDay
                            ? "execution-row-next-business"
                            : "",
                        isFocusedMatter ? "execution-row-focused" : ""
                      ].filter(Boolean).join(" ");
                      const rowTitle = [
                        validation.missing.length > 0 ? `Falta: ${validation.missing.join(", ")}` : "",
                        validation.isOverdue ? "Tiene tareas vencidas." : ""
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <Fragment key={matter.id}>
                        <tr id={`execution-matter-row-${matter.id}`} className={rowClassName} title={rowTitle}>
                          <td className="execution-row-index">{index + 1}</td>
                          <td>
                            <input className="lead-cell-input matter-cell-derived" value={clientNumber || "-"} readOnly />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.clientName || ""} readOnly />
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.quoteNumber || ""} readOnly />
                          </td>
                          <td className="execution-wide-text-column">
                            <div className="lead-cell-input matter-cell-readonly execution-readable-cell" title={matter.subject || ""}>
                              {matter.subject || "-"}
                            </div>
                          </td>
                          <td className="execution-wide-text-column">
                            <div className="execution-process-cell">
                              <div
                                className="lead-cell-input matter-cell-readonly execution-readable-cell"
                                title={matter.specificProcess || ""}
                              >
                                {matter.specificProcess || "-"}
                              </div>
                              <button
                                type="button"
                                className="secondary-button execution-submatter-add-button"
                                onClick={() => void handleAddSubmatter(matter)}
                              >
                                + Subfila
                              </button>
                            </div>
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.matterIdentifier || ""} readOnly />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="primary-button matter-inline-button"
                              onClick={() => {
                                setPanelMatter(matter);
                                setPanelSubmatter(null);
                                setPanelMode("create");
                              }}
                            >
                              Crear Tarea
                            </button>
                          </td>
                          <td>
                            <div className="matter-reflection-card">{getChannelLabel(matter.communicationChannel)}</div>
                          </td>
                          <td>
                            <div className="execution-actions-cell">
                              {matterTasks.length === 0 ? (
                                <span className="matter-cell-muted">Sin tareas</span>
                              ) : (
                                matterTasks.map((task) => (
                                  <div key={`${getTaskViewIdentity(task)}:subject`} className="execution-inline-entry">
                                    <strong>{"\u2022"}</strong> {task.subject || task.trackLabel}
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="execution-actions-cell">
                              {matterTasks.length === 0 ? (
                                <span className="matter-cell-muted">-</span>
                              ) : (
                                matterTasks.map((task) => (
                                  <div key={`${getTaskViewIdentity(task)}:due-date`} className="execution-inline-entry">
                                    {getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority) || "S/F"}
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="matter-checkbox-cell">
                            {matterTasks.length === 0 ? (
                              <span className="matter-cell-muted">-</span>
                            ) : (
                              <div className="execution-origin-stack">
                                {matterTasks.map((task) => (
                                  <span
                                    key={`${getTaskViewIdentity(task)}:origin`}
                                    className="execution-origin-entry"
                                  >
                                    <span className="matter-origin-indicator" title={task.sourceLabel}>
                                      i
                                    </span>
                                    <button
                                      type="button"
                                      className="secondary-button execution-origin-link"
                                      onClick={() => navigate(getTaskSourcePath(legacyConfig.slug, task))}
                                      title={`Abrir ${task.sourceLabel}`}
                                    >
                                      Ir
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary-button matter-inline-button"
                              onClick={() => navigate(getTaskDistributorPath(legacyConfig.slug, matter))}
                            >
                              Ir a tareas activas
                            </button>
                          </td>
                          <td>
                            <select
                              className="lead-cell-input execution-authority-select"
                              value={getExecutionHolidayAuthority(matter.holidayAuthorityShortName)}
                              onChange={(event) => void handleHolidayAuthorityChange(matter.id, event.target.value)}
                            >
                              <option value="">Seleccionar...</option>
                              {EXECUTION_HOLIDAY_AUTHORITIES.map((authority) => (
                                <option key={authority} value={authority}>
                                  {authority}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="lead-cell-input execution-telegram-id-input"
                              value={matter.internalTelegramGroupId || ""}
                              onChange={(event) => handleLocalChange(matter.id, "internalTelegramGroupId", event.target.value)}
                              onBlur={() => handleBlur(matter.id)}
                              placeholder="-100..."
                            />
                          </td>
                          <td>
                            <input
                              className="lead-cell-input matter-cell-readonly execution-telegram-name-input"
                              value={matter.internalTelegramGroupName || ""}
                              readOnly
                              placeholder="Pendiente de bot"
                            />
                          </td>
                          <td>
                            <div className="execution-ri-input-cell">
                              <textarea
                                className="lead-cell-input execution-textarea"
                                value={matter.executionPrompt || ""}
                                onChange={(event) => handleLocalChange(matter.id, "executionPrompt", event.target.value)}
                                onBlur={() => handleBlur(matter.id)}
                                placeholder="Prompt operativo..."
                              />
                              {generatingRiMatterIds.has(matter.id) ? (
                                <span className="execution-ri-generation-status" role="status">
                                  Generando RI...
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="execution-caducidad-cell">
                              {caducidadRiOutput ? (
                                <div className="lead-cell-input matter-cell-readonly execution-caducidad-output" title={caducidadRiOutput}>
                                  {caducidadRiOutput}
                                </div>
                              ) : (
                                <input
                                  className="lead-cell-input execution-date-input"
                                  type="date"
                                  value={toDateInput(matter.expirationDate)}
                                  onChange={(event) => {
                                    handleLocalChange(matter.id, "expirationDate", event.target.value);
                                    if (normalizeText(matter.expirationRiOutput)) {
                                      handleLocalChange(matter.id, "expirationRiOutput", "");
                                    }
                                  }}
                                  onBlur={() => handleBlur(matter.id)}
                                />
                              )}
                              {isGeneratingCaducidadRi ? (
                                <span className="execution-ri-generation-status" role="status">
                                  Calculando RI-004...
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <select
                              data-execution-focus="promotionCommand"
                              className={`lead-cell-input execution-promotion-select${isPromotionCommandFocus ? " is-focused-from-manager" : ""}`}
                              value={getMatterPromotionCommand(matter.promotionCommand)}
                              onChange={(event) => void handlePromotionCommandChange(matter.id, event.target.value)}
                            >
                              <option value="">Seleccionar...</option>
                              {MATTER_PROMOTION_COMMANDS.map((command) => (
                                <option key={command} value={command}>
                                  {command}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="lead-cell-input matter-cell-readonly" value={matter.milestone || ""} readOnly />
                          </td>
                          <td className="matter-checkbox-cell">
                            <input
                              type="checkbox"
                              checked={Boolean(matter.concluded)}
                              onChange={(event) => void handleToggleConcluded(matter.id, event.target.checked)}
                            />
                          </td>
                          <td>
                            <textarea
                              className="lead-cell-input execution-textarea"
                              value={matter.notes || ""}
                              onChange={(event) => handleLocalChange(matter.id, "notes", event.target.value)}
                              onBlur={() => handleBlur(matter.id)}
                              placeholder="Comentarios del equipo..."
                            />
                          </td>
                          <td>
                            <div
                              data-execution-focus="missing"
                              className={`execution-missing-cell ${validation.missing.length > 0 ? "is-missing" : ""}`}
                              title={validation.missing.join(", ")}
                              tabIndex={validation.missing.length > 0 ? 0 : undefined}
                            >
                              {validation.missing.length > 0 ? validation.missing.join(", ") : "-"}
                            </div>
                          </td>
                        </tr>
                        {(matter.executionSubmatters ?? []).map((submatter, submatterIndex) => {
                          const submatterTasks = getSubmatterTasks(matter, submatter, activeTaskMap);
                          const submatterValidation = evaluateSubmatterRow(
                            submatter,
                            submatterTasks,
                            holidayDateKeysByAuthority
                          );
                          const submatterCaducidadRiOutput = normalizeText(submatter.expirationRiOutput);
                          const submatterRowClassName = [
                            "execution-submatter-row",
                            submatterValidation.missing.length > 0 || submatterValidation.isOverdue
                              ? "execution-row-danger"
                              : submatterValidation.isNextBusinessDay
                                ? "execution-row-next-business"
                                : ""
                          ].filter(Boolean).join(" ");
                          const submatterRowTitle = [
                            submatterValidation.missing.length > 0
                              ? `Falta: ${submatterValidation.missing.join(", ")}`
                              : "",
                            submatterValidation.isOverdue ? "Tiene tareas vencidas." : ""
                          ].filter(Boolean).join(" ");

                          return (
                            <tr
                              id={`execution-submatter-row-${submatter.id}`}
                              key={submatter.id}
                              className={submatterRowClassName}
                              title={submatterRowTitle}
                            >
                              <td colSpan={5} className="execution-submatter-label-cell">
                                <div className="execution-submatter-label">
                                  <span>Subfila {index + 1}.{submatterIndex + 1}</span>
                                  <strong>{getSubmatterLabel(submatter)}</strong>
                                  <small>{matter.subject || "Asunto madre"}</small>
                                  <button
                                    type="button"
                                    className="danger-button execution-submatter-delete-button"
                                    onClick={() => void handleDeleteSubmatter(matter.id, submatter.id)}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                              <td className="execution-wide-text-column">
                                <input
                                  className="lead-cell-input"
                                  value={submatter.specificProcess || ""}
                                  onChange={(event) =>
                                    handleSubmatterLocalChange(matter.id, submatter.id, "specificProcess", event.target.value)
                                  }
                                  onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                  placeholder="Proceso especifico del subasunto..."
                                />
                              </td>
                              <td>
                                <input
                                  className="lead-cell-input"
                                  value={submatter.matterIdentifier || ""}
                                  onChange={(event) =>
                                    handleSubmatterLocalChange(matter.id, submatter.id, "matterIdentifier", event.target.value)
                                  }
                                  onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                  placeholder="ID subfila"
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="primary-button matter-inline-button"
                                  onClick={() => {
                                    setPanelMatter(matter);
                                    setPanelSubmatter(submatter);
                                    setPanelMode("create");
                                  }}
                                >
                                  Crear Tarea
                                </button>
                              </td>
                              <td>
                                <select
                                  className="lead-cell-input execution-channel-select"
                                  value={submatter.communicationChannel || "WHATSAPP"}
                                  onChange={(event) => {
                                    const communicationChannel = event.target.value as Matter["communicationChannel"];
                                    handleSubmatterLocalChange(
                                      matter.id,
                                      submatter.id,
                                      "communicationChannel",
                                      communicationChannel
                                    );
                                    void persistSubmatter(matter.id, submatter.id, { communicationChannel });
                                  }}
                                >
                                  {CHANNEL_VALUES.map((channel) => (
                                    <option key={channel} value={channel}>
                                      {getChannelLabel(channel)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <div className="execution-actions-cell">
                                  {submatterTasks.length === 0 ? (
                                    <span className="matter-cell-muted">Sin tareas</span>
                                  ) : (
                                    submatterTasks.map((task) => (
                                      <div key={`${getTaskViewIdentity(task)}:submatter-subject`} className="execution-inline-entry">
                                        <strong>{"\u2022"}</strong> {task.subject || task.trackLabel}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className="execution-actions-cell">
                                  {submatterTasks.length === 0 ? (
                                    <span className="matter-cell-muted">-</span>
                                  ) : (
                                    submatterTasks.map((task) => (
                                      <div key={`${getTaskViewIdentity(task)}:submatter-due-date`} className="execution-inline-entry">
                                        {getEffectiveSubmatterTaskDueDate(task, submatter, holidayDateKeysByAuthority) || "S/F"}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="matter-checkbox-cell">
                                {submatterTasks.length === 0 ? (
                                  <span className="matter-cell-muted">-</span>
                                ) : (
                                  <div className="execution-origin-stack">
                                    {submatterTasks.map((task) => (
                                      <span
                                        key={`${getTaskViewIdentity(task)}:submatter-origin`}
                                        className="execution-origin-entry"
                                      >
                                        <span className="matter-origin-indicator" title={task.sourceLabel}>
                                          i
                                        </span>
                                        <button
                                          type="button"
                                          className="secondary-button execution-origin-link"
                                          onClick={() => navigate(getTaskSourcePath(legacyConfig.slug, task))}
                                          title={`Abrir ${task.sourceLabel}`}
                                        >
                                          Ir
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="secondary-button matter-inline-button"
                                  onClick={() => navigate(getTaskDistributorPath(legacyConfig.slug, matter))}
                                >
                                  Ir a tareas activas
                                </button>
                              </td>
                              <td>
                                <select
                                  className="lead-cell-input execution-authority-select"
                                  value={getExecutionHolidayAuthority(submatter.holidayAuthorityShortName)}
                                  onChange={(event) =>
                                    void handleSubmatterHolidayAuthorityChange(matter.id, submatter.id, event.target.value)
                                  }
                                >
                                  <option value="">Seleccionar...</option>
                                  {EXECUTION_HOLIDAY_AUTHORITIES.map((authority) => (
                                    <option key={authority} value={authority}>
                                      {authority}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  className="lead-cell-input execution-telegram-id-input"
                                  value={submatter.internalTelegramGroupId || ""}
                                  onChange={(event) =>
                                    handleSubmatterLocalChange(
                                      matter.id,
                                      submatter.id,
                                      "internalTelegramGroupId",
                                      event.target.value
                                    )
                                  }
                                  onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                  placeholder="-100..."
                                />
                              </td>
                              <td>
                                <input
                                  className="lead-cell-input execution-telegram-name-input"
                                  value={submatter.internalTelegramGroupName || ""}
                                  onChange={(event) =>
                                    handleSubmatterLocalChange(
                                      matter.id,
                                      submatter.id,
                                      "internalTelegramGroupName",
                                      event.target.value
                                    )
                                  }
                                  onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                  placeholder="Pendiente de bot"
                                />
                              </td>
                              <td>
                                <div className="execution-ri-input-cell">
                                  <textarea
                                    className="lead-cell-input execution-textarea"
                                    value={submatter.executionPrompt || ""}
                                    onChange={(event) =>
                                      handleSubmatterLocalChange(matter.id, submatter.id, "executionPrompt", event.target.value)
                                    }
                                    onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                    placeholder="Prompt operativo..."
                                  />
                                </div>
                              </td>
                              <td>
                                <div className="execution-caducidad-cell">
                                  <input
                                    className="lead-cell-input execution-date-input"
                                    type="date"
                                    value={toDateInput(submatter.expirationDate)}
                                    onChange={(event) => {
                                      handleSubmatterLocalChange(matter.id, submatter.id, "expirationDate", event.target.value);
                                      if (submatterCaducidadRiOutput) {
                                        handleSubmatterLocalChange(matter.id, submatter.id, "expirationRiOutput", "");
                                      }
                                    }}
                                    onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                  />
                                  {submatterCaducidadRiOutput ? (
                                    <textarea
                                      className="lead-cell-input execution-caducidad-note"
                                      value={submatter.expirationRiOutput || ""}
                                      onChange={(event) =>
                                        handleSubmatterLocalChange(
                                          matter.id,
                                          submatter.id,
                                          "expirationRiOutput",
                                          event.target.value
                                        )
                                      }
                                      onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                      aria-label="Resultado RI-004"
                                    />
                                  ) : null}
                                </div>
                              </td>
                              <td>
                                <select
                                  className="lead-cell-input execution-promotion-select"
                                  value={getMatterPromotionCommand(submatter.promotionCommand)}
                                  onChange={(event) =>
                                    void handleSubmatterPromotionCommandChange(matter.id, submatter.id, event.target.value)
                                  }
                                >
                                  <option value="">Seleccionar...</option>
                                  {MATTER_PROMOTION_COMMANDS.map((command) => (
                                    <option key={command} value={command}>
                                      {command}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  className="lead-cell-input"
                                  value={submatter.milestone || ""}
                                  onChange={(event) =>
                                    handleSubmatterLocalChange(matter.id, submatter.id, "milestone", event.target.value)
                                  }
                                  onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                  placeholder="Hito..."
                                />
                              </td>
                              <td className="matter-checkbox-cell">
                                <input
                                  type="checkbox"
                                  checked={Boolean(submatter.concluded)}
                                  onChange={(event) =>
                                    void handleSubmatterToggleConcluded(matter.id, submatter.id, event.target.checked)
                                  }
                                />
                              </td>
                              <td>
                                <textarea
                                  className="lead-cell-input execution-textarea"
                                  value={submatter.notes || ""}
                                  onChange={(event) =>
                                    handleSubmatterLocalChange(matter.id, submatter.id, "notes", event.target.value)
                                  }
                                  onBlur={() => handleSubmatterBlur(matter.id, submatter.id)}
                                  placeholder="Comentarios del subasunto..."
                                />
                              </td>
                              <td>
                                <div
                                  className={`execution-missing-cell ${submatterValidation.missing.length > 0 ? "is-missing" : ""}`}
                                  title={submatterValidation.missing.join(", ")}
                                  tabIndex={submatterValidation.missing.length > 0 ? 0 : undefined}
                                >
                                  {submatterValidation.missing.length > 0 ? submatterValidation.missing.join(", ") : "-"}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        </Fragment>
                      );
                    })}

                    <tr className="execution-table-note">
                      <td colSpan={23}>Para agregar un nuevo asunto, se debe hacer desde el Manager de tareas.</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Papelera de reciclaje</h2>
          <span>{filteredDeletedMatters.length} registros</span>
        </div>
        <p className="muted matter-table-caption">
          Los asuntos eliminados desaparecen definitivamente despues de 30 dias.
        </p>

        <div className="lead-table-shell">
          <div className="lead-table-wrapper">
            <table className="lead-table execution-table execution-table-recycle">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>No. Cliente</th>
                  <th>Cliente</th>
                  <th>No. Cotizacion</th>
                  <th className="execution-wide-text-column">Asunto</th>
                  <th>ID Asunto</th>
                  <th>Canal</th>
                  <th>Siguiente tarea</th>
                  <th>Fecha sig. tarea</th>
                  <th>
                    <span className="ri-table-column-label">
                      Input de RI
                      <RusconiIntelligenceBadge connectionId="RI-001" label="Ejecucion / Input de RI" />
                    </span>
                  </th>
                  <th>
                    <span className="ri-table-column-label">
                      Caducidad
                      <RusconiIntelligenceBadge connectionId={CADUCIDAD_RI_CONNECTION_ID} label="Ejecucion / Caducidad" />
                    </span>
                  </th>
                  <th>Comando promoción</th>
                  <th>Hito conclusion</th>
                  <th>¿Concluyo?</th>
                  <th>Notas</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={16} className="centered-inline-message">
                      Cargando papelera...
                    </td>
                  </tr>
                ) : filteredDeletedMatters.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="centered-inline-message">
                      Papelera vacia.
                    </td>
                  </tr>
                ) : (
                  filteredDeletedMatters.map((matter, index) => {
                    const matterTasks = getMatterTasks(matter, allTaskMap);

                    return (
                      <tr key={matter.id}>
                        <td className="execution-row-index">{index + 1}</td>
                        <td>{getEffectiveClientNumber(matter, clients) || "-"}</td>
                        <td>{matter.clientName || "-"}</td>
                        <td>{matter.quoteNumber || "-"}</td>
                        <td className="execution-wide-text-column">
                          <div className="lead-cell-input matter-cell-readonly execution-readable-cell" title={matter.subject || ""}>
                            {matter.subject || "-"}
                          </div>
                        </td>
                        <td>{matter.matterIdentifier || "-"}</td>
                        <td>{getChannelLabel(matter.communicationChannel)}</td>
                        <td>
                          {matterTasks.length === 0 ? (
                            <span className="matter-cell-muted">Sin tareas</span>
                          ) : (
                            matterTasks.map((task) => (
                              <div key={`${getTaskViewIdentity(task)}:recycle-subject`} className="execution-inline-entry">
                                <strong>{"\u2022"}</strong> {task.subject || task.trackLabel}
                              </div>
                            ))
                          )}
                        </td>
                        <td>
                          {matterTasks.length === 0 ? (
                            <span className="matter-cell-muted">-</span>
                          ) : (
                            matterTasks.map((task) => (
                              <div key={`${getTaskViewIdentity(task)}:recycle-due-date`} className="execution-inline-entry">
                                {getEffectiveTaskDueDate(task, matter, holidayDateKeysByAuthority) || "S/F"}
                              </div>
                            ))
                          )}
                        </td>
                        <td>{matter.executionPrompt || "-"}</td>
                        <td>{getCaducidadColumnValue(matter) || "-"}</td>
                        <td>{matter.promotionCommand || "-"}</td>
                        <td>{matter.milestone || "-"}</td>
                        <td>{matter.concluded ? "Si" : "No"}</td>
                        <td>{matter.notes || "-"}</td>
                        <td>
                          <button type="button" className="secondary-button matter-inline-button" onClick={() => void handleRestore(matter.id)}>
                            Regresar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ExecutionTaskPanel
        module={module}
        legacyConfig={legacyConfig}
        distributionEvents={distributionEvents}
        matter={panelMatter}
        submatter={panelSubmatter}
        clientNumber={panelMatter ? getEffectiveClientNumber(panelMatter, clients) : ""}
        mode={panelMode}
        tasks={panelTasks}
        onClose={() => {
          setPanelMatter(null);
          setPanelSubmatter(null);
          setPanelMode(null);
        }}
        onModeChange={setPanelMode}
        onCreateTask={handleCreateTask}
        onUpdateState={handleUpdateTaskState}
      />
    </section>
  );
}

export function ExecutionTeamPage() {
  return <ExecutionTeamWorkspace />;
}
