import { useEffect, useMemo, useState } from "react";
import type {
  Client,
  CommissionBreakdownEntry,
  CommissionExclusion,
  CommissionGroup1TeamBreakdown,
  CommissionMatterCommission,
  CommissionPaymentAcknowledgement,
  CommissionPaymentFlowState,
  CommissionRecipientAssignment,
  CommissionReleaseEligibility,
  CommissionReceiver,
  CommissionSnapshot,
  CommissionSnapshotData,
  FinanceRecord,
  FinanceRecordStats,
  GeneralExpense,
  ProjectorCommission
} from "@sige/contracts";
import { COMMISSION_SECTIONS } from "@sige/contracts";

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canWriteModule, hasPermission } from "../auth/permissions";
import {
  buildCommissionMoneyReceipt,
  DocumentPreview,
  downloadPdfDocument,
  downloadWordDocument,
  generatedDocumentToHtml,
  type GeneratedDocument
} from "../modules/DailyDocumentsPage";

type ActiveTab = "calculation" | "receivers" | "snapshots";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

interface CommissionsOverviewResponse {
  financeRecords: FinanceRecord[];
  generalExpenses: GeneralExpense[];
  receivers: CommissionReceiver[];
  recipientAssignments: CommissionRecipientAssignment[];
  exclusions: CommissionExclusion[];
  matterCommissions: CommissionMatterCommission[];
  projectorCommissions: ProjectorCommission[];
  paymentAcknowledgements: CommissionPaymentAcknowledgement[];
  commissionReleaseEligibilities: CommissionReleaseEligibility[];
  periodLocked: boolean;
}

interface ComputedFinanceRecord extends FinanceRecord, FinanceRecordStats {
  effectiveClientNumber?: string;
  highlighted: boolean;
  highlightReason?: string;
}

interface SectionCalculation {
  financeRecords: ComputedFinanceRecord[];
  executionRecords: CommissionBreakdownEntry[];
  clientRecords: CommissionBreakdownEntry[];
  closingRecords: CommissionBreakdownEntry[];
  matterCommissions: CommissionMatterCommission[];
  matterCommissionsTotalMxn: number;
  group1TeamBreakdowns: CommissionGroup1TeamBreakdown[];
  highlightedCount: number;
  group1GrossMxn: number;
  group1NetMxn: number;
  group1PayableMxn: number;
  group2TotalMxn: number;
  group3TotalMxn: number;
  projectorPayableMxn: number;
  projectorBonusMxn: number;
  projectorCommissions: ProjectorCommission[];
  totalCommissionsMxn: number;
  grossTotalMxn: number;
  deductionRate: number;
  deductionBaseMxn: number;
  deductionMxn: number;
  netTotalMxn: number;
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

const EMPTY_CALCULATION: SectionCalculation = {
  financeRecords: [],
  executionRecords: [],
  clientRecords: [],
  closingRecords: [],
  matterCommissions: [],
  matterCommissionsTotalMxn: 0,
  group1TeamBreakdowns: [],
  highlightedCount: 0,
  group1GrossMxn: 0,
  group1NetMxn: 0,
  group1PayableMxn: 0,
  group2TotalMxn: 0,
  group3TotalMxn: 0,
  projectorPayableMxn: 0,
  projectorBonusMxn: 0,
  projectorCommissions: [],
  totalCommissionsMxn: 0,
  grossTotalMxn: 0,
  deductionRate: 0,
  deductionBaseMxn: 0,
  deductionMxn: 0,
  netTotalMxn: 0
};
const CLIENT_RELATIONS_COMMISSION_SECTION = "Comunicacion con cliente";
const SALES_COMMISSION_SECTION = "Ventas";
const SALES_COMMISSION_RATE = 0.01;
const COMMISSION_TOTALS_SECTION = "Totales de comisiones";
const LITIGATION_LEADER_COMMISSION_SECTION = "Litigio (lider)";
const LITIGATION_COLLABORATOR_COMMISSION_SECTION = "Litigio (colaborador)";
const PROJECTOR_COMMISSION_SECTIONS = [
  { role: "Proyectista 1", code: "EKPO", section: "Proyectista 1 (EKPO)" },
  { role: "Proyectista 2", code: "NBSG", section: "Proyectista 2 (NBSG)" }
] as const;
const RUSCONI_COMMISSION_SECTIONS = COMMISSION_SECTIONS.flatMap((section) =>
  normalizeText(section) === normalizeText("Litigio (colaborador)")
    ? [section, ...PROJECTOR_COMMISSION_SECTIONS.map((entry) => entry.section)]
    : [section]
);
const LEGALFLOW_COMMISSION_SECTIONS = [
  SALES_COMMISSION_SECTION,
  CLIENT_RELATIONS_COMMISSION_SECTION,
  "Direccion general"
];

const ONE_PERCENT_GROUP_SECTIONS = [
  CLIENT_RELATIONS_COMMISSION_SECTION,
  "Finanzas"
];

const COMMISSION_GROUP_TEAMS = [
  {
    teamKey: "LITIGATION" as const,
    teamLabel: "Litigio",
    expenseTeamLabel: "Litigio",
    distributionKey: "pctLitigation" as const
  },
  {
    teamKey: "CORPORATE_LABOR" as const,
    teamLabel: "Corporativo",
    expenseTeamLabel: "Corporativo y laboral",
    distributionKey: "pctCorporateLabor" as const
  },
  {
    teamKey: "SETTLEMENTS" as const,
    teamLabel: "Convenios",
    expenseTeamLabel: "Convenios",
    distributionKey: "pctSettlements" as const
  },
  {
    teamKey: "FINANCIAL_LAW" as const,
    teamLabel: "Derecho financiero",
    expenseTeamLabel: "Der Financiero",
    distributionKey: "pctFinancialLaw" as const
  },
  {
    teamKey: "TAX_COMPLIANCE" as const,
    teamLabel: "Compliance fiscal",
    expenseTeamLabel: "Compliance Fiscal",
    distributionKey: "pctTaxCompliance" as const
  }
];

interface CommissionTotalsRow {
  section: string;
  calculation: SectionCalculation;
}

interface CommissionReceiptDraft {
  amountMxn: number;
  document: GeneratedDocument;
  filenameBase: string;
  periodLabel: string;
  recipientName: string;
  section: string;
}

const MAX_SIGNED_RECEIPT_BYTES = 10 * 1024 * 1024;

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const separatorIndex = result.indexOf(",");
      resolve(separatorIndex >= 0 ? result.slice(separatorIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("No fue posible leer el recibo firmado."));
    reader.readAsDataURL(file);
  });
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeIdentityText(value?: string | null) {
  return normalizeText(value)
    .replace(/[@._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSuperadminAccess(user: ReturnType<typeof useAuth>["user"]) {
  return Boolean(
    user?.permissions?.includes("*") ||
    user?.role === "SUPERADMIN" ||
    user?.legacyRole === "SUPERADMIN"
  );
}

function isEduardoRusconiUser(user: ReturnType<typeof useAuth>["user"]) {
  const emailLocalPart = user?.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user?.email;

  return [user?.shortName, user?.username, user?.displayName, user?.email, emailLocalPart].some((value) => {
    const normalized = normalizeIdentityText(value);
    return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
  });
}

function isRusconiTenant(user: ReturnType<typeof useAuth>["user"]) {
  return Boolean(
    user?.organizationId === "org-rusconi"
    || normalizeText(user?.organizationSlug) === "rusconi-consulting"
    || normalizeText(user?.organizationName) === "rusconi consulting"
  );
}

function isFinanceTeamUser(user: ReturnType<typeof useAuth>["user"]) {
  return Boolean(
    user?.team === "FINANCE"
    || user?.secondaryTeam === "FINANCE"
    || [user?.legacyTeam, user?.secondaryLegacyTeam, user?.specificRole, user?.secondarySpecificRole]
      .some((value) => normalizeText(value) === "finanzas")
  );
}

function isAraceliLozanoUser(user: ReturnType<typeof useAuth>["user"]) {
  const identities = [user?.username, user?.displayName, user?.email].map(normalizeText);

  return isRusconiTenant(user) && isFinanceTeamUser(user) && identities.some((identity) =>
    identity === "araceli lozano"
    || identity === "araceli lozano escamilla"
    || identity.startsWith("araceli.lozano")
    || identity.startsWith("araceli lozano")
  );
}

function canManageCommissionExclusions(user: ReturnType<typeof useAuth>["user"]) {
  const canWriteCommissionExclusions = Boolean(user?.permissions?.includes("commissions:exclusions:write"));

  return canWriteCommissionExclusions || (hasSuperadminAccess(user) && isEduardoRusconiUser(user));
}

function canManageCommissionTotalsReceiverExclusions(user: ReturnType<typeof useAuth>["user"]) {
  return hasSuperadminAccess(user) && isEduardoRusconiUser(user);
}

function canManageProjectorCommissions(user: ReturnType<typeof useAuth>["user"]) {
  const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
  return !isLegalFlowTenant(user) && isSuperadmin && isEduardoRusconiUser(user);
}

function isLegalFlowTenant(user: ReturnType<typeof useAuth>["user"]) {
  return Boolean(
    user?.organizationId === "org-legalflow" ||
    normalizeText(user?.organizationSlug) === "legalflow" ||
    normalizeText(user?.organizationName) === "legalflow"
  );
}

function buildCommissionExclusionKey(input: {
  year: number;
  month: number;
  section: string;
  group: CommissionBreakdownEntry["group"];
  financeRecordId: string;
}) {
  return [
    input.year,
    input.month,
    normalizeText(input.section),
    input.group,
    input.financeRecordId
  ].join("::");
}

function buildCommissionTotalsReceiverExclusionKey(input: {
  year: number;
  month: number;
  section: string;
}) {
  return [
    input.year,
    input.month,
    normalizeText(input.section)
  ].join("::");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(value);
}

function usesOnePercentGroupBreakdown(section?: string | null) {
  return ONE_PERCENT_GROUP_SECTIONS.some((targetSection) => normalizeText(targetSection) === normalizeText(section));
}

function isSalesCommissionSection(section?: string | null) {
  return normalizeText(section) === normalizeText(SALES_COMMISSION_SECTION);
}

function getProjectorCommissionSectionForRole(role?: string | null) {
  return PROJECTOR_COMMISSION_SECTIONS.find(
    (entry) => normalizeText(entry.role) === normalizeText(role)
  )?.section;
}

function isProjectorCommissionSection(section?: string | null) {
  return PROJECTOR_COMMISSION_SECTIONS.some(
    (entry) => normalizeText(entry.section) === normalizeText(section)
  );
}

function isLitigationLeaderCommissionSection(section?: string | null) {
  return normalizeText(section) === normalizeText(LITIGATION_LEADER_COMMISSION_SECTION);
}

function isLitigationCollaboratorCommissionSection(section?: string | null) {
  return normalizeText(section) === normalizeText(LITIGATION_COLLABORATOR_COMMISSION_SECTION);
}

function isCommissionTotalsSection(section?: string | null) {
  return normalizeText(section) === normalizeText(COMMISSION_TOTALS_SECTION);
}

function getGroup1RateLabel(section?: string | null) {
  const normalizedSection = normalizeText(section);

  if (isSalesCommissionSection(section)) {
    return "1%";
  }

  if (usesOnePercentGroupBreakdown(section)) {
    return "1%";
  }

  if (normalizedSection === normalizeText("Der Financiero (lider)")) {
    return "10%";
  }

  if (normalizedSection.includes("colaborador")) {
    return "1%";
  }

  return "8%";
}

function sumIncludedCommissionRows(records: CommissionBreakdownEntry[]) {
  return records.reduce((sum, record) => sum + (record.excluded ? 0 : record.amountMxn), 0);
}

function withSalesCommissionBase(records: CommissionBreakdownEntry[]) {
  return records.map((record) => ({
    ...record,
    baseNetMxn: record.amountMxn / SALES_COMMISSION_RATE
  }));
}

function getSnapshotCommissionTotals(data: CommissionSnapshotData) {
  const group1TeamBreakdowns = data.group1TeamBreakdowns ?? [];
  const hasTeamBreakdowns = group1TeamBreakdowns.length > 0;
  const group1GrossMxn = data.group1GrossMxn ?? (
    hasTeamBreakdowns
      ? group1TeamBreakdowns.reduce((sum, team) => sum + team.grossMxn, 0)
      : sumIncludedCommissionRows(data.executionRecords)
  );
  const group2TotalMxn = data.group2TotalMxn ?? sumIncludedCommissionRows(data.clientRecords);
  const group3TotalMxn = data.group3TotalMxn ?? sumIncludedCommissionRows(data.closingRecords);
  const group1NetMxn = data.group1NetMxn ?? (
    hasTeamBreakdowns
      ? group1TeamBreakdowns.reduce((sum, team) => sum + team.payableMxn, 0)
      : group1GrossMxn - data.deductionMxn
  );
  const group1PayableMxn = data.group1PayableMxn ?? (
    hasTeamBreakdowns ? group1NetMxn : Math.max(group1NetMxn, 0)
  );
  const projectorPayableMxn = data.projectorPayableMxn ?? 0;
  const projectorBonusMxn = data.projectorBonusMxn ?? 0;
  const matterCommissionsTotalMxn = data.matterCommissionsTotalMxn ?? (
    data.matterCommissions ?? []
  ).reduce((sum, entry) => sum + (entry.excluded ? 0 : entry.amountMxn), 0);
  const totalCommissionsMxn = data.totalCommissionsMxn ?? data.netTotalMxn ?? (
    group1PayableMxn +
    group2TotalMxn +
    group3TotalMxn +
    matterCommissionsTotalMxn +
    projectorPayableMxn +
    projectorBonusMxn
  );

  return {
    group1GrossMxn,
    group1NetMxn,
    group1PayableMxn,
    group2TotalMxn,
    group3TotalMxn,
    projectorPayableMxn,
    projectorBonusMxn,
    matterCommissionsTotalMxn,
    totalCommissionsMxn,
    group1TeamBreakdowns
  };
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString();
}

function toDateKey(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function isPaymentReceived(method?: FinanceRecord["paymentMethod"] | null, received?: boolean | null) {
  return method === "T" || (method === "E" && received === true);
}

function hasPaymentDate(value?: string | null) {
  return Boolean(value);
}

function getReceivedPaymentsMxn(
  record: Pick<
    FinanceRecord,
    | "paidThisMonthMxn"
    | "payment2Mxn"
    | "payment3Mxn"
    | "paymentDate1"
    | "paymentDate2"
    | "paymentDate3"
    | "paymentMethod"
    | "paymentMethod2"
    | "paymentMethod3"
    | "paymentReceived"
    | "paymentReceived2"
    | "paymentReceived3"
  >
) {
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

function calculateFinanceStats(record: FinanceRecord): FinanceRecordStats {
  const totalPaidMxn = getReceivedPaymentsMxn(record);
  const totalExpensesMxn = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
  const netFeesMxn = totalPaidMxn - totalExpensesMxn;
  const remainingMxn = record.totalMatterMxn - record.previousPaymentsMxn;
  const dueTodayMxn = record.conceptFeesMxn - totalPaidMxn;
  const futurePaymentsMxn = Math.round(
    (record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn) * 100
  ) / 100;
  const totalNetDueMxn = record.totalMatterMxn - record.previousPaymentsMxn - totalPaidMxn;
  const feeBreakdownDifferenceMxn = Math.round(
    (record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn - futurePaymentsMxn) * 100
  ) / 100;
  const clientCommissionMxn = netFeesMxn * 0.2;
  const closingCommissionMxn = netFeesMxn * 0.1;
  const commissionableBaseMxn = netFeesMxn - clientCommissionMxn - closingCommissionMxn;
  const pctSum =
    record.pctLitigation +
    record.pctCorporateLabor +
    record.pctSettlements +
    record.pctFinancialLaw +
    record.pctTaxCompliance;

  const calculateExecutionCommission = (baseRate: number, percentage: number) =>
    percentage <= 0 ? 0 : commissionableBaseMxn * baseRate * (percentage / 100);

  const litigationLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctLitigation);
  const litigationCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctLitigation);
  const corporateLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctCorporateLabor);
  const corporateCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctCorporateLabor);
  const settlementsLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctSettlements);
  const settlementsCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctSettlements);
  const financialLeaderCommissionMxn = calculateExecutionCommission(0.1, record.pctFinancialLaw);
  const financialCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctFinancialLaw);
  const taxLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctTaxCompliance);
  const taxCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctTaxCompliance);
  const clientRelationsCommissionMxn = commissionableBaseMxn * 0.01;
  const financeCommissionMxn = commissionableBaseMxn * 0.01;
  const salesCommissionMxn = record.salesCommissionMxn;

  const netProfitMxn =
    netFeesMxn -
    (
      clientCommissionMxn +
      closingCommissionMxn +
      litigationLeaderCommissionMxn +
      litigationCollaboratorCommissionMxn +
      corporateLeaderCommissionMxn +
      corporateCollaboratorCommissionMxn +
      settlementsLeaderCommissionMxn +
      settlementsCollaboratorCommissionMxn +
      financialLeaderCommissionMxn +
      financialCollaboratorCommissionMxn +
      taxLeaderCommissionMxn +
      taxCollaboratorCommissionMxn +
      clientRelationsCommissionMxn +
      financeCommissionMxn +
      salesCommissionMxn
    );

  return {
    totalPaidMxn,
    totalExpensesMxn,
    netFeesMxn,
    remainingMxn,
    dueTodayMxn,
    futurePaymentsMxn,
    totalNetDueMxn,
    feeBreakdownDifferenceMxn,
    clientCommissionMxn,
    closingCommissionMxn,
    commissionableBaseMxn,
    pctSum,
    litigationLeaderCommissionMxn,
    litigationCollaboratorCommissionMxn,
    corporateLeaderCommissionMxn,
    corporateCollaboratorCommissionMxn,
    settlementsLeaderCommissionMxn,
    settlementsCollaboratorCommissionMxn,
    financialLeaderCommissionMxn,
    financialCollaboratorCommissionMxn,
    taxLeaderCommissionMxn,
    taxCollaboratorCommissionMxn,
    clientRelationsCommissionMxn,
    financeCommissionMxn,
    salesCommissionMxn,
    netProfitMxn
  };
}

