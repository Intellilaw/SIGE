import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  Client,
  FinanceRecord,
  GeneralExpense,
  Matter,
  TaskAdditionalTask,
  TaskDistributionHistory,
  TaskModuleDefinition,
  TaskTerm,
  TaskTrackingRecord
} from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import {
  buildExecutionTermTaskMap,
  buildExecutionTrackingRecordTaskMap,
  collectExecutionHolidayFetchPlan,
  evaluateExecutionMatterRow,
  fetchExecutionHolidayDateKeysByAuthority,
  getEffectiveClientNumber,
  getExecutionMatterTasks,
  mergeExecutionTaskMaps,
  serializeExecutionHolidayFetchPlan,
  sortActiveExecutionMatters,
  type HolidayDateKeysByAuthority
} from "../execution/execution-row-utils";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID, type TaskDashboardMember } from "./task-dashboard-config";
import {
  buildTaskDashboardMembers,
  findTaskModuleDescriptorBySlug
} from "./task-module-descriptors";
import {
  buildDistributionHistoryTaskNameMap,
  getEffectiveTrackingResponsible,
  getLitigationWritingFollowUpTaskLabel,
  hasValidTrackingResponsible,
  isLitigationWritingPostPresentationStage,
  isTrackingTermEnabled,
  resolveTrackingTaskName,
  usesPresentationAndTermDates
} from "./task-display-utils";
import { LEGACY_TASK_MODULE_BY_ID, type LegacyTaskTableConfig } from "./task-legacy-config";

type DashboardTimeframe = "anteriores" | "hoy" | "manana" | "posteriores";

interface DashboardRow {
  taskId: string;
  clientNumber: string;
  clientName: string;
  subject: string;
  specificProcess: string;
  taskLabel: string;
  typeLabel: string;
  displayDate: string;
  originLabel: string;
  originPath: string;
  actionLabel: string;
  secondaryActionLabel?: string;
  secondaryActionPath?: string;
  highlighted: boolean;
}

interface VerificationColumn {
  key: string;
  label: string;
}

