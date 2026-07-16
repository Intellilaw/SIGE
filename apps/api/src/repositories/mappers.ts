import type { Prisma } from "@prisma/client";
import type {
  AuthUser,
  AccountingAccount,
  AccountingCfdiDocument,
  AccountingJournalEntry,
  AccountingJournalLine,
  AccountingPeriod,
  AccountingRule,
  AccountingSettings,
  BudgetPlan,
  BudgetPlanExpenseBreakdownItem,
  BudgetPlanSnapshot,
  Client,
  CommissionExclusion,
  CommissionPaymentAcknowledgement,
  CommissionReceiver,
  CommissionSnapshot,
  ProjectorCommission,
  DailyDocumentAssignment,
  ExecutionSubmatter,
  FinanceRecord,
  FinanceSnapshot,
  GeneralExpense,
  GeneralExpenseEmrtDailyAcknowledgement,
  GeneralExpensePayrollEntry,
  Holiday,
  InternalContract,
  InternalContractCollaborator,
  InternalContractTemplate,
  LaborFile,
  LaborFileDocument,
  LaborGlobalVacationDay,
  LaborVacationEvent,
  Lead,
  ManagedTeam,
  ManagedUser,
  Matter,
  Quote,
  QuoteTemplate,
  TaskAdditionalTask,
  TaskDistributionEvent,
  TaskDistributionHistory,
  TaskItem,
  TaskModuleDefinition,
  TaskModuleMember,
  TaskTerm,
  TaskTrackingRecord
} from "@sige/contracts";
import { buildQuoteTitle, deriveEffectivePermissions } from "@sige/contracts";
import { ORGANIZATIONS, getDefaultOrganization } from "@sige/contracts";

import type { RefreshTokenRecord, StoredUser } from "./types";

const PAYROLL_BONUS_RATE = 0.1;

function repairMojibakeText(value?: string | null) {
  if (!value || !/[ÃÂâ]/.test(value)) {
    return value;
  }

  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return decoded.includes("�") ? value : decoded;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry));
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)])
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asQuoteTemplateCell(value: unknown, fallback = ""): QuoteTemplate["tableRows"][number]["paymentMoment"] {
  if (!value || typeof value !== "object") {
    return {
      value: fallback,
      rowSpan: 1,
      hidden: false
    };
  }

  const candidate = value as {
    value?: unknown;
    rowSpan?: unknown;
    hidden?: unknown;
  };

  return {
    value: typeof candidate.value === "string" ? candidate.value : fallback,
    rowSpan: typeof candidate.rowSpan === "number" && candidate.rowSpan > 0 ? Math.floor(candidate.rowSpan) : 1,
    hidden: Boolean(candidate.hidden)
  };
}

function asQuoteTemplateAmountColumns(value: unknown): QuoteTemplate["amountColumns"] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { id: "primary", title: "Monto 1", enabled: true, mode: "FIXED" },
      { id: "secondary", title: "Monto 2", enabled: false, mode: "FIXED" }
    ];
  }

  const parsed = value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const candidate = entry as {
        id?: unknown;
        title?: unknown;
        enabled?: unknown;
        mode?: unknown;
      };

      return {
        id: typeof candidate.id === "string" ? candidate.id : index === 0 ? "primary" : "secondary",
        title: typeof candidate.title === "string" ? candidate.title : `Monto ${index + 1}`,
        enabled: index === 0 ? true : Boolean(candidate.enabled),
        mode: candidate.mode === "VARIABLE" ? "VARIABLE" : "FIXED"
      } satisfies QuoteTemplate["amountColumns"][number];
    });

  if (parsed.length === 1) {
    parsed.push({ id: "secondary", title: "Monto 2", enabled: false, mode: "FIXED" });
  }

  return parsed.slice(0, 2);
}

function asLegacyQuoteTemplateRows(lineItems: QuoteTemplate["lineItems"]): QuoteTemplate["tableRows"] {
  if (lineItems.length === 0) {
    return [
      {
        id: "row-1",
        conceptDescription: "",
        excludeFromIva: false,
        amountCells: [
          { value: "", rowSpan: 1, hidden: false },
          { value: "", rowSpan: 1, hidden: false }
        ],
        paymentMoment: { value: "", rowSpan: 1, hidden: false },
        notesCell: { value: "", rowSpan: 1, hidden: false }
      }
    ];
  }

  return lineItems.map((lineItem, index) => ({
    id: `legacy-row-${index + 1}`,
    conceptDescription: lineItem.concept,
    excludeFromIva: false,
    amountCells: [
      { value: String(lineItem.amountMxn), rowSpan: 1, hidden: false },
      { value: "", rowSpan: 1, hidden: false }
    ],
    paymentMoment: { value: "", rowSpan: 1, hidden: false },
    notesCell: { value: "", rowSpan: 1, hidden: false }
  }));
}

function asQuoteTemplateRows(value: unknown, lineItems: QuoteTemplate["lineItems"]): QuoteTemplate["tableRows"] {
  if (!Array.isArray(value) || value.length === 0) {
    return asLegacyQuoteTemplateRows(lineItems);
  }

  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const candidate = entry as {
        id?: unknown;
        conceptDescription?: unknown;
        excludeFromIva?: unknown;
        amountCells?: unknown;
        paymentMoment?: unknown;
        notesCell?: unknown;
        notes?: unknown;
      };

      const amountCellsSource = Array.isArray(candidate.amountCells) ? candidate.amountCells : [];
      const amountCells = [0, 1].map((cellIndex) =>
        asQuoteTemplateCell(amountCellsSource[cellIndex], "")
      );

      return {
        id: typeof candidate.id === "string" ? candidate.id : `row-${index + 1}`,
        conceptDescription:
          typeof candidate.conceptDescription === "string" ? candidate.conceptDescription : "",
        excludeFromIva: Boolean(candidate.excludeFromIva),
        amountCells,
        paymentMoment: asQuoteTemplateCell(candidate.paymentMoment, ""),
        notesCell: asQuoteTemplateCell(
          candidate.notesCell,
          typeof candidate.notes === "string" ? candidate.notes : ""
        )
      } satisfies QuoteTemplate["tableRows"][number];
    });
}

export function mapUser(record: {
  id: string;
  organizationId?: string | null;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  legacyRole: string;
  team: string | null;
  legacyTeam: string | null;
  secondaryTeam: string | null;
  secondaryLegacyTeam: string | null;
  specificRole: string | null;
  secondarySpecificRole: string | null;
  permissions: Prisma.JsonValue;
  isExternal: boolean;
  createLaborFile: boolean;
  isActive: boolean;
  passwordResetRequired: boolean;
}): AuthUser {
  const organization =
    ORGANIZATIONS.find((entry) => entry.id === record.organizationId) ?? getDefaultOrganization();

  return {
    id: record.id,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    organizationName: organization.name,
    email: record.email,
    username: repairMojibakeText(record.username) ?? record.username,
    displayName: repairMojibakeText(record.displayName) ?? record.displayName,
    shortName: record.shortName ?? undefined,
    role: record.role as AuthUser["role"],
    legacyRole: record.legacyRole as AuthUser["legacyRole"],
    team: (record.team ?? undefined) as AuthUser["team"],
    legacyTeam: repairMojibakeText(record.legacyTeam) ?? undefined,
    secondaryTeam: (record.secondaryTeam ?? undefined) as AuthUser["secondaryTeam"],
    secondaryLegacyTeam: repairMojibakeText(record.secondaryLegacyTeam) ?? undefined,
    specificRole: repairMojibakeText(record.specificRole) ?? undefined,
    secondarySpecificRole: repairMojibakeText(record.secondarySpecificRole) ?? undefined,
    permissions: deriveEffectivePermissions({
      legacyRole: record.legacyRole as AuthUser["legacyRole"],
      team: (record.team ?? undefined) as AuthUser["team"],
      legacyTeam: repairMojibakeText(record.legacyTeam),
      secondaryTeam: (record.secondaryTeam ?? undefined) as AuthUser["secondaryTeam"],
      secondaryLegacyTeam: repairMojibakeText(record.secondaryLegacyTeam),
      specificRole: repairMojibakeText(record.specificRole),
      secondarySpecificRole: repairMojibakeText(record.secondarySpecificRole),
      permissions: Array.isArray(record.permissions)
        ? record.permissions.filter((permission): permission is string => typeof permission === "string")
        : [],
      isExternal: record.isExternal
    }),
    isExternal: record.isExternal,
    createLaborFile: record.createLaborFile,
    isActive: record.isActive,
    passwordResetRequired: record.passwordResetRequired
  };
}

export function mapStoredUser(record: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  legacyRole: string;
  team: string | null;
  legacyTeam: string | null;
  secondaryTeam: string | null;
  secondaryLegacyTeam: string | null;
  specificRole: string | null;
  secondarySpecificRole: string | null;
  permissions: Prisma.JsonValue;
  isExternal: boolean;
  createLaborFile: boolean;
  isActive: boolean;
  passwordResetRequired: boolean;
  passwordHash: string;
}): StoredUser {
  return {
    ...mapUser(record),
    passwordHash: record.passwordHash
  };
}

export function mapManagedUser(record: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  shortName: string | null;
  role: string;
  legacyRole: string;
  team: string | null;
  legacyTeam: string | null;
  secondaryTeam: string | null;
  secondaryLegacyTeam: string | null;
  specificRole: string | null;
  secondarySpecificRole: string | null;
  permissions: Prisma.JsonValue;
  isExternal: boolean;
  createLaborFile: boolean;
  isActive: boolean;
  passwordResetRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  emailConfirmedAt: Date | null;
}): ManagedUser {
  return {
    ...mapUser(record),
    isExternal: record.isExternal,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastLoginAt: record.lastLoginAt?.toISOString(),
    emailConfirmedAt: record.emailConfirmedAt?.toISOString()
  };
}

export function mapManagedTeam(record: {
  id: string;
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  deactivatedAt: Date | null;
  executionSpaceEnabled: boolean;
  executionSpaceDeactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}, memberCount = 0): ManagedTeam {
  return {
    id: record.id,
    key: record.key,
    label: repairMojibakeText(record.label) ?? record.label,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    memberCount,
    executionSpaceEnabled: record.executionSpaceEnabled,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deactivatedAt: record.deactivatedAt?.toISOString(),
    executionSpaceDeactivatedAt: record.executionSpaceDeactivatedAt?.toISOString()
  };
}

export function mapClient(record: { id: string; clientNumber: string; name: string; createdAt: Date }): Client {
  return {
    id: record.id,
    clientNumber: record.clientNumber,
    name: record.name,
    createdAt: record.createdAt.toISOString()
  };
}

