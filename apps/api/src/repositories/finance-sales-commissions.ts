import type { Prisma, PrismaClient } from "@prisma/client";
import type { FinanceRecord } from "@sige/contracts";

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

function getQuoteCommissionKey(quoteNumber?: string | null) {
  const normalized = normalizeComparableText(quoteNumber);
  return normalized || null;
}

type FinancePaymentHistoryRecord = {
  id: string;
  year: number;
  month: number;
  quoteNumber: string | null;
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
  createdAt: Date;
};

type FinanceSalesPaymentEvent = {
  quoteKey: string;
  recordId: string;
  amountMxn: number;
  sortTime: number;
  slot: number;
  createdAt: Date;
};

function getPaymentSortTime(record: FinancePaymentHistoryRecord, paymentDate: Date | null, slot: number) {
  if (paymentDate && !Number.isNaN(paymentDate.getTime())) {
    return paymentDate.getTime();
  }

  return Date.UTC(record.year, record.month - 1, slot);
}

function isPaymentReceived(method?: string | null, received?: boolean | null) {
  return method === "T" || method === "E_RECEIVED" || (method === "E" && received === true);
}

function hasPaymentDate(value: Date | null) {
  return Boolean(value && !Number.isNaN(value.getTime()));
}

function getSalesPaymentEvents(record: FinancePaymentHistoryRecord): FinanceSalesPaymentEvent[] {
  const quoteKey = getQuoteCommissionKey(record.quoteNumber);
  if (!quoteKey) {
    return [];
  }

  return [
    {
      amountMxn:
        hasPaymentDate(record.paymentDate1) && isPaymentReceived(record.paymentMethod, record.paymentReceived)
          ? Number(record.paidThisMonthMxn)
          : 0,
      paymentDate: record.paymentDate1,
      slot: 1
    },
    {
      amountMxn:
        hasPaymentDate(record.paymentDate2) && isPaymentReceived(record.paymentMethod2, record.paymentReceived2)
          ? Number(record.payment2Mxn)
          : 0,
      paymentDate: record.paymentDate2,
      slot: 2
    },
    {
      amountMxn:
        hasPaymentDate(record.paymentDate3) && isPaymentReceived(record.paymentMethod3, record.paymentReceived3)
          ? Number(record.payment3Mxn)
          : 0,
      paymentDate: record.paymentDate3,
      slot: 3
    }
  ]
    .filter((payment) => payment.amountMxn > 0)
    .map((payment) => ({
      quoteKey,
      recordId: record.id,
      amountMxn: payment.amountMxn,
      sortTime: getPaymentSortTime(record, payment.paymentDate, payment.slot),
      slot: payment.slot,
      createdAt: record.createdAt
    }));
}

function isEarlierSalesPaymentEvent(left: FinanceSalesPaymentEvent, right: FinanceSalesPaymentEvent) {
  if (left.sortTime !== right.sortTime) {
    return left.sortTime < right.sortTime;
  }
  if (left.slot !== right.slot) {
    return left.slot < right.slot;
  }
  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return left.createdAt.getTime() < right.createdAt.getTime();
  }

  return left.recordId.localeCompare(right.recordId) < 0;
}

export async function attachSalesCommissionsToFinanceRecords(
  prisma: PrismaClient,
  records: FinanceRecord[]
) {
  const quoteNumbersByKey = new Map<string, string>();

  records.forEach((record) => {
    const quoteKey = getQuoteCommissionKey(record.quoteNumber);
    if (quoteKey && record.quoteNumber) {
      quoteNumbersByKey.set(quoteKey, record.quoteNumber);
    }
  });

  if (quoteNumbersByKey.size === 0) {
    return records.map((record) => ({ ...record, salesCommissionMxn: 0 }));
  }

  const paymentHistory = await prisma.financeRecord.findMany({
    where: {
      OR: [...quoteNumbersByKey.values()].map((quoteNumber) => ({
        quoteNumber: {
          equals: quoteNumber,
          mode: "insensitive" as const
        }
      }))
    },
    select: {
      id: true,
      year: true,
      month: true,
      quoteNumber: true,
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
      createdAt: true
    }
  });

  const firstPaymentByQuoteKey = new Map<string, FinanceSalesPaymentEvent>();

  paymentHistory.forEach((historyRecord) => {
    getSalesPaymentEvents(historyRecord).forEach((event) => {
      const current = firstPaymentByQuoteKey.get(event.quoteKey);
      if (!current || isEarlierSalesPaymentEvent(event, current)) {
        firstPaymentByQuoteKey.set(event.quoteKey, event);
      }
    });
  });

  return records.map((record) => {
    const quoteKey = getQuoteCommissionKey(record.quoteNumber);
    const firstPayment = quoteKey ? firstPaymentByQuoteKey.get(quoteKey) : undefined;
    const salesCommissionMxn = firstPayment?.recordId === record.id ? firstPayment.amountMxn * 0.01 : 0;

    return {
      ...record,
      salesCommissionMxn
    };
  });
}
