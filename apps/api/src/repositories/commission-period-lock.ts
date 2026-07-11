import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";

const RUSCONI_ORGANIZATION_ID = "org-rusconi";
type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function uniquePeriods(periods: Array<{ year: number; month: number }>) {
  const byKey = new Map<string, { year: number; month: number }>();
  periods.forEach((period) => byKey.set(`${period.year}-${period.month}`, period));
  return [...byKey.values()];
}

export function isRusconiCommissionPaymentFlow() {
  return getCurrentOrganizationIdOrDefault() === RUSCONI_ORGANIZATION_ID;
}

export async function getCommissionPeriodLock(prisma: PrismaExecutor, year: number, month: number) {
  if (!isRusconiCommissionPaymentFlow()) {
    return { locked: false, confirmedByEmrtCount: 0 };
  }

  const confirmedByEmrtCount = await prisma.commissionPaymentAcknowledgement.count({
    where: { year, month, receivedByEmrt: true }
  });

  return {
    locked: confirmedByEmrtCount > 0,
    confirmedByEmrtCount
  };
}

export async function assertCommissionPeriodUnlocked(prisma: PrismaExecutor, year: number, month: number) {
  const state = await getCommissionPeriodLock(prisma, year, month);
  if (state.locked) {
    throw new AppError(
      423,
      "COMMISSION_PERIOD_LOCKED",
      "Este periodo esta cerrado por EMRT en Totales de comisiones. Reabre todas las confirmaciones de EMRT antes de modificarlo."
    );
  }
}

export async function assertFinanceCommissionSourceUnlocked(
  prisma: PrismaExecutor,
  input: { year: number; month: number; quoteNumbers?: Array<string | null | undefined> }
) {
  if (!isRusconiCommissionPaymentFlow()) {
    return;
  }

  const quoteNumbers = [...new Set(
    (input.quoteNumbers ?? [])
      .map((quoteNumber) => quoteNumber?.trim() ?? "")
      .filter(Boolean)
  )];
  const periods = [{ year: input.year, month: input.month }];

  if (quoteNumbers.length > 0) {
    const relatedRecords = await prisma.financeRecord.findMany({
      where: {
        OR: quoteNumbers.map((quoteNumber) => ({
          quoteNumber: { equals: quoteNumber, mode: "insensitive" as const }
        }))
      },
      select: { year: true, month: true }
    });
    periods.push(...relatedRecords);
  }

  const lockedAcknowledgement = await prisma.commissionPaymentAcknowledgement.findFirst({
    where: {
      receivedByEmrt: true,
      OR: uniquePeriods(periods)
    },
    select: { year: true, month: true }
  });

  if (lockedAcknowledgement) {
    throw new AppError(
      423,
      "COMMISSION_PERIOD_LOCKED",
      `El periodo ${lockedAcknowledgement.month}/${lockedAcknowledgement.year} esta cerrado por EMRT en Totales de comisiones.`
    );
  }
}

export async function buildCommissionPeriodSourceHash(prisma: PrismaExecutor, year: number, month: number) {
  if (!isRusconiCommissionPaymentFlow()) {
    return "";
  }

  const [financeRecords, generalExpenses, exclusions, projectorCommissions] = await Promise.all([
    prisma.financeRecord.findMany({
      where: { year, month },
      select: { id: true, quoteNumber: true, updatedAt: true },
      orderBy: { id: "asc" }
    }),
    prisma.generalExpense.findMany({
      where: { year, month },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" }
    }),
    prisma.commissionExclusion.findMany({
      where: { year, month },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" }
    }),
    prisma.projectorCommission.findMany({
      where: { year, month },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" }
    })
  ]);
  const quoteNumbersByKey = new Map<string, string>();
  financeRecords.forEach((record) => {
    const key = normalizeComparableText(record.quoteNumber);
    if (key && record.quoteNumber) {
      quoteNumbersByKey.set(key, record.quoteNumber);
    }
  });
  const quoteNumbers = [...quoteNumbersByKey.values()];
  const paymentHistory = quoteNumbers.length === 0
    ? []
    : await prisma.financeRecord.findMany({
        where: {
          OR: quoteNumbers.map((quoteNumber) => ({
            quoteNumber: { equals: quoteNumber, mode: "insensitive" as const }
          }))
        },
        select: { id: true, year: true, month: true, updatedAt: true },
        orderBy: { id: "asc" }
      });
  const source = {
    year,
    month,
    financeRecords: financeRecords.map((record) => [record.id, record.updatedAt.toISOString()]),
    financePaymentHistory: paymentHistory.map((record) => [
      record.id,
      record.year,
      record.month,
      record.updatedAt.toISOString()
    ]),
    generalExpenses: generalExpenses.map((record) => [record.id, record.updatedAt.toISOString()]),
    exclusions: exclusions.map((record) => [record.id, record.updatedAt.toISOString()]),
    projectorCommissions: projectorCommissions.map((record) => [record.id, record.updatedAt.toISOString()])
  };

  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}