function resolveEffectiveClientNumber(record: FinanceRecord, clients: Client[]) {
  if (record.clientNumber) {
    return record.clientNumber;
  }

  const match = clients.find((client) => normalizeText(client.name) === normalizeText(record.clientName));
  return match?.clientNumber;
}

function getExecutionAmount(record: FinanceRecord, stats: FinanceRecordStats, section: string) {
  const normalizedSection = normalizeText(section);

  switch (normalizedSection) {
    case normalizeText("Litigio (lider)"):
      return record.responsibleTeam === "LITIGATION" ? stats.litigationLeaderCommissionMxn : 0;
    case normalizeText("Litigio (colaborador)"):
      return record.responsibleTeam === "LITIGATION" ? stats.litigationCollaboratorCommissionMxn : 0;
    case normalizeText("Corporativo-laboral (lider)"):
      return record.responsibleTeam === "CORPORATE_LABOR" ? stats.corporateLeaderCommissionMxn : 0;
    case normalizeText("Corporativo-laboral (colaborador)"):
      return record.responsibleTeam === "CORPORATE_LABOR" ? stats.corporateCollaboratorCommissionMxn : 0;
    case normalizeText("Convenios (lider)"):
      return record.responsibleTeam === "SETTLEMENTS" ? stats.settlementsLeaderCommissionMxn : 0;
    case normalizeText("Convenios (colaborador)"):
      return record.responsibleTeam === "SETTLEMENTS" ? stats.settlementsCollaboratorCommissionMxn : 0;
    case normalizeText("Der Financiero (lider)"):
      return record.responsibleTeam === "FINANCIAL_LAW" ? stats.financialLeaderCommissionMxn : 0;
    case normalizeText("Der Financiero (colaborador)"):
      return record.responsibleTeam === "FINANCIAL_LAW" ? stats.financialCollaboratorCommissionMxn : 0;
    case normalizeText("Compliance Fiscal (lider)"):
      return record.responsibleTeam === "TAX_COMPLIANCE" ? stats.taxLeaderCommissionMxn : 0;
    case normalizeText("Compliance Fiscal (colaborador)"):
      return record.responsibleTeam === "TAX_COMPLIANCE" ? stats.taxCollaboratorCommissionMxn : 0;
    case normalizeText("Comunicacion con cliente"):
      return stats.clientRelationsCommissionMxn;
    case normalizeText(SALES_COMMISSION_SECTION):
      return stats.salesCommissionMxn;
    case normalizeText("Finanzas"):
      return stats.financeCommissionMxn;
    default:
      return 0;
  }
}

function getDeductionConfiguration(section: string) {
  const normalizedSection = normalizeText(section);

  switch (normalizedSection) {
    case normalizeText("Litigio (lider)"):
      return { rate: 0.08, teamLabel: "Litigio", distributionKey: "pctLitigation" as const, useAllExpenses: false };
    case normalizeText("Litigio (colaborador)"):
      return { rate: 0.01, teamLabel: "Litigio", distributionKey: "pctLitigation" as const, useAllExpenses: false };
    case normalizeText("Corporativo-laboral (lider)"):
      return { rate: 0.08, teamLabel: "Corporativo y laboral", distributionKey: "pctCorporateLabor" as const, useAllExpenses: false };
    case normalizeText("Corporativo-laboral (colaborador)"):
      return { rate: 0.01, teamLabel: "Corporativo y laboral", distributionKey: "pctCorporateLabor" as const, useAllExpenses: false };
    case normalizeText("Convenios (lider)"):
      return { rate: 0.08, teamLabel: "Convenios", distributionKey: "pctSettlements" as const, useAllExpenses: false };
    case normalizeText("Convenios (colaborador)"):
      return { rate: 0.01, teamLabel: "Convenios", distributionKey: "pctSettlements" as const, useAllExpenses: false };
    case normalizeText("Der Financiero (lider)"):
      return { rate: 0, teamLabel: "Der Financiero", distributionKey: "pctFinancialLaw" as const, useAllExpenses: false };
    case normalizeText("Der Financiero (colaborador)"):
      return { rate: 0.01, teamLabel: "Der Financiero", distributionKey: "pctFinancialLaw" as const, useAllExpenses: false };
    case normalizeText("Compliance Fiscal (lider)"):
      return { rate: 0.08, teamLabel: "Compliance Fiscal", distributionKey: "pctTaxCompliance" as const, useAllExpenses: false };
    case normalizeText("Compliance Fiscal (colaborador)"):
      return { rate: 0.01, teamLabel: "Compliance Fiscal", distributionKey: "pctTaxCompliance" as const, useAllExpenses: false };
    case normalizeText("Comunicacion con cliente"):
    case normalizeText("Finanzas"):
      return { rate: 0.01, teamLabel: "", distributionKey: undefined, useAllExpenses: true };
    default:
      return { rate: 0, teamLabel: "", distributionKey: undefined, useAllExpenses: false };
  }
}

function getExpenseDistributionSum(expense: GeneralExpense) {
  return (
    Number(expense.pctLitigation || 0) +
    Number(expense.pctCorporateLabor || 0) +
    Number(expense.pctSettlements || 0) +
    Number(expense.pctFinancialLaw || 0) +
    Number(expense.pctTaxCompliance || 0)
  );
}

function getExpenseDeductionBaseAmount(
  expense: GeneralExpense,
  deductionConfiguration: ReturnType<typeof getDeductionConfiguration>
) {
  const amount = Number(expense.amountMxn || 0);
  if (deductionConfiguration.useAllExpenses) {
    return amount;
  }

  if (expense.expenseWithoutTeam) {
    return 0;
  }

  if (expense.generalExpense) {
    return amount / 5;
  }

  if (deductionConfiguration.distributionKey && getExpenseDistributionSum(expense) > 0) {
    return amount * (Number(expense[deductionConfiguration.distributionKey] || 0) / 100);
  }

  const isGeneralExpense = normalizeText(expense.team) === normalizeText("General");
  if (isGeneralExpense) {
    return amount / 5;
  }

  if (normalizeText(expense.team) === normalizeText(deductionConfiguration.teamLabel)) {
    return amount;
  }

  return 0;
}

function buildOnePercentGroupTeamBreakdowns(
  executionRecords: CommissionBreakdownEntry[],
  generalExpenses: GeneralExpense[]
): CommissionGroup1TeamBreakdown[] {
  return COMMISSION_GROUP_TEAMS.map((team) => {
    const grossMxn = executionRecords
      .filter((record) => !record.excluded && record.teamKey === team.teamKey)
      .reduce((sum, record) => sum + record.amountMxn, 0);
    const deductionBaseMxn = generalExpenses.reduce((sum, expense) => {
      return sum + getExpenseDeductionBaseAmount(expense, {
        rate: 0.01,
        teamLabel: team.expenseTeamLabel,
        distributionKey: team.distributionKey,
        useAllExpenses: false
      });
    }, 0);
    const deductionMxn = deductionBaseMxn * 0.01;
    const netMxn = grossMxn - deductionMxn;

    return {
      teamKey: team.teamKey,
      teamLabel: team.teamLabel,
      grossMxn,
      deductionBaseMxn,
      deductionMxn,
      netMxn,
      payableMxn: Math.max(netMxn, 0)
    };
  });
}