function asInternalContractPaymentMilestones(value: Prisma.JsonValue): InternalContract["paymentMilestones"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry, index) => {
      const candidate = entry as {
        id?: unknown;
        label?: unknown;
        dueDate?: unknown;
        amountMxn?: unknown;
        notes?: unknown;
      };
      const amountMxn = Number(candidate.amountMxn);

      return {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : `milestone-${index + 1}`,
        label: typeof candidate.label === "string" ? candidate.label : "",
        dueDate: typeof candidate.dueDate === "string" && candidate.dueDate ? candidate.dueDate : undefined,
        amountMxn: Number.isFinite(amountMxn) && amountMxn > 0 ? amountMxn : undefined,
        notes: typeof candidate.notes === "string" && candidate.notes ? candidate.notes : undefined
      };
    })
    .filter((milestone) => milestone.label || milestone.dueDate || milestone.notes || milestone.amountMxn);
}

function inferInternalContractFormat(originalFileName?: string | null, fileMimeType?: string | null): InternalContract["availableFormats"][number] | null {
  const normalizedMimeType = (fileMimeType ?? "").toLowerCase();
  const normalizedFileName = (originalFileName ?? "").toLowerCase();

  if (normalizedMimeType.includes("pdf") || normalizedFileName.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    normalizedMimeType.includes("wordprocessingml.document")
    || normalizedMimeType.includes("msword")
    || normalizedFileName.endsWith(".docx")
    || normalizedFileName.endsWith(".doc")
  ) {
    return "docx";
  }

  return null;
}

function buildInternalContractAvailableFormats(record: {
  contractType?: string | null;
  sourceMatterId?: string | null;
  signatureStatus?: string | null;
  originalFileName?: string | null;
  fileMimeType?: string | null;
  pdfOriginalFileName?: string | null;
  pdfFileMimeType?: string | null;
}): InternalContract["availableFormats"] {
  const formats = new Set<InternalContract["availableFormats"][number]>();
  const primaryFormat = inferInternalContractFormat(record.originalFileName, record.fileMimeType);
  const pdfFormat = inferInternalContractFormat(record.pdfOriginalFileName, record.pdfFileMimeType);

  if (primaryFormat) {
    formats.add(primaryFormat);
  }

  if (pdfFormat && (!(record.contractType === "PROFESSIONAL_SERVICES" && record.sourceMatterId) || record.signatureStatus === "SIGNED")) {
    formats.add(pdfFormat);
  }

  return [...formats];
}

