import type { PrismaClient } from "@prisma/client";

import { runWithTenantContext } from "../../core/tenant/tenant-context";
import { PrismaExternalContractsRepository } from "../../repositories/external-contracts.repository";
import {
  getPreviousMonthInpcPeriodKey,
  shouldAttemptMonthlyExternalContractInpcSync,
  syncExternalContractInpc
} from "./external-contract-inpc";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

type InpcSchedulerLogger = {
  info: (payload: Record<string, unknown>, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

export function startExternalContractInpcScheduler(prisma: PrismaClient, logger?: InpcSchedulerLogger) {
  let running = false;
  let completedMonthlyTargetPeriod = "";

  function hasPeriod(records: Awaited<ReturnType<PrismaExternalContractsRepository["listInpc"]>>, targetPeriod: string) {
    return records.some((record) =>
      `${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}` === targetPeriod
    );
  }

  async function run(options: { reason: "startup" | "monthly"; now?: Date }) {
    const now = options.now ?? new Date();
    const businessDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
    const targetPeriod = getPreviousMonthInpcPeriodKey(now);

    if (running) {
      return;
    }

    if (options.reason === "monthly") {
      if (!shouldAttemptMonthlyExternalContractInpcSync(now) || completedMonthlyTargetPeriod === targetPeriod) {
        return;
      }
    }

    if (options.reason === "startup" && completedMonthlyTargetPeriod === `startup:${businessDate}`) {
      return;
    }

    running = true;
    try {
      const organizations = await prisma.organization.findMany({
        where: { isActive: true },
        select: { id: true, name: true }
      });
      const results = [];
      let allMonthlyTargetsStored = options.reason === "monthly";

      for (const organization of organizations) {
        const result = await runWithTenantContext(organization.id, async () => {
          const repository = new PrismaExternalContractsRepository(prisma);
          const beforeRecords = await repository.listInpc();
          if (options.reason === "monthly" && hasPeriod(beforeRecords, targetPeriod)) {
            return {
              imported: 0,
              updated: 0,
              skipped: beforeRecords.length,
              total: beforeRecords.length,
              latest: beforeRecords[0],
              warnings: [],
              targetStored: true,
              skippedBecauseStored: true
            };
          }

          const syncResult = await syncExternalContractInpc(repository, now);
          const afterRecords = await repository.listInpc();

          return {
            ...syncResult,
            targetStored: hasPeriod(afterRecords, targetPeriod),
            skippedBecauseStored: false
          };
        });

        if (options.reason === "monthly" && !result.targetStored) {
          allMonthlyTargetsStored = false;
        }

        results.push({
          organizationId: organization.id,
          organizationName: organization.name,
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          total: result.total,
          warnings: result.warnings.length,
          targetPeriod,
          targetStored: result.targetStored,
          skippedBecauseStored: result.skippedBecauseStored
        });
      }

      if (options.reason === "monthly" && allMonthlyTargetsStored) {
        completedMonthlyTargetPeriod = targetPeriod;
      }

      if (options.reason === "startup") {
        completedMonthlyTargetPeriod = `startup:${businessDate}`;
      }

      logger?.info(
        { businessDate, reason: options.reason, targetPeriod, results },
        "Synchronized external contract INPC values from Banxico."
      );
    } catch (error) {
      logger?.error(error, "Unable to synchronize external contract INPC values.");
    } finally {
      running = false;
    }
  }

  void run({ reason: "startup" });
  const interval = setInterval(() => {
    void run({ reason: "monthly" });
  }, SIX_HOURS_MS);
  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