function buildHighlightReason(record: FinanceRecord, stats: FinanceRecordStats, clients: Client[]) {
  const effectiveClientNumber = resolveEffectiveClientNumber(record, clients);
  const requiredFields = [
    { label: "numero_cliente", missing: !effectiveClientNumber },
    { label: "cliente", missing: normalizeText(record.clientName).length === 0 },
    { label: "numero_cotizacion", missing: normalizeText(record.quoteNumber).length === 0 },
    { label: "asunto", missing: normalizeText(record.subject).length === 0 },
    { label: "total_asunto", missing: record.totalMatterMxn <= 0 },
    { label: "honorarios_conceptos", missing: record.conceptFeesMxn <= 0 },
    { label: "conceptos_trabajando", missing: normalizeText(record.workingConcepts).length === 0 },
    { label: "fecha_pactada_pago", missing: normalizeText(record.nextPaymentDate).length === 0 },
    { label: "detalle_fecha_pactada", missing: normalizeText(record.nextPaymentNotes).length === 0 },
    { label: "equipo_responsable", missing: !record.responsibleTeam },
    { label: "comision_cliente_quien", missing: normalizeText(record.clientCommissionRecipient).length === 0 },
    { label: "comision_cierre_quien", missing: normalizeText(record.closingCommissionRecipient).length === 0 }
  ];

  const missing = requiredFields.filter((field) => field.missing).map((field) => field.label);
  const today = new Date();
  const todayKey = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
  const nextPaymentDateKey = toDateKey(record.nextPaymentDate);
  const isDateUrgent = Boolean(nextPaymentDateKey) && nextPaymentDateKey <= todayKey && stats.dueTodayMxn > 1;
  const isSumIncorrect = stats.pctSum !== 100;
  const isContractPending = record.contractSignedStatus === "NO";

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Faltan datos requeridos: ${missing.join(", ")}.`);
  }
  if (isContractPending) {
    parts.push("Contrato firmado en NO.");
  }
  if (isDateUrgent) {
    parts.push("ATENCION: tarea urgente por fecha pactada vencida o de hoy sin pago suficiente.");
  }
  if (isSumIncorrect) {
    parts.push(`ATENCION: la suma de porcentajes es ${stats.pctSum}%, debe ser 100%.`);
  }

  return parts.join(" ");
}

function calculateSection(
  financeRecords: FinanceRecord[],
  generalExpenses: GeneralExpense[],
  clients: Client[],
  section: string,
  year: number,
  month: number,
  exclusions: CommissionExclusion[],
  projectorCommissions: ProjectorCommission[],
  matterCommissions: CommissionMatterCommission[]
): SectionCalculation {
  if (!section) {
    return EMPTY_CALCULATION;
  }

  const periodProjectorCommissions = projectorCommissions.filter(
    (entry) => entry.year === year && entry.month === month
  );

  if (isProjectorCommissionSection(section)) {
    const sectionProjectorCommissions = periodProjectorCommissions.filter(
      (entry) => normalizeText(entry.section) === normalizeText(section)
    );
    const projectorPayableMxn = sectionProjectorCommissions.reduce(
      (sum, entry) => sum + (entry.authorized ? entry.amountMxn : 0),
      0
    );

    return {
      ...EMPTY_CALCULATION,
      projectorPayableMxn,
      projectorCommissions: sectionProjectorCommissions,
      totalCommissionsMxn: projectorPayableMxn,
      grossTotalMxn: projectorPayableMxn,
      netTotalMxn: projectorPayableMxn
    };
  }

  const exclusionKeys = new Set(
    exclusions
      .filter((exclusion) =>
        exclusion.year === year &&
        exclusion.month === month &&
        normalizeText(exclusion.section) === normalizeText(section)
      )
      .map((exclusion) => buildCommissionExclusionKey(exclusion))
  );
  const applyExclusions = (records: CommissionBreakdownEntry[]) =>
    records.map((record) => ({
      ...record,
      excluded: exclusionKeys.has(buildCommissionExclusionKey({
        year,
        month,
        section,
        group: record.group,
        financeRecordId: record.financeRecordId
      }))
    }));

  const computedRecords: ComputedFinanceRecord[] = financeRecords.map((record) => {
    const stats = calculateFinanceStats(record);
    const highlightReason = buildHighlightReason(record, stats, clients);

    return {
      ...record,
      ...stats,
      effectiveClientNumber: resolveEffectiveClientNumber(record, clients),
      highlighted: highlightReason.length > 0,
      highlightReason: highlightReason || undefined
    };
  });

  const executionRecords = applyExclusions(
    computedRecords
      .map<CommissionBreakdownEntry | null>((record) => {
        const amountMxn = getExecutionAmount(record, record, section);
        if (amountMxn <= 0) {
          return null;
        }

        const showOnePercentBase = usesOnePercentGroupBreakdown(section);
        const showSalesCommissionBase = isSalesCommissionSection(section);
        const teamConfig = COMMISSION_GROUP_TEAMS.find((team) => team.teamKey === record.responsibleTeam);
        if (showOnePercentBase && !teamConfig) {
          return null;
        }

        return {
          financeRecordId: record.id,
          clientName: record.clientName,
          clientNumber: record.effectiveClientNumber,
          quoteNumber: record.quoteNumber,
          subject: `${record.subject}${showOnePercentBase ? " (1% Base)" : ""}`,
          group: "EXECUTION",
          baseNetMxn: showSalesCommissionBase ? amountMxn / SALES_COMMISSION_RATE : record.netFeesMxn,
          amountMxn,
          teamKey: teamConfig?.teamKey,
          teamLabel: teamConfig?.teamLabel,
          highlighted: record.highlighted,
          highlightReason: record.highlightReason
        };
      })
      .filter((record): record is CommissionBreakdownEntry => record !== null)
  );

  const clientRecords = applyExclusions(
    computedRecords
      .filter((record) => normalizeText(record.clientCommissionRecipient) === normalizeText(section) && record.clientCommissionMxn > 0)
      .map<CommissionBreakdownEntry>((record) => ({
        financeRecordId: record.id,
        clientName: record.clientName,
        clientNumber: record.effectiveClientNumber,
        quoteNumber: record.quoteNumber,
        subject: record.subject,
        group: "CLIENT",
        baseNetMxn: record.netFeesMxn,
        amountMxn: record.clientCommissionMxn,
        highlighted: record.highlighted,
        highlightReason: record.highlightReason
      }))
  );

  const closingRecords = applyExclusions(
    computedRecords
      .filter((record) => normalizeText(record.closingCommissionRecipient) === normalizeText(section) && record.closingCommissionMxn > 0)
      .map<CommissionBreakdownEntry>((record) => ({
        financeRecordId: record.id,
        clientName: record.clientName,
        clientNumber: record.effectiveClientNumber,
        quoteNumber: record.quoteNumber,
        subject: record.subject,
        group: "CLOSING",
        baseNetMxn: record.netFeesMxn,
        amountMxn: record.closingCommissionMxn,
        highlighted: record.highlighted,
        highlightReason: record.highlightReason
      }))
  );

  const group2TotalMxn = sumIncludedCommissionRows(clientRecords);
  const group3TotalMxn = sumIncludedCommissionRows(closingRecords);
  const sectionMatterCommissions = isLitigationCollaboratorCommissionSection(section)
    ? matterCommissions
    : [];
  const matterCommissionsTotalMxn = sectionMatterCommissions.reduce(
    (sum, entry) => sum + (entry.excluded ? 0 : entry.amountMxn),
    0
  );

  const deductionConfiguration = getDeductionConfiguration(section);
  let group1TeamBreakdowns: CommissionGroup1TeamBreakdown[] = [];
  let group1GrossMxn = sumIncludedCommissionRows(executionRecords);
  let deductionBaseMxn = generalExpenses.reduce((sum, expense) => {
    return sum + getExpenseDeductionBaseAmount(expense, deductionConfiguration);
  }, 0);

  if (usesOnePercentGroupBreakdown(section)) {
    group1TeamBreakdowns = buildOnePercentGroupTeamBreakdowns(executionRecords, generalExpenses);
    group1GrossMxn = group1TeamBreakdowns.reduce((sum, team) => sum + team.grossMxn, 0);
    deductionBaseMxn = group1TeamBreakdowns.reduce((sum, team) => sum + team.deductionBaseMxn, 0);
  }

  const deductionMxn = usesOnePercentGroupBreakdown(section)
    ? group1TeamBreakdowns.reduce((sum, team) => sum + team.deductionMxn, 0)
    : deductionBaseMxn * deductionConfiguration.rate;
  const rawGroup1NetMxn = group1GrossMxn - deductionMxn;
  const group1NetMxn = usesOnePercentGroupBreakdown(section)
    ? group1TeamBreakdowns.reduce((sum, team) => sum + team.payableMxn, 0)
    : rawGroup1NetMxn;
  const group1PayableMxn = usesOnePercentGroupBreakdown(section)
    ? group1NetMxn
    : Math.max(group1NetMxn, 0);
  const mirroredProjectorCommissions = isLitigationLeaderCommissionSection(section)
    ? periodProjectorCommissions.filter((entry) => entry.authorized)
    : [];
  const projectorBonusMxn = mirroredProjectorCommissions.reduce((sum, entry) => sum + entry.amountMxn, 0);
  const grossTotalMxn = group1GrossMxn + group2TotalMxn + group3TotalMxn
    + matterCommissionsTotalMxn + projectorBonusMxn;
  const totalCommissionsMxn = group1PayableMxn + group2TotalMxn + group3TotalMxn
    + matterCommissionsTotalMxn + projectorBonusMxn;

  return {
    financeRecords: computedRecords,
    executionRecords,
    clientRecords,
    closingRecords,
    matterCommissions: sectionMatterCommissions,
    matterCommissionsTotalMxn,
    group1TeamBreakdowns,
    highlightedCount: computedRecords.filter((record) => record.highlighted).length,
    group1GrossMxn,
    group1NetMxn,
    group1PayableMxn,
    group2TotalMxn,
    group3TotalMxn,
    projectorPayableMxn: 0,
    projectorBonusMxn,
    projectorCommissions: mirroredProjectorCommissions,
    totalCommissionsMxn,
    grossTotalMxn,
    deductionRate: deductionConfiguration.rate,
    deductionBaseMxn,
    deductionMxn,
    netTotalMxn: totalCommissionsMxn
  };
}

function CurrencyMetricCard(props: {
  label: string;
  value: number;
  accentClass: string;
  helper?: string;
}) {
  return (
    <article className={`commissions-metric-card ${props.accentClass}`}>
      <span>{props.label}</span>
      <strong>{formatCurrency(props.value)}</strong>
      {props.helper ? <small>{props.helper}</small> : null}
    </article>
  );
}

function CountMetricCard(props: {
  label: string;
  value: number;
  accentClass: string;
  helper?: string;
}) {
  return (
    <article className={`commissions-metric-card ${props.accentClass}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.helper ? <small>{props.helper}</small> : null}
    </article>
  );
}

function CommissionTeamBreakdownCards(props: {
  teams: CommissionGroup1TeamBreakdown[];
}) {
  return (
    <div className="commissions-team-breakdown-grid">
      {props.teams.map((team) => (
        <CurrencyMetricCard
          key={`${team.teamKey}-gross`}
          label={`Brutas ${team.teamLabel} (1%)`}
          value={team.grossMxn}
          accentClass="is-primary"
        />
      ))}
      {props.teams.map((team) => (
        <CurrencyMetricCard
          key={`${team.teamKey}-deduction`}
          label={`Deduccion ${team.teamLabel}`}
          value={team.deductionMxn}
          accentClass="is-warning"
          helper={`Neto: ${formatCurrency(team.netMxn)} | aporta ${formatCurrency(team.payableMxn)}`}
        />
      ))}
    </div>
  );
}

