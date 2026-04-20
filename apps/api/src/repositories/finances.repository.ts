import { Prisma, type PrismaClient } from "@prisma/client";
import type { ContractSignedStatus, FinanceRecord, FinanceRecordStats, FinanceSnapshotData, Matter, QuoteType } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
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

function hasOwn<T extends object>(payload: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(payload, key);
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

function getRecordMatchKey(input: Pick<FinanceRecord, "quoteNumber" | "clientName" | "subject">) {
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
  const totalPaidMxn = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;
  const totalExpensesMxn = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
  const netFeesMxn = totalPaidMxn - totalExpensesMxn;
  const remainingMxn = record.conceptFeesMxn - record.previousPaymentsMxn;
  const dueTodayMxn = remainingMxn - totalPaidMxn;
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
      financeCommissionMxn
    );

  return {
    totalPaidMxn,
    totalExpensesMxn,
    netFeesMxn,
    remainingMxn,
    dueTodayMxn,
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
  public constructor(private readonly prisma: PrismaClient) {}

  public async listRecords(year: number, month: number) {
    await this.syncRecordsWithMatters(year, month);

    const records = await this.prisma.financeRecord.findMany({
      where: { year, month },
      orderBy: [{ createdAt: "asc" }, { clientNumber: "asc" }]
    });

    return records.map(mapFinanceRecord);
  }

  public async createRecord(year: number, month: number, payload: FinanceRecordWriteRecord = {}) {
    const record = await this.prisma.financeRecord.create({
      data: {
        year,
        month,
        clientNumber: normalizeOptionalText(payload.clientNumber),
        clientName: normalizeRequiredText(payload.clientName),
        quoteNumber: normalizeOptionalText(payload.quoteNumber),
        matterType: payload.matterType ?? "ONE_TIME",
        subject: normalizeRequiredText(payload.subject),
        contractSignedStatus: normalizeContractSignedStatus(payload.contractSignedStatus),
        responsibleTeam: payload.responsibleTeam ?? null,
        totalMatterMxn: toDecimal(payload.totalMatterMxn),
        workingConcepts: normalizeOptionalText(payload.workingConcepts),
        conceptFeesMxn: toDecimal(payload.conceptFeesMxn),
        previousPaymentsMxn: toDecimal(payload.previousPaymentsMxn),
        nextPaymentDate: parseDateValue(payload.nextPaymentDate),
        nextPaymentNotes: normalizeOptionalText(payload.nextPaymentNotes),
        paidThisMonthMxn: toDecimal(payload.paidThisMonthMxn),
        payment2Mxn: toDecimal(payload.payment2Mxn),
        payment3Mxn: toDecimal(payload.payment3Mxn),
        paymentDate1: parseDateValue(payload.paymentDate1),
        paymentDate2: parseDateValue(payload.paymentDate2),
        paymentDate3: parseDateValue(payload.paymentDate3),
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
      }
    });

    return mapFinanceRecord(record);
  }

  public async updateRecord(recordId: string, payload: FinanceRecordWriteRecord) {
    await this.findRecordOrThrow(this.prisma, recordId);

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
    if (hasOwn(payload, "workingConcepts")) {
      data.workingConcepts = normalizeOptionalText(payload.workingConcepts);
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
    if (hasOwn(payload, "milestone")) {
      data.milestone = normalizeOptionalText(payload.milestone);
    }
    if (hasOwn(payload, "concluded")) {
      data.concluded = payload.concluded ?? false;
    }
    if (hasOwn(payload, "financeComments")) {
      data.financeComments = normalizeOptionalText(payload.financeComments);
    }

    const record = await this.prisma.financeRecord.update({
      where: { id: recordId },
      data
    });

    return mapFinanceRecord(record);
  }

  public async deleteRecord(recordId: string) {
    await this.findRecordOrThrow(this.prisma, recordId);
    await this.prisma.financeRecord.delete({
      where: { id: recordId }
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
    const sourceRecords = await this.listRecords(year, month);

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.financeRecord.deleteMany({
        where: {
          year: nextYear,
          month: nextMonth
        }
      });

      for (const record of sourceRecords) {
        const totalPaidMxn = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;

        await tx.financeRecord.create({
          data: {
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
            workingConcepts: normalizeOptionalText(record.workingConcepts),
            conceptFeesMxn: toDecimal(record.conceptFeesMxn),
            previousPaymentsMxn: toDecimal(record.previousPaymentsMxn + totalPaidMxn),
            nextPaymentDate: parseDateValue(record.nextPaymentDate),
            nextPaymentNotes: normalizeOptionalText(record.nextPaymentNotes),
            paidThisMonthMxn: toDecimal(0),
            payment2Mxn: toDecimal(0),
            payment3Mxn: toDecimal(0),
            paymentDate1: null,
            paymentDate2: null,
            paymentDate3: null,
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
          }
        });
      }
    });

    return {
      year: nextYear,
      month: nextMonth,
      copied: sourceRecords.length
    };
  }

  public async sendMatterToFinance(matterId: string, year: number, month: number) {
    const matter = await this.findMatterProjectionOrThrow(this.prisma, matterId);
    const matterPayload = buildMatterMirrorPayload(matter);
    const isRetainer = matter.matterType === "RETAINER";

    if (!isRetainer) {
      const existing = await this.findExistingUniqueRecord(this.prisma, year, month, matter);
      if (existing) {
        const record = await this.prisma.financeRecord.update({
          where: { id: existing.id },
          data: {
            clientNumber: normalizeOptionalText(matterPayload.clientNumber),
            clientName: normalizeRequiredText(matterPayload.clientName),
            quoteNumber: normalizeOptionalText(matterPayload.quoteNumber),
            matterType: matterPayload.matterType ?? "ONE_TIME",
            subject: normalizeRequiredText(matterPayload.subject),
            responsibleTeam: matterPayload.responsibleTeam ?? null,
            totalMatterMxn: toDecimal(matterPayload.totalMatterMxn),
            nextPaymentDate: parseDateValue(matterPayload.nextPaymentDate),
            closingCommissionRecipient: normalizeOptionalText(matterPayload.closingCommissionRecipient),
            milestone: normalizeOptionalText(matterPayload.milestone),
            concluded: matterPayload.concluded ?? false
          }
        });

        return mapFinanceRecord(record);
      }
    }

    const percentages = isRetainer ? getDefaultPercentages(undefined) : getDefaultPercentages(matter.responsibleTeam);
    const record = await this.prisma.financeRecord.create({
      data: {
        year,
        month,
        clientNumber: normalizeOptionalText(matterPayload.clientNumber),
        clientName: normalizeRequiredText(matterPayload.clientName),
        quoteNumber: normalizeOptionalText(matterPayload.quoteNumber),
        matterType: matterPayload.matterType ?? "ONE_TIME",
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
      }
    });

    return mapFinanceRecord(record);
  }

  public async listCommissionReceivers() {
    const records = await this.prisma.commissionReceiver.findMany({
      where: { active: true },
      orderBy: [{ name: "asc" }]
    });

    return records.map(mapCommissionReceiver);
  }

  private async syncRecordsWithMatters(year: number, month: number) {
    const [records, matters] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where: { year, month },
        orderBy: [{ createdAt: "asc" }]
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
      const mapped = mapFinanceRecord(record);
      const matchKey = getRecordMatchKey(mapped);
      if (!matchKey) {
        return;
      }

      const matter = matterLookup.get(matchKey);
      if (!matter) {
        return;
      }

      const isRetainer = mapped.matterType === "RETAINER";
      const nextPercentages = !isRetainer && areAllPercentagesZero(record)
        ? getDefaultPercentages(matter.responsibleTeam)
        : null;

      const teamMismatch = !isRetainer && (record.responsibleTeam ?? null) !== (matter.responsibleTeam ?? null);
      const needsUpdate =
        normalizeComparableText(record.clientName) !== normalizeComparableText(matter.clientName) ||
        normalizeComparableText(record.subject) !== normalizeComparableText(matter.subject) ||
        normalizeComparableText(record.quoteNumber) !== normalizeComparableText(matter.quoteNumber) ||
        normalizeComparableText(record.clientNumber) !== normalizeComparableText(matter.clientNumber) ||
        record.matterType !== matter.matterType ||
        teamMismatch ||
        Number(record.totalMatterMxn) !== matter.totalFeesMxn ||
        normalizeComparableText(record.closingCommissionRecipient) !== normalizeComparableText(matter.commissionAssignee) ||
        toDateKey(record.nextPaymentDate) !== toDateKey(matter.nextPaymentDate) ||
        normalizeComparableText(record.milestone) !== normalizeComparableText(matter.milestone) ||
        record.concluded !== matter.concluded ||
        nextPercentages !== null;

      if (!needsUpdate) {
        return;
      }

      const data: Prisma.FinanceRecordUncheckedUpdateInput = {
        clientNumber: normalizeOptionalText(matter.clientNumber),
        clientName: normalizeRequiredText(matter.clientName),
        quoteNumber: normalizeOptionalText(matter.quoteNumber),
        matterType: matter.matterType,
        subject: normalizeRequiredText(matter.subject),
        totalMatterMxn: toDecimal(matter.totalFeesMxn),
        nextPaymentDate: parseDateValue(matter.nextPaymentDate),
        closingCommissionRecipient: normalizeOptionalText(matter.commissionAssignee),
        milestone: normalizeOptionalText(matter.milestone),
        concluded: matter.concluded
      };

      if (!isRetainer) {
        data.responsibleTeam = matter.responsibleTeam ?? null;
      }

      if (nextPercentages) {
        Object.assign(data, nextPercentages);
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
          data: update.data
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
        }
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
      }
    });
  }

  private async findRecordOrThrow(prisma: PrismaExecutor, recordId: string) {
    const record = await prisma.financeRecord.findUnique({
      where: { id: recordId }
    });

    if (!record) {
      throw new AppError(404, "FINANCE_RECORD_NOT_FOUND", "The requested finance record does not exist.");
    }

    return record;
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
