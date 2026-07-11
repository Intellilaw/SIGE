import { type PrismaClient } from "@prisma/client";

import { assertCommissionPeriodUnlocked } from "./commission-period-lock";

export const RUSCONI_ORGANIZATION_ID = "org-rusconi";
export const PROJECTOR_COMMISSION_DEFAULT_MXN = 500;
export const PROJECTOR_COMMISSION_FINAL_STAGE = 5;

export const PROJECTOR_COMMISSION_RECIPIENTS = [
  {
    responsibleCode: "EKPO",
    projectorName: "Evelyng Perez",
    role: "Proyectista 1",
    section: "Proyectista 1 (EKPO)"
  },
  {
    responsibleCode: "NBSG",
    projectorName: "Noelia Serrano",
    role: "Proyectista 2",
    section: "Proyectista 2 (NBSG)"
  }
] as const;

type ProjectorCommissionTrackingRecord = {
  id: string;
  organizationId: string;
  moduleId: string;
  tableCode: string;
  sourceTable: string;
  clientName: string;
  subject: string;
  responsible: string;
  workflowStage: number;
  completedAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date;
};

function normalizeComparable(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeTableKey(value?: string | null) {
  return normalizeComparable(value).toLowerCase().replace(/[-\s]+/g, "_");
}

function getMexicoCityPeriod(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "numeric"
  }).formatToParts(value);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value)
  };
}

export function findProjectorCommissionRecipient(responsible?: string | null) {
  const normalizedResponsible = normalizeComparable(responsible);
  return PROJECTOR_COMMISSION_RECIPIENTS.find(
    (recipient) => recipient.responsibleCode === normalizedResponsible
  );
}

export function findProjectorCommissionSectionForRole(role?: string | null) {
  const normalizedRole = normalizeComparable(role);
  return PROJECTOR_COMMISSION_RECIPIENTS.find(
    (recipient) => normalizeComparable(recipient.role) === normalizedRole
  )?.section;
}

export async function syncProjectorCommissionForTrackingRecord(
  prisma: PrismaClient,
  record: ProjectorCommissionTrackingRecord
) {
  if (record.organizationId !== RUSCONI_ORGANIZATION_ID) {
    return;
  }

  const recipient = findProjectorCommissionRecipient(record.responsible);
  const isWriting = record.moduleId === "litigation" && [record.tableCode, record.sourceTable]
    .some((value) => normalizeTableKey(value) === "escritos_fondo");
  const isEligible = Boolean(
    recipient
    && isWriting
    && record.workflowStage >= PROJECTOR_COMMISSION_FINAL_STAGE
    && !record.deletedAt
  );
  const existing = await prisma.projectorCommission.findFirst({
    where: { taskTrackingRecordId: record.id }
  });

  if (!isEligible || !recipient) {
    if (existing && !existing.authorized) {
      await assertCommissionPeriodUnlocked(prisma, existing.year, existing.month);
      await prisma.projectorCommission.delete({ where: { id: existing.id } });
    }
    return;
  }

  if (existing?.authorized) {
    return;
  }

  const completedAt = record.completedAt ?? record.updatedAt;
  const period = getMexicoCityPeriod(completedAt);
  const data = {
    year: period.year,
    month: period.month,
    section: recipient.section,
    responsibleCode: recipient.responsibleCode,
    projectorName: recipient.projectorName,
    clientName: record.clientName,
    subject: record.subject,
    completedAt
  };

  if (existing) {
    await assertCommissionPeriodUnlocked(prisma, existing.year, existing.month);
    if (existing.year !== period.year || existing.month !== period.month) {
      await assertCommissionPeriodUnlocked(prisma, period.year, period.month);
    }
    await prisma.projectorCommission.update({
      where: { id: existing.id },
      data
    });
    return;
  }

  await assertCommissionPeriodUnlocked(prisma, period.year, period.month);
  await prisma.projectorCommission.create({
    data: {
      taskTrackingRecordId: record.id,
      ...data,
      amountMxn: PROJECTOR_COMMISSION_DEFAULT_MXN
    }
  });
}
