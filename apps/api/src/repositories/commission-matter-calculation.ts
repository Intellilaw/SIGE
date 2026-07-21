import type { Prisma, PrismaClient } from "@prisma/client";
import type { CommissionMatterCommission } from "@sige/contracts";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export const LITIGATION_MATTER_COMMISSION_MXN = 100;

function getPeriodStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function getNextPeriodStart(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

function isPeriodAtOrBefore(year: number, month: number, otherYear: number, otherMonth: number) {
  return year < otherYear || (year === otherYear && month <= otherMonth);
}

export async function getLitigationMatterCommissions(
  prisma: PrismaExecutor,
  year: number,
  month: number
): Promise<CommissionMatterCommission[]> {
  const periodStart = getPeriodStart(year, month);
  const nextPeriodStart = getNextPeriodStart(year, month);
  const matters = await prisma.matter.findMany({
    where: {
      responsibleTeam: "LITIGATION",
      OR: [
        { executionLinkedAt: { lt: nextPeriodStart } },
        { executionLinkedAt: null, createdAt: { lt: nextPeriodStart } }
      ]
    },
    select: {
      id: true,
      matterNumber: true,
      clientName: true,
      clientNumber: true,
      subject: true,
      executionLinkedAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      concluded: true
    },
    orderBy: [{ clientName: "asc" }, { subject: "asc" }, { createdAt: "asc" }]
  });
  const matterIds = matters.map((matter) => matter.id);
  if (matterIds.length === 0) {
    return [];
  }

  const [conclusionEvents, exclusionEvents] = await Promise.all([
    prisma.matterConclusionEvent.findMany({
      where: {
        matterId: { in: matterIds },
        effectiveAt: { lt: periodStart }
      },
      orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }]
    }),
    prisma.commissionMatterExclusionEvent.findMany({
      where: {
        matterId: { in: matterIds },
        OR: [
          { effectiveYear: { lt: year } },
          { effectiveYear: year, effectiveMonth: { lte: month } }
        ]
      },
      orderBy: [{ effectiveYear: "asc" }, { effectiveMonth: "asc" }, { updatedAt: "asc" }]
    })
  ]);
  const conclusionStateByMatterId = new Map<string, boolean>();
  conclusionEvents.forEach((event) => conclusionStateByMatterId.set(event.matterId, event.concluded));
  const exclusionStateByMatterId = new Map<string, boolean>();
  exclusionEvents.forEach((event) => {
    if (isPeriodAtOrBefore(event.effectiveYear, event.effectiveMonth, year, month)) {
      exclusionStateByMatterId.set(event.matterId, event.excluded);
    }
  });

  return matters
    .filter((matter) => !matter.deletedAt || matter.deletedAt >= periodStart)
    .filter((matter) => {
      const historicalState = conclusionStateByMatterId.get(matter.id);
      if (historicalState !== undefined) {
        return !historicalState;
      }

      return !(matter.concluded && matter.updatedAt < periodStart);
    })
    .map((matter) => ({
      matterId: matter.id,
      matterNumber: matter.matterNumber,
      clientName: matter.clientName,
      clientNumber: matter.clientNumber ?? undefined,
      subject: matter.subject,
      registeredAt: (matter.executionLinkedAt ?? matter.createdAt).toISOString(),
      amountMxn: LITIGATION_MATTER_COMMISSION_MXN,
      excluded: exclusionStateByMatterId.get(matter.id) ?? false
    }));
}