const TIMEFRAMES: Array<{ id: DashboardTimeframe; label: string; colorClass: string }> = [
  { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
  { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
  { id: "manana", label: "Tareas mañana", colorClass: "is-tomorrow" },
  { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];
const LITIGATION_MODULE_ID = "litigation";
const CORPORATE_LABOR_MODULE_ID = "corporate-labor";
const TAX_COMPLIANCE_MODULE_ID = "tax-compliance";
const FINANCE_TASK_MODULE_ID = "finance";
const GENERAL_EXPENSES_PATH = "/app/general-expenses";
const TEAM_WIDE_DASHBOARD_MODULE_IDS = new Set([CORPORATE_LABOR_MODULE_ID, TAX_COMPLIANCE_MODULE_ID]);
const EXECUTION_INCOMPLETE_DASHBOARD_MODULE_IDS = new Set([
  LITIGATION_MODULE_ID,
  CORPORATE_LABOR_MODULE_ID,
  TAX_COMPLIANCE_MODULE_ID
]);
const LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER = "MEOO";
const LITIGATION_COLLABORATOR_MEMBER_ID = "LAMR";
const LITIGATION_WRITINGS_TABLE_SLUG = "escritos-fondo";
const LITIGATION_PREVENTIONS_TABLE_SLUG = "desahogo-prevenciones";
const LITIGATION_JUDGES_TABLE_SLUG = "jueces-magistrados";
const LITIGATION_AUDIENCES_TABLE_SLUG = "audiencias";
const LITIGATION_ACTUARY_APPOINTMENTS_TABLE_SLUG = "citas-actuarios";
const LITIGATION_NOTIFICATIONS_TABLE_SLUG = "notificaciones";
const LITIGATION_EVIDENCE_TABLE_SLUG = "pruebas";
const LITIGATION_PUBLICATIONS_TABLE_SLUG = "publicaciones";
const LITIGATION_WAIT_RESOLUTION_TABLE_SLUG = "esperar-resolucion";
const LITIGATION_COPIES_TABLE_SLUG = "copias";
const LITIGATION_OFFICIAL_LETTERS_TABLE_SLUG = "oficios";
const LITIGATION_APPEALS_AND_AMPAROS_TABLE_SLUG = "amparos";
const LITIGATION_RETURNED_COURT_FILES_TABLE_SLUG = "archivo-judicial";
const LITIGATION_DOCUMENT_RETURNS_TABLE_SLUG = "devoluciones";
const LITIGATION_FILES_TO_SCAN_TABLE_SLUG = "escaneados";
const LITIGATION_THIRD_PARTY_ACTIONS_TABLE_SLUG = "terceros-ajenos";
const LITIGATION_OTHER_PROCEDURES_TABLE_SLUG = "otros-tramites";

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\/\s*/g, "/");
}

function splitResponsibleAliases(value?: string | null) {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s*(?:\/|,|;|&|\by\b)\s*/u)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function roundCurrencyValue(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function hasCurrencyDifference(value: number) {
  return Math.round(Math.abs(Number(value) || 0) * 100) !== 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function getLocalDateInput(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCurrentFinancePeriod() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);

  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function getCurrentFinancePeriodQuery() {
  const { year, month } = getCurrentFinancePeriod();

  return `year=${year}&month=${month}`;
}

function getMonthEndDateInput(year: number, month: number) {
  const date = new Date(year, month, 0, 12, 0, 0, 0);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildFinanceRecordMatchKeys(input: { quoteNumber?: string | null; clientName?: string | null; subject?: string | null }) {
  const keys: string[] = [];
  const quote = normalizeComparableText(input.quoteNumber);
  const client = normalizeComparableText(input.clientName);
  const subject = normalizeComparableText(input.subject);

  if (quote) {
    keys.push(`quote:${quote}`);
  }
  if (client && subject) {
    keys.push(`matter:${client}|${subject}`);
  }

  return keys;
}

function matchesResponsible(taskResponsible: string, member: TaskDashboardMember, sharedResponsibleAliases: string[]) {
  const normalizedResponsible = normalizeComparableText(taskResponsible);
  const responsibleAliases = splitResponsibleAliases(taskResponsible);
  const memberAliases = member.aliases.map((alias) => normalizeComparableText(alias));
  const sharedAliases = sharedResponsibleAliases.map((alias) => normalizeComparableText(alias));

  return memberAliases.includes(normalizedResponsible)
    || responsibleAliases.some((alias) => memberAliases.includes(alias))
    || sharedAliases.includes(normalizedResponsible);
}

function getVerificationColumnAliases(column: VerificationColumn) {
  const labelWithoutPrefix = normalizeText(column.label).replace(/^v\.\s*/i, "");
  const keyAliases = column.key
    .replace(/^verificado[_-]?/i, "")
    .split(/[_-]/)
    .filter(Boolean);

  return [column.label, labelWithoutPrefix, ...keyAliases]
    .map((alias) => normalizeComparableText(alias))
    .filter(Boolean);
}

function matchesVerificationColumn(column: VerificationColumn, member: TaskDashboardMember) {
  const memberAliases = member.aliases.map((alias) => normalizeComparableText(alias));

  return getVerificationColumnAliases(column).some((alias) => memberAliases.includes(alias));
}

function usesTeamWideDashboard(moduleId?: string) {
  return Boolean(moduleId && TEAM_WIDE_DASHBOARD_MODULE_IDS.has(moduleId));
}

function usesExecutionIncompleteDashboard(moduleId?: string) {
  return Boolean(moduleId && EXECUTION_INCOMPLETE_DASHBOARD_MODULE_IDS.has(moduleId));
}

function isVerificationValueComplete(value?: string | null) {
  return ["si", "yes"].includes(normalizeComparableText(value));
}

function buildLegacyTableLookup(tables: LegacyTaskTableConfig[]) {
  const lookup = new Map<string, LegacyTaskTableConfig>();

  tables.forEach((table) => {
    [table.slug, table.sourceTable, table.title].forEach((key) => {
      const normalizedKey = normalizeComparableText(key);
      if (normalizedKey) {
        lookup.set(normalizedKey, table);
      }
    });
  });

  return lookup;
}

function resolveRecordTable(lookup: Map<string, LegacyTaskTableConfig>, record: TaskTrackingRecord) {
  return lookup.get(normalizeComparableText(record.tableCode))
    ?? lookup.get(normalizeComparableText(record.sourceTable));
}

function belongsToTimeframe(input: { state: "open" | "closed"; date: string }, timeframe: DashboardTimeframe) {
  const today = getLocalDateInput();
  const tomorrow = getLocalDateInput(1);

  if (timeframe === "anteriores") {
    return input.state === "closed";
  }

  if (input.state === "closed") {
    return false;
  }

  if (timeframe === "hoy") {
    return !input.date || input.date <= today;
  }

  if (timeframe === "manana") {
    return input.date === tomorrow;
  }

  return input.date > tomorrow;
}

function isVerificationComplete(term: TaskTerm) {
  const values = Object.values(term.verification);
  return values.length > 0 && values.every((value) => isVerificationValueComplete(value));
}

function isLinkedVerificationComplete(term: TaskTerm | undefined) {
  return term ? isVerificationComplete(term) : false;
}

function isLinkedTermTableEnabled(table: LegacyTaskTableConfig | undefined) {
  if (!table) {
    return false;
  }

  return usesPresentationAndTermDates(table) || Boolean(table.autoTerm || table.termManagedDate);
}

function isPaymentReceived(method?: FinanceRecord["paymentMethod"] | null, received?: boolean | null) {
  return method === "T" || (method === "E" && received === true);
}

function hasPaymentDate(value?: string | null) {
  return Boolean(toDateInput(value));
}

function getReceivedFinancePaymentsMxn(record: FinanceRecord) {
  const payment1Mxn =
    hasPaymentDate(record.paymentDate1) && isPaymentReceived(record.paymentMethod, record.paymentReceived)
      ? record.paidThisMonthMxn
      : 0;
  const payment2Mxn =
    hasPaymentDate(record.paymentDate2) && isPaymentReceived(record.paymentMethod2, record.paymentReceived2)
      ? record.payment2Mxn
      : 0;
  const payment3Mxn =
    hasPaymentDate(record.paymentDate3) && isPaymentReceived(record.paymentMethod3, record.paymentReceived3)
      ? record.payment3Mxn
      : 0;

  return payment1Mxn + payment2Mxn + payment3Mxn;
}

function calculateFinanceDashboardStats(record: FinanceRecord) {
  const totalPaidMxn = getReceivedFinancePaymentsMxn(record);
  const dueTodayMxn = record.conceptFeesMxn - totalPaidMxn;
  const futurePaymentsMxn = roundCurrencyValue(record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn);
  const feeBreakdownDifferenceMxn = roundCurrencyValue(
    record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn - futurePaymentsMxn
  );
  const pctSum =
    record.pctLitigation +
    record.pctCorporateLabor +
    record.pctSettlements +
    record.pctFinancialLaw +
    record.pctTaxCompliance;

  return {
    dueTodayMxn,
    futurePaymentsMxn,
    feeBreakdownDifferenceMxn,
    pctSum
  };
}

function resolveFinanceClientNumber(record: FinanceRecord, clients: Client[]) {
  if (normalizeText(record.clientNumber)) {
    return normalizeText(record.clientNumber);
  }

  const normalizedName = normalizeComparableText(record.clientName);
  return clients.find((client) => normalizeComparableText(client.name) === normalizedName)?.clientNumber ?? "";
}

function buildCurrentFinanceRecordKeys(records: FinanceRecord[]) {
  const { year, month } = getCurrentFinancePeriod();
  const keys = new Set<string>();

  records
    .filter((record) => record.year === year && record.month === month)
    .forEach((record) => {
      buildFinanceRecordMatchKeys(record).forEach((key) => keys.add(key));
    });

  return keys;
}

function evaluateFinanceActiveMatterForTasks(matter: Matter, records: FinanceRecord[], clients: Client[]) {
  const { year, month } = getCurrentFinancePeriod();
  const currentRecordKeys = buildCurrentFinanceRecordKeys(records);
  const monthEnd = getMonthEndDateInput(year, month);
  const paymentDate = toDateInput(matter.nextPaymentDate);
  const matterKeys = buildFinanceRecordMatchKeys(matter);
  const missing: string[] = [];

  if (!paymentDate) {
    missing.push("Fecha de proximo pago");
  } else if (paymentDate <= monthEnd && !matterKeys.some((key) => currentRecordKeys.has(key))) {
    missing.push("Vence este mes o antes y no esta en Finanzas > Ver mes");
  }

  return {
    effectiveClientNumber: getEffectiveClientNumber(matter, clients),
    missing
  };
}

function evaluateFinanceRecordForTasks(record: FinanceRecord, clients: Client[]) {
  const stats = calculateFinanceDashboardStats(record);
  const effectiveClientNumber = resolveFinanceClientNumber(record, clients);
  const hasExactlyOneCollectionProbability = record.highCollectionProbability !== record.lowCollectionProbability;
  const requiredChecks: Array<{ label: string; present: boolean }> = [
    { label: "No. Cliente", present: Boolean(normalizeText(effectiveClientNumber)) },
    { label: "Cliente", present: Boolean(normalizeText(record.clientName)) },
    { label: "No. Cotizacion", present: Boolean(normalizeText(record.quoteNumber)) },
    { label: "Tipo", present: Boolean(record.matterType) },
    {
      label: "Periodo",
      present:
        record.matterType !== "RETAINER" ||
        (Boolean(record.periodYear ?? record.year) && Boolean(record.periodMonth ?? record.month))
    },
    { label: "Asunto", present: Boolean(normalizeText(record.subject)) },
    { label: "Equipo Responsable", present: Boolean(record.responsibleTeam) },
    {
      label: "Conceptos trabajando",
      present: record.matterType !== "ONE_TIME" || Boolean(normalizeText(record.workingConcepts))
    },
    { label: "Fecha de proximo pago", present: Boolean(record.nextPaymentDate) },
    { label: "Detalle Fecha", present: Boolean(normalizeText(record.nextPaymentNotes)) },
    { label: "En mora", present: Boolean(record.delinquencyStatus) },
    { label: "Probabilidad de cobro este mes", present: hasExactlyOneCollectionProbability },
    { label: "Receptor comision cliente 20%", present: Boolean(normalizeText(record.clientCommissionRecipient)) },
    { label: "Receptor comision cierre 10%", present: Boolean(normalizeText(record.closingCommissionRecipient)) },
    { label: "Hito conclusion", present: Boolean(normalizeText(record.milestone)) }
  ];
  const missing = requiredChecks.filter((field) => !field.present).map((field) => field.label);
  const today = getLocalDateInput();
  const paymentDate = toDateInput(record.nextPaymentDate);
  const isDateUrgent = Boolean(paymentDate && paymentDate <= today && stats.dueTodayMxn > 1);
  const isPctInvalid = stats.pctSum !== 100;
  const isFeeBreakdownInvalid =
    stats.futurePaymentsMxn < 0 || hasCurrencyDifference(stats.feeBreakdownDifferenceMxn);
  const reasons: string[] = [];

  if (missing.length > 0) {
    reasons.push(`Completar datos financieros: ${missing.join(", ")}`);
  }
  if (isDateUrgent) {
    reasons.push(`Cobrar pago pactado (${formatCurrency(stats.dueTodayMxn)})`);
  }
  if (isPctInvalid) {
    reasons.push(`Corregir porcentajes: suman ${stats.pctSum}%`);
  }
  if (stats.futurePaymentsMxn < 0) {
    reasons.push("Corregir desglose: anteriores + este mes exceden Total asunto");
  } else if (isFeeBreakdownInvalid) {
    reasons.push(`Corregir desglose: diferencia ${formatCurrency(stats.feeBreakdownDifferenceMxn)}`);
  }

  return {
    effectiveClientNumber,
    displayDate: isDateUrgent && paymentDate ? paymentDate : today,
    reasons
  };
}

function getGeneralExpenseDistributionPctSum(expense: GeneralExpense) {
  return (
    Number(expense.pctLitigation) +
    Number(expense.pctCorporateLabor) +
    Number(expense.pctSettlements) +
    Number(expense.pctFinancialLaw) +
    Number(expense.pctTaxCompliance)
  );
}

function evaluateGeneralExpenseForTasks(expense: GeneralExpense) {
  const missing: string[] = [];

  if (!normalizeText(expense.detail)) {
    missing.push("Detalle de gasto");
  }
  if (!Number(expense.amountMxn)) {
    missing.push("Monto");
  }
  if (!expense.expenseWithoutTeam && !expense.generalExpense && getGeneralExpenseDistributionPctSum(expense) !== 100) {
    missing.push("Distribucion por equipo (100%)");
  }
  if (!expense.payrollEntryId && !expense.projectorCommissionId) {
    if (!expense.paymentMethod) {
      missing.push("Metodo de pago");
    }
    if (expense.paymentMethod === "Transferencia" && !expense.bank) {
      missing.push("Banco");
    }
  }
  if (!expense.approvedByEmrt) {
    missing.push("Aprobado por EMRT");
  }
  if (!expense.reviewedByJnls) {
    missing.push("Revisado por JNLS");
  }
  if (!expense.paid) {
    missing.push("Pagado");
  }
  if (!expense.paidAt) {
    missing.push("Fecha de pago");
  }

  return missing;
}

function isLitigationWritingTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_WRITINGS_TABLE_SLUG;
}

function isLitigationPreventionTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_PREVENTIONS_TABLE_SLUG;
}

function isLitigationJudgesTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_JUDGES_TABLE_SLUG;
}

function isLitigationAudienceTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_AUDIENCES_TABLE_SLUG;
}

function isLitigationActuaryAppointmentTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_ACTUARY_APPOINTMENTS_TABLE_SLUG;
}

function isLitigationNotificationTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_NOTIFICATIONS_TABLE_SLUG;
}

function isLitigationEvidenceTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_EVIDENCE_TABLE_SLUG;
}

function isLitigationPublicationsTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_PUBLICATIONS_TABLE_SLUG;
}

function isLitigationWaitResolutionTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_WAIT_RESOLUTION_TABLE_SLUG;
}

function isLitigationCopiesTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_COPIES_TABLE_SLUG;
}

function isLitigationOfficialLettersTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_OFFICIAL_LETTERS_TABLE_SLUG;
}

function isLitigationAppealsAndAmparosTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_APPEALS_AND_AMPAROS_TABLE_SLUG;
}

function isLitigationReturnedCourtFilesTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_RETURNED_COURT_FILES_TABLE_SLUG;
}

function isLitigationDocumentReturnsTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_DOCUMENT_RETURNS_TABLE_SLUG;
}

function isLitigationFilesToScanTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_FILES_TO_SCAN_TABLE_SLUG;
}

function isLitigationThirdPartyActionsTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_THIRD_PARTY_ACTIONS_TABLE_SLUG;
}

function isLitigationOtherProceduresTable(table: LegacyTaskTableConfig | undefined) {
  return table?.slug === LITIGATION_OTHER_PROCEDURES_TABLE_SLUG;
}

function isLitigationCollaboratorMirrorTable(table: LegacyTaskTableConfig | undefined) {
  return isLitigationJudgesTable(table)
    || isLitigationAudienceTable(table)
    || isLitigationActuaryAppointmentTable(table)
    || isLitigationNotificationTable(table)
    || isLitigationPublicationsTable(table)
    || isLitigationWaitResolutionTable(table)
    || isLitigationCopiesTable(table)
    || isLitigationOfficialLettersTable(table)
    || isLitigationAppealsAndAmparosTable(table)
    || isLitigationReturnedCourtFilesTable(table)
    || isLitigationDocumentReturnsTable(table)
    || isLitigationFilesToScanTable(table)
    || isLitigationThirdPartyActionsTable(table)
    || isLitigationOtherProceduresTable(table);
}

function isResponsibleAssignmentTable(table: LegacyTaskTableConfig | undefined) {
  return isLitigationWritingTable(table) || isLitigationPreventionTable(table);
}

function isCompletedTrackingRecord(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (record.status === "presentado" || record.status === "concluida") {
    return true;
  }

  return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}

function isResponsibleAssignmentPending(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  return isResponsibleAssignmentTable(table) && !hasValidTrackingResponsible(record, table);
}

function isLitigationTermOversightMember(member: TaskDashboardMember) {
  return member.id === LITIGATION_COLLABORATOR_MEMBER_ID
    || member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
}

function matchesTermDashboardOwner(responsible: string, member: TaskDashboardMember, sharedResponsibleAliases: string[]) {
  return isLitigationTermOversightMember(member)
    || matchesResponsible(responsible, member, sharedResponsibleAliases);
}

