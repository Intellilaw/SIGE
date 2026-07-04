import { Prisma, type PrismaClient } from "@prisma/client";
import type { ContractSignedStatus, FinanceRecord, FinanceRecordStats, FinanceSnapshotData, Matter, QuoteType } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { attachSalesCommissionsToFinanceRecords } from "./finance-sales-commissions";
import { mapCommissionReceiver, mapFinanceRecord, mapFinanceSnapshot } from "./mappers";
import type { FinanceRecordWriteRecord, FinanceRepository } from "./types";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

type FinanceMatterProjection = Pick<
  Matter,
  | "id"
  | "clientNumber"
  | "clientName"
  | "quoteNumber"
  | "matterType"
  | "subject"
  | "commissionAssignee"
  | "responsibleTeam"
  | "nextPaymentDate"
  | "totalFeesMxn"
  | "milestone"
  | "concluded"
>;

type PercentagePayload = Pick<
  Prisma.FinanceRecordUncheckedUpdateInput,
  "pctLitigation" | "pctCorporateLabor" | "pctSettlements" | "pctFinancialLaw" | "pctTaxCompliance"
>;

const VALID_CONTRACT_STATUS = new Set<ContractSignedStatus>(["YES", "NO", "NOT_REQUIRED"]);
const VALID_PAYMENT_METHODS = new Set<FinanceRecord["paymentMethod"]>(["blank", "T", "E"]);
const VALID_DELINQUENCY_STATUSES = new Set<FinanceRecord["delinquencyStatus"]>([
  "CURRENT",
  "DAYS_1_TO_10",
  "MORE_THAN_10",
  "MORE_THAN_20",
  "MORE_THAN_30"
]);
const FINANCE_RECORD_BASE_SELECT = {
  id: true,
  year: true,
  month: true,
  clientNumber: true,
  clientName: true,
  quoteNumber: true,
  matterType: true,
  subject: true,
  contractSignedStatus: true,
  responsibleTeam: true,
  totalMatterMxn: true,
  workingConcepts: true,
  conceptFeesMxn: true,
  previousPaymentsMxn: true,
  nextPaymentDate: true,
  nextPaymentNotes: true,
  delinquencyStatus: true,
  paidThisMonthMxn: true,
  payment2Mxn: true,
  payment3Mxn: true,
  paymentDate1: true,
  paymentDate2: true,
  paymentDate3: true,
  paymentMethod: true,
  paymentMethod2: true,
  paymentMethod3: true,
  paymentReceived: true,
  paymentReceived2: true,
  paymentReceived3: true,
  expenseNotes1: true,
  expenseNotes2: true,
  expenseNotes3: true,
  expenseAmount1Mxn: true,
  expenseAmount2Mxn: true,
  expenseAmount3Mxn: true,
  pctLitigation: true,
  pctCorporateLabor: true,
  pctSettlements: true,
  pctFinancialLaw: true,
  pctTaxCompliance: true,
  clientCommissionRecipient: true,
  closingCommissionRecipient: true,
  milestone: true,
  concluded: true,
  financeComments: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.FinanceRecordSelect;
const FINANCE_RECORD_WITH_PERIOD_SELECT = {
  ...FINANCE_RECORD_BASE_SELECT,
  periodYear: true,
  periodMonth: true
} satisfies Prisma.FinanceRecordSelect;
const FINANCE_RECORD_WITH_COLLECTION_PROBABILITY_SELECT = {
  ...FINANCE_RECORD_BASE_SELECT,
  highCollectionProbability: true,
  lowCollectionProbability: true
} satisfies Prisma.FinanceRecordSelect;
const FINANCE_RECORD_WITH_PERIOD_AND_COLLECTION_PROBABILITY_SELECT = {
  ...FINANCE_RECORD_WITH_PERIOD_SELECT,
  highCollectionProbability: true,
  lowCollectionProbability: true
} satisfies Prisma.FinanceRecordSelect;

type FinanceRecordMapInput = Parameters<typeof mapFinanceRecord>[0];
type FinanceRecordMapInputWithOptionalFields = Omit<
  FinanceRecordMapInput,
  "periodYear" | "periodMonth" | "highCollectionProbability" | "lowCollectionProbability"
> &
  Partial<
    Pick<
      FinanceRecordMapInput,
      "periodYear" | "periodMonth" | "highCollectionProbability" | "lowCollectionProbability"
    >
  >;

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value?: string | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeRequiredText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeContractSignedStatus(value?: string | null): ContractSignedStatus {
  const normalized = normalizeComparableText(value);

  if (normalized === "yes" || normalized === "si" || normalized === "s") {
    return "YES";
  }
  if (normalized === "not_required" || normalized === "no es necesario" || normalized === "no_es_necesario") {
    return "NOT_REQUIRED";
  }
  if (VALID_CONTRACT_STATUS.has(value as ContractSignedStatus)) {
    return value as ContractSignedStatus;
  }

  return "NO";
}

function normalizeFinancePaymentMethod(value?: string | null): FinanceRecord["paymentMethod"] {
  if (value === "E_RECEIVED" || value === "E_PENDING") {
    return "E";
  }

  return VALID_PAYMENT_METHODS.has(value as FinanceRecord["paymentMethod"])
    ? (value as FinanceRecord["paymentMethod"])
    : "blank";
}

function normalizeDelinquencyStatus(value?: string | null): FinanceRecord["delinquencyStatus"] {
  return VALID_DELINQUENCY_STATUSES.has(value as FinanceRecord["delinquencyStatus"])
    ? (value as FinanceRecord["delinquencyStatus"])
    : "CURRENT";
}

function isPaymentReceived(method?: FinanceRecord["paymentMethod"] | null, received?: boolean | null) {
  return method === "T" || (method === "E" && received === true);
}

function normalizePaymentReceived(method?: FinanceRecord["paymentMethod"] | null, received?: boolean | null) {
  return method === "E" && received === true;
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

function hasOwn<T extends object>(payload: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function assertUnlockedReceivedPaymentFields(
  currentRecord: {
    paymentReceived: boolean;
    paymentReceived2: boolean;
    paymentReceived3: boolean;
  },
  payload: FinanceRecordWriteRecord
) {
  const lockedPayments: Array<{
    locked: boolean;
    fields: Array<keyof FinanceRecordWriteRecord>;
  }> = [
    { locked: currentRecord.paymentReceived, fields: ["paidThisMonthMxn", "paymentDate1", "paymentMethod"] },
    { locked: currentRecord.paymentReceived2, fields: ["payment2Mxn", "paymentDate2", "paymentMethod2"] },
    { locked: currentRecord.paymentReceived3, fields: ["payment3Mxn", "paymentDate3", "paymentMethod3"] }
  ];

  const hasLockedFieldUpdate = lockedPayments.some((payment) =>
    payment.locked && payment.fields.some((field) => hasOwn(payload, field))
  );

  if (hasLockedFieldUpdate) {
    throw new AppError(
      409,
      "FINANCE_RECEIVED_PAYMENT_LOCKED",
      "This payment was marked as received and its amount, date and payment method are locked."
    );
  }
}

function parseDateValue(value?: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "INVALID_DATE", `Invalid date value: ${value}`);
  }

  return date;
}

function toDateKey(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

function toDecimal(value?: number | null) {
  return new Prisma.Decimal(value ?? 0);
}

function roundCurrencyValue(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeFinancePeriodYear(value?: number | null) {
  return typeof value === "number" && Number.isInteger(value) && value >= 2024 && value <= 2030 ? value : null;
}

function normalizeFinancePeriodMonth(value?: number | null) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

function getFinancePeriodData(input: {
  matterType?: FinanceRecord["matterType"] | null;
  year: number;
  month: number;
  periodYear?: number | null;
  periodMonth?: number | null;
}) {
  if (input.matterType !== "RETAINER") {
    return {
      periodYear: null,
      periodMonth: null
    } satisfies Pick<Prisma.FinanceRecordUncheckedCreateInput, "periodYear" | "periodMonth">;
  }

  return {
    periodYear: normalizeFinancePeriodYear(input.periodYear) ?? normalizeFinancePeriodYear(input.year) ?? 2024,
    periodMonth: normalizeFinancePeriodMonth(input.periodMonth) ?? normalizeFinancePeriodMonth(input.month) ?? 1
  } satisfies Pick<Prisma.FinanceRecordUncheckedCreateInput, "periodYear" | "periodMonth">;
}

function normalizeFinanceWorkingConcepts(matterType?: FinanceRecord["matterType"] | null, value?: string | null) {
  return matterType === "RETAINER" ? null : normalizeOptionalText(value);
}

function getFinanceRecordSelect(includeCollectionProbability: boolean, includePeriod: boolean) {
  if (includeCollectionProbability && includePeriod) {
    return FINANCE_RECORD_WITH_PERIOD_AND_COLLECTION_PROBABILITY_SELECT;
  }
  if (includeCollectionProbability) {
    return FINANCE_RECORD_WITH_COLLECTION_PROBABILITY_SELECT;
  }
  if (includePeriod) {
    return FINANCE_RECORD_WITH_PERIOD_SELECT;
  }

  return FINANCE_RECORD_BASE_SELECT;
}

function mapFinanceRecordWithOptionalDefaults(record: FinanceRecordMapInputWithOptionalFields) {
  return mapFinanceRecord({
    ...record,
    periodYear: record.periodYear ?? null,
    periodMonth: record.periodMonth ?? null,
    highCollectionProbability: record.highCollectionProbability ?? false,
    lowCollectionProbability: record.lowCollectionProbability ?? false
  });
}

function getCollectionProbabilityCreateData(payload: FinanceRecordWriteRecord) {
  return {
    highCollectionProbability: payload.highCollectionProbability === true,
    lowCollectionProbability: payload.highCollectionProbability === true ? false : payload.lowCollectionProbability === true
  } satisfies Pick<
    Prisma.FinanceRecordUncheckedCreateInput,
    "highCollectionProbability" | "lowCollectionProbability"
  >;
}

function getDefaultPercentages(team?: FinanceRecord["responsibleTeam"] | null): PercentagePayload {
  return {
    pctLitigation: team === "LITIGATION" ? 100 : 0,
    pctCorporateLabor: team === "CORPORATE_LABOR" ? 100 : 0,
    pctSettlements: team === "SETTLEMENTS" ? 100 : 0,
    pctFinancialLaw: team === "FINANCIAL_LAW" ? 100 : 0,
    pctTaxCompliance: team === "TAX_COMPLIANCE" ? 100 : 0
  };
}

function areAllPercentagesZero(record: {
  pctLitigation: number;
  pctCorporateLabor: number;
  pctSettlements: number;
  pctFinancialLaw: number;
  pctTaxCompliance: number;
}) {
  return (
    record.pctLitigation === 0 &&
    record.pctCorporateLabor === 0 &&
    record.pctSettlements === 0 &&
    record.pctFinancialLaw === 0 &&
    record.pctTaxCompliance === 0
  );
}

function getMatterMatchKey(input: Pick<FinanceMatterProjection, "quoteNumber" | "clientName" | "subject">) {
  const quoteNumber = normalizeComparableText(input.quoteNumber);
  if (quoteNumber) {
    return `quote:${quoteNumber}`;
  }

  const clientName = normalizeComparableText(input.clientName);
  const subject = normalizeComparableText(input.subject);
  if (!clientName || !subject) {
    return null;
  }

  return `matter:${clientName}|${subject}`;
}

function getRecordMatchKey(input: { quoteNumber?: string | null; clientName?: string | null; subject?: string | null }) {
  const quoteNumber = normalizeComparableText(input.quoteNumber);
  if (quoteNumber) {
    return `quote:${quoteNumber}`;
  }

  const clientName = normalizeComparableText(input.clientName);
  const subject = normalizeComparableText(input.subject);
  if (!clientName || !subject) {
    return null;
  }

  return `matter:${clientName}|${subject}`;
}

function getMonthName(month: number) {
  return [
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
  ][month - 1] ?? String(month);
}

function calculateFinanceStats(record: FinanceRecord): FinanceRecordStats {
  const totalPaidMxn = getReceivedPaymentsMxn(record);
  const totalExpensesMxn = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
  const netFeesMxn = totalPaidMxn - totalExpensesMxn;
  const remainingMxn = record.totalMatterMxn - record.previousPaymentsMxn;
  const dueTodayMxn = record.conceptFeesMxn - totalPaidMxn;
  const futurePaymentsMxn = roundCurrencyValue(record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn);
  const totalNetDueMxn = record.totalMatterMxn - record.previousPaymentsMxn - totalPaidMxn;
  const feeBreakdownDifferenceMxn = roundCurrencyValue(
    record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn - futurePaymentsMxn
  );
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

function buildMatterMirrorPayload(matter: FinanceMatterProjection): FinanceRecordWriteRecord {
  return {
    clientNumber: matter.clientNumber ?? null,
    clientName: matter.clientName,
    quoteNumber: matter.quoteNumber ?? null,
    matterType: (matter.matterType ?? "ONE_TIME") as QuoteType,
    subject: matter.subject,
    responsibleTeam: matter.responsibleTeam ?? null,
    totalMatterMxn: matter.totalFeesMxn,
    nextPaymentDate: matter.nextPaymentDate ?? null,
    closingCommissionRecipient: matter.commissionAssignee ?? null,
    milestone: matter.milestone ?? null,
    concluded: matter.concluded
  };
}

export class PrismaFinanceRepository implements FinanceRepository {
  private collectionProbabilityColumnsAvailable?: Promise<boolean>;
  private periodColumnsAvailable?: Promise<boolean>;

  public constructor(private readonly prisma: PrismaClient) {}

  public async listRecords(year: number, month: number) {
    const [includeCollectionProbability, includePeriod] = await Promise.all([
      this.hasCollectionProbabilityColumns(),
      this.hasPeriodColumns()
    ]);
    await this.syncRecordsWithMatters(year, month, includeCollectionProbability, includePeriod);
    return this.listRecordsForMonth(year, month, includeCollectionProbability, includePeriod);
  }

  public async listRecordsReadOnly(year: number, month: number) {
    const [includeCollectionProbability, includePeriod] = await Promise.all([
      this.hasCollectionProbabilityColumns(),
      this.hasPeriodColumns()
    ]);
    return this.listRecordsForMonth(year, month, includeCollectionProbability, includePeriod);
  }

  private async listRecordsForMonth(
    year: number,
    month: number,
    includeCollectionProbability: boolean,
    includePeriod: boolean
  ) {
    const records = await this.prisma.financeRecord.findMany({
      where: { year, month },
      orderBy: [{ createdAt: "asc" }, { clientNumber: "asc" }],
      select: getFinanceRecordSelect(includeCollectionProbability, includePeriod)
    });

    return attachSalesCommissionsToFinanceRecords(this.prisma, records.map(mapFinanceRecordWithOptionalDefaults));
  }

  public async createRecord(year: number, month: number, payload: FinanceRecordWriteRecord = {}) {
    const [includeCollectionProbability, includePeriod] = await Promise.all([
      this.hasCollectionProbabilityColumns(),
      this.hasPeriodColumns()
    ]);
    const paymentMethod = normalizeFinancePaymentMethod(payload.paymentMethod);
    const paymentMethod2 = normalizeFinancePaymentMethod(payload.paymentMethod2);
    const paymentMethod3 = normalizeFinancePaymentMethod(payload.paymentMethod3);
    const matterType = payload.matterType ?? "ONE_TIME";
    const data: Prisma.FinanceRecordUncheckedCreateInput = {
      year,
      month,
      clientNumber: normalizeOptionalText(payload.clientNumber),
      clientName: normalizeRequiredText(payload.clientName),
      quoteNumber: normalizeOptionalText(payload.quoteNumber),
      matterType,
      subject: normalizeRequiredText(payload.subject),
      contractSignedStatus: normalizeContractSignedStatus(payload.contractSignedStatus),
      responsibleTeam: payload.responsibleTeam ?? null,
      totalMatterMxn: toDecimal(payload.totalMatterMxn),
      workingConcepts: normalizeFinanceWorkingConcepts(matterType, payload.workingConcepts),
      conceptFeesMxn: toDecimal(payload.conceptFeesMxn),
      previousPaymentsMxn: toDecimal(payload.previousPaymentsMxn),
      nextPaymentDate: parseDateValue(payload.nextPaymentDate),
      nextPaymentNotes: normalizeOptionalText(payload.nextPaymentNotes),
      delinquencyStatus: normalizeDelinquencyStatus(payload.delinquencyStatus),
      paidThisMonthMxn: toDecimal(payload.paidThisMonthMxn),
      payment2Mxn: toDecimal(payload.payment2Mxn),
      payment3Mxn: toDecimal(payload.payment3Mxn),
      paymentDate1: parseDateValue(payload.paymentDate1),
      paymentDate2: parseDateValue(payload.paymentDate2),
      paymentDate3: parseDateValue(payload.paymentDate3),
      paymentMethod,
      paymentMethod2,
      paymentMethod3,
      paymentReceived: normalizePaymentReceived(paymentMethod, payload.paymentReceived),
      paymentReceived2: normalizePaymentReceived(paymentMethod2, payload.paymentReceived2),
      paymentReceived3: normalizePaymentReceived(paymentMethod3, payload.paymentReceived3),
      expenseNotes1: normalizeOptionalText(payload.expenseNotes1),
      expenseNotes2: normalizeOptionalText(payload.expenseNotes2),
      expenseNotes3: normalizeOptionalText(payload.expenseNotes3),
      expenseAmount1Mxn: toDecimal(payload.expenseAmount1Mxn),
      expenseAmount2Mxn: toDecimal(payload.expenseAmount2Mxn),
      expenseAmount3Mxn: toDecimal(payload.expenseAmount3Mxn),
      pctLitigation: payload.pctLitigation ?? 0,
      pctCorporateLabor: payload.pctCorporateLabor ?? 0,
      pctSettlements: payload.pctSettlements ?? 0,
      pctFinancialLaw: payload.pctFinancialLaw ?? 0,
      pctTaxCompliance: payload.pctTaxCompliance ?? 0,
      clientCommissionRecipient: normalizeOptionalText(payload.clientCommissionRecipient),
      closingCommissionRecipient: normalizeOptionalText(payload.closingCommissionRecipient),
      milestone: normalizeOptionalText(payload.milestone),
      concluded: payload.concluded ?? false,
      financeComments: normalizeOptionalText(payload.financeComments)
    };

    if (includeCollectionProbability) {
      Object.assign(data, getCollectionProbabilityCreateData(payload));
    }
    if (includePeriod) {
      Object.assign(
        data,
        getFinancePeriodData({
          matterType: payload.matterType ?? "ONE_TIME",
          year,
          month,
          periodYear: payload.periodYear,
          periodMonth: payload.periodMonth
        })
      );
    }

    const record = await this.prisma.financeRecord.create({
      data,
      select: getFinanceRecordSelect(includeCollectionProbability, includePeriod)
    });

    const [enrichedRecord] = await attachSalesCommissionsToFinanceRecords(this.prisma, [mapFinanceRecordWithOptionalDefaults(record)]);
    return enrichedRecord;
  }

  public async updateRecord(recordId: string, payload: FinanceRecordWriteRecord) {
    const [includeCollectionProbability, includePeriod] = await Promise.all([
      this.hasCollectionProbabilityColumns(),
      this.hasPeriodColumns()
    ]);
    const currentRecord = await this.findRecordOrThrow(this.prisma, recordId, includePeriod);
    assertUnlockedReceivedPaymentFields(currentRecord, payload);

    const data: Prisma.FinanceRecordUncheckedUpdateInput = {};

    if (hasOwn(payload, "clientNumber")) {
      data.clientNumber = normalizeOptionalText(payload.clientNumber);
    }
    if (hasOwn(payload, "clientName")) {
      data.clientName = normalizeRequiredText(payload.clientName);
    }
    if (hasOwn(payload, "quoteNumber")) {
      data.quoteNumber = normalizeOptionalText(payload.quoteNumber);
    }
    if (hasOwn(payload, "matterType")) {
      data.matterType = payload.matterType ?? "ONE_TIME";
    }
    if (hasOwn(payload, "subject")) {
      data.subject = normalizeRequiredText(payload.subject);
    }
    if (hasOwn(payload, "contractSignedStatus")) {
      data.contractSignedStatus = normalizeContractSignedStatus(payload.contractSignedStatus);
    }
    if (hasOwn(payload, "responsibleTeam")) {
      data.responsibleTeam = payload.responsibleTeam ?? null;
    }
    if (hasOwn(payload, "totalMatterMxn")) {
      data.totalMatterMxn = toDecimal(payload.totalMatterMxn);
    }
    const nextMatterType = hasOwn(payload, "matterType")
      ? payload.matterType ?? "ONE_TIME"
      : (currentRecord.matterType as FinanceRecord["matterType"]);

    if (hasOwn(payload, "workingConcepts") || hasOwn(payload, "matterType")) {
      data.workingConcepts = normalizeFinanceWorkingConcepts(
        nextMatterType,
        hasOwn(payload, "workingConcepts") ? payload.workingConcepts : currentRecord.workingConcepts
      );
    }
    if (hasOwn(payload, "conceptFeesMxn")) {
      data.conceptFeesMxn = toDecimal(payload.conceptFeesMxn);
    }
    if (hasOwn(payload, "previousPaymentsMxn")) {
      data.previousPaymentsMxn = toDecimal(payload.previousPaymentsMxn);
    }
    if (hasOwn(payload, "nextPaymentDate")) {
      data.nextPaymentDate = parseDateValue(payload.nextPaymentDate);
    }
    if (hasOwn(payload, "nextPaymentNotes")) {
      data.nextPaymentNotes = normalizeOptionalText(payload.nextPaymentNotes);
    }
    if (hasOwn(payload, "delinquencyStatus")) {
      data.delinquencyStatus = normalizeDelinquencyStatus(payload.delinquencyStatus);
    }
    if (hasOwn(payload, "paidThisMonthMxn")) {
      data.paidThisMonthMxn = toDecimal(payload.paidThisMonthMxn);
    }
    if (hasOwn(payload, "payment2Mxn")) {
      data.payment2Mxn = toDecimal(payload.payment2Mxn);
    }
    if (hasOwn(payload, "payment3Mxn")) {
      data.payment3Mxn = toDecimal(payload.payment3Mxn);
    }
    if (hasOwn(payload, "paymentDate1")) {
      data.paymentDate1 = parseDateValue(payload.paymentDate1);
    }
    if (hasOwn(payload, "paymentDate2")) {
      data.paymentDate2 = parseDateValue(payload.paymentDate2);
    }
    if (hasOwn(payload, "paymentDate3")) {
      data.paymentDate3 = parseDateValue(payload.paymentDate3);
    }
    if (hasOwn(payload, "paymentMethod")) {
      data.paymentMethod = normalizeFinancePaymentMethod(payload.paymentMethod);
    }
    if (hasOwn(payload, "paymentMethod2")) {
      data.paymentMethod2 = normalizeFinancePaymentMethod(payload.paymentMethod2);
    }
    if (hasOwn(payload, "paymentMethod3")) {
      data.paymentMethod3 = normalizeFinancePaymentMethod(payload.paymentMethod3);
    }
    const nextPaymentMethod = hasOwn(payload, "paymentMethod")
      ? normalizeFinancePaymentMethod(payload.paymentMethod)
      : normalizeFinancePaymentMethod(currentRecord.paymentMethod);
    const nextPaymentMethod2 = hasOwn(payload, "paymentMethod2")
      ? normalizeFinancePaymentMethod(payload.paymentMethod2)
      : normalizeFinancePaymentMethod(currentRecord.paymentMethod2);
    const nextPaymentMethod3 = hasOwn(payload, "paymentMethod3")
      ? normalizeFinancePaymentMethod(payload.paymentMethod3)
      : normalizeFinancePaymentMethod(currentRecord.paymentMethod3);

    if (hasOwn(payload, "paymentMethod") || hasOwn(payload, "paymentReceived")) {
      data.paymentMethod = nextPaymentMethod;
      data.paymentReceived = normalizePaymentReceived(
        nextPaymentMethod,
        hasOwn(payload, "paymentReceived") ? payload.paymentReceived : currentRecord.paymentReceived
      );
    }
    if (hasOwn(payload, "paymentMethod2") || hasOwn(payload, "paymentReceived2")) {
      data.paymentMethod2 = nextPaymentMethod2;
      data.paymentReceived2 = normalizePaymentReceived(
        nextPaymentMethod2,
        hasOwn(payload, "paymentReceived2") ? payload.paymentReceived2 : currentRecord.paymentReceived2
      );
    }
    if (hasOwn(payload, "paymentMethod3") || hasOwn(payload, "paymentReceived3")) {
      data.paymentMethod3 = nextPaymentMethod3;
      data.paymentReceived3 = normalizePaymentReceived(
        nextPaymentMethod3,
        hasOwn(payload, "paymentReceived3") ? payload.paymentReceived3 : currentRecord.paymentReceived3
      );
    }
    if (hasOwn(payload, "expenseNotes1")) {
      data.expenseNotes1 = normalizeOptionalText(payload.expenseNotes1);
    }
    if (hasOwn(payload, "expenseNotes2")) {
      data.expenseNotes2 = normalizeOptionalText(payload.expenseNotes2);
    }
    if (hasOwn(payload, "expenseNotes3")) {
      data.expenseNotes3 = normalizeOptionalText(payload.expenseNotes3);
    }
    if (hasOwn(payload, "expenseAmount1Mxn")) {
      data.expenseAmount1Mxn = toDecimal(payload.expenseAmount1Mxn);
    }
    if (hasOwn(payload, "expenseAmount2Mxn")) {
      data.expenseAmount2Mxn = toDecimal(payload.expenseAmount2Mxn);
    }
    if (hasOwn(payload, "expenseAmount3Mxn")) {
      data.expenseAmount3Mxn = toDecimal(payload.expenseAmount3Mxn);
    }
    if (hasOwn(payload, "pctLitigation")) {
      data.pctLitigation = payload.pctLitigation ?? 0;
    }
    if (hasOwn(payload, "pctCorporateLabor")) {
      data.pctCorporateLabor = payload.pctCorporateLabor ?? 0;
    }
    if (hasOwn(payload, "pctSettlements")) {
      data.pctSettlements = payload.pctSettlements ?? 0;
    }
    if (hasOwn(payload, "pctFinancialLaw")) {
      data.pctFinancialLaw = payload.pctFinancialLaw ?? 0;
    }
    if (hasOwn(payload, "pctTaxCompliance")) {
      data.pctTaxCompliance = payload.pctTaxCompliance ?? 0;
    }
    if (hasOwn(payload, "clientCommissionRecipient")) {
      data.clientCommissionRecipient = normalizeOptionalText(payload.clientCommissionRecipient);
    }
    if (hasOwn(payload, "closingCommissionRecipient")) {
      data.closingCommissionRecipient = normalizeOptionalText(payload.closingCommissionRecipient);
    }
    if (includeCollectionProbability) {
      if (hasOwn(payload, "highCollectionProbability") && payload.highCollectionProbability) {
        data.highCollectionProbability = true;
        data.lowCollectionProbability = false;
      } else if (hasOwn(payload, "lowCollectionProbability") && payload.lowCollectionProbability) {
        data.highCollectionProbability = false;
        data.lowCollectionProbability = true;
      } else {
        if (hasOwn(payload, "highCollectionProbability")) {
          data.highCollectionProbability = payload.highCollectionProbability ?? false;
        }
        if (hasOwn(payload, "lowCollectionProbability")) {
          data.lowCollectionProbability = payload.lowCollectionProbability ?? false;
        }
      }
    }
    if (includePeriod && (hasOwn(payload, "periodYear") || hasOwn(payload, "periodMonth") || hasOwn(payload, "matterType"))) {
      Object.assign(
        data,
        getFinancePeriodData({
          matterType: hasOwn(payload, "matterType")
            ? nextMatterType
            : (currentRecord.matterType as FinanceRecord["matterType"]),
          year: currentRecord.year,
          month: currentRecord.month,
          periodYear: hasOwn(payload, "periodYear") ? payload.periodYear : currentRecord.periodYear,
          periodMonth: hasOwn(payload, "periodMonth") ? payload.periodMonth : currentRecord.periodMonth
        })
      );
    }
    if (hasOwn(payload, "concluded")) {
      data.concluded = payload.concluded ?? false;
    }
    if (hasOwn(payload, "financeComments")) {
      data.financeComments = normalizeOptionalText(payload.financeComments);
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.financeRecord.update({
        where: { id: recordId },
        data,
        select: getFinanceRecordSelect(includeCollectionProbability, includePeriod)
      });

      if (hasOwn(payload, "closingCommissionRecipient")) {
        await this.updateMatchedMatterCommissionAssignee(
          tx,
          currentRecord,
          normalizeOptionalText(payload.closingCommissionRecipient)
        );
      }

      return updated;
    });

    const [enrichedRecord] = await attachSalesCommissionsToFinanceRecords(this.prisma, [mapFinanceRecordWithOptionalDefaults(record)]);
    return enrichedRecord;
  }

  public async deleteRecord(recordId: string) {
    await this.findRecordOrThrow(this.prisma, recordId);
    await this.prisma.financeRecord.delete({
      where: { id: recordId },
      select: { id: true }
    });
  }

  public async bulkDelete(recordIds: string[]) {
    if (recordIds.length === 0) {
      return;
    }

    await this.prisma.financeRecord.deleteMany({
      where: {
        id: {
          in: recordIds
        }
      }
    });
  }

  public async listSnapshots() {
    const records = await this.prisma.financeSnapshot.findMany({
      orderBy: [{ createdAt: "desc" }]
    });

    return records.map(mapFinanceSnapshot);
  }

  public async createSnapshot(year: number, month: number) {
    const records = await this.listRecords(year, month);
    const enrichedRecords = records.map((record) => ({
      ...record,
      ...calculateFinanceStats(record)
    }));
    const totalIncomeMxn = enrichedRecords.reduce((sum, record) => sum + record.totalPaidMxn, 0);
    const totalExpenseMxn = enrichedRecords.reduce((sum, record) => sum + record.expenseAmount1Mxn, 0);
    const balanceMxn = totalIncomeMxn - totalExpenseMxn;
    const snapshotData: FinanceSnapshotData = { enrichedRecords };

    const snapshot = await this.prisma.financeSnapshot.create({
      data: {
        year,
        month,
        title: `Balance ${getMonthName(month)} ${year}`,
        totalIncomeMxn: toDecimal(totalIncomeMxn),
        totalExpenseMxn: toDecimal(totalExpenseMxn),
        balanceMxn: toDecimal(balanceMxn),
        snapshotData: snapshotData as unknown as Prisma.InputJsonValue
      }
    });

    return mapFinanceSnapshot(snapshot);
  }

  public async copyToNextMonth(year: number, month: number) {
    const [includeCollectionProbability, includePeriod] = await Promise.all([
      this.hasCollectionProbabilityColumns(),
      this.hasPeriodColumns()
    ]);
    const sourceRecords = await this.listRecords(year, month);

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    let copied = 0;
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      const targetRecords = await tx.financeRecord.findMany({
        where: { year: nextYear, month: nextMonth },
        select: {
          quoteNumber: true,
          clientName: true,
          subject: true
        }
      });

      const targetMatchKeys = new Set<string>();
      targetRecords.forEach((record) => {
        const matchKey = getRecordMatchKey(record);
        if (matchKey) {
          targetMatchKeys.add(matchKey);
        }
      });

      for (const record of sourceRecords) {
        const matchKey = getRecordMatchKey(record);
        if (matchKey && targetMatchKeys.has(matchKey)) {
          skipped += 1;
          continue;
        }

        const totalPaidMxn = getReceivedPaymentsMxn(record);
        const nextPreviousPaymentsMxn = record.previousPaymentsMxn + totalPaidMxn;
        const data: Prisma.FinanceRecordUncheckedCreateInput = {
          year: nextYear,
          month: nextMonth,
          clientNumber: record.clientNumber ?? null,
          clientName: record.clientName,
          quoteNumber: record.quoteNumber ?? null,
          matterType: record.matterType,
          subject: record.subject,
          contractSignedStatus: record.contractSignedStatus,
          responsibleTeam: record.responsibleTeam ?? null,
          totalMatterMxn: toDecimal(record.totalMatterMxn),
          workingConcepts: normalizeFinanceWorkingConcepts(record.matterType, record.workingConcepts),
          conceptFeesMxn: toDecimal(record.conceptFeesMxn),
          previousPaymentsMxn: toDecimal(nextPreviousPaymentsMxn),
          nextPaymentDate: parseDateValue(record.nextPaymentDate),
          nextPaymentNotes: normalizeOptionalText(record.nextPaymentNotes),
          delinquencyStatus: "CURRENT",
          paidThisMonthMxn: toDecimal(0),
          payment2Mxn: toDecimal(0),
          payment3Mxn: toDecimal(0),
          paymentDate1: null,
          paymentDate2: null,
          paymentDate3: null,
          paymentMethod: "blank",
          paymentMethod2: "blank",
          paymentMethod3: "blank",
          paymentReceived: false,
          paymentReceived2: false,
          paymentReceived3: false,
          expenseNotes1: null,
          expenseNotes2: null,
          expenseNotes3: null,
          expenseAmount1Mxn: toDecimal(0),
          expenseAmount2Mxn: toDecimal(0),
          expenseAmount3Mxn: toDecimal(0),
          pctLitigation: record.pctLitigation,
          pctCorporateLabor: record.pctCorporateLabor,
          pctSettlements: record.pctSettlements,
          pctFinancialLaw: record.pctFinancialLaw,
          pctTaxCompliance: record.pctTaxCompliance,
          clientCommissionRecipient: normalizeOptionalText(record.clientCommissionRecipient),
          closingCommissionRecipient: normalizeOptionalText(record.closingCommissionRecipient),
          milestone: normalizeOptionalText(record.milestone),
          concluded: record.concluded,
          financeComments: normalizeOptionalText(record.financeComments)
        };

        if (includeCollectionProbability) {
          data.highCollectionProbability = record.highCollectionProbability;
          data.lowCollectionProbability = record.highCollectionProbability ? false : record.lowCollectionProbability;
        }
        if (includePeriod) {
          Object.assign(
            data,
            getFinancePeriodData({
              matterType: record.matterType,
              year: nextYear,
              month: nextMonth,
              periodYear: nextYear,
              periodMonth: nextMonth
            })
          );
        }

        await tx.financeRecord.create({
          data,
          select: { id: true }
        });

        if (matchKey) {
          targetMatchKeys.add(matchKey);
        }
        copied += 1;
      }
    });

    return {
      year: nextYear,
      month: nextMonth,
      copied,
      skipped
    };
  }

  public async sendMatterToFinance(matterId: string, year: number, month: number) {
    const [includeCollectionProbability, includePeriod] = await Promise.all([
      this.hasCollectionProbabilityColumns(),
      this.hasPeriodColumns()
    ]);
    const matter = await this.findMatterProjectionOrThrow(this.prisma, matterId);
    const matterPayload = buildMatterMirrorPayload(matter);
    const isRetainer = matter.matterType === "RETAINER";

    const existing = await this.findExistingUniqueRecord(this.prisma, year, month, matter);
    if (existing) {
      const data: Prisma.FinanceRecordUncheckedUpdateInput = {
        clientNumber: normalizeOptionalText(matterPayload.clientNumber),
        clientName: normalizeRequiredText(matterPayload.clientName),
        quoteNumber: normalizeOptionalText(matterPayload.quoteNumber),
        matterType: matterPayload.matterType ?? "ONE_TIME",
        ...(matterPayload.matterType === "RETAINER" ? { workingConcepts: null } : {}),
        subject: normalizeRequiredText(matterPayload.subject),
        responsibleTeam: matterPayload.responsibleTeam ?? null,
        totalMatterMxn: toDecimal(matterPayload.totalMatterMxn),
        nextPaymentDate: parseDateValue(matterPayload.nextPaymentDate),
        milestone: normalizeOptionalText(matterPayload.milestone),
        concluded: matterPayload.concluded ?? false
      };
      const record = await this.prisma.financeRecord.update({
        where: { id: existing.id },
        data,
        select: getFinanceRecordSelect(includeCollectionProbability, includePeriod)
      });

      const [enrichedRecord] = await attachSalesCommissionsToFinanceRecords(this.prisma, [mapFinanceRecordWithOptionalDefaults(record)]);
      return enrichedRecord;
    }

    const percentages = isRetainer ? getDefaultPercentages(undefined) : getDefaultPercentages(matter.responsibleTeam);
    const data: Prisma.FinanceRecordUncheckedCreateInput = {
      year,
      month,
      clientNumber: normalizeOptionalText(matterPayload.clientNumber),
      clientName: normalizeRequiredText(matterPayload.clientName),
      quoteNumber: normalizeOptionalText(matterPayload.quoteNumber),
      matterType: matterPayload.matterType ?? "ONE_TIME",
      workingConcepts: normalizeFinanceWorkingConcepts(matterPayload.matterType ?? "ONE_TIME", null),
      subject: normalizeRequiredText(matterPayload.subject),
      contractSignedStatus: "NO",
      responsibleTeam: matterPayload.responsibleTeam ?? null,
      totalMatterMxn: toDecimal(matterPayload.totalMatterMxn),
      nextPaymentDate: parseDateValue(matterPayload.nextPaymentDate),
      pctLitigation: percentages.pctLitigation as number,
      pctCorporateLabor: percentages.pctCorporateLabor as number,
      pctSettlements: percentages.pctSettlements as number,
      pctFinancialLaw: percentages.pctFinancialLaw as number,
      pctTaxCompliance: percentages.pctTaxCompliance as number,
      closingCommissionRecipient: normalizeOptionalText(matterPayload.closingCommissionRecipient),
      milestone: normalizeOptionalText(matterPayload.milestone),
      concluded: matterPayload.concluded ?? false
    };
    if (includePeriod) {
      Object.assign(
        data,
        getFinancePeriodData({
          matterType: matterPayload.matterType ?? "ONE_TIME",
          year,
          month,
          periodYear: year,
          periodMonth: month
        })
      );
    }

    const record = await this.prisma.financeRecord.create({
      data,
      select: getFinanceRecordSelect(includeCollectionProbability, includePeriod)
    });

    const [enrichedRecord] = await attachSalesCommissionsToFinanceRecords(this.prisma, [mapFinanceRecordWithOptionalDefaults(record)]);
    return enrichedRecord;
  }

  public async listCommissionReceivers() {
    const records = await this.prisma.commissionReceiver.findMany({
      where: { active: true },
      orderBy: [{ name: "asc" }]
    });

    return records.map(mapCommissionReceiver);
  }

  private async hasCollectionProbabilityColumns() {
    this.collectionProbabilityColumnsAvailable ??= this.prisma
      .$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'FinanceRecord'
          AND column_name IN ('highCollectionProbability', 'lowCollectionProbability')
      `
      .then((rows) => rows.length === 2);

    return this.collectionProbabilityColumnsAvailable;
  }

  private async hasPeriodColumns() {
    this.periodColumnsAvailable ??= this.prisma
      .$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'FinanceRecord'
          AND column_name IN ('periodYear', 'periodMonth')
      `
      .then((rows) => rows.length === 2);

    return this.periodColumnsAvailable;
  }

  private async syncRecordsWithMatters(
    year: number,
    month: number,
    includeCollectionProbability: boolean,
    includePeriod: boolean
  ) {
    const [records, matters] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where: { year, month },
        orderBy: [{ createdAt: "asc" }],
        select: getFinanceRecordSelect(includeCollectionProbability, includePeriod)
      }),
      this.prisma.matter.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          clientNumber: true,
          clientName: true,
          quoteNumber: true,
          matterType: true,
          subject: true,
          commissionAssignee: true,
          responsibleTeam: true,
          nextPaymentDate: true,
          milestone: true,
          concluded: true,
          deletedAt: true,
          totalFeesMxn: true
        }
      })
    ]);

    const matterLookup = new Map<string, FinanceMatterProjection>();
    matters.forEach((matter) => {
      const projection: FinanceMatterProjection = {
        id: matter.id,
        clientNumber: matter.clientNumber ?? undefined,
        clientName: matter.clientName,
        quoteNumber: matter.quoteNumber ?? undefined,
        matterType: (matter.matterType ?? "ONE_TIME") as QuoteType,
        subject: matter.subject,
        commissionAssignee: matter.commissionAssignee ?? undefined,
        responsibleTeam: matter.responsibleTeam as Matter["responsibleTeam"],
        nextPaymentDate: matter.nextPaymentDate?.toISOString(),
        milestone: matter.milestone ?? undefined,
        concluded: matter.concluded,
        totalFeesMxn: Number(matter.totalFeesMxn)
      };
      const matchKey = getMatterMatchKey(projection);
      if (matchKey && !matterLookup.has(matchKey)) {
        matterLookup.set(matchKey, projection);
      }
    });

    const updates: Array<{ id: string; data: Prisma.FinanceRecordUncheckedUpdateInput }> = [];

    records.forEach((record) => {
      const mapped = mapFinanceRecordWithOptionalDefaults(record);
      const staleRetainerWorkingConcepts =
        mapped.matterType === "RETAINER" && normalizeOptionalText(record.workingConcepts) !== null;
      const matchKey = getRecordMatchKey(mapped);
      if (!matchKey) {
        if (staleRetainerWorkingConcepts) {
          updates.push({
            id: record.id,
            data: { workingConcepts: null }
          });
        }
        return;
      }

      const matter = matterLookup.get(matchKey);
      if (!matter) {
        if (staleRetainerWorkingConcepts) {
          updates.push({
            id: record.id,
            data: { workingConcepts: null }
          });
        }
        return;
      }

      const nextMatterType = (matter.matterType ?? "ONE_TIME") as FinanceRecord["matterType"];
      const isRetainer = mapped.matterType === "RETAINER";
      const nextIsRetainer = nextMatterType === "RETAINER";
      const nextWorkingConcepts = normalizeFinanceWorkingConcepts(nextMatterType, record.workingConcepts);
      const needsWorkingConceptsUpdate = normalizeOptionalText(record.workingConcepts) !== nextWorkingConcepts;
      const needsPeriodDefault =
        includePeriod &&
        ((nextIsRetainer && (!mapped.periodYear || !mapped.periodMonth)) ||
          (!nextIsRetainer && (Boolean(mapped.periodYear) || Boolean(mapped.periodMonth))));
      const nextPercentages = !isRetainer && areAllPercentagesZero(record)
        ? getDefaultPercentages(matter.responsibleTeam)
        : null;

      const teamMismatch = !isRetainer && (record.responsibleTeam ?? null) !== (matter.responsibleTeam ?? null);
      const needsUpdate =
        normalizeComparableText(record.clientName) !== normalizeComparableText(matter.clientName) ||
        normalizeComparableText(record.subject) !== normalizeComparableText(matter.subject) ||
        normalizeComparableText(record.quoteNumber) !== normalizeComparableText(matter.quoteNumber) ||
        normalizeComparableText(record.clientNumber) !== normalizeComparableText(matter.clientNumber) ||
        record.matterType !== nextMatterType ||
        teamMismatch ||
        Number(record.totalMatterMxn) !== matter.totalFeesMxn ||
        toDateKey(record.nextPaymentDate) !== toDateKey(matter.nextPaymentDate) ||
        needsWorkingConceptsUpdate ||
        normalizeComparableText(record.milestone) !== normalizeComparableText(matter.milestone) ||
        record.concluded !== matter.concluded ||
        needsPeriodDefault ||
        nextPercentages !== null;

      if (!needsUpdate) {
        return;
      }

      const data: Prisma.FinanceRecordUncheckedUpdateInput = {
        clientNumber: normalizeOptionalText(matter.clientNumber),
        clientName: normalizeRequiredText(matter.clientName),
        quoteNumber: normalizeOptionalText(matter.quoteNumber),
        matterType: nextMatterType,
        workingConcepts: nextWorkingConcepts,
        subject: normalizeRequiredText(matter.subject),
        totalMatterMxn: toDecimal(matter.totalFeesMxn),
        nextPaymentDate: parseDateValue(matter.nextPaymentDate),
        milestone: normalizeOptionalText(matter.milestone),
        concluded: matter.concluded
      };

      if (!isRetainer) {
        data.responsibleTeam = matter.responsibleTeam ?? null;
      }

      if (nextPercentages) {
        Object.assign(data, nextPercentages);
      }
      if (needsPeriodDefault) {
        Object.assign(
          data,
          getFinancePeriodData({
            matterType: nextMatterType,
            year,
            month,
            periodYear: mapped.periodYear,
            periodMonth: mapped.periodMonth
          })
        );
      }

      updates.push({
        id: record.id,
        data
      });
    });

    if (updates.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.financeRecord.update({
          where: { id: update.id },
          data: update.data,
          select: { id: true }
        })
      )
    );
  }

  private async findExistingUniqueRecord(prisma: PrismaExecutor, year: number, month: number, matter: FinanceMatterProjection) {
    const normalizedQuoteNumber = normalizeOptionalText(matter.quoteNumber);

    if (normalizedQuoteNumber) {
      return prisma.financeRecord.findFirst({
        where: {
          year,
          month,
          quoteNumber: {
            equals: normalizedQuoteNumber,
            mode: "insensitive"
          }
        },
        select: { id: true }
      });
    }

    return prisma.financeRecord.findFirst({
      where: {
        year,
        month,
        clientName: {
          equals: normalizeRequiredText(matter.clientName),
          mode: "insensitive"
        },
        subject: {
          equals: normalizeRequiredText(matter.subject),
          mode: "insensitive"
        }
      },
      select: { id: true }
    });
  }

  private async findRecordOrThrow(prisma: PrismaExecutor, recordId: string, includePeriod = false) {
    const select = {
      id: true,
      year: true,
      month: true,
      quoteNumber: true,
      clientName: true,
      matterType: true,
      workingConcepts: true,
      subject: true,
      paymentMethod: true,
      paymentMethod2: true,
      paymentMethod3: true,
      paymentReceived: true,
      paymentReceived2: true,
      paymentReceived3: true,
      ...(includePeriod
        ? {
            periodYear: true,
            periodMonth: true
          }
        : {})
    } satisfies Prisma.FinanceRecordSelect;
    const record = await prisma.financeRecord.findUnique({
      where: { id: recordId },
      select
    });

    if (!record) {
      throw new AppError(404, "FINANCE_RECORD_NOT_FOUND", "The requested finance record does not exist.");
    }

    return record;
  }

  private async updateMatchedMatterCommissionAssignee(
    prisma: PrismaExecutor,
    record: { quoteNumber?: string | null; clientName?: string | null; subject?: string | null },
    commissionAssignee: string | null
  ) {
    const quoteNumber = normalizeOptionalText(record.quoteNumber);
    if (quoteNumber) {
      await prisma.matter.updateMany({
        where: {
          deletedAt: null,
          quoteNumber: {
            equals: quoteNumber,
            mode: "insensitive"
          }
        },
        data: { commissionAssignee }
      });
      return;
    }

    await prisma.matter.updateMany({
      where: {
        deletedAt: null,
        clientName: {
          equals: normalizeRequiredText(record.clientName),
          mode: "insensitive"
        },
        subject: {
          equals: normalizeRequiredText(record.subject),
          mode: "insensitive"
        }
      },
      data: { commissionAssignee }
    });
  }

  private async findMatterProjectionOrThrow(prisma: PrismaExecutor, matterId: string): Promise<FinanceMatterProjection> {
    const matter = await prisma.matter.findUnique({
      where: { id: matterId }
    });

    if (!matter || matter.deletedAt) {
      throw new AppError(404, "MATTER_NOT_FOUND", "The requested matter does not exist.");
    }

    return {
      id: matter.id,
      clientNumber: matter.clientNumber ?? undefined,
      clientName: matter.clientName,
      quoteNumber: matter.quoteNumber ?? undefined,
      matterType: matter.matterType as QuoteType,
      subject: matter.subject,
      commissionAssignee: matter.commissionAssignee ?? undefined,
      responsibleTeam: matter.responsibleTeam as Matter["responsibleTeam"],
      nextPaymentDate: matter.nextPaymentDate?.toISOString(),
      milestone: matter.milestone ?? undefined,
      concluded: matter.concluded,
      totalFeesMxn: Number(matter.totalFeesMxn)
    };
  }
}
