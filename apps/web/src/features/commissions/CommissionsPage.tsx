import { useEffect, useMemo, useState } from "react";
import type {
  Client,
  CommissionBreakdownEntry,
  CommissionExclusion,
  CommissionGroup1TeamBreakdown,
  CommissionReceiver,
  CommissionSnapshot,
  CommissionSnapshotData,
  FinanceRecord,
  FinanceRecordStats,
  GeneralExpense
} from "@sige/contracts";
import { COMMISSION_SECTIONS } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canWriteModule, hasPermission } from "../auth/permissions";

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
  exclusions: CommissionExclusion[];
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
  group1TeamBreakdowns: CommissionGroup1TeamBreakdown[];
  highlightedCount: number;
  group1GrossMxn: number;
  group1NetMxn: number;
  group1PayableMxn: number;
  group2TotalMxn: number;
  group3TotalMxn: number;
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
  group1TeamBreakdowns: [],
  highlightedCount: 0,
  group1GrossMxn: 0,
  group1NetMxn: 0,
  group1PayableMxn: 0,
  group2TotalMxn: 0,
  group3TotalMxn: 0,
  totalCommissionsMxn: 0,
  grossTotalMxn: 0,
  deductionRate: 0,
  deductionBaseMxn: 0,
  deductionMxn: 0,
  netTotalMxn: 0
};
const EMPTY_TOTALS_RECEIVER_EXCLUSION_KEYS = new Set<string>();
const CLIENT_RELATIONS_COMMISSION_SECTION = "Comunicacion con cliente";
const SALES_COMMISSION_SECTION = "Ventas";
const SALES_COMMISSION_RATE = 0.01;
const COMMISSION_TOTALS_SECTION = "Totales de comisiones";
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

function canManageCommissionExclusions(user: ReturnType<typeof useAuth>["user"]) {
  const canWriteCommissionExclusions = Boolean(user?.permissions?.includes("commissions:exclusions:write"));

  return canWriteCommissionExclusions || (hasSuperadminAccess(user) && isEduardoRusconiUser(user));
}