function matchesTrackingDashboardOwner(
  table: LegacyTaskTableConfig | undefined,
  record: TaskTrackingRecord,
  member: TaskDashboardMember,
  sharedResponsibleAliases: string[]
) {
  const responsible = getEffectiveTrackingResponsible(record, table);

  if (isTrackingTermEnabled(record, table)) {
    return matchesTermDashboardOwner(responsible, member, sharedResponsibleAliases);
  }

  if (isLitigationEvidenceTable(table)) {
    return member.id === LITIGATION_COLLABORATOR_MEMBER_ID
      || member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
  }

  if (isLitigationCollaboratorMirrorTable(table)) {
    return member.id === LITIGATION_COLLABORATOR_MEMBER_ID
      || (hasValidTrackingResponsible(record, table) && matchesResponsible(responsible, member, sharedResponsibleAliases));
  }

  if (!isResponsibleAssignmentTable(table)) {
    return matchesResponsible(responsible, member, sharedResponsibleAliases);
  }

  if (isResponsibleAssignmentPending(table, record)) {
    return member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
  }

  if (member.id === LITIGATION_COLLABORATOR_MEMBER_ID && isLitigationWritingTable(table)) {
    return false;
  }

  return member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER
    || (isLitigationPreventionTable(table) && member.id === LITIGATION_COLLABORATOR_MEMBER_ID)
    || matchesResponsible(responsible, member, []);
}

function getTrackingDashboardDateForMember(
  table: LegacyTaskTableConfig | undefined,
  record: TaskTrackingRecord,
  member: TaskDashboardMember
) {
  if (isResponsibleAssignmentPending(table, record) && member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER) {
    return getLocalDateInput();
  }

  if (isLitigationWritingPostPresentationStage(table, record)) {
    return getLocalDateInput();
  }

  return getTrackingDashboardDate(table, record);
}

function getTrackingDateCandidates(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  if (isLitigationWritingPostPresentationStage(table, record)) {
    return [getLocalDateInput()];
  }

  const dates = [toDateInput(record.dueDate)];
  const termDate = toDateInput(record.termDate);

  if (isTrackingTermEnabled(record, table) && termDate) {
    dates.push(termDate);
  }

  return dates.filter(Boolean).sort();
}

function getTrackingDashboardDate(table: LegacyTaskTableConfig | undefined, record: TaskTrackingRecord) {
  return getTrackingDateCandidates(table, record)[0] ?? "";
}

function isTrackingDashboardRed(
  table: LegacyTaskTableConfig | undefined,
  record: TaskTrackingRecord,
  taskLabel: string,
  linkedTerm: TaskTerm | undefined
) {
  if (isCompletedTrackingRecord(table, record)) {
    return false;
  }

  const today = getLocalDateInput();
  const termEnabled = isTrackingTermEnabled(record, table);

  if (!taskLabel || !hasValidTrackingResponsible(record, table)) {
    return true;
  }

  if (isLitigationWritingPostPresentationStage(table, record)) {
    return false;
  }

  if (usesPresentationAndTermDates(table)) {
    const presentationDate = toDateInput(record.dueDate);
    const termDate = toDateInput(record.termDate);

    return !presentationDate
      || presentationDate <= today
      || (termEnabled && (!termDate || termDate <= today || !isLinkedVerificationComplete(linkedTerm)));
  }

  const dueDate = getTrackingDashboardDate(table, record);
  const requiresDate = table?.showDateColumn !== false;

  return (requiresDate && !dueDate)
    || (Boolean(dueDate) && dueDate <= today)
    || (termEnabled && !isLinkedVerificationComplete(linkedTerm));
}