export function mapInternalContract(record: {
  id: string;
  contractNumber: string;
  title: string | null;
  contractType: string;
  documentKind: string;
  clientId: string | null;
  clientNumber: string | null;
  clientName: string | null;
  collaboratorName: string | null;
  sourceMatterId: string | null;
  sourceQuoteId: string | null;
  signatureStatus: string | null;
  originalFileName: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  pdfOriginalFileName: string | null;
  pdfFileMimeType: string | null;
  pdfFileSizeBytes: number | null;
  paymentMilestones: Prisma.JsonValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): InternalContract {
  return {
    id: record.id,
    contractNumber: record.contractNumber,
    title: record.title ?? undefined,
    contractType: record.contractType as InternalContract["contractType"],
    documentKind: record.documentKind as InternalContract["documentKind"],
    clientId: record.clientId ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName ?? undefined,
    collaboratorName: record.collaboratorName ?? undefined,
    sourceMatterId: record.sourceMatterId ?? undefined,
    sourceQuoteId: record.sourceQuoteId ?? undefined,
    signatureStatus:
      record.signatureStatus === "SIGNED" || record.signatureStatus === "PENDING"
        ? record.signatureStatus
        : undefined,
    originalFileName: record.originalFileName ?? undefined,
    fileMimeType: record.fileMimeType ?? undefined,
    fileSizeBytes: record.fileSizeBytes ?? undefined,
    pdfOriginalFileName: record.pdfOriginalFileName ?? undefined,
    pdfFileMimeType: record.pdfFileMimeType ?? undefined,
    pdfFileSizeBytes: record.pdfFileSizeBytes ?? undefined,
    availableFormats: buildInternalContractAvailableFormats(record),
    paymentMilestones: asInternalContractPaymentMilestones(record.paymentMilestones),
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapInternalContractCollaborator(record: {
  id: string;
  displayName: string;
  username: string;
  shortName: string | null;
  team: string | null;
}): InternalContractCollaborator {
  return {
    id: record.id,
    name: record.displayName || record.username,
    shortName: record.shortName ?? undefined,
    team: (record.team ?? undefined) as InternalContractCollaborator["team"]
  };
}

export function mapInternalContractTemplate(record: {
  id: string;
  title: string;
  originalFileName: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): InternalContractTemplate {
  return {
    id: record.id,
    title: record.title,
    originalFileName: record.originalFileName,
    fileMimeType: record.fileMimeType ?? undefined,
    fileSizeBytes: record.fileSizeBytes ?? undefined,
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toDateOnlyKey(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
}

function makeDateKey(year: number, month: number, day: number) {
  const safeDay = Math.min(day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function addDateKey(value: string, offset: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getCurrentVacationYearStartKey(hireDateKey: string, todayKey = toDateOnlyKey(new Date())) {
  const hireDate = dateFromKey(hireDateKey);
  const today = dateFromKey(todayKey);
  const hireMonth = hireDate.getUTCMonth() + 1;
  const hireDay = hireDate.getUTCDate();
  let year = today.getUTCFullYear();
  let anniversary = makeDateKey(year, hireMonth, hireDay);

  if (anniversary > todayKey) {
    year -= 1;
    anniversary = makeDateKey(year, hireMonth, hireDay);
  }

  return anniversary;
}

function getPreviousVacationYearRange(currentYearStartDate: string) {
  const currentYearStart = dateFromKey(currentYearStartDate);
  const month = currentYearStart.getUTCMonth() + 1;
  const day = currentYearStart.getUTCDate();
  const previousYearStartDate = makeDateKey(currentYearStart.getUTCFullYear() - 1, month, day);

  return {
    previousYearStartDate,
    previousYearEndDate: addDateKey(currentYearStartDate, -1)
  };
}

function getCompletedYears(hireDateKey: string, currentYearStartKey: string) {
  return Math.max(0, dateFromKey(currentYearStartKey).getUTCFullYear() - dateFromKey(hireDateKey).getUTCFullYear());
}

function getVacationEntitlementDays(completedYears: number) {
  if (completedYears < 1) {
    return 0;
  }

  if (completedYears <= 5) {
    return 10 + completedYears * 2;
  }

  return 22 + Math.floor((completedYears - 6) / 5) * 2;
}

const YEAR_WORDS = [
  "cero",
  "un",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte"
];

function formatCompletedYearsLabel(value: number) {
  return YEAR_WORDS[value] ?? String(value);
}

function formatLongDateKey(value: string) {
  if (!value) {
    return "-";
  }

  return dateFromKey(value).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatVacationRange(startDate?: string, endDate?: string) {
  if (!startDate) {
    return "";
  }

  if (!endDate || endDate === startDate) {
    return formatLongDateKey(startDate);
  }

  return `${formatLongDateKey(startDate)} al ${formatLongDateKey(endDate)}`;
}

function parseVacationDateKeys(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .filter((entry): entry is string => typeof entry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry))
      .map((entry) => entry.slice(0, 10))
  )).sort();
}

function getGlobalVacationDateKeys(day: Pick<LaborGlobalVacationDay, "date" | "days" | "vacationDates">) {
  if (day.vacationDates.length > 0) {
    return [...day.vacationDates].sort();
  }

  const days = Number(day.days);
  if (!day.date || !Number.isInteger(days) || days <= 1) {
    return day.date ? [day.date] : [];
  }

  return Array.from({ length: days }, (_, index) => addDateKey(day.date, index));
}

function enumerateVacationDateKeys(startDate?: string, endDate?: string) {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const result: string[] = [];
  let current = startDate;
  while (current <= endDate && result.length < 370) {
    result.push(current);
    current = addDateKey(current, 1);
  }

  return result;
}

function getVacationEventDateKeys(event: LaborVacationEvent) {
  const explicitDates = event.vacationDates ?? [];
  if (explicitDates.length > 0) {
    return [...explicitDates].sort();
  }

  if (event.startDate && event.endDate) {
    return enumerateVacationDateKeys(event.startDate, event.endDate);
  }

  const days = Number(event.days ?? 0);
  if (event.startDate && Number.isInteger(days) && days > 1 && days <= 31) {
    return Array.from({ length: days }, (_, index) => addDateKey(event.startDate!, index));
  }

  return event.startDate ? [event.startDate] : [];
}

function getRepresentedDaysInRange(recordedDays: number, dateKeys: string[], startDate: string, endDate: string) {
  const dateKeysInRange = dateKeys.filter((dateKey) => dateKey >= startDate && dateKey <= endDate);
  if (dateKeysInRange.length === 0) {
    return 0;
  }

  if (recordedDays > 0 && dateKeys.length > 0 && Math.abs(recordedDays - dateKeys.length) > 0.01) {
    return dateKeysInRange.length * (recordedDays / dateKeys.length);
  }

  return dateKeysInRange.length;
}

function getVacationEventDaysInRange(event: LaborVacationEvent, startDate: string, endDate: string) {
  return getRepresentedDaysInRange(Number(event.days ?? 0), getVacationEventDateKeys(event), startDate, endDate);
}

function getGlobalVacationDayDaysInRange(day: LaborGlobalVacationDay, startDate: string, endDate: string) {
  return getRepresentedDaysInRange(Number(day.days ?? 0), getGlobalVacationDateKeys(day), startDate, endDate);
}

function formatVacationDateSelection(event: LaborVacationEvent) {
  const dates = event.vacationDates ?? [];
  if (dates.length === 0) {
    return formatVacationRange(event.startDate, event.endDate);
  }

  const continuousRange = event.startDate && event.endDate && dates.length > 1
    ? formatVacationRange(event.startDate, event.endDate)
    : "";
  const rangeLength = event.startDate && event.endDate
    ? Math.round((dateFromKey(event.endDate).getTime() - dateFromKey(event.startDate).getTime()) / 86_400_000) + 1
    : 0;
  if (continuousRange && rangeLength === dates.length) {
    return continuousRange;
  }

  return dates.map(formatLongDateKey).join(", ");
}

function formatGlobalVacationDateSelection(day: LaborGlobalVacationDay) {
  const dates = getGlobalVacationDateKeys(day);
  if (dates.length === 0) {
    return "";
  }

  return formatVacationDateSelection({
    id: day.id,
    laborFileId: "",
    eventType: "GLOBAL_VACATION",
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    vacationDates: dates,
    days: day.days,
    description: day.description,
    createdAt: day.createdAt,
    updatedAt: day.updatedAt
  });
}

function getMexicoCityDateKey(value = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Mexico_City",
    year: "numeric"
  }).formatToParts(value);
  const parts = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getVacationEventLastDateKey(event: LaborVacationEvent) {
  const dates = [...(event.vacationDates ?? [])].sort();
  if (dates.length > 0) {
    return dates[dates.length - 1];
  }

  return event.endDate ?? event.startDate ?? "";
}

function isPastVacationEvent(event: LaborVacationEvent, todayKey = getMexicoCityDateKey()) {
  const lastDateKey = getVacationEventLastDateKey(event);
  return Boolean(lastDateKey && lastDateKey < todayKey);
}

function isAuthorizedVacationEvent(event: LaborVacationEvent) {
  const mimeType = (event.acceptanceFileMimeType ?? "").toLowerCase();
  const filename = (event.acceptanceOriginalFileName ?? "").toLowerCase();
  return (event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION") &&
    (mimeType === "application/pdf" || filename.endsWith(".pdf"));
}

export function buildVacationSummary(
  hireDateKey: string,
  employmentEndedAtKey: string | undefined,
  vacationEvents: LaborVacationEvent[],
  globalVacationDays: LaborGlobalVacationDay[]
): LaborFile["vacationSummary"] {
  const currentYearStartDate = getCurrentVacationYearStartKey(hireDateKey);
  const { previousYearStartDate, previousYearEndDate } = getPreviousVacationYearRange(currentYearStartDate);
  const {
    previousYearStartDate: yearBeforeLastStartDate,
    previousYearEndDate: yearBeforeLastEndDate
  } = getPreviousVacationYearRange(previousYearStartDate);
  const completedYears = getCompletedYears(hireDateKey, currentYearStartDate);
  const entitlementDays = getVacationEntitlementDays(completedYears);
  const applicableGlobalVacationDays = globalVacationDays.filter((day) =>
    day.date >= hireDateKey && (!employmentEndedAtKey || day.date <= employmentEndedAtKey)
  );
  const vacationRequests = vacationEvents.filter((event) =>
    event.eventType === "VACATION" || event.eventType === "GLOBAL_VACATION"
  );
  const globalVacationRequests = vacationEvents.filter((event) => event.eventType === "GLOBAL_VACATION");
  const previousYearPendingEvents = vacationEvents.filter((event) => event.eventType === "PREVIOUS_YEAR_PENDING");
  const previousYearPendingCountedEvents = previousYearPendingEvents.filter((event) =>
    event.startDate === previousYearStartDate && event.endDate === previousYearEndDate
  );
  const yearBeforeLastPendingCountedEvents = previousYearPendingEvents.filter((event) =>
    event.startDate === yearBeforeLastStartDate && event.endDate === yearBeforeLastEndDate
  );
  const yearBeforeLastPendingDays = yearBeforeLastPendingCountedEvents.reduce((total, event) => total + event.days, 0);
  const ignoredPreviousYearPendingDays = previousYearPendingEvents
    .filter((event) =>
      !previousYearPendingCountedEvents.includes(event) &&
      !yearBeforeLastPendingCountedEvents.includes(event)
    )
    .reduce((total, event) => total + event.days, 0);
  const rawPreviousYearPendingDays = previousYearPendingCountedEvents.reduce((total, event) => total + event.days, 0);
  const previousYearManualCarryoverDays = Math.max(0, rawPreviousYearPendingDays);
  const previousYearManualDeductionDays = Math.max(0, -rawPreviousYearPendingDays);
  const previousYearDeductionDays = vacationEvents
    .filter((event) => event.eventType === "PREVIOUS_YEAR_DEDUCTION")
    .reduce((total, event) => total + event.days, 0);
  const globalVacationUsedDays = applicableGlobalVacationDays
    .filter((day) => !globalVacationRequests.some((event) =>
      event.globalVacationDayId === day.id || event.startDate === day.date
    ))
    .reduce((total, day) => total + day.days, 0);
  const authorizedDays = vacationRequests
    .filter(isAuthorizedVacationEvent)
    .reduce((total, event) => total + event.days, 0);
  const scheduledDays = vacationRequests
    .filter((event) => !isAuthorizedVacationEvent(event))
    .reduce((total, event) => total + event.days, 0);
  const recordedPreviousYearVacationDays = vacationRequests
    .reduce((total, event) => total + getVacationEventDaysInRange(event, previousYearStartDate, previousYearEndDate), 0) +
    applicableGlobalVacationDays
      .filter((day) => !globalVacationRequests.some((event) =>
        event.globalVacationDayId === day.id || event.startDate === day.date
      ))
      .reduce((total, day) => total + getGlobalVacationDayDaysInRange(day, previousYearStartDate, previousYearEndDate), 0);
  const effectivePreviousYearManualDeductionDays = Math.max(
    0,
    previousYearManualDeductionDays - recordedPreviousYearVacationDays
  );
  const previousYearPendingDays = previousYearManualCarryoverDays;
  const availableDays = entitlementDays + previousYearManualCarryoverDays + yearBeforeLastPendingDays;
  const usedDays = authorizedDays +
    scheduledDays +
    previousYearDeductionDays +
    globalVacationUsedDays +
    effectivePreviousYearManualDeductionDays;
  const remainingDays = availableDays - usedDays;
  const unearnedDays = Math.max(0, usedDays - availableDays);
  const eventLines = vacationEvents.map((event) => {
    if (event.eventType === "PREVIOUS_YEAR_DEDUCTION") {
      return {
        dateKey: "0000-00-00",
        line: `Descuenta ${event.days} del año pasado.`
      };
    }

    if (event.eventType === "PREVIOUS_YEAR_PENDING") {
      const dateRange = formatVacationRange(event.startDate, event.endDate);
      const isLastYearPending = previousYearPendingCountedEvents.includes(event);
      const isYearBeforeLastPending = yearBeforeLastPendingCountedEvents.includes(event);
      const adjustmentDays = Math.abs(event.days);
      const adjustmentAction = event.days < 0 ? "descuenta" : "agrega";
      const adjustmentUnit = adjustmentDays === 1 ? "día" : "días";
      if (isLastYearPending && event.days < 0 && effectivePreviousYearManualDeductionDays < adjustmentDays) {
        const coveredDays = adjustmentDays - effectivePreviousYearManualDeductionDays;
        const coveredUnit = coveredDays === 1 ? "dia" : "dias";
        if (effectivePreviousYearManualDeductionDays <= 0) {
          return {
            dateKey: event.startDate ?? "0000-00-00",
            line: `Ajuste manual del ultimo ano: ${coveredDays} ${coveredUnit} ya estan cubiertos por vacaciones registradas${dateRange ? ` del periodo ${dateRange}` : ""}.`
          };
        }

        return {
          dateKey: event.startDate ?? "0000-00-00",
          line: `Saldo pendiente del ultimo ano: descuenta ${effectivePreviousYearManualDeductionDays} ${effectivePreviousYearManualDeductionDays === 1 ? "dia" : "dias"} adicionales${dateRange ? ` del periodo ${dateRange}` : ""}; ${coveredDays} ${coveredUnit} ya estan cubiertos por vacaciones registradas.`
        };
      }

      return {
        dateKey: event.startDate ?? "0000-00-00",
        line: isLastYearPending
          ? `Saldo pendiente del último año: ${adjustmentAction} ${adjustmentDays} ${adjustmentUnit}${dateRange ? ` del periodo ${dateRange}` : ""}.`
          : isYearBeforeLastPending
            ? `Saldo pendiente del año inmediato anterior al último año: ${adjustmentAction} ${adjustmentDays} ${adjustmentUnit}${dateRange ? ` del periodo ${dateRange}` : ""}.`
            : `Saldo pendiente de un año anterior no contabilizado: ${event.days} ${event.days === 1 ? "día" : "días"}${dateRange ? ` del periodo ${dateRange}` : ""}.`
      };
    }

    const dateRange = formatVacationDateSelection(event);
    const actionText = isPastVacationEvent(event) ? "Tomó" : "Tomará";
    const statusText = isAuthorizedVacationEvent(event)
      ? "Autorizado con PDF firmado"
      : "Programado pendiente de PDF firmado";
    const prefix = event.eventType === "GLOBAL_VACATION" ? "Vacación general: " : "";
    return {
      dateKey: event.startDate ?? "9999-99-99",
      line: `${prefix}${actionText} ${event.days} ${event.days === 1 ? "día" : "días"}${dateRange ? ` en ${dateRange}` : ""}. ${statusText}.`
    };
  });
  const globalVacationLines = applicableGlobalVacationDays
    .filter((day) => !globalVacationRequests.some((event) =>
      event.globalVacationDayId === day.id || event.startDate === day.date
    ))
    .map((day) => ({
      dateKey: day.date,
      line: `Vacación general: descuenta ${day.days} ${day.days === 1 ? "día" : "días"} en ${formatGlobalVacationDateSelection(day)}${day.description ? ` (${day.description})` : ""}.`
    }));
  const sortedEventLines = [...eventLines, ...globalVacationLines]
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    .map((event) => event.line);
  const detailLine = sortedEventLines.length > 0
    ? `Detalle: ${sortedEventLines.join(" ")}`
    : "Detalle: Sin periodos disfrutados, programados o descontados.";

  return {
    hireDate: hireDateKey,
    currentYearStartDate,
    previousYearStartDate,
    previousYearEndDate,
    yearBeforeLastStartDate,
    yearBeforeLastEndDate,
    completedYears,
    completedYearsLabel: formatCompletedYearsLabel(completedYears).toUpperCase(),
    entitlementDays,
    previousYearPendingDays,
    yearBeforeLastPendingDays,
    ignoredPreviousYearPendingDays,
    earnedDays: entitlementDays,
    unearnedDays,
    scheduledDays,
    authorizedDays,
    usedDays,
    remainingDays,
    lines: [
      "CONTABILIZACIÓN DE VACACIONES",
      `Fecha de ingreso: ${formatLongDateKey(hireDateKey)}`,
      `Fecha de inicio del año corriente: ${formatLongDateKey(currentYearStartDate)}. ${formatCompletedYearsLabel(completedYears).toUpperCase()} AÑOS CUMPLIDOS`,
      `Días a los que tiene derecho por el último año (${formatLongDateKey(previousYearStartDate)} al ${formatLongDateKey(previousYearEndDate)}): ${entitlementDays + previousYearPendingDays}`,
      `Días a los que tiene derecho por el año inmediato anterior al último año (${formatLongDateKey(yearBeforeLastStartDate)} al ${formatLongDateKey(yearBeforeLastEndDate)}): ${yearBeforeLastPendingDays}`,
      `TOTAL DE DÍAS A LOS QUE TIENE DERECHO: ${availableDays}`,
      `Días ya disfrutados: ${usedDays}`,
      detailLine,
      `TOTAL DE DÍAS PENDIENTES DE SER DISFRUTADOS: ${remainingDays}`,
      `Días ya programados pendientes de PDF firmado: ${scheduledDays}.`,
      `Días ya autorizados con PDF firmado: ${authorizedDays}.`
    ]
  };
}

export function mapLaborFileDocument(record: {
  id: string;
  laborFileId: string;
  documentType: string;
  originalFileName: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  riExtractedDailySalaryMxn?: Prisma.Decimal | number | string | null;
  riExtractedMonthlyGrossSalaryMxn?: Prisma.Decimal | number | string | null;
  riSalaryExtractionDetail?: string | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): LaborFileDocument {
  const riExtractedDailySalaryMxn = Number(record.riExtractedDailySalaryMxn ?? 0) || undefined;
  const riExtractedMonthlyGrossSalaryMxn = Number(record.riExtractedMonthlyGrossSalaryMxn ?? 0) || undefined;

  return {
    id: record.id,
    laborFileId: record.laborFileId,
    documentType: record.documentType as LaborFileDocument["documentType"],
    originalFileName: record.originalFileName,
    fileMimeType: record.fileMimeType ?? undefined,
    fileSizeBytes: record.fileSizeBytes ?? undefined,
    riExtractedDailySalaryMxn,
    riExtractedMonthlyGrossSalaryMxn,
    riSalaryExtractionDetail: record.riSalaryExtractionDetail ?? undefined,
    uploadedAt: record.uploadedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapLaborVacationEvent(record: {
  id: string;
  laborFileId: string;
  globalVacationDayId?: string | null;
  eventType: string;
  startDate: Date | null;
  endDate: Date | null;
  vacationDates?: Prisma.JsonValue | null;
  days: Prisma.Decimal;
  description: string | null;
  acceptanceOriginalFileName?: string | null;
  acceptanceFileMimeType?: string | null;
  acceptanceFileSizeBytes?: number | null;
  createdAt: Date;
  updatedAt: Date;
}): LaborVacationEvent {
  return {
    id: record.id,
    laborFileId: record.laborFileId,
    globalVacationDayId: record.globalVacationDayId ?? undefined,
    eventType: record.eventType as LaborVacationEvent["eventType"],
    startDate: toDateOnlyKey(record.startDate) || undefined,
    endDate: toDateOnlyKey(record.endDate) || undefined,
    vacationDates: parseVacationDateKeys(record.vacationDates),
    days: Number(record.days),
    description: record.description ?? undefined,
    acceptanceOriginalFileName: record.acceptanceOriginalFileName ?? undefined,
    acceptanceFileMimeType: record.acceptanceFileMimeType ?? undefined,
    acceptanceFileSizeBytes: record.acceptanceFileSizeBytes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapLaborGlobalVacationDay(record: {
  id: string;
  date: Date;
  days: Prisma.Decimal;
  vacationDates?: Prisma.JsonValue | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LaborGlobalVacationDay {
  const date = toDateOnlyKey(record.date);
  const days = Number(record.days);
  const explicitDates = parseVacationDateKeys(record.vacationDates);
  const vacationDates = explicitDates.length > 0
    ? explicitDates
    : getGlobalVacationDateKeys({ date, days, vacationDates: [] });

  return {
    id: record.id,
    date,
    days,
    vacationDates,
    description: record.description ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapLaborFile(record: {
  id: string;
  userId: string | null;
  employeeName: string;
  employeeEmail: string | null;
  employeeUsername: string;
  employeeShortName: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactAddress: string | null;
  team: string | null;
  legacyTeam: string | null;
  specificRole: string | null;
  status: string;
  employmentStatus: string;
  hireDate: Date;
  dailySalaryMxn: Prisma.Decimal | number | null;
  advanceVacationDaysPaidBalance?: Prisma.Decimal | number | null;
  advanceVacationDaysPaidCutoffDate?: Date | null;
  advanceVacationDaysPaidPrevious?: Prisma.Decimal | number | null;
  advanceVacationDaysPaidCurrent?: Prisma.Decimal | number | null;
  employmentEndedAt: Date | null;
  notes: string | null;
  documents: Array<Parameters<typeof mapLaborFileDocument>[0]>;
  vacationEvents: Array<Parameters<typeof mapLaborVacationEvent>[0]>;
  createdAt: Date;
  updatedAt: Date;
}, globalVacationDayRecords: Array<Parameters<typeof mapLaborGlobalVacationDay>[0]> = []): LaborFile {
  const documents = record.documents.map(mapLaborFileDocument);
  const vacationEvents = record.vacationEvents.map(mapLaborVacationEvent);
  const globalVacationDays = globalVacationDayRecords.map(mapLaborGlobalVacationDay);
  const hireDate = toDateOnlyKey(record.hireDate);
  const employmentEndedAt = toDateOnlyKey(record.employmentEndedAt) || undefined;

  return {
    id: record.id,
    userId: record.userId ?? undefined,
    employeeName: record.employeeName,
    employeeEmail: record.employeeEmail ?? undefined,
    employeeUsername: record.employeeUsername,
    employeeShortName: record.employeeShortName ?? undefined,
    personalPhone: record.personalPhone ?? undefined,
    personalEmail: record.personalEmail ?? undefined,
    emergencyContactName: record.emergencyContactName ?? undefined,
    emergencyContactPhone: record.emergencyContactPhone ?? undefined,
    emergencyContactAddress: record.emergencyContactAddress ?? undefined,
    team: (record.team ?? undefined) as LaborFile["team"],
    legacyTeam: record.legacyTeam ?? undefined,
    specificRole: record.specificRole ?? undefined,
    status: record.status as LaborFile["status"],
    employmentStatus: record.employmentStatus as LaborFile["employmentStatus"],
    hireDate,
    dailySalaryMxn: Number(record.dailySalaryMxn ?? 0) || undefined,
    advanceVacationDaysPaidBalance: Number(record.advanceVacationDaysPaidBalance ?? 0),
    advanceVacationDaysPaidCutoffDate: toDateOnlyKey(record.advanceVacationDaysPaidCutoffDate) || undefined,
    advanceVacationDaysPaidPrevious: Number(record.advanceVacationDaysPaidPrevious ?? 0),
    advanceVacationDaysPaidCurrent: Number(record.advanceVacationDaysPaidCurrent ?? 0),
    employmentEndedAt,
    notes: record.notes ?? undefined,
    documents,
    vacationEvents,
    globalVacationDays,
    vacationSummary: buildVacationSummary(hireDate, employmentEndedAt, vacationEvents, globalVacationDays),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapDailyDocumentAssignment(record: {
  id: string;
  templateId: string;
  templateTitle: string;
  title: string;
  clientId: string;
  clientNumber: string;
  clientName: string;
  values: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): DailyDocumentAssignment {
  return {
    id: record.id,
    templateId: record.templateId as DailyDocumentAssignment["templateId"],
    templateTitle: record.templateTitle,
    title: record.title,
    clientId: record.clientId,
    clientNumber: record.clientNumber,
    clientName: record.clientName,
    values: asStringRecord(record.values),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapQuote(record: {
  id: string;
  title?: string | null;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  recipientName?: string | null;
  responsibleTeam: string | null;
  subject: string;
  status: string;
  quoteType: string;
  language: string | null;
  quoteDate: Date;
  amountColumns: Prisma.JsonValue | null;
  tableRows: Prisma.JsonValue | null;
  lineItems: Prisma.JsonValue;
  totalMxn: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Quote {
  return {
    id: record.id,
    title: record.title || buildQuoteTitle(record),
    quoteNumber: record.quoteNumber,
    clientId: record.clientId,
    clientName: record.clientName,
    recipientName: record.recipientName ?? undefined,
    responsibleTeam: record.responsibleTeam as Quote["responsibleTeam"],
    subject: record.subject,
    status: record.status as Quote["status"],
    quoteType: record.quoteType as Quote["quoteType"],
    language: record.language === "en" ? "en" : "es",
    quoteDate: record.quoteDate.toISOString(),
    amountColumns: record.amountColumns ? asQuoteTemplateAmountColumns(record.amountColumns) : undefined,
    tableRows: record.tableRows ? asQuoteTemplateRows(record.tableRows, ((Array.isArray(record.lineItems) ? record.lineItems : []) as unknown as Quote["lineItems"])) : undefined,
    lineItems: ((Array.isArray(record.lineItems) ? record.lineItems : []) as unknown as Quote["lineItems"]),
    totalMxn: Number(record.totalMxn),
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapQuoteTemplate(record: {
  id: string;
  templateNumber: string | null;
  name: string;
  team: string;
  subject: string;
  services: string | null;
  quoteType: string;
  amountColumns: Prisma.JsonValue | null;
  tableRows: Prisma.JsonValue | null;
  lineItems: Prisma.JsonValue;
  totalMxn: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): QuoteTemplate {
  const lineItems = ((Array.isArray(record.lineItems) ? record.lineItems : []) as unknown as QuoteTemplate["lineItems"]);
  return {
    id: record.id,
    templateNumber: record.templateNumber ?? record.name,
    name: record.name,
    team: record.team as QuoteTemplate["team"],
    subject: record.subject,
    services: record.services ?? record.subject,
    quoteType: record.quoteType as QuoteTemplate["quoteType"],
    amountColumns: asQuoteTemplateAmountColumns(record.amountColumns),
    tableRows: asQuoteTemplateRows(record.tableRows, lineItems),
    lineItems,
    totalMxn: Number(record.totalMxn),
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapLead(record: {
  id: string;
  clientId: string | null;
  clientName: string;
  prospectName: string | null;
  commissionAssignee: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  subject: string;
  amountMxn: Prisma.Decimal;
  communicationChannel: string;
  lastInteractionLabel: string | null;
  lastInteraction: Date | null;
  nextInteractionLabel: string | null;
  nextInteraction: Date | null;
  notes: string | null;
  sentToClientAt: Date | null;
  sentToMattersAt: Date | null;
  hiddenFromTracking: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Lead {
  return {
    id: record.id,
    clientId: record.clientId ?? undefined,
    clientName: record.clientName,
    prospectName: record.prospectName ?? undefined,
    commissionAssignee: record.commissionAssignee ?? undefined,
    quoteId: record.quoteId ?? undefined,
    quoteNumber: record.quoteNumber ?? undefined,
    subject: record.subject,
    amountMxn: Number(record.amountMxn),
    communicationChannel: record.communicationChannel as Lead["communicationChannel"],
    lastInteractionLabel: record.lastInteractionLabel ?? undefined,
    lastInteraction: record.lastInteraction?.toISOString(),
    nextInteractionLabel: record.nextInteractionLabel ?? undefined,
    nextInteraction: record.nextInteraction?.toISOString(),
    notes: record.notes ?? undefined,
    sentToClientAt: record.sentToClientAt?.toISOString(),
    sentToMattersAt: record.sentToMattersAt?.toISOString(),
    hiddenFromTracking: record.hiddenFromTracking,
    status: record.status as Lead["status"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapMatter(record: {
  id: string;
  matterNumber: string;
  clientId: string | null;
  clientNumber: string | null;
  clientName: string;
  quoteId: string | null;
  quoteNumber: string | null;
  commissionAssignee: string | null;
  matterType: string;
  subject: string;
  specificProcess: string | null;
  totalFeesMxn: Prisma.Decimal;
  responsibleTeam: string | null;
  nextPaymentDate: Date | null;
  communicationChannel: string;
  r1InternalCreated: boolean;
  telegramBotLinked: boolean;
  rdCreated: boolean;
  rfCreated: string;
  r1ExternalCreated: boolean;
  billingChatCreated: boolean;
  matterIdentifier: string | null;
  executionLinkedModule: string | null;
  executionLinkedAt: Date | null;
  executionPrompt: string | null;
  expirationDate: Date | null;
  expirationRiOutput: string | null;
  promotionCommand: string | null;
  holidayAuthorityShortName: string | null;
  internalTelegramGroupId: string | null;
  internalTelegramGroupName: string | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  nextActionSource: string | null;
  visibility: string;
  milestone: string | null;
  concluded: boolean;
  stage: string;
  origin: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  executionSubmatters?: Array<{
    id: string;
    matterId: string;
    sortOrder: number;
    specificProcess: string | null;
    matterIdentifier: string | null;
    communicationChannel: string;
    executionPrompt: string | null;
    expirationDate: Date | null;
    expirationRiOutput: string | null;
    promotionCommand: string | null;
    holidayAuthorityShortName: string | null;
    internalTelegramGroupId: string | null;
    internalTelegramGroupName: string | null;
    milestone: string | null;
    concluded: boolean;
    notes: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): Matter {
  return {
    id: record.id,
    matterNumber: record.matterNumber,
    clientId: record.clientId ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    quoteId: record.quoteId ?? undefined,
    quoteNumber: record.quoteNumber ?? undefined,
    commissionAssignee: record.commissionAssignee ?? undefined,
    matterType: record.matterType as Matter["matterType"],
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    totalFeesMxn: Number(record.totalFeesMxn),
    responsibleTeam: (record.responsibleTeam ?? undefined) as Matter["responsibleTeam"],
    nextPaymentDate: record.nextPaymentDate?.toISOString(),
    communicationChannel: record.communicationChannel as Matter["communicationChannel"],
    r1InternalCreated: record.r1InternalCreated,
    telegramBotLinked: record.telegramBotLinked,
    rdCreated: record.rdCreated,
    rfCreated: record.rfCreated as Matter["rfCreated"],
    r1ExternalCreated: record.r1ExternalCreated,
    billingChatCreated: record.billingChatCreated,
    matterIdentifier: record.matterIdentifier ?? undefined,
    executionLinkedModule: record.executionLinkedModule ?? undefined,
    executionLinkedAt: record.executionLinkedAt?.toISOString(),
    executionPrompt: record.executionPrompt ?? undefined,
    expirationDate: record.expirationDate?.toISOString(),
    expirationRiOutput: record.expirationRiOutput ?? undefined,
    promotionCommand: (record.promotionCommand ?? undefined) as Matter["promotionCommand"],
    holidayAuthorityShortName: (
      (record.holidayAuthorityShortName === "PJCDMX" ? "TSJCDMX" : record.holidayAuthorityShortName) ?? undefined
    ) as Matter["holidayAuthorityShortName"],
    internalTelegramGroupId: record.internalTelegramGroupId ?? undefined,
    internalTelegramGroupName: record.internalTelegramGroupName ?? undefined,
    nextAction: record.nextAction ?? undefined,
    nextActionDueAt: record.nextActionDueAt?.toISOString(),
    nextActionSource: record.nextActionSource ?? undefined,
    visibility: record.visibility || "General",
    milestone: record.milestone ?? undefined,
    concluded: record.concluded,
    stage: record.stage as Matter["stage"],
    origin: record.origin as Matter["origin"],
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString(),
    executionSubmatters: record.executionSubmatters?.map(mapExecutionSubmatter)
  };
}

export function mapExecutionSubmatter(record: {
  id: string;
  matterId: string;
  sortOrder: number;
  specificProcess: string | null;
  matterIdentifier: string | null;
  communicationChannel: string;
  executionPrompt: string | null;
  expirationDate: Date | null;
  expirationRiOutput: string | null;
  promotionCommand: string | null;
  holidayAuthorityShortName: string | null;
  internalTelegramGroupId: string | null;
  internalTelegramGroupName: string | null;
  milestone: string | null;
  concluded: boolean;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ExecutionSubmatter {
  return {
    id: record.id,
    matterId: record.matterId,
    sortOrder: record.sortOrder,
    specificProcess: record.specificProcess ?? undefined,
    matterIdentifier: record.matterIdentifier ?? undefined,
    communicationChannel: record.communicationChannel as ExecutionSubmatter["communicationChannel"],
    executionPrompt: record.executionPrompt ?? undefined,
    expirationDate: record.expirationDate?.toISOString(),
    expirationRiOutput: record.expirationRiOutput ?? undefined,
    promotionCommand: (record.promotionCommand ?? undefined) as ExecutionSubmatter["promotionCommand"],
    holidayAuthorityShortName: (
      (record.holidayAuthorityShortName === "PJCDMX" ? "TSJCDMX" : record.holidayAuthorityShortName) ?? undefined
    ) as ExecutionSubmatter["holidayAuthorityShortName"],
    internalTelegramGroupId: record.internalTelegramGroupId ?? undefined,
    internalTelegramGroupName: record.internalTelegramGroupName ?? undefined,
    milestone: record.milestone ?? undefined,
    concluded: record.concluded,
    notes: record.notes ?? undefined,
    deletedAt: record.deletedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapCommissionReceiver(record: {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
}): CommissionReceiver {
  return {
    id: record.id,
    name: repairMojibakeText(record.name) ?? record.name,
    active: record.active,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapCommissionExclusion(record: {
  id: string;
  year: number;
  month: number;
  section: string;
  group: string;
  financeRecordId: string;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CommissionExclusion {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    section: record.section,
    group: record.group as CommissionExclusion["group"],
    financeRecordId: record.financeRecordId,
    createdByUserId: record.createdByUserId ?? undefined,
    createdByName: record.createdByName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapCommissionPaymentAcknowledgement(record: {
  id: string;
  year: number;
  month: number;
  section: string;
  amountMxn: Prisma.Decimal;
  sourceHash: string;
  excluded: boolean;
  paidByTransfer: boolean;
  paidByTransferAt: Date | null;
  paidByTransferUserId: string | null;
  paidByTransferName: string | null;
  receivedByAraceli: boolean;
  receivedByAraceliAt: Date | null;
  receivedByAraceliUserId: string | null;
  receivedByAraceliName: string | null;
  receivedByEmrt: boolean;
  receivedByEmrtAt: Date | null;
  receivedByEmrtUserId: string | null;
  receivedByEmrtName: string | null;
  signedReceiptFileName: string | null;
  signedReceiptMimeType: string | null;
  signedReceiptSizeBytes: number | null;
  signedReceiptUploadedAt: Date | null;
  signedReceiptUserId: string | null;
  signedReceiptUserName: string | null;
  reopenedAt: Date | null;
  reopenedByUserId: string | null;
  reopenedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CommissionPaymentAcknowledgement {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    section: repairMojibakeText(record.section) ?? record.section,
    amountMxn: Number(record.amountMxn),
    sourceHash: record.sourceHash,
    excluded: record.excluded,
    paidByTransfer: record.paidByTransfer,
    paidByTransferAt: record.paidByTransferAt?.toISOString(),
    paidByTransferUserId: record.paidByTransferUserId ?? undefined,
    paidByTransferName: record.paidByTransferName ?? undefined,
    receivedByAraceli: record.receivedByAraceli,
    receivedByAraceliAt: record.receivedByAraceliAt?.toISOString(),
    receivedByAraceliUserId: record.receivedByAraceliUserId ?? undefined,
    receivedByAraceliName: record.receivedByAraceliName ?? undefined,
    receivedByEmrt: record.receivedByEmrt,
    receivedByEmrtAt: record.receivedByEmrtAt?.toISOString(),
    receivedByEmrtUserId: record.receivedByEmrtUserId ?? undefined,
    receivedByEmrtName: record.receivedByEmrtName ?? undefined,
    signedReceiptFileName: record.signedReceiptFileName ?? undefined,
    signedReceiptMimeType: record.signedReceiptMimeType ?? undefined,
    signedReceiptSizeBytes: record.signedReceiptSizeBytes ?? undefined,
    signedReceiptUploadedAt: record.signedReceiptUploadedAt?.toISOString(),
    signedReceiptUserId: record.signedReceiptUserId ?? undefined,
    signedReceiptUserName: record.signedReceiptUserName ?? undefined,
    reopenedAt: record.reopenedAt?.toISOString(),
    reopenedByUserId: record.reopenedByUserId ?? undefined,
    reopenedByName: record.reopenedByName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapProjectorCommission(record: {
  id: string;
  taskTrackingRecordId: string;
  year: number;
  month: number;
  section: string;
  responsibleCode: string;
  projectorName: string;
  clientName: string;
  subject: string;
  amountMxn: Prisma.Decimal;
  authorized: boolean;
  completedAt: Date;
  authorizedAt: Date | null;
  authorizedByUserId: string | null;
  authorizedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProjectorCommission {
  return {
    id: record.id,
    taskTrackingRecordId: record.taskTrackingRecordId,
    year: record.year,
    month: record.month,
    section: record.section,
    responsibleCode: record.responsibleCode,
    projectorName: record.projectorName,
    clientName: record.clientName,
    subject: record.subject,
    amountMxn: Number(record.amountMxn),
    authorized: record.authorized,
    completedAt: record.completedAt.toISOString(),
    authorizedAt: record.authorizedAt?.toISOString(),
    authorizedByUserId: record.authorizedByUserId ?? undefined,
    authorizedByName: record.authorizedByName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

const FINANCE_PAYMENT_METHOD_VALUES = new Set<FinanceRecord["paymentMethod"]>([
  "blank",
  "T",
  "E"
]);
const FINANCE_DELINQUENCY_STATUS_VALUES = new Set<FinanceRecord["delinquencyStatus"]>([
  "CURRENT",
  "DAYS_1_TO_10",
  "MORE_THAN_10",
  "MORE_THAN_20",
  "MORE_THAN_30"
]);

function normalizeFinancePaymentMethod(value?: string | null): FinanceRecord["paymentMethod"] {
  if (value === "E_RECEIVED" || value === "E_PENDING") {
    return "E";
  }

  return FINANCE_PAYMENT_METHOD_VALUES.has(value as FinanceRecord["paymentMethod"])
    ? (value as FinanceRecord["paymentMethod"])
    : "blank";
}

function normalizeFinancePaymentReceived(method?: string | null, received?: boolean | null) {
  return method === "E_RECEIVED" || (normalizeFinancePaymentMethod(method) === "E" && received === true);
}

function normalizeFinanceDelinquencyStatus(value?: string | null): FinanceRecord["delinquencyStatus"] {
  return FINANCE_DELINQUENCY_STATUS_VALUES.has(value as FinanceRecord["delinquencyStatus"])
    ? (value as FinanceRecord["delinquencyStatus"])
    : "CURRENT";
}

export function mapFinanceRecord(record: {
  id: string;
  year: number;
  month: number;
  clientNumber: string | null;
  clientName: string;
  quoteNumber: string | null;
  matterType: string;
  periodYear: number | null;
  periodMonth: number | null;
  subject: string;
  contractSignedStatus: string;
  responsibleTeam: string | null;
  totalMatterMxn: Prisma.Decimal;
  workingConcepts: string | null;
  conceptFeesMxn: Prisma.Decimal;
  previousPaymentsMxn: Prisma.Decimal;
  nextPaymentDate: Date | null;
  nextPaymentNotes: string | null;
  delinquencyStatus: string;
  paidThisMonthMxn: Prisma.Decimal;
  payment2Mxn: Prisma.Decimal;
  payment3Mxn: Prisma.Decimal;
  paymentDate1: Date | null;
  paymentDate2: Date | null;
  paymentDate3: Date | null;
  paymentMethod: string;
  paymentMethod2: string;
  paymentMethod3: string;
  paymentReceived: boolean;
  paymentReceived2: boolean;
  paymentReceived3: boolean;
  expenseNotes1: string | null;
  expenseNotes2: string | null;
  expenseNotes3: string | null;
  expenseAmount1Mxn: Prisma.Decimal;
  expenseAmount2Mxn: Prisma.Decimal;
  expenseAmount3Mxn: Prisma.Decimal;
  pctLitigation: number;
  pctCorporateLabor: number;
  pctSettlements: number;
  pctFinancialLaw: number;
  pctTaxCompliance: number;
  clientCommissionRecipient: string | null;
  closingCommissionRecipient: string | null;
  highCollectionProbability: boolean;
  lowCollectionProbability: boolean;
  milestone: string | null;
  concluded: boolean;
  financeComments: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FinanceRecord {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    quoteNumber: record.quoteNumber ?? undefined,
    matterType: record.matterType as FinanceRecord["matterType"],
    periodYear: record.periodYear ?? undefined,
    periodMonth: record.periodMonth ?? undefined,
    subject: record.subject,
    contractSignedStatus: record.contractSignedStatus as FinanceRecord["contractSignedStatus"],
    responsibleTeam: (record.responsibleTeam ?? undefined) as FinanceRecord["responsibleTeam"],
    totalMatterMxn: Number(record.totalMatterMxn),
    workingConcepts: record.workingConcepts ?? undefined,
    conceptFeesMxn: Number(record.conceptFeesMxn),
    previousPaymentsMxn: Number(record.previousPaymentsMxn),
    nextPaymentDate: record.nextPaymentDate?.toISOString(),
    nextPaymentNotes: record.nextPaymentNotes ?? undefined,
    delinquencyStatus: normalizeFinanceDelinquencyStatus(record.delinquencyStatus),
    paidThisMonthMxn: Number(record.paidThisMonthMxn),
    payment2Mxn: Number(record.payment2Mxn),
    payment3Mxn: Number(record.payment3Mxn),
    paymentDate1: record.paymentDate1?.toISOString(),
    paymentDate2: record.paymentDate2?.toISOString(),
    paymentDate3: record.paymentDate3?.toISOString(),
    paymentMethod: normalizeFinancePaymentMethod(record.paymentMethod),
    paymentMethod2: normalizeFinancePaymentMethod(record.paymentMethod2),
    paymentMethod3: normalizeFinancePaymentMethod(record.paymentMethod3),
    paymentReceived: normalizeFinancePaymentReceived(record.paymentMethod, record.paymentReceived),
    paymentReceived2: normalizeFinancePaymentReceived(record.paymentMethod2, record.paymentReceived2),
    paymentReceived3: normalizeFinancePaymentReceived(record.paymentMethod3, record.paymentReceived3),
    expenseNotes1: record.expenseNotes1 ?? undefined,
    expenseNotes2: record.expenseNotes2 ?? undefined,
    expenseNotes3: record.expenseNotes3 ?? undefined,
    expenseAmount1Mxn: Number(record.expenseAmount1Mxn),
    expenseAmount2Mxn: Number(record.expenseAmount2Mxn),
    expenseAmount3Mxn: Number(record.expenseAmount3Mxn),
    pctLitigation: record.pctLitigation,
    pctCorporateLabor: record.pctCorporateLabor,
    pctSettlements: record.pctSettlements,
    pctFinancialLaw: record.pctFinancialLaw,
    pctTaxCompliance: record.pctTaxCompliance,
    clientCommissionRecipient: record.clientCommissionRecipient ?? undefined,
    closingCommissionRecipient: record.closingCommissionRecipient ?? undefined,
    highCollectionProbability: record.highCollectionProbability,
    lowCollectionProbability: record.lowCollectionProbability,
    salesCommissionMxn: 0,
    milestone: record.milestone ?? undefined,
    concluded: record.concluded,
    financeComments: record.financeComments ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapFinanceSnapshot(record: {
  id: string;
  year: number;
  month: number;
  title: string;
  totalIncomeMxn: Prisma.Decimal;
  totalExpenseMxn: Prisma.Decimal;
  balanceMxn: Prisma.Decimal;
  snapshotData: Prisma.JsonValue | null;
  createdAt: Date;
}): FinanceSnapshot {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    title: record.title,
    totalIncomeMxn: Number(record.totalIncomeMxn),
    totalExpenseMxn: Number(record.totalExpenseMxn),
    balanceMxn: Number(record.balanceMxn),
    snapshotData: (record.snapshotData ?? undefined) as FinanceSnapshot["snapshotData"],
    createdAt: record.createdAt.toISOString()
  };
}

export function mapGeneralExpense(record: {
  id: string;
  year: number;
  month: number;
  detail: string;
  amountMxn: Prisma.Decimal;
  countsTowardLimit: boolean;
  team: string;
  generalExpense: boolean;
  expenseWithoutTeam: boolean;
  pctLitigation: Prisma.Decimal;
  pctCorporateLabor: Prisma.Decimal;
  pctSettlements: Prisma.Decimal;
  pctFinancialLaw: Prisma.Decimal;
  pctTaxCompliance: Prisma.Decimal;
  paymentMethod: string;
  bank: string | null;
  hasVat: boolean;
  hasWithholdings: boolean;
  recurring: boolean;
  approvedByEmrt: boolean;
  paidByEmrtAt: Date | null;
  emrtReimbursementPending: boolean;
  reviewedByJnls: boolean;
  paid: boolean;
  paidAt: Date | null;
  payrollEntryId: string | null;
  payrollNetDepositMxn: Prisma.Decimal | null;
  projectorCommissionId: string | null;
  projectorCommissionRecipient: string | null;
  createdAt: Date;
  updatedAt: Date;
}): GeneralExpense {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    detail: record.detail,
    amountMxn: Number(record.amountMxn),
    countsTowardLimit: record.countsTowardLimit,
    team: record.team as GeneralExpense["team"],
    generalExpense: record.generalExpense,
    expenseWithoutTeam: record.expenseWithoutTeam,
    pctLitigation: Number(record.pctLitigation),
    pctCorporateLabor: Number(record.pctCorporateLabor),
    pctSettlements: Number(record.pctSettlements),
    pctFinancialLaw: Number(record.pctFinancialLaw),
    pctTaxCompliance: Number(record.pctTaxCompliance),
    paymentMethod: record.paymentMethod as GeneralExpense["paymentMethod"],
    bank: (record.bank ?? undefined) as GeneralExpense["bank"],
    hasVat: record.hasVat,
    hasWithholdings: record.hasWithholdings,
    recurring: record.recurring,
    approvedByEmrt: record.approvedByEmrt,
    paidByEmrtAt: record.paidByEmrtAt?.toISOString(),
    emrtReimbursementPending: record.emrtReimbursementPending,
    reviewedByJnls: record.reviewedByJnls,
    paid: record.paid,
    paidAt: record.paidAt?.toISOString(),
    payrollEntryId: record.payrollEntryId ?? undefined,
    payrollNetDepositMxn: record.payrollNetDepositMxn === null ? undefined : Number(record.payrollNetDepositMxn),
    projectorCommissionId: record.projectorCommissionId ?? undefined,
    projectorCommissionRecipient: (record.projectorCommissionRecipient ?? undefined) as GeneralExpense["projectorCommissionRecipient"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapGeneralExpenseEmrtAcknowledgement(record: {
  id: string;
  year: number;
  month: number;
  paidByEmrtDate: Date;
  totalMxn: Prisma.Decimal;
  summaryMessage: string;
  expenseIds: Prisma.JsonValue;
  snapshotHash: string;
  receivedByAle: boolean;
  receivedByAleAt: Date | null;
  paidByEmrt: boolean;
  paidByEmrtAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): GeneralExpenseEmrtDailyAcknowledgement {
  const expenseIds = Array.isArray(record.expenseIds)
    ? record.expenseIds.filter((value): value is string => typeof value === "string")
    : [];

  return {
    id: record.id,
    year: record.year,
    month: record.month,
    paidByEmrtDate: record.paidByEmrtDate.toISOString(),
    totalMxn: Number(record.totalMxn),
    summaryMessage: record.summaryMessage,
    expenseIds,
    snapshotHash: record.snapshotHash,
    receivedByAle: record.receivedByAle,
    receivedByAleAt: record.receivedByAleAt?.toISOString(),
    paidByEmrt: record.paidByEmrt,
    paidByEmrtAt: record.paidByEmrtAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function getPayrollDailySalaryRiStatus(laborFile?: {
  dailySalaryMxn: Prisma.Decimal | number | null;
  documents?: Array<{ documentType: string }>;
} | null) {
  if (!laborFile) {
    return {
      verified: false,
      detail: "Sin expediente laboral vinculado."
    };
  }

  const dailySalaryMxn = Number(laborFile.dailySalaryMxn ?? 0);
  if (!dailySalaryMxn) {
    return {
      verified: false,
      detail: "Falta salario diario en Expedientes Laborales."
    };
  }

  const hasEmploymentContract = Boolean(laborFile.documents?.some((document) => document.documentType === "EMPLOYMENT_CONTRACT"));
  if (!hasEmploymentContract) {
    return {
      verified: false,
      detail: "Expedientes Laborales no tiene contrato laboral cargado."
    };
  }

  return {
    verified: false,
    detail: "Contrato laboral cargado; falta salario diario contractual verificable."
  };
}

export function mapGeneralExpensePayrollEntry(record: {
  id: string;
  year: number;
  month: number;
  half: number;
  laborFileId: string | null;
  employeeName: string;
  isPartTime: boolean;
  dailySalaryMxn: Prisma.Decimal;
  laborFile?: {
    employeeName: string;
    dailySalaryMxn: Prisma.Decimal | number | null;
    documents?: Array<{
      documentType: string;
    }>;
  } | null;
  grossSalaryMxn: Prisma.Decimal;
  punctualityBonusMxn: Prisma.Decimal;
  attendanceBonusMxn: Prisma.Decimal;
  punctualityBonusExcluded: boolean;
  attendanceBonusExcluded: boolean;
  advanceVacationDays?: number;
  advanceVacationPremiumPaymentDate?: string | null;
  advanceVacationDaysPaid?: boolean;
  advanceVacationDaysPaymentEligible?: boolean;
  vacationDaysPaidPreviousPeriods?: number;
  vacationDaysPaidCurrentPeriod?: number;
  vacationDays?: number;
  vacationPremiumMxn?: number;
  absenceDays: Prisma.Decimal;
  overtimeHours: Prisma.Decimal;
  overtimeDetail: string;
  generalExpense: boolean;
  pctLitigation: Prisma.Decimal;
  pctCorporateLabor: Prisma.Decimal;
  pctSettlements: Prisma.Decimal;
  pctFinancialLaw: Prisma.Decimal;
  pctTaxCompliance: Prisma.Decimal;
  isrWithholdingMxn: Prisma.Decimal;
  imssWithholdingMxn: Prisma.Decimal;
  employmentSubsidyMxn: Prisma.Decimal;
  infonavitCreditMxn: Prisma.Decimal;
  payrollStampedByAraceli: boolean;
  finalPaymentApprovedByEmrt: boolean;
  reviewedByJnls: boolean;
  createdAt: Date;
  updatedAt: Date;
}): GeneralExpensePayrollEntry {
  const employeeName = record.laborFile?.employeeName ?? record.employeeName;
  const dailySalaryMxn = Number(record.laborFile?.dailySalaryMxn ?? record.dailySalaryMxn);
  const dailySalaryRiStatus = getPayrollDailySalaryRiStatus(record.laborFile);
  const grossSalaryMxn = dailySalaryMxn * 15;
  const vacationDays = Number(record.vacationDays ?? 0);
  const vacationPremiumMxn = Number(record.vacationPremiumMxn ?? 0);
  const absenceDays = Number(record.absenceDays);
  const absenceDiscountMxn = dailySalaryMxn * absenceDays;
  const netSalaryMxn = grossSalaryMxn - absenceDiscountMxn;
  const bonusBaseMxn = record.half === 2 ? netSalaryMxn : 0;
  const punctualityBonusExcluded = Boolean(record.punctualityBonusExcluded);
  const attendanceBonusExcluded = Boolean(record.attendanceBonusExcluded);
  const punctualityBonusMxn = punctualityBonusExcluded ? 0 : roundMoney(Math.max(0, bonusBaseMxn * PAYROLL_BONUS_RATE));
  const attendanceBonusMxn = attendanceBonusExcluded ? 0 : roundMoney(Math.max(0, bonusBaseMxn * PAYROLL_BONUS_RATE));
  const overtimeHours = Number(record.overtimeHours);
  const isrWithholdingMxn = Number(record.isrWithholdingMxn);
  const imssWithholdingMxn = Number(record.imssWithholdingMxn);
  const employmentSubsidyMxn = Number(record.employmentSubsidyMxn);
  const infonavitCreditMxn = Number(record.infonavitCreditMxn);
  const overtimeHourlyRateMxn = (dailySalaryMxn / 8) * 2;
  const overtimeTotalMxn = overtimeHourlyRateMxn * overtimeHours;
  const payrollWithholdingsMxn = isrWithholdingMxn + imssWithholdingMxn + infonavitCreditMxn;

  return {
    id: record.id,
    year: record.year,
    month: record.month,
    half: (record.half === 2 ? 2 : 1) as GeneralExpensePayrollEntry["half"],
    laborFileId: record.laborFileId ?? undefined,
    employeeName,
    isPartTime: record.isPartTime,
    dailySalaryMxn,
    laborFileDailySalaryMxn: record.laborFile ? Number(record.laborFile.dailySalaryMxn ?? 0) : undefined,
    dailySalaryRiVerified: dailySalaryRiStatus.verified,
    dailySalaryRiVerificationDetail: dailySalaryRiStatus.detail,
    grossSalaryMxn,
    punctualityBonusMxn,
    attendanceBonusMxn,
    punctualityBonusExcluded,
    attendanceBonusExcluded,
    advanceVacationDays: Number(record.advanceVacationDays ?? 0),
    advanceVacationPremiumPaymentDate: record.advanceVacationPremiumPaymentDate ?? undefined,
    advanceVacationDaysPaid: Boolean(record.advanceVacationDaysPaid),
    advanceVacationDaysPaymentEligible: Boolean(record.advanceVacationDaysPaymentEligible),
    vacationDaysPaidPreviousPeriods: Number(record.vacationDaysPaidPreviousPeriods ?? 0),
    vacationDaysPaidCurrentPeriod: Number(record.vacationDaysPaidCurrentPeriod ?? 0),
    vacationDays,
    vacationPremiumMxn,
    absenceDays,
    absenceDiscountMxn,
    netSalaryMxn,
    overtimeHourlyRateMxn,
    overtimeHours,
    overtimeTotalMxn,
    overtimeDetail: record.overtimeDetail,
    generalExpense: record.generalExpense,
    pctLitigation: Number(record.pctLitigation),
    pctCorporateLabor: Number(record.pctCorporateLabor),
    pctSettlements: Number(record.pctSettlements),
    pctFinancialLaw: Number(record.pctFinancialLaw),
    pctTaxCompliance: Number(record.pctTaxCompliance),
    isrWithholdingMxn,
    imssWithholdingMxn,
    employmentSubsidyMxn,
    infonavitCreditMxn,
    netDepositMxn: netSalaryMxn + punctualityBonusMxn + attendanceBonusMxn + vacationPremiumMxn + overtimeTotalMxn + employmentSubsidyMxn - payrollWithholdingsMxn,
    payrollStampedByAraceli: record.payrollStampedByAraceli,
    finalPaymentApprovedByEmrt: record.finalPaymentApprovedByEmrt,
    reviewedByJnls: record.reviewedByJnls,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapAccountingAccount(record: {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  satGroupingCode: string | null;
  parentId: string | null;
  level: number;
  nature: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AccountingAccount {
  return {
    id: record.id,
    code: record.code,
    name: repairMojibakeText(record.name) ?? record.name,
    type: record.type as AccountingAccount["type"],
    subtype: record.subtype ?? undefined,
    satGroupingCode: record.satGroupingCode ?? undefined,
    parentId: record.parentId ?? undefined,
    level: record.level,
    nature: record.nature as AccountingAccount["nature"],
    isActive: record.isActive,
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapAccountingPeriod(record: {
  id: string;
  year: number;
  month: number;
  status: string;
  exportedAt: Date | null;
  requiresRegeneration: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AccountingPeriod {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    status: record.status as AccountingPeriod["status"],
    exportedAt: record.exportedAt?.toISOString(),
    requiresRegeneration: record.requiresRegeneration,
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapAccountingCfdiDocument(record: {
  id: string;
  uuid: string;
  version: string | null;
  type: string;
  issuerRfc: string;
  issuerName: string | null;
  receiverRfc: string;
  receiverName: string | null;
  issueDate: Date | null;
  certificationDate: Date | null;
  subtotalMxn: Prisma.Decimal;
  discountMxn: Prisma.Decimal;
  taxMxn: Prisma.Decimal;
  totalMxn: Prisma.Decimal;
  currency: string;
  paymentMethod: string | null;
  paymentForm: string | null;
  usage: string | null;
  status: string;
  linkedSourceType: string | null;
  linkedSourceId: string | null;
  originalFileName: string;
  parsedData: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): AccountingCfdiDocument {
  return {
    id: record.id,
    uuid: record.uuid,
    version: record.version ?? undefined,
    type: record.type,
    issuerRfc: record.issuerRfc,
    issuerName: record.issuerName ?? undefined,
    receiverRfc: record.receiverRfc,
    receiverName: record.receiverName ?? undefined,
    issueDate: record.issueDate?.toISOString(),
    certificationDate: record.certificationDate?.toISOString(),
    subtotalMxn: Number(record.subtotalMxn),
    discountMxn: Number(record.discountMxn),
    taxMxn: Number(record.taxMxn),
    totalMxn: Number(record.totalMxn),
    currency: record.currency,
    paymentMethod: record.paymentMethod ?? undefined,
    paymentForm: record.paymentForm ?? undefined,
    usage: record.usage ?? undefined,
    status: record.status as AccountingCfdiDocument["status"],
    linkedSourceType: record.linkedSourceType ?? undefined,
    linkedSourceId: record.linkedSourceId ?? undefined,
    originalFileName: record.originalFileName,
    parsedData: asRecord(record.parsedData),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapAccountingJournalLine(record: {
  id: string;
  entryId: string;
  accountId: string;
  account: { code: string; name: string };
  description: string;
  debitMxn: Prisma.Decimal;
  creditMxn: Prisma.Decimal;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: Date;
}): AccountingJournalLine {
  return {
    id: record.id,
    entryId: record.entryId,
    accountId: record.accountId,
    accountCode: record.account.code,
    accountName: record.account.name,
    description: record.description,
    debitMxn: Number(record.debitMxn),
    creditMxn: Number(record.creditMxn),
    sourceType: record.sourceType ?? undefined,
    sourceId: record.sourceId ?? undefined,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapAccountingJournalEntry(record: {
  id: string;
  year: number;
  month: number;
  entryDate: Date;
  number: string;
  entryType: string;
  status: string;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceFingerprint: string | null;
  cfdiDocumentId: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<Parameters<typeof mapAccountingJournalLine>[0]>;
}): AccountingJournalEntry {
  const lines = record.lines.map(mapAccountingJournalLine);
  const totalDebitMxn = lines.reduce((sum, line) => sum + line.debitMxn, 0);
  const totalCreditMxn = lines.reduce((sum, line) => sum + line.creditMxn, 0);

  return {
    id: record.id,
    year: record.year,
    month: record.month,
    entryDate: record.entryDate.toISOString().slice(0, 10),
    number: record.number,
    entryType: record.entryType as AccountingJournalEntry["entryType"],
    status: record.status as AccountingJournalEntry["status"],
    description: record.description,
    sourceType: record.sourceType ?? undefined,
    sourceId: record.sourceId ?? undefined,
    sourceFingerprint: record.sourceFingerprint ?? undefined,
    cfdiDocumentId: record.cfdiDocumentId ?? undefined,
    createdByUserId: record.createdByUserId ?? undefined,
    createdByName: record.createdByName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lines,
    totalDebitMxn,
    totalCreditMxn,
    balanced: Math.abs(totalDebitMxn - totalCreditMxn) < 0.01
  };
}

export function mapAccountingRule(record: {
  id: string;
  ruleType: string;
  sourceKey: string;
  accountId: string;
  taxAccountId: string | null;
  cashAccountId: string | null;
  counterAccountId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AccountingRule {
  return {
    id: record.id,
    ruleType: record.ruleType as AccountingRule["ruleType"],
    sourceKey: record.sourceKey,
    accountId: record.accountId,
    taxAccountId: record.taxAccountId ?? undefined,
    cashAccountId: record.cashAccountId ?? undefined,
    counterAccountId: record.counterAccountId ?? undefined,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapAccountingSettings(record: {
  companyRfc: string | null;
  legalName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AccountingSettings {
  return {
    companyRfc: record.companyRfc ?? undefined,
    legalName: record.legalName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapHoliday(record: {
  id: string;
  date: Date;
  authorityShortName: string;
  authorityName: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}): Holiday {
  return {
    id: record.id,
    date: record.date.toISOString().slice(0, 10),
    authorityShortName: record.authorityShortName as Holiday["authorityShortName"],
    authorityName: record.authorityName,
    label: record.label,
    source: "MANUAL",
    automatic: false,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapBudgetPlan(record: {
  id: string;
  year: number;
  month: number;
  expectedIncomeMxn: Prisma.Decimal;
  expectedExpenseMxn: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BudgetPlan {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    expectedIncomeMxn: Number(record.expectedIncomeMxn),
    expectedExpenseMxn: Number(record.expectedExpenseMxn),
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapBudgetPlanExpenseBreakdownItem(record: {
  id: string;
  year: number;
  month: number;
  concept: string;
  amountMxn: Prisma.Decimal;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): BudgetPlanExpenseBreakdownItem {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    concept: record.concept,
    amountMxn: Number(record.amountMxn),
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapBudgetPlanSnapshot(record: {
  id: string;
  year: number;
  month: number;
  expectedIncomeMxn: Prisma.Decimal;
  expectedExpenseMxn: Prisma.Decimal;
  actualIncomeMxn: Prisma.Decimal;
  actualExpenseMxn: Prisma.Decimal;
  expectedResultMxn: Prisma.Decimal;
  actualResultMxn: Prisma.Decimal;
  financeRecordCount: number;
  generalExpenseCount: number;
  notes: string | null;
  createdAt: Date;
}): BudgetPlanSnapshot {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    expectedIncomeMxn: Number(record.expectedIncomeMxn),
    expectedExpenseMxn: Number(record.expectedExpenseMxn),
    actualIncomeMxn: Number(record.actualIncomeMxn),
    actualExpenseMxn: Number(record.actualExpenseMxn),
    expectedResultMxn: Number(record.expectedResultMxn),
    actualResultMxn: Number(record.actualResultMxn),
    financeRecordCount: record.financeRecordCount,
    generalExpenseCount: record.generalExpenseCount,
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapCommissionSnapshot(record: {
  id: string;
  year: number;
  month: number;
  section: string;
  title: string;
  totalNetMxn: Prisma.Decimal;
  snapshotData: Prisma.JsonValue | null;
  createdAt: Date;
}): CommissionSnapshot {
  return {
    id: record.id,
    year: record.year,
    month: record.month,
    section: record.section,
    title: record.title,
    totalNetMxn: Number(record.totalNetMxn),
    snapshotData: (record.snapshotData ?? undefined) as CommissionSnapshot["snapshotData"],
    createdAt: record.createdAt.toISOString()
  };
}

export function mapTaskItem(record: {
  id: string;
  moduleId: string;
  trackId: string;
  clientName: string;
  matterId: string | null;
  matterNumber: string | null;
  subject: string;
  responsible: string;
  dueDate: Date;
  state: string;
  recurring: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TaskItem {
  return {
    id: record.id,
    moduleId: record.moduleId,
    trackId: record.trackId,
    clientName: record.clientName,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    subject: record.subject,
    responsible: record.responsible,
    dueDate: record.dueDate.toISOString(),
    state: record.state as TaskItem["state"],
    recurring: record.recurring,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskTrackingRecord(record: {
  id: string;
  moduleId: string;
  tableCode: string;
  sourceTable: string;
  matterId: string | null;
  matterNumber: string | null;
  clientNumber: string | null;
  clientName: string;
  subject: string;
  specificProcess: string | null;
  matterIdentifier: string | null;
  taskName: string;
  eventName: string | null;
  responsible: string;
  dueDate: Date | null;
  termDate: Date | null;
  completedAt: Date | null;
  status: string;
  workflowStage: number;
  reportedMonth: string | null;
  termId: string | null;
  data: Prisma.JsonValue;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskTrackingRecord {
  return {
    id: record.id,
    moduleId: record.moduleId,
    tableCode: record.tableCode,
    sourceTable: record.sourceTable,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    matterIdentifier: record.matterIdentifier ?? undefined,
    taskName: record.taskName,
    eventName: record.eventName ?? undefined,
    responsible: record.responsible,
    dueDate: record.dueDate?.toISOString(),
    termDate: record.termDate?.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    status: record.status as TaskTrackingRecord["status"],
    workflowStage: record.workflowStage,
    reportedMonth: record.reportedMonth ?? undefined,
    termId: record.termId ?? undefined,
    data: asRecord(record.data),
    deletedAt: record.deletedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskTerm(record: {
  id: string;
  moduleId: string;
  sourceTable: string | null;
  sourceRecordId: string | null;
  matterId: string | null;
  matterNumber: string | null;
  clientNumber: string | null;
  clientName: string;
  subject: string;
  specificProcess: string | null;
  matterIdentifier: string | null;
  eventName: string;
  pendingTaskLabel: string | null;
  responsible: string;
  dueDate: Date | null;
  termDate: Date | null;
  status: string;
  recurring: boolean;
  reportedMonth: string | null;
  verification: Prisma.JsonValue;
  data: Prisma.JsonValue;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskTerm {
  return {
    id: record.id,
    moduleId: record.moduleId,
    sourceTable: record.sourceTable ?? undefined,
    sourceRecordId: record.sourceRecordId ?? undefined,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    matterIdentifier: record.matterIdentifier ?? undefined,
    eventName: record.eventName,
    pendingTaskLabel: record.pendingTaskLabel ?? undefined,
    responsible: record.responsible,
    dueDate: record.dueDate?.toISOString(),
    termDate: record.termDate?.toISOString(),
    status: record.status as TaskTerm["status"],
    recurring: record.recurring,
    reportedMonth: record.reportedMonth ?? undefined,
    verification: asStringRecord(record.verification),
    data: asRecord(record.data),
    deletedAt: record.deletedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskDistributionEvent(record: {
  id: string;
  moduleId: string;
  name: string;
  targetTables: Prisma.JsonValue;
  defaultTaskName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskDistributionEvent {
  return {
    id: record.id,
    moduleId: record.moduleId,
    name: record.name,
    targetTables: asStringArray(record.targetTables),
    defaultTaskName: record.defaultTaskName ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskDistributionHistory(record: {
  id: string;
  moduleId: string;
  matterId: string | null;
  matterNumber: string | null;
  clientNumber: string | null;
  clientName: string;
  subject: string;
  specificProcess: string | null;
  matterIdentifier: string | null;
  eventName: string;
  targetTables: Prisma.JsonValue;
  eventNamesPerTable: Prisma.JsonValue;
  createdIds: Prisma.JsonValue;
  data: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): TaskDistributionHistory {
  return {
    id: record.id,
    moduleId: record.moduleId,
    matterId: record.matterId ?? undefined,
    matterNumber: record.matterNumber ?? undefined,
    clientNumber: record.clientNumber ?? undefined,
    clientName: record.clientName,
    subject: record.subject,
    specificProcess: record.specificProcess ?? undefined,
    matterIdentifier: record.matterIdentifier ?? undefined,
    eventName: record.eventName,
    targetTables: asStringArray(record.targetTables),
    eventNamesPerTable: asStringArray(record.eventNamesPerTable),
    createdIds: asStringRecord(record.createdIds),
    data: asRecord(record.data),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapTaskAdditionalTask(record: {
  id: string;
  moduleId: string;
  task: string;
  responsible: string;
  responsible2: string | null;
  dueDate: Date | null;
  recurring: boolean;
  status: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskAdditionalTask {
  return {
    id: record.id,
    moduleId: record.moduleId,
    task: record.task,
    responsible: record.responsible,
    responsible2: record.responsible2 ?? undefined,
    dueDate: record.dueDate?.toISOString(),
    recurring: record.recurring,
    status: record.status as TaskAdditionalTask["status"],
    deletedAt: record.deletedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapRefreshToken(record: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}): RefreshTokenRecord {
  return {
    id: record.id,
    userId: record.userId,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapPasswordResetToken(record: {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: record.id,
    userId: record.userId,
    tokenHash: record.tokenHash,
    purpose: record.purpose,
    expiresAt: record.expiresAt.toISOString(),
    consumedAt: record.consumedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString()
  };
}

export function mapTaskModule(record: {
  id: string;
  team: string;
  label: string;
  summary: string;
  isActive?: boolean;
  tracks: Array<{
    trackCode: string;
    label: string;
    mode: string;
    recurring: boolean;
    recurrenceRule: Prisma.JsonValue | null;
  }>;
}, members: TaskModuleMember[] = []): TaskModuleDefinition {
  return {
    id: record.id,
    team: record.team as TaskModuleDefinition["team"],
    label: record.label,
    summary: record.summary,
    isActive: record.isActive,
    members,
    tracks: record.tracks.map((track) => ({
      id: track.trackCode,
      label: track.label,
      mode: track.mode as TaskModuleDefinition["tracks"][number]["mode"],
      recurring: track.recurring,
      recurrenceRule: (track.recurrenceRule ?? undefined) as TaskModuleDefinition["tracks"][number]["recurrenceRule"]
    }))
  };
}