function canManageCommissionTotalsReceiverExclusions(user: ReturnType<typeof useAuth>["user"]) {
  return hasSuperadminAccess(user) && isEduardoRusconiUser(user);
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
  const totalCommissionsMxn = data.totalCommissionsMxn ?? data.netTotalMxn ?? (
    group1PayableMxn +
    group2TotalMxn +
    group3TotalMxn
  );

  return {
    group1GrossMxn,
    group1NetMxn,
    group1PayableMxn,
    group2TotalMxn,
    group3TotalMxn,
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
  exclusions: CommissionExclusion[]
): SectionCalculation {
  if (!section) {
    return EMPTY_CALCULATION;
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
  const grossTotalMxn = group1GrossMxn + group2TotalMxn + group3TotalMxn;
  const totalCommissionsMxn = group1PayableMxn + group2TotalMxn + group3TotalMxn;

  return {
    financeRecords: computedRecords,
    executionRecords,
    clientRecords,
    closingRecords,
    group1TeamBreakdowns,
    highlightedCount: computedRecords.filter((record) => record.highlighted).length,
    group1GrossMxn,
    group1NetMxn,
    group1PayableMxn,
    group2TotalMxn,
    group3TotalMxn,
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

function CommissionTotalsTable(props: {
  rows: CommissionTotalsRow[];
  year: number;
  month: number;
  excludedReceiverKeys: Set<string>;
  canManageReceiverExclusions: boolean;
  onToggleReceiverExclusion: (section: string, excluded: boolean) => void;
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

              return (
                <tr className={excluded ? "commissions-row-excluded" : undefined} key={row.section}>
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
                            onChange={(event) => props.onToggleReceiverExclusion(row.section, event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                      ) : null}
                      <span className={excluded ? "commissions-amount-excluded" : undefined}>{row.section}</span>
                    </div>
                  </td>
                  <td className="commissions-total-strong">
                    <span className={excluded ? "commissions-amount-excluded" : undefined}>
                      {formatCurrency(row.calculation.totalCommissionsMxn)}
                    </span>
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
          </tfoot>
        </table>
      </div>
    </section>
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
                    label="Deduccion por gastos"
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
              <CurrencyMetricCard
                label="Comisiones totales"
                value={totals?.totalCommissionsMxn ?? 0}
                accentClass="is-success"
              />
            </div>

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
  const [clients, setClients] = useState<Client[]>([]);
  const [snapshots, setSnapshots] = useState<CommissionSnapshot[]>([]);
  const [exclusions, setExclusions] = useState<CommissionExclusion[]>([]);
  const [savingExclusionKeys, setSavingExclusionKeys] = useState<Set<string>>(new Set());
  const [excludedTotalsReceiverKeys, setExcludedTotalsReceiverKeys] = useState<Set<string>>(new Set());
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
  const canWriteCommissions = canWriteModule(user, "commissions");
  const canReadAllCommissions = canWriteCommissions || hasPermission(user, "commissions:all:read");
  const canWriteClientRelationsCommissions = hasPermission(user, "commissions:client-relations:write");
  const canWriteOwnCommissionSection = hasPermission(user, "commissions:own-section:write");
  const canReadClients = hasPermission(user, "clients:read");
  const canManageExclusions = canManageCommissionExclusions(user);
  const canManageTotalsReceiverExclusions = canManageCommissionTotalsReceiverExclusions(user);
  const isLegalFlow = isLegalFlowTenant(user);
  const availableCommissionSections = useMemo(
    () => isLegalFlow ? [...LEGALFLOW_COMMISSION_SECTIONS] : [...COMMISSION_SECTIONS],
    [isLegalFlow]
  );

  const visibleSections = useMemo(() => {
    const userRole = normalizeText(user?.specificRole);

    if (canReadAllCommissions || user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN") {
      return isLegalFlow ? availableCommissionSections : [...availableCommissionSections, COMMISSION_TOTALS_SECTION];
    }

    if (canWriteClientRelationsCommissions) {
      return availableCommissionSections.filter(
        (section) => normalizeText(section) === normalizeText(CLIENT_RELATIONS_COMMISSION_SECTION)
      );
    }

    return availableCommissionSections.filter((section) => normalizeText(section) === userRole);
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
      setExclusions(overview.exclusions ?? []);
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
    () => calculateSection(financeRecords, generalExpenses, clients, activeSection, selectedYear, selectedMonth, exclusions),
    [activeSection, clients, exclusions, financeRecords, generalExpenses, selectedMonth, selectedYear]
  );
  const commissionTotalsRows = useMemo<CommissionTotalsRow[]>(() => {
    if (!isTotalsActiveSection) {
      return [];
    }

    return availableCommissionSections
      .filter((section) => normalizeText(section) !== normalizeText("Direccion general"))
      .map((section) => ({
        section,
        calculation: calculateSection(financeRecords, generalExpenses, clients, section, selectedYear, selectedMonth, exclusions)
      }));
  }, [
    availableCommissionSections,
    clients,
    exclusions,
    financeRecords,
    generalExpenses,
    isTotalsActiveSection,
    selectedMonth,
    selectedYear
  ]);
  const effectiveExcludedTotalsReceiverKeys = canManageTotalsReceiverExclusions
    ? excludedTotalsReceiverKeys
    : EMPTY_TOTALS_RECEIVER_EXCLUSION_KEYS;
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
        totalCommissionsMxn: acc.totalCommissionsMxn + row.calculation.totalCommissionsMxn
      }),
      {
        group1PayableMxn: 0,
        group2TotalMxn: 0,
        group3TotalMxn: 0,
        totalCommissionsMxn: 0
      }
    ),
    [includedCommissionTotalsRows]
  );

  function handleToggleCommissionTotalsReceiverExclusion(section: string, excluded: boolean) {
    if (!canManageTotalsReceiverExclusions) {
      return;
    }

    const exclusionKey = buildCommissionTotalsReceiverExclusionKey({
      year: selectedYear,
      month: selectedMonth,
      section
    });

    setExcludedTotalsReceiverKeys((current) => {
      const next = new Set(current);

      if (excluded) {
        next.add(exclusionKey);
      } else {
        next.delete(exclusionKey);
      }

      return next;
    });
  }

  async function handleToggleCommissionExclusion(row: CommissionBreakdownEntry, excluded: boolean) {
    if (!canManageExclusions || !activeSection) {
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
      group1TeamBreakdowns: sectionCalculation.group1TeamBreakdowns,
      group1GrossMxn: sectionCalculation.group1GrossMxn,
      group1NetMxn: sectionCalculation.group1NetMxn,
      group1PayableMxn: sectionCalculation.group1PayableMxn,
      group2TotalMxn: sectionCalculation.group2TotalMxn,
      group3TotalMxn: sectionCalculation.group3TotalMxn,
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
  const shouldShowDeductionPanel = Boolean(activeSection && normalizeText(activeSection) !== normalizeText("Direccion general"));
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
                          label="Deduccion por gastos"
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
                  canManageReceiverExclusions={canManageTotalsReceiverExclusions}
                  onToggleReceiverExclusion={handleToggleCommissionTotalsReceiverExclusion}
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
                      canManageExclusions={canManageExclusions}
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
                      canManageExclusions={canManageExclusions}
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
                      canManageExclusions={canManageExclusions}
                      savingExclusionKeys={savingExclusionKeys}
                      year={selectedYear}
                      month={selectedMonth}
                      section={activeSection}
                      onToggleExclusion={handleToggleCommissionExclusion}
                    />
                  </div>

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
    </section>
  );
}