export function TasksTeamPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusedMemberId = searchParams.get("member");
  const focusedTimeframe = searchParams.get("timeframe");
  const [taskModules, setTaskModules] = useState<TaskModuleDefinition[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const module = useMemo(
    () => findTaskModuleDescriptorBySlug(taskModules, slug),
    [slug, taskModules]
  );
  const dashboardMembers = useMemo(
    () => module ? buildTaskDashboardMembers(module.definition) : [],
    [module]
  );
  const dashboardConfig = module ? TASK_DASHBOARD_CONFIG_BY_MODULE_ID[module.moduleId] : undefined;
  const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;

  const [trackingRecords, setTrackingRecords] = useState<TaskTrackingRecord[]>([]);
  const [terms, setTerms] = useState<TaskTerm[]>([]);
  const [additionalTasks, setAdditionalTasks] = useState<TaskAdditionalTask[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [financeActiveMatters, setFinanceActiveMatters] = useState<Matter[]>([]);
  const [generalExpenses, setGeneralExpenses] = useState<GeneralExpense[]>([]);
  const [executionMatters, setExecutionMatters] = useState<Matter[]>([]);
  const [executionClients, setExecutionClients] = useState<Client[]>([]);
  const [executionDistributionHistory, setExecutionDistributionHistory] = useState<TaskDistributionHistory[]>([]);
  const [executionHolidayDateKeysByAuthority, setExecutionHolidayDateKeysByAuthority] = useState<HolidayDateKeysByAuthority>({});
  const [loading, setLoading] = useState(true);
  const [expandedView, setExpandedView] = useState<{ memberId: string; timeframe: DashboardTimeframe } | null>(null);

  const canAccess = Boolean(module);

  useEffect(() => {
    let active = true;

    async function loadModules() {
      setModulesLoading(true);
      setModulesError(null);

      try {
        const loadedModules = await apiGet<TaskModuleDefinition[]>("/tasks/modules");
        if (active) {
          setTaskModules(loadedModules);
        }
      } catch (error) {
        if (active) {
          setModulesError(error instanceof Error ? error.message : "No se pudieron cargar los equipos de tareas.");
        }
      } finally {
        if (active) {
          setModulesLoading(false);
        }
      }
    }

    void loadModules();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const isValidTimeframe = TIMEFRAMES.some((candidate) => candidate.id === focusedTimeframe);

    if (!focusedMemberId || !isValidTimeframe) {
      return;
    }

    const member = dashboardMembers.find((candidate) => candidate.id === focusedMemberId);
    if (member) {
      setExpandedView({ memberId: member.id, timeframe: focusedTimeframe as DashboardTimeframe });
    }
  }, [dashboardMembers, focusedMemberId, focusedTimeframe]);

  useEffect(() => {
    if (!module || !canAccess) {
      return;
    }

    const currentModule = module;

    async function loadDashboard() {
      setLoading(true);

      try {
        const shouldLoadLegacyRows = Boolean(legacyConfig);
        const shouldLoadFinanceRows = currentModule.moduleId === FINANCE_TASK_MODULE_ID;
        const shouldLoadExecutionMissingRows = shouldLoadLegacyRows && usesExecutionIncompleteDashboard(currentModule.moduleId);
        const shouldLoadClients = shouldLoadExecutionMissingRows || shouldLoadFinanceRows;
        const financePeriodQuery = getCurrentFinancePeriodQuery();
        const trackingRecordsPromise = shouldLoadLegacyRows
          ? apiGet<TaskTrackingRecord[]>(`/tasks/tracking-records?moduleId=${currentModule.moduleId}`)
          : Promise.resolve<TaskTrackingRecord[]>([]);
        const termsPromise = shouldLoadLegacyRows
          ? apiGet<TaskTerm[]>(`/tasks/terms?moduleId=${currentModule.moduleId}`)
          : Promise.resolve<TaskTerm[]>([]);
        const financeRecordsPromise = shouldLoadFinanceRows
          ? apiGet<FinanceRecord[]>(`/finances/records?${financePeriodQuery}`).catch(() => [])
          : Promise.resolve<FinanceRecord[]>([]);
        const generalExpensesPromise = shouldLoadFinanceRows
          ? apiGet<GeneralExpense[]>(`/general-expenses?${financePeriodQuery}`).catch(() => [])
          : Promise.resolve<GeneralExpense[]>([]);
        const additionalTasksPromise = apiGet<TaskAdditionalTask[]>(`/tasks/additional?moduleId=${currentModule.moduleId}`).catch(() => []);
        const executionMattersPromise = shouldLoadExecutionMissingRows
          || shouldLoadFinanceRows
          ? apiGet<Matter[]>("/matters").catch(() => [])
          : Promise.resolve<Matter[]>([]);
        const executionClientsPromise = shouldLoadClients
          ? apiGet<Client[]>("/clients").catch(() => [])
          : Promise.resolve<Client[]>([]);
        const executionDistributionHistoryPromise = shouldLoadExecutionMissingRows
          ? apiGet<TaskDistributionHistory[]>(`/tasks/distributions?moduleId=${currentModule.moduleId}`).catch(() => [])
          : Promise.resolve<TaskDistributionHistory[]>([]);
        const [
          loadedTracking,
          loadedTerms,
          loadedFinanceRecords,
          loadedGeneralExpenses,
          loadedAdditionalTasks,
          loadedExecutionMatters,
          loadedExecutionClients,
          loadedExecutionDistributionHistory
        ] = await Promise.all([
          trackingRecordsPromise,
          termsPromise,
          financeRecordsPromise,
          generalExpensesPromise,
          additionalTasksPromise,
          executionMattersPromise,
          executionClientsPromise,
          executionDistributionHistoryPromise
        ]);

        setTrackingRecords(loadedTracking);
        setTerms(loadedTerms);
        setFinanceRecords(loadedFinanceRecords);
        setFinanceActiveMatters(
          shouldLoadFinanceRows
            ? loadedExecutionMatters.filter((matter) => !matter.concluded)
            : []
        );
        setGeneralExpenses(shouldLoadFinanceRows ? loadedGeneralExpenses : []);
        setAdditionalTasks(loadedAdditionalTasks);
        setExecutionClients(loadedExecutionClients);
        setExecutionMatters(
          shouldLoadExecutionMissingRows
            ? sortActiveExecutionMatters(
              loadedExecutionMatters.filter((matter) => matter.responsibleTeam === currentModule.team && !matter.concluded),
              loadedExecutionClients
            )
            : []
        );
        setExecutionDistributionHistory(loadedExecutionDistributionHistory);
        if (!shouldLoadExecutionMissingRows) {
          setExecutionHolidayDateKeysByAuthority({});
        }
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [canAccess, legacyConfig, module]);

  const tableLookup = useMemo(
    () => buildLegacyTableLookup(legacyConfig?.tables ?? []),
    [legacyConfig]
  );

  const managerSourceLookup = useMemo(() => {
    const recordIds = new Set<string>();
    const termIds = new Set<string>();

    trackingRecords.forEach((record) => {
        const table = resolveRecordTable(tableLookup, record);
        if (!table || record.deletedAt || isCompletedTrackingRecord(table, record) || !isTrackingTermEnabled(record, table)) {
          return;
        }

        recordIds.add(record.id);
        if (record.termId) {
          termIds.add(record.termId);
        }
      });

    return { recordIds, termIds };
  }, [tableLookup, trackingRecords]);

  const termLookup = useMemo(() => {
    const byId = new Map<string, TaskTerm>();
    const bySourceRecordId = new Map<string, TaskTerm>();

    terms.forEach((term) => {
      byId.set(term.id, term);
      if (term.sourceRecordId) {
        bySourceRecordId.set(term.sourceRecordId, term);
      }
    });

    return { byId, bySourceRecordId };
  }, [terms]);

  const executionTrackLabels = useMemo(
    () => new Map(module?.definition.tracks.map((track) => [track.id, track.label]) ?? []),
    [module]
  );
  const executionSourcePrefix = module?.shortLabel ?? "Ejecucion";
  const executionTaskNamesByRecordId = useMemo(
    () => buildDistributionHistoryTaskNameMap(executionDistributionHistory),
    [executionDistributionHistory]
  );
  const activeExecutionTaskMap = useMemo(
    () => mergeExecutionTaskMaps(
      buildExecutionTrackingRecordTaskMap(
        trackingRecords,
        executionTrackLabels,
        executionSourcePrefix,
        executionTaskNamesByRecordId
      ),
      buildExecutionTermTaskMap(terms, executionSourcePrefix)
    ),
    [executionSourcePrefix, executionTaskNamesByRecordId, executionTrackLabels, terms, trackingRecords]
  );
  const executionHolidayFetchPlan = useMemo(
    () => collectExecutionHolidayFetchPlan(executionMatters, activeExecutionTaskMap),
    [activeExecutionTaskMap, executionMatters]
  );
  const executionHolidayFetchSignature = useMemo(
    () => serializeExecutionHolidayFetchPlan(executionHolidayFetchPlan),
    [executionHolidayFetchPlan]
  );

  useEffect(() => {
    if (!usesExecutionIncompleteDashboard(module?.moduleId) || !executionHolidayFetchSignature) {
      setExecutionHolidayDateKeysByAuthority({});
      return;
    }

    let active = true;

    async function loadExecutionHolidayDates() {
      try {
        const dateKeys = await fetchExecutionHolidayDateKeysByAuthority(executionHolidayFetchPlan);
        if (active) {
          setExecutionHolidayDateKeysByAuthority(dateKeys);
        }
      } catch {
        if (active) {
          setExecutionHolidayDateKeysByAuthority({});
        }
      }
    }

    void loadExecutionHolidayDates();

    return () => {
      active = false;
    };
  }, [executionHolidayFetchPlan, executionHolidayFetchSignature, module?.moduleId]);

  function buildTrackingRows(member: TaskDashboardMember, timeframe: DashboardTimeframe): DashboardRow[] {
    const teamWideDashboard = usesTeamWideDashboard(module?.moduleId);

    return trackingRecords
      .filter((record) => !record.deletedAt)
      .map((record) => ({ record, table: resolveRecordTable(tableLookup, record) }))
      .filter(({ table }) => Boolean(table))
      .filter(({ record, table }) => !(isLitigationWritingTable(table) && isCompletedTrackingRecord(table, record)))
      .filter(({ record, table }) =>
        teamWideDashboard || matchesTrackingDashboardOwner(table, record, member, dashboardConfig?.sharedResponsibleAliases ?? [])
      )
      .filter(({ record, table }) =>
        belongsToTimeframe({
          state: isCompletedTrackingRecord(table, record) ? "closed" : "open",
          date: getTrackingDashboardDateForMember(table, record, member)
        }, timeframe)
      )
      .map(({ record, table }) => {
        const linkedTerm = (record.termId ? termLookup.byId.get(record.termId) : undefined) ?? termLookup.bySourceRecordId.get(record.id);
        const dueDate = getTrackingDashboardDateForMember(table, record, member);
        const baseTaskLabel = resolveTrackingTaskName(record, table, undefined, record.eventName);
        const followUpTaskLabel = getLitigationWritingFollowUpTaskLabel(table, record);
        const dashboardTaskLabel = followUpTaskLabel || baseTaskLabel;
        const completed = isCompletedTrackingRecord(table, record);
        const assignmentPending = !completed
          && isResponsibleAssignmentPending(table, record)
          && member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
        const highlighted = assignmentPending || isTrackingDashboardRed(table, record, dashboardTaskLabel, linkedTerm);

        return {
          taskId: `tracking-${record.id}`,
          clientNumber: record.clientNumber || "-",
          clientName: record.clientName || "-",
          subject: record.subject || "-",
          specificProcess: record.specificProcess || "-",
          taskLabel: assignmentPending
            ? `Definir responsable: ${dashboardTaskLabel || "Tarea"}`
            : dashboardTaskLabel || "Tarea",
          typeLabel: completed
            ? "Completada"
            : assignmentPending
              ? "Definir responsable"
              : isTrackingTermEnabled(record, table)
                ? "Termino / seguimiento"
                : highlighted ? "Vencida / incompleta" : "Seguimiento",
          displayDate: completed ? toDateInput(record.completedAt || record.updatedAt) : dueDate,
          originLabel: table?.title ?? record.sourceTable,
          originPath: `/app/tasks/${slug}/distribuidor`,
          actionLabel: "Ir al Manager",
          highlighted
        };
      });
  }

  function buildTermRows(timeframe: DashboardTimeframe): DashboardRow[] {
    if (!usesTeamWideDashboard(module?.moduleId)) {
      return [];
    }

    const today = getLocalDateInput();

    return terms
      .filter((term) => !term.deletedAt)
      .filter((term) => {
        const completed = term.status === "concluida";
        const termDate = toDateInput(term.termDate) || toDateInput(term.dueDate);
        const displayDate = completed ? toDateInput(term.updatedAt) || termDate : termDate;
        return belongsToTimeframe({ state: completed ? "closed" : "open", date: displayDate }, timeframe);
      })
      .map((term) => {
        const table = tableLookup.get(normalizeComparableText(term.sourceTable));
        const completed = term.status === "concluida";
        const termDate = toDateInput(term.termDate) || toDateInput(term.dueDate);
        const displayDate = completed ? toDateInput(term.updatedAt) || termDate : termDate;
        const taskLabel = normalizeText(term.pendingTaskLabel) || normalizeText(term.eventName) || "Termino sin nombre";
        const highlighted = !completed && (!displayDate || displayDate <= today || !isVerificationComplete(term));

        return {
          taskId: `term-${term.id}`,
          clientNumber: term.clientNumber || "-",
          clientName: term.clientName || "-",
          subject: term.subject || "-",
          specificProcess: term.specificProcess || "-",
          taskLabel,
          typeLabel: completed ? "Termino completado" : highlighted ? "Termino vencido / incompleto" : "Termino",
          displayDate,
          originLabel: table?.title ?? "Terminos",
          originPath: `/app/tasks/${slug}/${term.recurring ? "terminos-recurrentes" : "terminos"}`,
          actionLabel: "Ir a terminos",
          highlighted
        };
      });
  }

  function buildTermVerificationRows(member: TaskDashboardMember, timeframe: DashboardTimeframe): DashboardRow[] {
    if (timeframe !== "hoy") {
      return [];
    }

    const today = getLocalDateInput();
    const teamWideDashboard = usesTeamWideDashboard(module?.moduleId);

    return terms
      .filter((term) => !term.deletedAt)
      .filter((term) =>
        term.sourceRecordId
          ? managerSourceLookup.recordIds.has(term.sourceRecordId)
          : managerSourceLookup.termIds.has(term.id)
      )
      .flatMap((term) => {
        const table = tableLookup.get(normalizeComparableText(term.sourceTable));
        if (term.sourceRecordId && !isLinkedTermTableEnabled(table)) {
          return [];
        }

        if (isLitigationWritingTable(table) && member.id === LITIGATION_COLLABORATOR_MEMBER_ID) {
          return [];
        }

        const taskLabel = normalizeText(term.pendingTaskLabel) || normalizeText(term.eventName) || "Termino sin nombre";
        return (legacyConfig?.verificationColumns ?? [])
          .filter((column) => teamWideDashboard || matchesVerificationColumn(column, member))
          .filter((column) => !isVerificationValueComplete(term.verification[column.key]))
          .map((column) => ({
            taskId: `term-verification-${term.id}-${column.key}`,
            clientNumber: term.clientNumber || "-",
            clientName: term.clientName || "-",
            subject: term.subject || "-",
            specificProcess: term.specificProcess || "-",
            taskLabel: `Verificar termino: ${taskLabel}`,
            typeLabel: "Verificacion de termino",
            displayDate: today,
            originLabel: table?.title ?? "Manager de tareas",
            originPath: `/app/tasks/${slug}/distribuidor`,
            actionLabel: "Ir al Manager",
            highlighted: true
          }));
      });
  }

  function buildExecutionMissingRows(member: TaskDashboardMember, timeframe: DashboardTimeframe): DashboardRow[] {
    if (
      !module ||
      !legacyConfig ||
      timeframe !== "hoy" ||
      !usesExecutionIncompleteDashboard(module.moduleId) ||
      (module.moduleId === LITIGATION_MODULE_ID && member.id !== LITIGATION_COLLABORATOR_MEMBER_ID)
    ) {
      return [];
    }

    const today = getLocalDateInput();

    return executionMatters.flatMap((matter, index) => {
      const clientNumber = getEffectiveClientNumber(matter, executionClients);
      const matterTasks = getExecutionMatterTasks(matter, activeExecutionTaskMap);
      const validation = evaluateExecutionMatterRow(
        matter,
        clientNumber,
        matterTasks,
        executionHolidayDateKeysByAuthority
      );

      const hasMissing = validation.missing.length > 0;
      const rowNumber = index + 1;
      const managerParams = new URLSearchParams({ tab: "active" });
      const clientName = normalizeText(matter.clientName);
      if (clientName) {
        managerParams.set("client", clientName);
      }

      const executionParams = new URLSearchParams({
        matterId: matter.id,
        focus: "missing"
      });

      return [{
        taskId: `execution-missing-${matter.id}`,
        clientNumber: clientNumber || "-",
        clientName: matter.clientName || "-",
        subject: matter.subject || "-",
        specificProcess: matter.specificProcess || "-",
        taskLabel: hasMissing ? `Arreglar fila ${rowNumber}` : `Completar fila ${rowNumber}`,
        typeLabel: hasMissing ? "Faltantes en ejecución" : "Fila de ejecución pendiente",
        displayDate: today,
        originLabel: `Ejecución / ${module.shortLabel}`,
        originPath: `/app/tasks/${legacyConfig.slug}/distribuidor?${managerParams.toString()}`,
        actionLabel: "Ir al Manager",
        secondaryActionLabel: hasMissing ? "Ir a la fila con faltantes" : "Ir a la fila",
        secondaryActionPath: `/app/execution/${legacyConfig.slug}?${executionParams.toString()}`,
        highlighted: hasMissing
      }];
    });
  }

  function buildFinanceActiveMatterRows(timeframe: DashboardTimeframe): DashboardRow[] {
    if (module?.moduleId !== FINANCE_TASK_MODULE_ID) {
      return [];
    }

    const today = getLocalDateInput();

    if (!belongsToTimeframe({ state: "open", date: today }, timeframe)) {
      return [];
    }

    return financeActiveMatters.flatMap((matter) => {
      const evaluation = evaluateFinanceActiveMatterForTasks(matter, financeRecords, executionClients);
      if (evaluation.missing.length === 0) {
        return [];
      }

      return [{
        taskId: `finance-active-matter-${matter.id}`,
        clientNumber: evaluation.effectiveClientNumber || "-",
        clientName: matter.clientName || "-",
        subject: matter.subject || "-",
        specificProcess: matter.quoteNumber || matter.matterIdentifier || matter.matterType || "-",
        taskLabel: `Completar asunto activo: ${evaluation.missing.join(", ")}`,
        typeLabel: "Finanzas / Asuntos activos",
        displayDate: today,
        originLabel: "Finanzas / 1. Asuntos activos",
        originPath: "/app/finances",
        actionLabel: "Ir a Finanzas",
        highlighted: true
      }];
    });
  }

  function buildFinanceMonthlyRows(timeframe: DashboardTimeframe): DashboardRow[] {
    if (module?.moduleId !== FINANCE_TASK_MODULE_ID) {
      return [];
    }

    return financeRecords
      .filter((record) => !record.concluded)
      .flatMap((record) => {
        const evaluation = evaluateFinanceRecordForTasks(record, executionClients);
        if (evaluation.reasons.length === 0) {
          return [];
        }

        if (!belongsToTimeframe({ state: "open", date: evaluation.displayDate }, timeframe)) {
          return [];
        }

        return [{
          taskId: `finance-record-${record.id}`,
          clientNumber: evaluation.effectiveClientNumber || "-",
          clientName: record.clientName || "-",
          subject: record.subject || "-",
          specificProcess: record.quoteNumber || record.matterType || "-",
          taskLabel: evaluation.reasons.join(" / "),
          typeLabel: "Finanzas / Ver mes",
          displayDate: evaluation.displayDate,
          originLabel: "Finanzas / 2. Ver mes",
          originPath: "/app/finances",
          actionLabel: "Ir a Finanzas",
          highlighted: true
        }];
      });
  }

  function buildGeneralExpenseRows(timeframe: DashboardTimeframe): DashboardRow[] {
    if (module?.moduleId !== FINANCE_TASK_MODULE_ID) {
      return [];
    }

    const today = getLocalDateInput();

    if (!belongsToTimeframe({ state: "open", date: today }, timeframe)) {
      return [];
    }

    return generalExpenses.flatMap((expense) => {
      const missing = evaluateGeneralExpenseForTasks(expense);
      if (missing.length === 0) {
        return [];
      }

      return [{
        taskId: `general-expense-${expense.id}`,
        clientNumber: "-",
        clientName: "Gastos generales",
        subject: expense.detail || "Gasto sin detalle",
        specificProcess: expense.team || "-",
        taskLabel: `Completar gasto: ${missing.join(", ")}`,
        typeLabel: "Gastos generales",
        displayDate: today,
        originLabel: "Gastos generales / 1. Registro",
        originPath: GENERAL_EXPENSES_PATH,
        actionLabel: "Ir a Gastos",
        highlighted: true
      }];
    });
  }

  function buildAdditionalTaskRows(member: TaskDashboardMember, timeframe: DashboardTimeframe): DashboardRow[] {
    return additionalTasks
      .filter((task) => !task.deletedAt)
      .filter((task) =>
        matchesResponsible(task.responsible, member, dashboardConfig?.sharedResponsibleAliases ?? [])
        || (task.responsible2 ? matchesResponsible(task.responsible2, member, dashboardConfig?.sharedResponsibleAliases ?? []) : false)
      )
      .filter((task) =>
        belongsToTimeframe({
          state: task.status === "concluida" ? "closed" : "open",
          date: task.status === "concluida" ? toDateInput(task.updatedAt) : toDateInput(task.dueDate)
        }, timeframe)
      )
      .map((task) => {
        const completed = task.status === "concluida";
        const displayDate = completed ? toDateInput(task.updatedAt) : toDateInput(task.dueDate);
        const highlighted = !completed && (!displayDate || displayDate <= getLocalDateInput());

        return {
          taskId: `additional-${task.id}`,
          clientNumber: "-",
          clientName: "-",
          subject: "-",
          specificProcess: "-",
          taskLabel: task.task,
          typeLabel: completed ? "Completada" : highlighted ? "Vencida / incompleta" : "Tarea adicional",
          displayDate,
          originLabel: "Tareas adicionales",
          originPath: `/app/tasks/${slug}/adicionales`,
          actionLabel: "Ir a adicionales",
          highlighted
        };
      });
  }

  function buildRows(member: TaskDashboardMember, timeframe: DashboardTimeframe) {
    return [
      ...buildFinanceActiveMatterRows(timeframe),
      ...buildFinanceMonthlyRows(timeframe),
      ...buildGeneralExpenseRows(timeframe),
      ...buildAdditionalTaskRows(member, timeframe),
      ...buildTrackingRows(member, timeframe),
      ...buildTermRows(timeframe),
      ...buildTermVerificationRows(member, timeframe),
      ...buildExecutionMissingRows(member, timeframe)
    ].sort((left, right) => left.displayDate.localeCompare(right.displayDate));
  }

  if (!modulesLoading && modulesError) {
    return (
      <section className="page-stack tasks-team-page">
        <section className="panel">
          <div className="centered-inline-message">{modulesError}</div>
        </section>
      </section>
    );
  }

  if (!modulesLoading && (!module || !canAccess)) {
    return <Navigate to="/app/tasks" replace />;
  }

  if (modulesLoading || !module) {
    return (
      <section className="page-stack tasks-team-page">
        <section className="panel">
          <div className="centered-inline-message">Cargando equipo...</div>
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack tasks-team-page">
      <header className="hero module-hero">
        <div className="execution-page-topline">
          <button type="button" className="secondary-button" onClick={() => navigate("/app/tasks")}>
            Volver
          </button>
          <div className="module-hero-head">
            <span className="module-hero-icon" aria-hidden="true" style={{ color: module.color }}>
              {module.icon}
            </span>
            <div>
              <h2>{module.label}</h2>
            </div>
          </div>
        </div>
        <p className="muted">
          {module.moduleId === FINANCE_TASK_MODULE_ID
            ? "Dashboard de tareas del equipo de Finanzas alimentado por la tabla de Finanzas y tareas adicionales."
            : legacyConfig
              ? "Operacion de tareas por equipo con Manager de tareas, tablas de seguimiento, terminos y tareas adicionales."
              : "Espacio de tareas del equipo listo para configuracion posterior."}
        </p>
        {legacyConfig || module.moduleId === FINANCE_TASK_MODULE_ID ? (
          <div className="tasks-legacy-toolbar">
            {legacyConfig ? (
              <>
                <button type="button" className="primary-action-button" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/distribuidor`)}>
                  Manager de tareas
                </button>
                <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/terminos`)}>
                  Terminos
                </button>
                {legacyConfig.hasRecurringTerms ? (
                  <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/terminos-recurrentes`)}>
                    Terminos recurrentes
                  </button>
                ) : null}
              </>
            ) : null}
            {module.moduleId === FINANCE_TASK_MODULE_ID ? (
              <button type="button" className="primary-action-button" onClick={() => navigate("/app/finances")}>
                Tabla de Finanzas
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={() => navigate(`/app/tasks/${module.slug}/adicionales`)}>
              Tareas adicionales
            </button>
          </div>
        ) : null}
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Vista diaria del equipo</h2>
          <span>{dashboardMembers.length} integrantes</span>
        </div>
        <p className="muted tasks-team-board-copy">
          Cada integrante conserva sus ventanas de trabajo: realizadas, hoy, mañana y posteriores. El rojo indica
          faltantes, terminos sin verificacion o fechas vencidas.
        </p>

        <div className="tasks-team-member-list">
          {dashboardMembers.length === 0 ? (
            <div className="centered-inline-message">No hay integrantes activos asignados a este equipo.</div>
          ) : null}
          {dashboardMembers.map((member) => {
            const isExpanded = expandedView?.memberId === member.id;
            const rows = isExpanded && expandedView ? buildRows(member, expandedView.timeframe) : [];

            return (
              <article key={member.id} className="tasks-team-member-card">
                <div className="tasks-team-member-head">
                  <h3>{member.name}</h3>
                  <span>{member.id}</span>
                </div>

                <div className="tasks-team-timeframes">
                  {TIMEFRAMES.map((timeframe) => {
                    const isActive = expandedView?.memberId === member.id && expandedView.timeframe === timeframe.id;

                    return (
                      <button
                        key={timeframe.id}
                        type="button"
                        className={`tasks-team-timeframe-button ${timeframe.colorClass} ${isActive ? "is-active" : ""}`}
                        onClick={() =>
                          setExpandedView((current) =>
                            current?.memberId === member.id && current?.timeframe === timeframe.id
                              ? null
                              : { memberId: member.id, timeframe: timeframe.id }
                          )
                        }
                      >
                        {timeframe.label}
                      </button>
                    );
                  })}
                </div>

                {isExpanded && expandedView ? (
                  <div className="tasks-team-timeframe-panel">
                    <div className="panel-header">
                      <h3>{TIMEFRAMES.find((timeframe) => timeframe.id === expandedView.timeframe)?.label ?? "Detalle"}</h3>
                      <span>{rows.length} tareas</span>
                    </div>

                    <div className="table-scroll">
                      <table className="data-table tasks-dashboard-table">
                        <thead>
                          <tr>
                            <th>No. Cliente</th>
                            <th>Cliente</th>
                            <th>Asunto</th>
                            <th>Proceso especifico</th>
                            <th>Tarea</th>
                            <th>Tipo</th>
                            <th>Fecha</th>
                            <th>Tabla de Origen</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan={9} className="centered-inline-message">
                                Cargando tareas...
                              </td>
                            </tr>
                          ) : rows.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="centered-inline-message">
                                No hay tareas en esta categoria.
                              </td>
                            </tr>
                          ) : (
                            rows.map((row) => (
                              <tr key={row.taskId} className={row.highlighted ? "tasks-dashboard-row-overdue" : undefined}>
                                <td>{row.clientNumber || "-"}</td>
                                <td>{row.clientName}</td>
                                <td>{row.subject}</td>
                                <td>{row.specificProcess}</td>
                                <td className={row.highlighted ? "tasks-dashboard-title-overdue" : undefined}>{row.taskLabel}</td>
                                <td>
                                  <span className={`tasks-dashboard-type-pill ${row.typeLabel === "Completada" ? "is-completed" : row.highlighted ? "is-overdue" : "is-pending"}`}>
                                    {row.typeLabel}
                                  </span>
                                </td>
                                <td>{row.displayDate || "-"}</td>
                                <td>{row.originLabel}</td>
                                <td>
                                  <div className="tasks-dashboard-actions">
                                    <button type="button" className="secondary-button matter-inline-button" onClick={() => navigate(row.originPath)}>
                                      {row.actionLabel}
                                    </button>
                                    {row.secondaryActionPath ? (
                                      <button
                                        type="button"
                                        className="secondary-button matter-inline-button"
                                        onClick={() => navigate(row.secondaryActionPath ?? row.originPath)}
                                      >
                                        {row.secondaryActionLabel ?? "Ir"}
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {legacyConfig ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Tablas de seguimiento</h2>
            <span>{legacyConfig.tables.length} tablas</span>
          </div>
          <div className="tasks-table-card-grid">
            {legacyConfig.tables.map((table) => (
              <button key={table.slug} type="button" className="tasks-table-card" onClick={() => navigate(`/app/tasks/${legacyConfig.slug}/${table.slug}`)}>
                <strong>{table.title}</strong>
                <span>{table.sourceTable}</span>
              </button>
            ))}
          </div>
        </section>
      ) : module.moduleId === FINANCE_TASK_MODULE_ID ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Fuentes de tareas</h2>
            <span>4 fuentes</span>
          </div>
          <div className="tasks-table-card-grid">
            <button type="button" className="tasks-table-card" onClick={() => navigate("/app/finances")}>
              <strong>Finanzas / 1. Asuntos activos</strong>
              <span>Solo lectura en Tareas; se corrige desde Finanzas.</span>
            </button>
            <button type="button" className="tasks-table-card" onClick={() => navigate("/app/finances")}>
              <strong>Finanzas / 2. Ver mes</strong>
              <span>Solo lectura en Tareas; se corrige desde Finanzas.</span>
            </button>
            <button type="button" className="tasks-table-card" onClick={() => navigate(GENERAL_EXPENSES_PATH)}>
              <strong>Gastos generales / 1. Registro</strong>
              <span>Solo lectura en Tareas; se corrige desde Gastos generales.</span>
            </button>
            <button type="button" className="tasks-table-card" onClick={() => navigate(`/app/tasks/${module.slug}/adicionales`)}>
              <strong>Tareas adicionales</strong>
              <span>Alta y seguimiento manual del equipo.</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-header">
            <h2>Submodulos</h2>
            <span>0 configurados</span>
          </div>
          <div className="centered-inline-message">Sin submodulos configurados.</div>
        </section>
      )}
    </section>
  );
}
