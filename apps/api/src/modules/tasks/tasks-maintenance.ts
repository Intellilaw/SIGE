import type { PrismaClient } from "@prisma/client";

const BUSINESS_TIME_ZONE = "America/Mexico_City";
const LITIGATION_MODULE_ID = "litigation";
const AUDIENCES_TABLE_CODE = "audiencias";
const AUDIENCES_SOURCE_TABLE = "audiencias_citas_oficiales";
const ONE_MINUTE_MS = 60 * 1000;

type MaintenanceLogger = {
  info: (payload: Record<string, unknown>, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getBusinessDateInput(date = new Date()) {
  const parts = Object.fromEntries(
    businessDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toDatabaseDate(dateInput: string) {
  return new Date(`${dateInput}T00:00:00.000Z`);
}

export async function moveExpiredLitigationAudienceRecordsToRecycleBin(
  prisma: PrismaClient,
  now = new Date()
) {
  const today = getBusinessDateInput(now);
  const cutoffDate = toDatabaseDate(today);
  const expiredRecords = await prisma.taskTrackingRecord.findMany({
    select: {
      id: true,
      termId: true
    },
    where: {
      moduleId: LITIGATION_MODULE_ID,
      deletedAt: null,
      status: { notIn: ["presentado", "concluida"] },
      OR: [
        { tableCode: AUDIENCES_TABLE_CODE },
        { sourceTable: AUDIENCES_SOURCE_TABLE }
      ],
      AND: [
        {
          OR: [
            { dueDate: { lt: cutoffDate } },
            {
              dueDate: null,
              termDate: { lt: cutoffDate }
            }
          ]
        }
      ]
    }
  });

  if (expiredRecords.length === 0) {
    return { moved: 0, today };
  }

  const recordIds = expiredRecords.map((record) => record.id);
  const termIds = expiredRecords
    .map((record) => record.termId)
    .filter((termId): termId is string => Boolean(termId));
  const termReferences = [
    { sourceRecordId: { in: recordIds } },
    ...(termIds.length > 0 ? [{ id: { in: termIds } }] : [])
  ];

  await prisma.$transaction([
    prisma.taskTrackingRecord.updateMany({
      where: {
        id: { in: recordIds },
        deletedAt: null
      },
      data: { deletedAt: now }
    }),
    prisma.taskTerm.updateMany({
      where: {
        deletedAt: null,
        OR: termReferences
      },
      data: { deletedAt: now }
    })
  ]);

  return { moved: recordIds.length, today };
}

export function startTasksMaintenanceScheduler(prisma: PrismaClient, logger?: MaintenanceLogger) {
  let running = false;

  async function run() {
    if (running) {
      return;
    }

    running = true;
    try {
      const result = await moveExpiredLitigationAudienceRecordsToRecycleBin(prisma);
      if (result.moved > 0) {
        logger?.info(
          { moved: result.moved, businessDate: result.today },
          "Moved expired litigation audience records to the task recycle bin."
        );
      }
    } catch (error) {
      logger?.error(error, "Unable to run task maintenance.");
    } finally {
      running = false;
    }
  }

  void run();
  const interval = setInterval(() => {
    void run();
  }, ONE_MINUTE_MS);
  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
