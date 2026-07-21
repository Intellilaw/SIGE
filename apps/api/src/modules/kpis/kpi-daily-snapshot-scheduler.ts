import type { PrismaKpisRepository } from "../../repositories/kpis.repository";

const BUSINESS_TIME_ZONE = "America/Mexico_City";
const SNAPSHOT_CHECK_INTERVAL_MS = 60 * 1000;
const SNAPSHOT_RUN_HOUR = 23;
const SNAPSHOT_RUN_MINUTE = 55;

type KpiSnapshotLogger = {
  info: (payload: Record<string, unknown>, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

const businessClockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

function getBusinessClock(now = new Date()) {
  const parts = Object.fromEntries(
    businessClockFormatter.formatToParts(now).map((part) => [part.type, part.value])
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function isSnapshotTime(clock: { hour: number; minute: number }) {
  return clock.hour > SNAPSHOT_RUN_HOUR
    || (clock.hour === SNAPSHOT_RUN_HOUR && clock.minute >= SNAPSHOT_RUN_MINUTE);
}

export function startKpiDailySnapshotScheduler(repository: PrismaKpisRepository, logger?: KpiSnapshotLogger) {
  let running = false;
  let lastCheckedDateKey: string | null = null;

  async function runIfDue() {
    const clock = getBusinessClock();
    if (!isSnapshotTime(clock) || running || lastCheckedDateKey === clock.dateKey) {
      return;
    }

    running = true;
    try {
      const result = await repository.captureExecutionIncompleteRowsSnapshot(clock.dateKey);
      lastCheckedDateKey = clock.dateKey;

      if (result.skipped) {
        logger?.info(
          { dateKey: result.dateKey, reason: result.reason },
          "Skipped KPI daily snapshot."
        );
        return;
      }

      const snapshots = result.snapshots ?? [];
      logger?.info(
        {
          dateKey: result.dateKey,
          status: result.status,
          value: result.value,
          incidentCount: result.incidentCount,
          snapshotCount: snapshots.length,
          teams: snapshots.map((snapshot) => ({
            teamKey: snapshot.teamKey,
            value: snapshot.value,
            target: snapshot.target,
            status: snapshot.status
          }))
        },
        "Captured KPI daily snapshots."
      );
    } catch (error) {
      logger?.error(error, "Unable to capture KPI daily snapshot.");
    } finally {
      running = false;
    }
  }

  void runIfDue();
  const interval = setInterval(() => {
    void runIfDue();
  }, SNAPSHOT_CHECK_INTERVAL_MS);
  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