function CommissionGroupTable(props: {
  title: string;
  toneClass: string;
  rows: CommissionBreakdownEntry[];
  showBaseNet?: boolean;
  baseNetLabel?: string;
  amountLabel?: string;
  showExclusionControls?: boolean;
  canManageExclusions?: boolean;
  savingExclusionKeys?: Set<string>;
  year?: number;
  month?: number;
  section?: string;
  onToggleExclusion?: (row: CommissionBreakdownEntry, excluded: boolean) => void;
}) {
  const total = props.rows.reduce((sum, row) => sum + (row.excluded ? 0 : row.amountMxn), 0);
  const totalColumns = (props.showBaseNet ? 4 : 3) + (props.showExclusionControls ? 1 : 0);
  const totalLabelColumns = props.showBaseNet ? 3 : 2;
  const baseNetLabel = props.baseNetLabel ?? "Base Neta";
  const amountLabel = props.amountLabel ?? (props.showBaseNet ? "Comision" : "Monto");

  return (
    <section className="panel commissions-group-panel">
      <div className="panel-header">
        <h2>{props.title}</h2>
        <span>{props.rows.length} registros</span>
      </div>
      <div className="table-scroll">
        <table className={`data-table commissions-group-table ${props.toneClass}`}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Asunto</th>
              {props.showBaseNet ? <th>{baseNetLabel}</th> : null}
              <th>{amountLabel}</th>
              {props.showExclusionControls ? <th className="commissions-exclusion-heading">Excluir gasto</th> : null}
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={totalColumns}>Sin comisiones en este rubro.</td>
              </tr>
            ) : (
              props.rows.map((row) => {
                const exclusionKey =
                  props.year && props.month && props.section
                    ? buildCommissionExclusionKey({
                        year: props.year,
                        month: props.month,
                        section: props.section,
                        group: row.group,
                        financeRecordId: row.financeRecordId
                      })
                    : `${row.group}-${row.financeRecordId}`;
                const savingExclusion = props.savingExclusionKeys?.has(exclusionKey) ?? false;
                const rowClassName = [
                  row.highlighted ? "commissions-row-alert" : "",
                  row.excluded ? "commissions-row-excluded" : ""
                ].filter(Boolean).join(" ") || undefined;
                const rowTitle = [
                  row.highlightReason,
                  row.excluded ? "Excluido del calculo de esta seccion." : ""
                ].filter(Boolean).join(" ");

                return (
                  <tr
                    key={`${row.group}-${row.financeRecordId}`}
                    className={rowClassName}
                    style={row.highlighted ? { backgroundColor: "#fee2e2" } : undefined}
                    title={rowTitle || undefined}
                  >
                    <td>{row.clientName || "-"}</td>
                    <td>{row.subject || "-"}</td>
                    {props.showBaseNet ? (
                      <td>
                        <span className={row.excluded ? "commissions-amount-excluded" : undefined}>
                          {formatCurrency(row.baseNetMxn)}
                        </span>
                      </td>
                    ) : null}
                    <td className="commissions-amount-cell">
                      <span className={row.excluded ? "commissions-amount-excluded" : undefined}>
                        {formatCurrency(row.amountMxn)}
                      </span>
                    </td>
                    {props.showExclusionControls ? (
                      <td className="commissions-exclusion-cell">
                        <label
                          className="commissions-exclusion-toggle"
                          title={
                            props.canManageExclusions
                              ? "Excluir del calculo de esta seccion"
                              : "Solo Eduardo Rusconi o Finanzas puede cambiar esta exclusion"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(row.excluded)}
                            disabled={!props.canManageExclusions || savingExclusion}
                            aria-label={`Excluir ${row.clientName || "registro"} del calculo de esta seccion`}
                            onChange={(event) => props.onToggleExclusion?.(row, event.target.checked)}
                          />
                        </label>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={totalLabelColumns}>Total rubro</td>
              <td>{formatCurrency(total)}</td>
              {props.showExclusionControls ? <td className="commissions-exclusion-cell" aria-label="Excluir gasto" /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function CommissionMatterTable(props: {
  rows: CommissionMatterCommission[];
  canManageExclusions?: boolean;
  savingMatterIds?: Set<string>;
  onToggleExclusion?: (entry: CommissionMatterCommission, excluded: boolean) => void;
}) {
  const totalMxn = props.rows.reduce((sum, entry) => sum + (entry.excluded ? 0 : entry.amountMxn), 0);

  return (
    <section className="panel commissions-matter-panel">
      <div className="panel-header">
        <h2>COMISIONES POR ASUNTO: Litigio (colaborador)</h2>
        <span>{props.rows.length} asuntos vigentes</span>
      </div>
      <p className="muted commissions-caption">
        Cada asunto vigente genera $100 mensuales. Las exclusiones que marque EMRT aplican desde el mes seleccionado
        y permanecen en los meses siguientes hasta que se reviertan.
      </p>
      <div className="table-scroll">
        <table className="data-table commissions-matter-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>No. asunto</th>
              <th>Asunto</th>
              <th>Registrado en Litigio</th>
              <th>Monto</th>
              <th className="commissions-exclusion-heading">Excluir comision</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={6}>No hay asuntos de Litigio vigentes para este mes.</td>
              </tr>
            ) : props.rows.map((entry) => {
              const saving = props.savingMatterIds?.has(entry.matterId) ?? false;
              return (
                <tr className={entry.excluded ? "commissions-row-excluded" : undefined} key={entry.matterId}>
                  <td>
                    <strong>{entry.clientName || "-"}</strong>
                    {entry.clientNumber ? <small>{entry.clientNumber}</small> : null}
                  </td>
                  <td>{entry.matterNumber || "-"}</td>
                  <td>{entry.subject || "-"}</td>
                  <td>{formatDate(entry.registeredAt)}</td>
                  <td className="commissions-amount-cell">
                    <span className={entry.excluded ? "commissions-amount-excluded" : undefined}>
                      {formatCurrency(entry.amountMxn)}
                    </span>
                  </td>
                  <td className="commissions-exclusion-cell">
                    <label
                      className="commissions-exclusion-toggle"
                      title={
                        props.canManageExclusions
                          ? "Excluir esta comision desde el mes seleccionado"
                          : "Solo EMRT puede cambiar esta exclusion"
                      }
                    >
                      <input
                        aria-label={`Excluir comision del asunto ${entry.matterNumber || entry.subject}`}
                        checked={entry.excluded}
                        disabled={!props.canManageExclusions || saving}
                        onChange={(event) => props.onToggleExclusion?.(entry, event.target.checked)}
                        type="checkbox"
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total comisiones por asunto</td>
              <td>{formatCurrency(totalMxn)}</td>
              <td className="commissions-exclusion-cell" aria-label="Excluir comision" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ProjectorCommissionTable(props: {
  title: string;
  rows: ProjectorCommission[];
  mode: "projector" | "leader-mirror";
  canManage?: boolean;
  savingIds?: Set<string>;
  amountDrafts?: Record<string, string>;
  onAmountDraftChange?: (entryId: string, value: string) => void;
  onCommitAmount?: (entry: ProjectorCommission) => void;
  onToggleAuthorization?: (entry: ProjectorCommission, authorized: boolean) => void;
}) {
  const isProjectorView = props.mode === "projector";
  const totalAuthorizedMxn = props.rows.reduce(
    (sum, entry) => sum + (entry.authorized ? entry.amountMxn : 0),
    0
  );
  const totalColumns = 5;
  const totalLabelColumns = isProjectorView ? 3 : 4;

  return (
    <section className="panel commissions-group-panel">
      <div className="panel-header">
        <h2>{props.title}</h2>
        <span>{props.rows.length} registros</span>
      </div>
      <div className="table-scroll">
        <table className="data-table commissions-group-table commissions-projector-table tone-primary">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Asunto</th>
              {!isProjectorView ? <th>Proyectista</th> : null}
              <th>Fecha terminada</th>
              <th>Monto (MXN)</th>
              {isProjectorView ? <th className="commissions-projector-authorization-heading">Autorizar pago</th> : null}
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={totalColumns}>No hay escritos terminados en este periodo.</td>
              </tr>
            ) : (
              props.rows.map((entry) => {
                const saving = props.savingIds?.has(entry.id) ?? false;
                const amountDraft = props.amountDrafts?.[entry.id] ?? entry.amountMxn.toFixed(2);

                return (
                  <tr
                    key={entry.id}
                    className={!entry.authorized ? "commissions-row-pending-authorization" : undefined}
                    title={!entry.authorized ? "Pendiente de autorización; no forma parte del total." : "Comisión autorizada."}
                  >
                    <td>{entry.clientName || "-"}</td>
                    <td>{entry.subject || "-"}</td>
                    {!isProjectorView ? (
                      <td>{entry.projectorName} ({entry.responsibleCode})</td>
                    ) : null}
                    <td>{formatDate(entry.completedAt)}</td>
                    <td className="commissions-projector-amount-cell">
                      {isProjectorView && props.canManage ? (
                        <div className="commissions-projector-amount-control">
                          <span className="commissions-projector-currency-symbol" aria-hidden="true">$</span>
                          <input
                            className="commissions-projector-amount-input"
                            type="number"
                            min="0"
                            step="50"
                            value={amountDraft}
                            disabled={saving}
                            aria-label={`Monto en pesos mexicanos de la comisión para ${entry.subject || entry.clientName}`}
                            onChange={(event) => props.onAmountDraftChange?.(entry.id, event.target.value)}
                            onBlur={() => props.onCommitAmount?.(entry)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                          />
                          <span className="commissions-projector-currency-code">MXN</span>
                        </div>
                      ) : (
                        <span>{formatCurrency(entry.amountMxn)}</span>
                      )}
                    </td>
                    {isProjectorView ? (
                      <td className="commissions-projector-authorization-cell">
                        <label
                          className="commissions-projector-authorization-toggle"
                          title={props.canManage ? "Autorizar el pago de esta comisión" : "Solo Eduardo Rusconi puede autorizar este pago"}
                        >
                          <input
                            type="checkbox"
                            checked={entry.authorized}
                            disabled={!props.canManage || saving}
                            aria-label={`Autorizar comisión de ${entry.projectorName} por ${entry.subject || entry.clientName}`}
                            onChange={(event) => props.onToggleAuthorization?.(entry, event.target.checked)}
                          />
                        </label>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={totalLabelColumns}>Total autorizado</td>
              <td>{formatCurrency(totalAuthorizedMxn)}</td>
              {isProjectorView ? <td className="commissions-projector-authorization-cell" aria-label="Autorizar pago" /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function CommissionTotalsTable(props: {
  rows: CommissionTotalsRow[];
  year: number;
  month: number;
  excludedReceiverKeys: Set<string>;
  acknowledgementsBySection: Map<string, CommissionPaymentAcknowledgement>;
  recipientAssignmentsBySection: Map<string, CommissionRecipientAssignment>;
  releaseEligibilityByUserId: Map<string, CommissionReleaseEligibility>;
  periodLocked: boolean;
  canManageReceiverExclusions: boolean;
  canMarkPaidByTransfer: boolean;
  canGenerateReceipts: boolean;
  canManageSignedReceipts: boolean;
  canConfirmAsAraceli: boolean;
  canConfirmAsEmrt: boolean;
  savingSections: Set<string>;
  uploadingSignedReceiptSections: Set<string>;
  onToggleReceiverExclusion: (section: string, excluded: boolean) => void;
  onTogglePaidByTransfer: (section: string, paid: boolean) => void;
  onToggleReceivedByAraceli: (section: string, received: boolean) => void;
  onToggleReceivedByEmrt: (section: string, received: boolean) => void;
  onGenerateReceipt: (row: CommissionTotalsRow, recipientName: string) => void;
  onUploadSignedReceipt: (section: string, file: File) => void;
  onOpenSignedReceipt: (acknowledgement: CommissionPaymentAcknowledgement) => void;
}) {
  const isReceiverExcluded = (section: string) => props.excludedReceiverKeys.has(
    buildCommissionTotalsReceiverExclusionKey({
      year: props.year,
      month: props.month,
      section
    })
  );
  const totalCommissionsMxn = props.rows.reduce(
    (sum, row) => sum + (isReceiverExcluded(row.section) ? 0 : row.calculation.totalCommissionsMxn),
    0
  );
  const pendingCommissionsMxn = props.rows.reduce((sum, row) => {
    if (isReceiverExcluded(row.section)) {
      return sum;
    }

    const acknowledgement = props.acknowledgementsBySection.get(normalizeText(row.section));
    return acknowledgement?.paidByTransfer || acknowledgement?.receivedByEmrt
      ? sum
      : sum + row.calculation.totalCommissionsMxn;
  }, 0);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Comisiones a pagar por receptor</h2>
        <span>{props.rows.length} secciones</span>
      </div>
      <div className="table-scroll">
        <table className="data-table commissions-totals-table">
          <thead>
            <tr>
              <th>Receptor</th>
              <th>Comision a pagar</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => {
              const excluded = isReceiverExcluded(row.section);
              const acknowledgement = props.acknowledgementsBySection.get(normalizeText(row.section));
              const recipientAssignment = props.recipientAssignmentsBySection.get(normalizeText(row.section));
              const recipientName = recipientAssignment?.recipientName;
              const releaseEligibility = recipientAssignment?.userId
                ? props.releaseEligibilityByUserId.get(recipientAssignment.userId)
                : undefined;
              const paymentBlocked = Boolean(releaseEligibility?.blocked);
              const amountMxn = row.calculation.totalCommissionsMxn;
              const eligible = !excluded && amountMxn > 0;
              const saving = props.savingSections.has(normalizeText(row.section));
              const uploadingSignedReceipt = props.uploadingSignedReceiptSections.has(normalizeText(row.section));
              const paidByTransfer = Boolean(acknowledgement?.paidByTransfer);
              const araceliLocked = paidByTransfer || Boolean(acknowledgement?.receivedByEmrt);
              const hasSignedReceipt = Boolean(
                acknowledgement?.signedReceiptUploadedAt && acknowledgement.signedReceiptFileName
              );
              const missingSignedReceipt = Boolean(acknowledgement?.receivedByEmrt && !hasSignedReceipt);
              const rowClassName = [
                excluded ? "commissions-row-excluded" : "",
                missingSignedReceipt ? "commissions-row-missing-signed-receipt" : ""
              ].filter(Boolean).join(" ") || undefined;

              return (
                <tr className={rowClassName} key={row.section}>
                  <td>
                    <div className="commissions-total-receiver-cell">
                      {props.canManageReceiverExclusions ? (
                        <label
                          className="commissions-total-exclusion-toggle"
                          title={excluded ? "Incluir receptor en el Total general" : "Excluir receptor del Total general"}
                        >
                          <input
                            aria-label={`${excluded ? "Incluir" : "Excluir"} ${row.section} del Total general`}
                            checked={excluded}
                            disabled={props.periodLocked || saving}
                            onChange={(event) => props.onToggleReceiverExclusion(row.section, event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                      ) : null}
                      <span className={`commissions-total-receiver-identity${excluded ? " commissions-amount-excluded" : ""}`}>
                        <strong>{recipientName ?? row.section}</strong>
                        {recipientName && normalizeText(recipientName) !== normalizeText(row.section) ? (
                          <small>{row.section}</small>
                        ) : null}
                        {!recipientName ? <small>Titular activo no asignado</small> : null}
                      </span>
                    </div>
                  </td>
                  <td className="commissions-total-strong">
                    <div className="commissions-payment-flow">
                      <span className={excluded ? "commissions-amount-excluded" : undefined}>
                        {formatCurrency(amountMxn)}
                      </span>
                      <div className="commissions-payment-flow-controls">
                        <label className={!eligible || paymentBlocked || !props.canMarkPaidByTransfer || props.periodLocked ? "is-disabled" : undefined}>
                          <input
                            type="checkbox"
                            checked={paidByTransfer}
                            disabled={
                              !acknowledgement
                              || !eligible
                              || (paymentBlocked && !paidByTransfer)
                              || !props.canMarkPaidByTransfer
                              || props.periodLocked
                              || saving
                            }
                            onChange={(event) => props.onTogglePaidByTransfer(row.section, event.target.checked)}
                          />
                          <span>Pagado mediante transferencia</span>
                        </label>
                        <label className={!eligible || !props.canConfirmAsAraceli || araceliLocked ? "is-disabled" : undefined}>
                          <input
                            type="checkbox"
                            checked={Boolean(acknowledgement?.receivedByAraceli)}
                            disabled={
                              !acknowledgement
                              || !eligible
                              || !props.canConfirmAsAraceli
                              || araceliLocked
                              || saving
                            }
                            onChange={(event) => props.onToggleReceivedByAraceli(row.section, event.target.checked)}
                          />
                          <span>Recibido por Araceli Lozano</span>
                        </label>
                        <label className={!eligible || paymentBlocked || !props.canConfirmAsEmrt || !acknowledgement?.receivedByAraceli ? "is-disabled" : undefined}>
                          <input
                            type="checkbox"
                            checked={Boolean(acknowledgement?.receivedByEmrt)}
                            disabled={
                              !acknowledgement
                              || !eligible
                              || (paymentBlocked && !acknowledgement.receivedByEmrt)
                              || !props.canConfirmAsEmrt
                              || !acknowledgement.receivedByAraceli
                              || paidByTransfer
                              || saving
                            }
                            onChange={(event) => props.onToggleReceivedByEmrt(row.section, event.target.checked)}
                          />
                          <span>Pagado por EMRT</span>
                        </label>
                      </div>
                      {releaseEligibility?.blocked ? (
                        <section className="commissions-kpi-payment-block" role="alert">
                          <strong>Pago retenido</strong>
                          <span>
                            Estas comisiones no pueden pagarse hasta reparar los pendientes aplicables a este mes.
                          </span>
                          <ul>
                            {releaseEligibility.requirements.map((requirement) => (
                              <li key={requirement.metricId}>
                                <strong>{requirement.metricLabel}</strong>
                                <span>
                                  {requirement.pendingAmount} {requirement.unit}
                                  {requirement.oldestOriginDate ? `; pendiente desde ${requirement.oldestOriginDate}` : ""}
                                </span>
                                <div className="commissions-kpi-payment-requirements">
                                  {requirement.requirements.map((item) => (
                                    <small key={item.obligationId}>
                                      {item.summary} ({item.originDate})
                                    </small>
                                  ))}
                                </div>
                              </li>
                            ))}
                          </ul>
                          {releaseEligibility.auditAlert ? (
                            <span className="commissions-kpi-payment-audit">
                              Alerta de auditoria: el pago ya estaba registrado cuando se detecto este incumplimiento retroactivo. No se revirtio.
                            </span>
                          ) : null}
                        </section>
                      ) : null}
                      <button
                        className="secondary-button commissions-generate-receipt-button"
                        disabled={!eligible || !props.canGenerateReceipts || !recipientName}
                        onClick={() => recipientName && props.onGenerateReceipt(row, recipientName)}
                        title={!recipientName ? "Asigna un titular activo a este cargo para generar el recibo" : undefined}
                        type="button"
                      >
                        Generar recibo
                      </button>
                      <div className="commissions-signed-receipt-controls">
                        <label
                          className={`secondary-button commissions-signed-receipt-upload${
                            !eligible || !props.canManageSignedReceipts || uploadingSignedReceipt ? " is-disabled" : ""
                          }`}
                        >
                          <input
                            accept=".pdf,application/pdf"
                            aria-label={`${hasSignedReceipt ? "Reemplazar" : "Cargar"} recibo firmado de ${recipientName ?? row.section}`}
                            disabled={!acknowledgement || !eligible || !props.canManageSignedReceipts || uploadingSignedReceipt}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = "";
                              if (file) {
                                props.onUploadSignedReceipt(row.section, file);
                              }
                            }}
                            type="file"
                          />
                          <span>
                            {uploadingSignedReceipt
                              ? "Cargando PDF..."
                              : hasSignedReceipt
                                ? "Reemplazar recibo firmado"
                                : "Cargar recibo firmado"}
                          </span>
                        </label>
                        {hasSignedReceipt && acknowledgement ? (
                          <button
                            className="secondary-button commissions-signed-receipt-open"
                            onClick={() => props.onOpenSignedReceipt(acknowledgement)}
                            type="button"
                          >
                            Ver recibo firmado
                          </button>
                        ) : null}
                      </div>
                      {hasSignedReceipt && acknowledgement ? (
                        <div className="commissions-signed-receipt-meta">
                          <span>{acknowledgement.signedReceiptFileName}</span>
                          {acknowledgement.signedReceiptSizeBytes ? (
                            <span>{formatFileSize(acknowledgement.signedReceiptSizeBytes)}</span>
                          ) : null}
                          {acknowledgement.signedReceiptUploadedAt ? (
                            <span>Cargado: {formatDateTime(acknowledgement.signedReceiptUploadedAt)}</span>
                          ) : null}
                        </div>
                      ) : null}
                      {missingSignedReceipt ? (
                        <div className="commissions-signed-receipt-alert" role="alert">
                          Falta cargar el recibo firmado en PDF.
                        </div>
                      ) : null}
                      {acknowledgement ? (
                        <div className="commissions-payment-flow-meta">
                          {acknowledgement.receivedByAraceliAt ? (
                            <span>Araceli: {formatDateTime(acknowledgement.receivedByAraceliAt)}</span>
                          ) : null}
                          {acknowledgement.receivedByEmrtAt ? (
                            <span>Pagado por EMRT: {formatDateTime(acknowledgement.receivedByEmrtAt)}</span>
                          ) : null}
                          {acknowledgement.reopenedAt ? (
                            <span>
                              Reabierto: {formatDateTime(acknowledgement.reopenedAt)}
                              {acknowledgement.reopenedByName ? ` por ${acknowledgement.reopenedByName}` : ""}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {!eligible ? (
                        <small>{excluded ? "Receptor excluido del pago" : "Sin monto por confirmar"}</small>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total general</td>
              <td>{formatCurrency(totalCommissionsMxn)}</td>
            </tr>
            <tr>
              <td>Total pendiente de pago</td>
              <td>{formatCurrency(pendingCommissionsMxn)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function CommissionReceiptModal(props: {
  draft: CommissionReceiptDraft;
  onClose: () => void;
}) {
  const [busyAction, setBusyAction] = useState<"word" | "pdf" | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        props.onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  async function downloadWord() {
    setBusyAction("word");
    setStatus("Generando Word...");
    try {
      await downloadWordDocument(props.draft.document, props.draft.filenameBase);
      setStatus("Word descargado.");
    } catch {
      setStatus("No se pudo generar el archivo Word.");
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadPdf() {
    setBusyAction("pdf");
    setStatus("Generando PDF...");
    try {
      await downloadPdfDocument(props.draft.document, props.draft.filenameBase);
      setStatus("PDF descargado.");
    } catch {
      setStatus("No se pudo generar el archivo PDF.");
    } finally {
      setBusyAction(null);
    }
  }

  function printReceipt() {
    const popup = window.open("", "_blank");
    if (!popup) {
      setStatus("No se pudo abrir la vista de impresion.");
      return;
    }

    popup.document.write(generatedDocumentToHtml(props.draft.document));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="commissions-modal-backdrop" onClick={props.onClose}>
      <div
        aria-labelledby="commission-receipt-modal-title"
        aria-modal="true"
        className="commissions-modal commissions-receipt-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="commissions-modal-header">
          <div>
            <h2 id="commission-receipt-modal-title">Recibo de comisiones</h2>
            <p className="muted">
              {props.draft.recipientName} | {props.draft.section} | {props.draft.periodLabel} | {formatCurrency(props.draft.amountMxn)}
            </p>
          </div>
          <div className="commissions-receipt-actions">
            <button className="secondary-button" disabled={busyAction !== null} onClick={() => void downloadWord()} type="button">
              {busyAction === "word" ? "Generando..." : "Word"}
            </button>
            <button className="secondary-button" disabled={busyAction !== null} onClick={() => void downloadPdf()} type="button">
              {busyAction === "pdf" ? "Generando..." : "PDF"}
            </button>
            <button className="secondary-button" disabled={busyAction !== null} onClick={printReceipt} type="button">
              Imprimir
            </button>
            <button className="secondary-button" onClick={props.onClose} type="button">
              Cerrar
            </button>
          </div>
        </div>
        <div className="commissions-modal-body commissions-receipt-modal-body">
          {status ? <p className="muted commissions-receipt-status">{status}</p> : null}
          <div className="daily-doc-preview-viewport commissions-receipt-preview">
            <DocumentPreview document={props.draft.document} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapshotDetailModal(props: {
  snapshot: CommissionSnapshot;
  onClose: () => void;
}) {
  const data = props.snapshot.snapshotData as CommissionSnapshotData | undefined;
  const totals = data ? getSnapshotCommissionTotals(data) : null;
  const snapshotGroup1RateLabel = getGroup1RateLabel(props.snapshot.section);
  const snapshotUsesTeamBreakdown = Boolean(totals?.group1TeamBreakdowns.length);
  const snapshotIsSalesSection = isSalesCommissionSection(props.snapshot.section);
  const snapshotIsProjectorSection = isProjectorCommissionSection(props.snapshot.section);
  const snapshotIsLitigationLeaderSection = isLitigationLeaderCommissionSection(props.snapshot.section);
  const snapshotIsLitigationCollaboratorSection = isLitigationCollaboratorCommissionSection(props.snapshot.section);
  const snapshotProjectorCommissions = data?.projectorCommissions ?? [];
  const snapshotProjectorPendingMxn = snapshotProjectorCommissions.reduce(
    (sum, entry) => sum + (entry.authorized ? 0 : entry.amountMxn),
    0
  );
  const snapshotExecutionRecords = snapshotIsSalesSection
    ? withSalesCommissionBase(data?.executionRecords ?? [])
    : data?.executionRecords ?? [];

  return (
    <div className="commissions-modal-backdrop" onClick={props.onClose}>
      <div className="commissions-modal" onClick={(event) => event.stopPropagation()}>
        <div className="commissions-modal-header">
          <div>
            <h2>{props.snapshot.title}</h2>
            <p className="muted">
              {props.snapshot.section} | {MONTH_NAMES[props.snapshot.month - 1]} {props.snapshot.year}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={props.onClose}>
            Cerrar
          </button>
        </div>

        {!data ? (
          <div className="commissions-modal-body">
            <p className="muted">No hay detalle disponible para esta estampa.</p>
          </div>
        ) : (
          <div className="commissions-modal-body">
            <div className="commissions-metrics-grid">
              {snapshotIsProjectorSection ? (
                <>
                  <CurrencyMetricCard
                    label="Comisiones pendientes de autorizar"
                    value={snapshotProjectorPendingMxn}
                    accentClass="is-warning"
                  />
                  <CurrencyMetricCard
                    label="Comisiones autorizadas"
                    value={totals?.projectorPayableMxn ?? 0}
                    accentClass="is-primary"
                  />
                  <CurrencyMetricCard
                    label="Comisiones totales"
                    value={totals?.totalCommissionsMxn ?? 0}
                    accentClass="is-success"
                  />
                </>
              ) : (
                <>
                  {snapshotUsesTeamBreakdown ? (
                    <CommissionTeamBreakdownCards teams={totals?.group1TeamBreakdowns ?? []} />
                  ) : (
                    <>
                      <CurrencyMetricCard
                        label={`Comisiones brutas Grupo 1 (${snapshotGroup1RateLabel})`}
                        value={totals?.group1GrossMxn ?? 0}
                        accentClass="is-primary"
                      />
                      <CurrencyMetricCard
                        label="Deducción por gastos"
                        value={data.deductionMxn}
                        accentClass="is-warning"
                        helper={`${Math.round(data.deductionRate * 100)}% de ${formatCurrency(data.deductionBaseMxn)}`}
                      />
                    </>
                  )}
                  <CurrencyMetricCard
                    label={`Comisiones netas Grupo 1 (${snapshotGroup1RateLabel})`}
                    value={totals?.group1NetMxn ?? 0}
                    accentClass="is-success"
                  />
                  <CurrencyMetricCard
                    label="Comisiones Grupo 2 (20%)"
                    value={totals?.group2TotalMxn ?? 0}
                    accentClass="is-neutral"
                  />
                  <CurrencyMetricCard
                    label="Comisiones Grupo 3 (10%)"
                    value={totals?.group3TotalMxn ?? 0}
                    accentClass="is-neutral"
                  />
                  {snapshotIsLitigationCollaboratorSection ? (
                    <CurrencyMetricCard
                      label="Comisiones por asunto"
                      value={totals?.matterCommissionsTotalMxn ?? 0}
                      accentClass="is-primary"
                    />
                  ) : null}
                  {snapshotIsLitigationLeaderSection ? (
                    <CurrencyMetricCard
                      label="Comisiones espejo de proyectistas"
                      value={totals?.projectorBonusMxn ?? 0}
                      accentClass="is-primary"
                    />
                  ) : null}
                  <CurrencyMetricCard
                    label="Comisiones totales"
                    value={totals?.totalCommissionsMxn ?? 0}
                    accentClass="is-success"
                  />
                </>
              )}
            </div>

            {snapshotIsProjectorSection ? (
              <ProjectorCommissionTable
                title={`Comisiones por escritos de fondo - ${props.snapshot.section}`}
                rows={snapshotProjectorCommissions}
                mode="projector"
              />
            ) : (
              <>
                <CommissionGroupTable
                  title="1. Comision por ejecucion"
                  toneClass="tone-primary"
                  rows={snapshotExecutionRecords}
                  showBaseNet
                  baseNetLabel={snapshotIsSalesSection ? "Primer pago recibido" : undefined}
                  amountLabel={snapshotIsSalesSection ? "1%" : undefined}
                />
                <CommissionGroupTable title="2. Comision por cliente" toneClass="tone-secondary" rows={data.clientRecords} showBaseNet />
                <CommissionGroupTable title="3. Comision por cierre" toneClass="tone-tertiary" rows={data.closingRecords} showBaseNet />
                {snapshotIsLitigationCollaboratorSection ? (
                  <CommissionMatterTable rows={data.matterCommissions ?? []} />
                ) : null}
                {snapshotIsLitigationLeaderSection ? (
                  <ProjectorCommissionTable
                    title="COMISIONES ESPEJO: Escritos de fondo autorizados"
                    rows={snapshotProjectorCommissions}
                    mode="leader-mirror"
                  />
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommissionsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("calculation");
  const [activeSection, setActiveSection] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [generalExpenses, setGeneralExpenses] = useState<GeneralExpense[]>([]);
  const [receivers, setReceivers] = useState<CommissionReceiver[]>([]);
  const [recipientAssignments, setRecipientAssignments] = useState<CommissionRecipientAssignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [snapshots, setSnapshots] = useState<CommissionSnapshot[]>([]);
  const [exclusions, setExclusions] = useState<CommissionExclusion[]>([]);
  const [matterCommissions, setMatterCommissions] = useState<CommissionMatterCommission[]>([]);
  const [projectorCommissions, setProjectorCommissions] = useState<ProjectorCommission[]>([]);
  const [paymentAcknowledgements, setPaymentAcknowledgements] = useState<CommissionPaymentAcknowledgement[]>([]);
  const [commissionReleaseEligibilities, setCommissionReleaseEligibilities] = useState<CommissionReleaseEligibility[]>([]);
  const [periodLocked, setPeriodLocked] = useState(false);
  const [confirmedByEmrtCount, setConfirmedByEmrtCount] = useState(0);
  const [savingExclusionKeys, setSavingExclusionKeys] = useState<Set<string>>(new Set());
  const [savingMatterExclusionIds, setSavingMatterExclusionIds] = useState<Set<string>>(new Set());
  const [savingProjectorCommissionIds, setSavingProjectorCommissionIds] = useState<Set<string>>(new Set());
  const [savingPaymentSections, setSavingPaymentSections] = useState<Set<string>>(new Set());
  const [uploadingSignedReceiptSections, setUploadingSignedReceiptSections] = useState<Set<string>>(new Set());
  const [projectorAmountDrafts, setProjectorAmountDrafts] = useState<Record<string, string>>({});
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [savingReceiver, setSavingReceiver] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newReceiverName, setNewReceiverName] = useState("");
  const [editingReceiverId, setEditingReceiverId] = useState<string | null>(null);
  const [editingReceiverName, setEditingReceiverName] = useState("");
  const [viewingSnapshot, setViewingSnapshot] = useState<CommissionSnapshot | null>(null);
  const [commissionReceiptDraft, setCommissionReceiptDraft] = useState<CommissionReceiptDraft | null>(null);
  const canWriteCommissions = canWriteModule(user, "commissions");
  const canReadAllCommissions = canWriteCommissions || hasPermission(user, "commissions:all:read");
  const canWriteClientRelationsCommissions = hasPermission(user, "commissions:client-relations:write");
  const canWriteOwnCommissionSection = hasPermission(user, "commissions:own-section:write");
  const canReadClients = hasPermission(user, "clients:read");
  const canManageExclusions = canManageCommissionExclusions(user);
  const canManageTotalsReceiverExclusions = canManageCommissionTotalsReceiverExclusions(user);
  const canManageProjectorEntries = canManageProjectorCommissions(user);
  const canManageMatterExclusions = canManageProjectorCommissions(user);
  const canMarkPaymentsByTransfer = isRusconiTenant(user) && (
    isFinanceTeamUser(user) || (hasSuperadminAccess(user) && isEduardoRusconiUser(user))
  );
  const canConfirmPaymentsAsAraceli = isAraceliLozanoUser(user);
  const canConfirmPaymentsAsEmrt = isRusconiTenant(user) && hasSuperadminAccess(user) && isEduardoRusconiUser(user);
  const isLegalFlow = isLegalFlowTenant(user);
  const availableCommissionSections = useMemo(
    () => isLegalFlow ? [...LEGALFLOW_COMMISSION_SECTIONS] : [...RUSCONI_COMMISSION_SECTIONS],
    [isLegalFlow]
  );

  const visibleSections = useMemo(() => {
    const userRole = normalizeText(user?.specificRole);
    const projectorRoleSection = getProjectorCommissionSectionForRole(user?.specificRole);

    if (canReadAllCommissions || user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN") {
      return isLegalFlow ? availableCommissionSections : [...availableCommissionSections, COMMISSION_TOTALS_SECTION];
    }

    if (canWriteClientRelationsCommissions) {
      return availableCommissionSections.filter(
        (section) => normalizeText(section) === normalizeText(CLIENT_RELATIONS_COMMISSION_SECTION)
      );
    }

    return availableCommissionSections.filter((section) =>
      normalizeText(section) === normalizeText(projectorRoleSection ?? userRole)
    );
  }, [
    availableCommissionSections,
    canReadAllCommissions,
    canWriteClientRelationsCommissions,
    isLegalFlow,
    user?.legacyRole,
    user?.role,
    user?.specificRole
  ]);

  const canAccessCalculation = visibleSections.length > 0;
  const visibleSectionKeys = useMemo(
    () => new Set(visibleSections.map((section) => normalizeText(section))),
    [visibleSections]
  );
  const isTotalsActiveSection = isCommissionTotalsSection(activeSection);
  const canWriteActiveSection = Boolean(
    !isTotalsActiveSection &&
    (
      canWriteCommissions ||
      (
        canWriteClientRelationsCommissions &&
        normalizeText(activeSection) === normalizeText(CLIENT_RELATIONS_COMMISSION_SECTION)
      ) ||
      (
        canWriteOwnCommissionSection &&
        visibleSectionKeys.has(normalizeText(activeSection))
      )
    )
  );

  useEffect(() => {
    if (visibleSections.length === 0) {
      setActiveSection("");
      return;
    }

    if (!visibleSections.includes(activeSection)) {
      setActiveSection(visibleSections[0]);
    }
  }, [activeSection, visibleSections]);

  useEffect(() => {
    if (activeTab === "receivers" && !canReadAllCommissions) {
      setActiveTab("calculation");
    }
  }, [activeTab, canReadAllCommissions]);

  async function loadBoard() {
    setLoadingBoard(true);
    setErrorMessage(null);

    try {
      const [overview, clientsResponse] = await Promise.all([
        apiGet<CommissionsOverviewResponse>(`/commissions/overview?year=${selectedYear}&month=${selectedMonth}`),
        canReadClients ? apiGet<Client[]>("/clients") : Promise.resolve([])
      ]);

      setFinanceRecords(overview.financeRecords);
      setGeneralExpenses(overview.generalExpenses);
      setReceivers(overview.receivers);
      setRecipientAssignments(overview.recipientAssignments ?? []);
      setExclusions(overview.exclusions ?? []);
      setMatterCommissions(overview.matterCommissions ?? []);
      setProjectorCommissions(overview.projectorCommissions ?? []);
      setPaymentAcknowledgements(overview.paymentAcknowledgements ?? []);
      setCommissionReleaseEligibilities(overview.commissionReleaseEligibilities ?? []);
      setPeriodLocked(Boolean(overview.periodLocked));
      setConfirmedByEmrtCount((overview.paymentAcknowledgements ?? []).filter((entry) => entry.receivedByEmrt).length);
      setClients(clientsResponse);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingBoard(false);
    }
  }

  async function loadSnapshots() {
    setLoadingSnapshots(true);

    try {
      const data = await apiGet<CommissionSnapshot[]>("/commissions/snapshots");
      setSnapshots(data);
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setLoadingSnapshots(false);
    }
  }

  useEffect(() => {
    void loadBoard();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    void loadSnapshots();
  }, []);

  const sectionCalculation = useMemo(
    () => calculateSection(
      financeRecords,
      generalExpenses,
      clients,
      activeSection,
      selectedYear,
      selectedMonth,
      exclusions,
      projectorCommissions,
      matterCommissions
    ),
    [
      activeSection,
      clients,
      exclusions,
      financeRecords,
      generalExpenses,
      matterCommissions,
      projectorCommissions,
      selectedMonth,
      selectedYear
    ]
  );
  const commissionTotalsRows = useMemo<CommissionTotalsRow[]>(() => {
    if (!isTotalsActiveSection) {
      return [];
    }

    return availableCommissionSections
      .filter((section) => normalizeText(section) !== normalizeText("Direccion general"))
      .map((section) => ({
        section,
        calculation: calculateSection(
          financeRecords,
          generalExpenses,
          clients,
          section,
          selectedYear,
          selectedMonth,
          exclusions,
          projectorCommissions,
          matterCommissions
        )
      }));
  }, [
    availableCommissionSections,
    clients,
    exclusions,
    financeRecords,
    generalExpenses,
    isTotalsActiveSection,
    matterCommissions,
    projectorCommissions,
    selectedMonth,
    selectedYear
  ]);
  const paymentAcknowledgementsBySection = useMemo(
    () => new Map(paymentAcknowledgements.map((entry) => [normalizeText(entry.section), entry])),
    [paymentAcknowledgements]
  );
  const recipientAssignmentsBySection = useMemo(
    () => new Map(recipientAssignments.map((entry) => [normalizeText(entry.section), entry])),
    [recipientAssignments]
  );
  const releaseEligibilityByUserId = useMemo(
    () => new Map(commissionReleaseEligibilities.map((entry) => [entry.userId, entry])),
    [commissionReleaseEligibilities]
  );
  const effectiveExcludedTotalsReceiverKeys = useMemo(
    () => new Set(
      paymentAcknowledgements
        .filter((entry) => entry.excluded)
        .map((entry) => buildCommissionTotalsReceiverExclusionKey({
          year: entry.year,
          month: entry.month,
          section: entry.section
        }))
    ),
    [paymentAcknowledgements]
  );
  const includedCommissionTotalsRows = useMemo(
    () => commissionTotalsRows.filter((row) => !effectiveExcludedTotalsReceiverKeys.has(
      buildCommissionTotalsReceiverExclusionKey({
        year: selectedYear,
        month: selectedMonth,
        section: row.section
      })
    )),
    [commissionTotalsRows, effectiveExcludedTotalsReceiverKeys, selectedMonth, selectedYear]
  );
  const commissionTotalsSummary = useMemo(
    () => includedCommissionTotalsRows.reduce(
      (acc, row) => ({
        group1PayableMxn: acc.group1PayableMxn + row.calculation.group1PayableMxn,
        group2TotalMxn: acc.group2TotalMxn + row.calculation.group2TotalMxn,
        group3TotalMxn: acc.group3TotalMxn + row.calculation.group3TotalMxn,
        projectorPayableMxn: acc.projectorPayableMxn + row.calculation.projectorPayableMxn,
        projectorBonusMxn: acc.projectorBonusMxn + row.calculation.projectorBonusMxn,
        totalCommissionsMxn: acc.totalCommissionsMxn + row.calculation.totalCommissionsMxn
      }),
      {
        group1PayableMxn: 0,
        group2TotalMxn: 0,
        group3TotalMxn: 0,
        projectorPayableMxn: 0,
        projectorBonusMxn: 0,
        totalCommissionsMxn: 0
      }
    ),
    [includedCommissionTotalsRows]
  );

  const paymentReconcileSignature = useMemo(
    () => commissionTotalsRows
      .map((row) => `${normalizeText(row.section)}:${row.calculation.totalCommissionsMxn.toFixed(2)}`)
      .join("|"),
    [commissionTotalsRows]
  );

  useEffect(() => {
    if (!isTotalsActiveSection || isLegalFlow || loadingBoard || commissionTotalsRows.length === 0) {
      return;
    }

    let cancelled = false;
    void apiPost<CommissionPaymentFlowState>("/commissions/payment-acknowledgements/reconcile", {
      year: selectedYear,
      month: selectedMonth,
      rows: commissionTotalsRows.map((row) => ({
        section: row.section,
        amountMxn: row.calculation.totalCommissionsMxn
      }))
    })
      .then((state) => {
        if (!cancelled) {
          setPaymentAcknowledgements(state.acknowledgements);
          setPeriodLocked(state.locked);
          setConfirmedByEmrtCount(state.confirmedByEmrtCount);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFlash({ tone: "error", text: getErrorMessage(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    commissionTotalsRows,
    isLegalFlow,
    isTotalsActiveSection,
    loadingBoard,
    paymentReconcileSignature,
    selectedMonth,
    selectedYear
  ]);

  async function updatePaymentAcknowledgement(
    section: string,
    payload: { paidByTransfer?: boolean; receivedByAraceli?: boolean; receivedByEmrt?: boolean; excluded?: boolean }
  ) {
    const savingKey = normalizeText(section);
    setSavingPaymentSections((current) => new Set(current).add(savingKey));
    setFlash(null);

    try {
      const state = await apiPatch<CommissionPaymentFlowState>("/commissions/payment-acknowledgements", {
        year: selectedYear,
        month: selectedMonth,
        section,
        ...payload
      });
      setPaymentAcknowledgements(state.acknowledgements);
      setPeriodLocked(state.locked);
      setConfirmedByEmrtCount(state.confirmedByEmrtCount);
      setFlash({
        tone: "success",
        text: payload.paidByTransfer !== undefined
          ? payload.paidByTransfer
            ? "Pago mediante transferencia registrado. Las confirmaciones de recepcion quedaron deshabilitadas."
            : "Pago mediante transferencia desmarcado. Las confirmaciones de recepcion volvieron a estar disponibles."
          : payload.receivedByEmrt === false
          ? state.locked
            ? "Pago por EMRT reabierto. El periodo sigue bloqueado por otros pagos de EMRT."
            : "Todos los pagos por EMRT fueron reabiertos; Finanzas y Gastos generales quedaron habilitados."
          : "Flujo de pago de comisiones actualizado."
      });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
      if (payload.receivedByEmrt) {
        void loadBoard();
      }
    } finally {
      setSavingPaymentSections((current) => {
        const next = new Set(current);
        next.delete(savingKey);
        return next;
      });
    }
  }

  function handleToggleCommissionTotalsReceiverExclusion(section: string, excluded: boolean) {
    if (!canManageTotalsReceiverExclusions || periodLocked) {
      return;
    }
    void updatePaymentAcknowledgement(section, { excluded });
  }

  function handleGenerateCommissionReceipt(row: CommissionTotalsRow, recipientName: string) {
    if (!canMarkPaymentsByTransfer || row.calculation.totalCommissionsMxn <= 0) {
      return;
    }

    const periodLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
    const filenamePeriod = `${selectedYear}-${`${selectedMonth}`.padStart(2, "0")}`;
    setCommissionReceiptDraft({
      amountMxn: row.calculation.totalCommissionsMxn,
      document: buildCommissionMoneyReceipt({
        amountMxn: row.calculation.totalCommissionsMxn,
        concept: `Comisiones correspondientes a ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}`,
        recipientName
      }),
      filenameBase: `recibo-comisiones-${recipientName}-${filenamePeriod}`,
      periodLabel,
      recipientName,
      section: row.section
    });
  }

  async function handleUploadSignedReceipt(section: string, file: File) {
    if (!canMarkPaymentsByTransfer) {
      return;
    }

    if (!isPdfFile(file)) {
      setFlash({ tone: "error", text: "El recibo firmado debe ser un archivo PDF." });
      return;
    }

    if (file.size <= 0 || file.size > MAX_SIGNED_RECEIPT_BYTES) {
      setFlash({ tone: "error", text: "El recibo firmado debe pesar entre 1 byte y 10 MB." });
      return;
    }

    const uploadingKey = normalizeText(section);
    setUploadingSignedReceiptSections((current) => new Set(current).add(uploadingKey));
    setFlash(null);

    try {
      const fileBase64 = await readFileAsBase64(file);
      const state = await apiPost<CommissionPaymentFlowState>(
        "/commissions/payment-acknowledgements/signed-receipt",
        {
          year: selectedYear,
          month: selectedMonth,
          section,
          originalFileName: file.name,
          fileBase64
        }
      );
      setPaymentAcknowledgements(state.acknowledgements);
      setPeriodLocked(state.locked);
      setConfirmedByEmrtCount(state.confirmedByEmrtCount);
      setFlash({ tone: "success", text: "Recibo firmado cargado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setUploadingSignedReceiptSections((current) => {
        const next = new Set(current);
        next.delete(uploadingKey);
        return next;
      });
    }
  }

  async function handleOpenSignedReceipt(acknowledgement: CommissionPaymentAcknowledgement) {
    setFlash(null);

    try {
      const query = new URLSearchParams({
        year: String(acknowledgement.year),
        month: String(acknowledgement.month),
        section: acknowledgement.section
      });
      const { blob } = await apiDownload(
        `/commissions/payment-acknowledgements/signed-receipt?${query.toString()}`
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    }
  }

  function handleTogglePaymentReceivedByAraceli(section: string, receivedByAraceli: boolean) {
    if (!canConfirmPaymentsAsAraceli) {
      return;
    }
    void updatePaymentAcknowledgement(section, { receivedByAraceli });
  }

  function handleTogglePaymentPaidByTransfer(section: string, paidByTransfer: boolean) {
    if (!canMarkPaymentsByTransfer || periodLocked) {
      return;
    }
    void updatePaymentAcknowledgement(section, { paidByTransfer });
  }

  function handleTogglePaymentReceivedByEmrt(section: string, receivedByEmrt: boolean) {
    if (!canConfirmPaymentsAsEmrt) {
      return;
    }
    if (!receivedByEmrt && !window.confirm(
      "Reabrir este pago por EMRT? El periodo solo se habilitara cuando no quede ningun pago de EMRT."
    )) {
      return;
    }
    void updatePaymentAcknowledgement(section, { receivedByEmrt });
  }

  async function handleToggleCommissionExclusion(row: CommissionBreakdownEntry, excluded: boolean) {
    if (!canManageExclusions || periodLocked || !activeSection) {
      return;
    }

    const payload = {
      year: selectedYear,
      month: selectedMonth,
      section: activeSection,
      group: row.group,
      financeRecordId: row.financeRecordId,
      excluded
    };
    const exclusionKey = buildCommissionExclusionKey(payload);

    setSavingExclusionKeys((current) => new Set(current).add(exclusionKey));
    setFlash(null);

    try {
      const response = await apiPatch<CommissionExclusion | (typeof payload)>("/commissions/exclusions", payload);
      setExclusions((current) => {
        const withoutCurrent = current.filter((entry) =>
          buildCommissionExclusionKey(entry) !== exclusionKey
        );

        if (!excluded) {
          return withoutCurrent;
        }

        return [...withoutCurrent, response as CommissionExclusion];
      });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingExclusionKeys((current) => {
        const next = new Set(current);
        next.delete(exclusionKey);
        return next;
      });
    }
  }

  async function handleToggleMatterCommissionExclusion(
    entry: CommissionMatterCommission,
    excluded: boolean
  ) {
    if (!canManageMatterExclusions || periodLocked) {
      return;
    }

    setSavingMatterExclusionIds((current) => new Set(current).add(entry.matterId));
    setFlash(null);

    try {
      await apiPatch("/commissions/matter-exclusions", {
        year: selectedYear,
        month: selectedMonth,
        matterId: entry.matterId,
        excluded
      });
      setMatterCommissions((current) => current.map((candidate) =>
        candidate.matterId === entry.matterId ? { ...candidate, excluded } : candidate
      ));
      setFlash({
        tone: "success",
        text: excluded
          ? `Asunto excluido desde ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}.`
          : `Asunto reincluido desde ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}.`
      });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingMatterExclusionIds((current) => {
        const next = new Set(current);
        next.delete(entry.matterId);
        return next;
      });
    }
  }

  function handleProjectorAmountDraftChange(entryId: string, value: string) {
    setProjectorAmountDrafts((current) => ({ ...current, [entryId]: value }));
  }

  async function updateProjectorCommission(
    entry: ProjectorCommission,
    payload: { amountMxn?: number; authorized?: boolean }
  ) {
    if (!canManageProjectorEntries || periodLocked) {
      return;
    }

    setSavingProjectorCommissionIds((current) => new Set(current).add(entry.id));
    setFlash(null);

    try {
      const updated = await apiPatch<ProjectorCommission>(
        `/commissions/projector-commissions/${entry.id}`,
        payload
      );
      setProjectorCommissions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setProjectorAmountDrafts((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      setFlash({
        tone: "success",
        text: updated.authorized
          ? "Comisión autorizada para la proyectista y para Litigio líder."
          : "Comisión actualizada; permanece fuera de ambos totales."
      });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingProjectorCommissionIds((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  }

  function handleCommitProjectorAmount(entry: ProjectorCommission) {
    const draft = projectorAmountDrafts[entry.id];
    if (draft === undefined) {
      return;
    }

    const amountMxn = Number(draft);
    if (!Number.isFinite(amountMxn) || amountMxn < 0) {
      setProjectorAmountDrafts((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      setFlash({ tone: "error", text: "El monto de la comisión debe ser un número igual o mayor a cero." });
      return;
    }

    if (amountMxn === entry.amountMxn) {
      setProjectorAmountDrafts((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      return;
    }

    void updateProjectorCommission(entry, { amountMxn });
  }

  function handleToggleProjectorAuthorization(entry: ProjectorCommission, authorized: boolean) {
    const draft = projectorAmountDrafts[entry.id];
    const amountMxn = draft === undefined ? entry.amountMxn : Number(draft);
    if (!Number.isFinite(amountMxn) || amountMxn < 0) {
      setFlash({ tone: "error", text: "Corrige el monto antes de autorizar la comisión." });
      return;
    }

    void updateProjectorCommission(entry, {
      authorized,
      ...(amountMxn === entry.amountMxn ? {} : { amountMxn })
    });
  }

  async function handleCreateReceiver() {
    if (!canWriteCommissions) {
      return;
    }

    const name = newReceiverName.trim();
    if (!name) {
      return;
    }

    setSavingReceiver(true);
    setFlash(null);

    try {
      const receiver = await apiPost<CommissionReceiver>("/commissions/receivers", { name });
      setReceivers((current) => [...current, receiver].sort((left, right) => left.name.localeCompare(right.name)));
      setNewReceiverName("");
      setFlash({ tone: "success", text: "Receptor agregado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingReceiver(false);
    }
  }

  async function handleUpdateReceiver() {
    if (!canWriteCommissions) {
      return;
    }

    if (!editingReceiverId || !editingReceiverName.trim()) {
      return;
    }

    setSavingReceiver(true);
    setFlash(null);

    try {
      const receiver = await apiPatch<CommissionReceiver>(`/commissions/receivers/${editingReceiverId}`, {
        name: editingReceiverName.trim()
      });
      setReceivers((current) =>
        current
          .map((entry) => (entry.id === receiver.id ? receiver : entry))
          .sort((left, right) => left.name.localeCompare(right.name))
      );
      setEditingReceiverId(null);
      setEditingReceiverName("");
      setFlash({ tone: "success", text: "Receptor actualizado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingReceiver(false);
    }
  }

  async function handleDeleteReceiver(receiverId: string) {
    if (!canWriteCommissions) {
      return;
    }

    if (!window.confirm("Eliminar este receptor puede afectar calculos historicos. Deseas continuar?")) {
      return;
    }

    setSavingReceiver(true);
    setFlash(null);

    try {
      await apiDelete(`/commissions/receivers/${receiverId}`);
      setReceivers((current) => current.filter((entry) => entry.id !== receiverId));
      setFlash({ tone: "success", text: "Receptor eliminado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingReceiver(false);
    }
  }

  async function handleCreateSnapshot() {
    if (!canWriteActiveSection) {
      return;
    }

    if (!activeSection) {
      setFlash({ tone: "error", text: "Selecciona primero una seccion para guardar la estampa." });
      return;
    }

    setSavingSnapshot(true);
    setFlash(null);

    const snapshotData: CommissionSnapshotData = {
      section: activeSection,
      financeRecords: sectionCalculation.financeRecords,
      generalExpenses,
      executionRecords: sectionCalculation.executionRecords,
      clientRecords: sectionCalculation.clientRecords,
      closingRecords: sectionCalculation.closingRecords,
      matterCommissions: sectionCalculation.matterCommissions,
      matterCommissionsTotalMxn: sectionCalculation.matterCommissionsTotalMxn,
      group1TeamBreakdowns: sectionCalculation.group1TeamBreakdowns,
      group1GrossMxn: sectionCalculation.group1GrossMxn,
      group1NetMxn: sectionCalculation.group1NetMxn,
      group1PayableMxn: sectionCalculation.group1PayableMxn,
      group2TotalMxn: sectionCalculation.group2TotalMxn,
      group3TotalMxn: sectionCalculation.group3TotalMxn,
      projectorPayableMxn: sectionCalculation.projectorPayableMxn,
      projectorBonusMxn: sectionCalculation.projectorBonusMxn,
      projectorCommissions: sectionCalculation.projectorCommissions,
      totalCommissionsMxn: sectionCalculation.totalCommissionsMxn,
      grossTotalMxn: sectionCalculation.grossTotalMxn,
      deductionRate: sectionCalculation.deductionRate,
      deductionBaseMxn: sectionCalculation.deductionBaseMxn,
      deductionMxn: sectionCalculation.deductionMxn,
      netTotalMxn: sectionCalculation.netTotalMxn,
      createdAt: new Date().toISOString()
    };

    try {
      const snapshot = await apiPost<CommissionSnapshot>("/commissions/snapshots", {
        year: selectedYear,
        month: selectedMonth,
        section: activeSection,
        title: `Estampa: ${activeSection} - ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
        totalNetMxn: sectionCalculation.totalCommissionsMxn,
        snapshotData
      });
      setSnapshots((current) => [...current, snapshot]);
      setFlash({ tone: "success", text: "Estampa guardada correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSavingSnapshot(false);
    }
  }

  const snapshotCards = loadingSnapshots
    ? []
    : canReadAllCommissions && !isLegalFlow
      ? snapshots
      : snapshots.filter((snapshot) => visibleSectionKeys.has(normalizeText(snapshot.section)));
  const activeSectionLabel = activeSection || "Sin seccion";
  const shouldShowDeductionPanel = Boolean(
    activeSection
    && normalizeText(activeSection) !== normalizeText("Direccion general")
    && !isProjectorCommissionSection(activeSection)
  );
  const isProjectorActiveSection = isProjectorCommissionSection(activeSection);
  const isLitigationLeaderActiveSection = isLitigationLeaderCommissionSection(activeSection);
  const isLitigationCollaboratorActiveSection = isLitigationCollaboratorCommissionSection(activeSection);
  const projectorPendingMxn = sectionCalculation.projectorCommissions.reduce(
    (sum, entry) => sum + (entry.authorized ? 0 : entry.amountMxn),
    0
  );
  const isSalesActiveSection = isSalesCommissionSection(activeSection);
  const group1RateLabel = getGroup1RateLabel(activeSection);
  const group1RateLabelSuffix = group1RateLabel ? ` (${group1RateLabel})` : "";
  const usesTeamGroup1Breakdown = sectionCalculation.group1TeamBreakdowns.length > 0;
  const hasNegativeTeamBalance = sectionCalculation.group1TeamBreakdowns.some((team) => team.netMxn < 0);
  const yearOptions = Array.from({ length: 7 }, (_, index) => 2024 + index);

  return (
    <section className="page-stack commissions-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Com
          </span>
          <div>
            <h2>Comisiones</h2>
          </div>
        </div>
        <p className="muted">
          Calculo por seccion, deduccion por gastos pagados, receptores editables, estampas historicas y resaltado
          visual en rojo sobre filas derivadas de registros incompletos.
        </p>
      </header>

      {flash ? <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>{flash.text}</div> : null}
      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}
      {periodLocked && !isLegalFlow ? (
        <div className="message-banner commissions-period-lock-banner">
          Periodo cerrado por EMRT con {confirmedByEmrtCount} confirmacion{confirmedByEmrtCount === 1 ? "" : "es"}.
          Finanzas, Gastos generales y los ajustes que cambian comisiones permanecen bloqueados hasta reabrir todas.
        </div>
      ) : null}

      <section className="panel">
        <div className="commissions-tabs" role="tablist" aria-label="Pestanas de comisiones">
          <button
            type="button"
            className={`commissions-tab ${activeTab === "calculation" ? "is-active" : ""}`}
            onClick={() => setActiveTab("calculation")}
          >
            Calculo de comisiones
          </button>
          {canReadAllCommissions ? (
            <button
              type="button"
              className={`commissions-tab ${activeTab === "receivers" ? "is-active" : ""}`}
              onClick={() => setActiveTab("receivers")}
            >
              Receptores
            </button>
          ) : null}
          <button
            type="button"
            className={`commissions-tab ${activeTab === "snapshots" ? "is-active" : ""}`}
            onClick={() => setActiveTab("snapshots")}
          >
            Estampas guardadas
          </button>
        </div>
      </section>

      {activeTab === "calculation" ? (
        canAccessCalculation ? (
          <div className="commissions-layout">
            <aside className="panel commissions-sidebar">
              <div className="panel-header">
                <h2>Secciones</h2>
                <span>{visibleSections.length}</span>
              </div>
              <div className="commissions-sidebar-list">
                {visibleSections.map((section) => (
                  <button
                    type="button"
                    key={section}
                    className={`commissions-sidebar-button ${section === activeSection ? "is-active" : ""}`}
                    onClick={() => setActiveSection(section)}
                  >
                    {section}
                  </button>
                ))}
              </div>
            </aside>

            <div className="commissions-main">
              <section className="panel">
                <div className="panel-header">
                  <h2>{activeSectionLabel}</h2>
                  <span>
                    {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                  </span>
                </div>

                <div className="commissions-toolbar">
                  <label className="form-field">
                    <span>Ano</span>
                    <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Mes</span>
                    <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                      {MONTH_NAMES.map((monthLabel, index) => (
                        <option key={monthLabel} value={index + 1}>
                          {monthLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary-button" type="button" onClick={() => void loadBoard()}>
                    Refrescar
                  </button>
                  {!isTotalsActiveSection ? (
                    <button className="primary-button" type="button" onClick={() => void handleCreateSnapshot()} disabled={savingSnapshot || !canWriteActiveSection}>
                      {savingSnapshot ? "Guardando..." : "Guardar estampa"}
                    </button>
                  ) : null}
                </div>

                <div className={`commissions-metrics-grid${isTotalsActiveSection ? " is-totals" : ""}`}>
                  {isProjectorActiveSection ? (
                    <>
                      <CurrencyMetricCard
                        label="Comisiones pendientes de autorizar"
                        value={projectorPendingMxn}
                        accentClass="is-warning"
                      />
                      <CurrencyMetricCard
                        label="Comisiones autorizadas"
                        value={sectionCalculation.projectorPayableMxn}
                        accentClass="is-primary"
                      />
                      <CurrencyMetricCard
                        label="Total a pagar"
                        value={sectionCalculation.totalCommissionsMxn}
                        accentClass="is-success"
                        helper="Solo las entradas autorizadas forman parte del total"
                      />
                    </>
                  ) : (
                    <>
                      {!isTotalsActiveSection ? (
                        usesTeamGroup1Breakdown ? (
                          <CommissionTeamBreakdownCards teams={sectionCalculation.group1TeamBreakdowns} />
                        ) : (
                          <>
                            <CurrencyMetricCard
                              label={`Comisiones brutas Grupo 1${group1RateLabelSuffix}`}
                              value={sectionCalculation.group1GrossMxn}
                              accentClass="is-primary"
                            />
                            <CurrencyMetricCard
                              label="Deducción por gastos"
                              value={sectionCalculation.deductionMxn}
                              accentClass="is-warning"
                              helper={`${Math.round(sectionCalculation.deductionRate * 100)}% de ${formatCurrency(sectionCalculation.deductionBaseMxn)}`}
                            />
                          </>
                        )
                      ) : null}
                      <CurrencyMetricCard
                        label={isTotalsActiveSection ? "Comisiones Grupo 1" : `Comisiones netas Grupo 1${group1RateLabelSuffix}`}
                        value={isTotalsActiveSection ? commissionTotalsSummary.group1PayableMxn : sectionCalculation.group1NetMxn}
                        accentClass="is-success"
                      />
                      <CurrencyMetricCard
                        label="Comisiones Grupo 2 (20%)"
                        value={isTotalsActiveSection ? commissionTotalsSummary.group2TotalMxn : sectionCalculation.group2TotalMxn}
                        accentClass="is-neutral"
                      />
                      <CurrencyMetricCard
                        label="Comisiones Grupo 3 (10%)"
                        value={isTotalsActiveSection ? commissionTotalsSummary.group3TotalMxn : sectionCalculation.group3TotalMxn}
                        accentClass="is-neutral"
                      />
                      {isLitigationCollaboratorActiveSection ? (
                        <CurrencyMetricCard
                          label="Comisiones por asunto"
                          value={sectionCalculation.matterCommissionsTotalMxn}
                          accentClass="is-primary"
                          helper="$100 por cada asunto de Litigio vigente"
                        />
                      ) : null}
                      {isTotalsActiveSection ? (
                        <CurrencyMetricCard
                          label="Proyectistas y espejo Litigio líder"
                          value={commissionTotalsSummary.projectorPayableMxn + commissionTotalsSummary.projectorBonusMxn}
                          accentClass="is-neutral"
                        />
                      ) : isLitigationLeaderActiveSection ? (
                        <CurrencyMetricCard
                          label="Comisiones espejo de proyectistas"
                          value={sectionCalculation.projectorBonusMxn}
                          accentClass="is-primary"
                          helper="Se entregan completas y no están sujetas a deducciones"
                        />
                      ) : null}
                      {isTotalsActiveSection ? (
                        <CurrencyMetricCard
                          label="Total a pagar"
                          value={commissionTotalsSummary.totalCommissionsMxn}
                          accentClass="is-success"
                        />
                      ) : (
                        <CurrencyMetricCard
                          label="Comisiones totales"
                          value={sectionCalculation.totalCommissionsMxn}
                          accentClass="is-success"
                          helper={
                            usesTeamGroup1Breakdown && hasNegativeTeamBalance
                              ? "Los equipos negativos aportan $0 y no afectan a los equipos positivos"
                              : sectionCalculation.group1NetMxn < 0
                                ? "El saldo negativo del Grupo 1 no se resta a los grupos 2 y 3"
                                : undefined
                          }
                        />
                      )}
                    </>
                  )}
                </div>
              </section>

              {loadingBoard ? (
                <section className="panel">
                  <div className="centered-inline-message">Cargando informacion de comisiones...</div>
                </section>
              ) : isTotalsActiveSection ? (
                <CommissionTotalsTable
                  rows={commissionTotalsRows}
                  year={selectedYear}
                  month={selectedMonth}
                  excludedReceiverKeys={effectiveExcludedTotalsReceiverKeys}
                  acknowledgementsBySection={paymentAcknowledgementsBySection}
                  recipientAssignmentsBySection={recipientAssignmentsBySection}
                  releaseEligibilityByUserId={releaseEligibilityByUserId}
                  periodLocked={periodLocked}
                  canManageReceiverExclusions={canManageTotalsReceiverExclusions}
                  canMarkPaidByTransfer={canMarkPaymentsByTransfer}
                  canGenerateReceipts={canMarkPaymentsByTransfer}
                  canManageSignedReceipts={canMarkPaymentsByTransfer}
                  canConfirmAsAraceli={canConfirmPaymentsAsAraceli}
                  canConfirmAsEmrt={canConfirmPaymentsAsEmrt}
                  savingSections={savingPaymentSections}
                  uploadingSignedReceiptSections={uploadingSignedReceiptSections}
                  onToggleReceiverExclusion={handleToggleCommissionTotalsReceiverExclusion}
                  onTogglePaidByTransfer={handleTogglePaymentPaidByTransfer}
                  onToggleReceivedByAraceli={handleTogglePaymentReceivedByAraceli}
                  onToggleReceivedByEmrt={handleTogglePaymentReceivedByEmrt}
                  onGenerateReceipt={handleGenerateCommissionReceipt}
                  onUploadSignedReceipt={handleUploadSignedReceipt}
                  onOpenSignedReceipt={handleOpenSignedReceipt}
                />
              ) : isProjectorActiveSection ? (
                <ProjectorCommissionTable
                  title={`Comisiones por escritos de fondo - ${activeSection}`}
                  rows={sectionCalculation.projectorCommissions}
                  mode="projector"
                  canManage={canManageProjectorEntries && !periodLocked}
                  savingIds={savingProjectorCommissionIds}
                  amountDrafts={projectorAmountDrafts}
                  onAmountDraftChange={handleProjectorAmountDraftChange}
                  onCommitAmount={handleCommitProjectorAmount}
                  onToggleAuthorization={handleToggleProjectorAuthorization}
                />
              ) : (
                <>
                  <div className="commissions-group-grid">
                    <CommissionGroupTable
                      title="PRIMER GRUPO: Comisiones de Ejecucion"
                      toneClass="tone-primary"
                      rows={sectionCalculation.executionRecords}
                      showBaseNet={isSalesActiveSection}
                      baseNetLabel={isSalesActiveSection ? "Primer pago recibido" : undefined}
                      amountLabel={isSalesActiveSection ? "1%" : undefined}
                      showExclusionControls
                      canManageExclusions={canManageExclusions && !periodLocked}
                      savingExclusionKeys={savingExclusionKeys}
                      year={selectedYear}
                      month={selectedMonth}
                      section={activeSection}
                      onToggleExclusion={handleToggleCommissionExclusion}
                    />
                    <CommissionGroupTable
                      title="SEGUNDO GRUPO: Comisiones de Cliente (20%)"
                      toneClass="tone-secondary"
                      rows={sectionCalculation.clientRecords}
                      showExclusionControls
                      canManageExclusions={canManageExclusions && !periodLocked}
                      savingExclusionKeys={savingExclusionKeys}
                      year={selectedYear}
                      month={selectedMonth}
                      section={activeSection}
                      onToggleExclusion={handleToggleCommissionExclusion}
                    />
                    <CommissionGroupTable
                      title="TERCER GRUPO: Comisiones de Cierre (10%)"
                      toneClass="tone-tertiary"
                      rows={sectionCalculation.closingRecords}
                      showExclusionControls
                      canManageExclusions={canManageExclusions && !periodLocked}
                      savingExclusionKeys={savingExclusionKeys}
                      year={selectedYear}
                      month={selectedMonth}
                      section={activeSection}
                      onToggleExclusion={handleToggleCommissionExclusion}
                    />
                  </div>

                  {isLitigationCollaboratorActiveSection ? (
                    <CommissionMatterTable
                      rows={sectionCalculation.matterCommissions}
                      canManageExclusions={canManageMatterExclusions && !periodLocked}
                      savingMatterIds={savingMatterExclusionIds}
                      onToggleExclusion={handleToggleMatterCommissionExclusion}
                    />
                  ) : null}

                  {isLitigationLeaderActiveSection ? (
                    <ProjectorCommissionTable
                      title="COMISIONES ESPEJO: Escritos de fondo autorizados"
                      rows={sectionCalculation.projectorCommissions}
                      mode="leader-mirror"
                    />
                  ) : null}

                  {shouldShowDeductionPanel ? (
                    <section className="panel commissions-deduction-panel">
                      <div className="panel-header">
                        <h2>Deduccion de gastos sobre Grupo 1 ({Math.round(sectionCalculation.deductionRate * 100)}%)</h2>
                        <span>{formatCurrency(sectionCalculation.deductionMxn)}</span>
                      </div>
                      {usesTeamGroup1Breakdown ? (
                        <p className="muted commissions-caption">
                          Para Finanzas y Comunicacion con cliente, el 1% se calcula por equipo. Si el neto de un
                          equipo queda en cero o negativo, ese equipo aporta $0 y no resta a los equipos con saldo
                          positivo.
                        </p>
                      ) : (
                        <p className="muted commissions-caption">
                          El total de gastos atribuibles a tu equipo este mes asciende a{" "}
                          <strong>{formatCurrency(sectionCalculation.deductionBaseMxn)}</strong>. De dicha suma, el{" "}
                          {Math.round(sectionCalculation.deductionRate * 100)}%, que asciende a{" "}
                          <strong>{formatCurrency(sectionCalculation.deductionMxn)}</strong>, se restara unicamente de las
                          comisiones del Grupo 1. Las comisiones de los grupos 2 y 3 se entregan completas, aunque
                          el Grupo 1 quede con saldo negativo.
                        </p>
                      )}
                      <div className="commissions-deduction-summary">
                        <span>Comisiones brutas Grupo 1{group1RateLabelSuffix}: <strong>{formatCurrency(sectionCalculation.group1GrossMxn)}</strong></span>
                        <span>(-) Deduccion Gastos: <strong>{formatCurrency(sectionCalculation.deductionMxn)}</strong></span>
                        <span>Comisiones netas Grupo 1{group1RateLabelSuffix}: <strong>{formatCurrency(sectionCalculation.group1NetMxn)}</strong></span>
                        <span>Grupo 1 aplicado al total: <strong>{formatCurrency(sectionCalculation.group1PayableMxn)}</strong></span>
                        <span>(+) Comisiones Grupo 2 (20%): <strong>{formatCurrency(sectionCalculation.group2TotalMxn)}</strong></span>
                        <span>(+) Comisiones Grupo 3 (10%): <strong>{formatCurrency(sectionCalculation.group3TotalMxn)}</strong></span>
                        {sectionCalculation.matterCommissionsTotalMxn > 0 ? (
                          <span>(+) Comisiones por asunto: <strong>{formatCurrency(sectionCalculation.matterCommissionsTotalMxn)}</strong></span>
                        ) : null}
                        {sectionCalculation.projectorBonusMxn > 0 ? (
                          <span>(+) Comisiones espejo de proyectistas: <strong>{formatCurrency(sectionCalculation.projectorBonusMxn)}</strong></span>
                        ) : null}
                        <span>Comisiones totales: <strong>{formatCurrency(sectionCalculation.totalCommissionsMxn)}</strong></span>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : (
          <section className="panel">
            <div className="centered-inline-message">
              No tienes asignado un rol de comisiones o no cuentas con permisos para esta pestana.
            </div>
          </section>
        )
      ) : null}

      {activeTab === "receivers" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Receptores de comisiones</h2>
            <span>{receivers.length} registros</span>
          </div>

          {canWriteCommissions ? (
          <div className="commissions-receiver-form">
            <label className="form-field commissions-receiver-input">
              <span>Nuevo receptor</span>
              <input
                type="text"
                value={newReceiverName}
                onChange={(event) => setNewReceiverName(event.target.value)}
                placeholder="Ej. Juan Perez o un puesto"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateReceiver();
                  }
                }}
              />
            </label>
            <button className="primary-button" type="button" onClick={() => void handleCreateReceiver()} disabled={savingReceiver || !newReceiverName.trim()}>
              {savingReceiver ? "Guardando..." : "Agregar receptor"}
            </button>
          </div>
          ) : null}

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre / Puesto</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {receivers.length === 0 ? (
                  <tr>
                    <td colSpan={2}>No hay receptores registrados.</td>
                  </tr>
                ) : (
                  receivers.map((receiver) => (
                    <tr key={receiver.id}>
                      <td>
                        {editingReceiverId === receiver.id ? (
                          <input
                            value={editingReceiverName}
                            onChange={(event) => setEditingReceiverName(event.target.value)}
                            className="commissions-inline-input"
                            autoFocus
                          />
                        ) : (
                          receiver.name
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          {!canWriteCommissions ? (
                            <span className="muted">Solo lectura</span>
                          ) : editingReceiverId === receiver.id ? (
                            <>
                              <button className="primary-button" type="button" onClick={() => void handleUpdateReceiver()} disabled={savingReceiver}>
                                Guardar
                              </button>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setEditingReceiverId(null);
                                  setEditingReceiverName("");
                                }}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setEditingReceiverId(receiver.id);
                                  setEditingReceiverName(receiver.name);
                                }}
                              >
                                Editar
                              </button>
                              <button className="danger-button" type="button" onClick={() => void handleDeleteReceiver(receiver.id)} disabled={savingReceiver}>
                                Borrar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "snapshots" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Estampas de comisiones</h2>
            <span>{loadingSnapshots ? "Cargando..." : `${snapshotCards.length} registros`}</span>
          </div>

          {loadingSnapshots ? <div className="centered-inline-message">Cargando estampas...</div> : null}

          {!loadingSnapshots ? (
            <div className="commissions-snapshot-grid">
              {snapshotCards.length === 0 ? (
                <article className="commissions-snapshot-card is-empty">
                  <p className="muted">No hay estampas guardadas aun.</p>
                </article>
              ) : (
                snapshotCards.map((snapshot) => {
                  const data = snapshot.snapshotData as CommissionSnapshotData | undefined;
                  const totals = data ? getSnapshotCommissionTotals(data) : null;

                  return (
                    <article key={snapshot.id} className="commissions-snapshot-card">
                      <div className="commissions-snapshot-head">
                        <strong>{snapshot.title}</strong>
                        <span>ID: {snapshot.id}</span>
                      </div>

                      <div className="commissions-snapshot-total">{formatCurrency(snapshot.totalNetMxn)}</div>
                      <div className="commissions-snapshot-meta">
                        <span>Seccion: {snapshot.section}</span>
                        <span>
                          Periodo: {MONTH_NAMES[snapshot.month - 1]} {snapshot.year}
                        </span>
                        <span>Guardado: {formatDate(snapshot.createdAt)}</span>
                      </div>

                      {data ? (
                        <>
                          <div className="commissions-snapshot-financials">
                            <span>Grupo 1 bruto: <strong>{formatCurrency(totals?.group1GrossMxn ?? 0)}</strong></span>
                            <span>Deduccion: <strong>-{formatCurrency(data.deductionMxn)}</strong></span>
                            <span>Total: <strong>{formatCurrency(totals?.totalCommissionsMxn ?? snapshot.totalNetMxn)}</strong></span>
                          </div>
                          <div className="commissions-snapshot-breakdown">
                            <span><strong>{formatCurrency(totals?.group1NetMxn ?? 0)}</strong> Neto Grupo 1 ({data.executionRecords.length})</span>
                            <span><strong>{formatCurrency(totals?.group2TotalMxn ?? 0)}</strong> Cliente ({data.clientRecords.length})</span>
                            <span><strong>{formatCurrency(totals?.group3TotalMxn ?? 0)}</strong> Cierre ({data.closingRecords.length})</span>
                          </div>
                        </>
                      ) : (
                        <div className="commissions-snapshot-breakdown">
                          <span>Reg. Finanzas: 0</span>
                          <span>Gastos Gral.: 0</span>
                          <span>Reg. Manuales: 0</span>
                        </div>
                      )}

                      {data ? (
                        <button className="secondary-button" type="button" onClick={() => setViewingSnapshot(snapshot)}>
                          Ver detalle
                        </button>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {viewingSnapshot ? <SnapshotDetailModal snapshot={viewingSnapshot} onClose={() => setViewingSnapshot(null)} /> : null}
      {commissionReceiptDraft ? (
        <CommissionReceiptModal draft={commissionReceiptDraft} onClose={() => setCommissionReceiptDraft(null)} />
      ) : null}
    </section>
  );
}
