import type { PrismaClient } from "@prisma/client";

import type { DashboardRepository } from "./types";

export class PrismaDashboardRepository implements DashboardRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getSummary() {
    const [clients, quotes, leads, matters, pendingTasks] = await Promise.all([
      this.prisma.client.count({
        where: {
          deletedAt: null
        }
      }),
      this.prisma.quote.count(),
      this.prisma.lead.count(),
      this.prisma.matter.count(),
      this.prisma.taskItem.count({
        where: {
          state: {
            in: ["PENDING", "IN_PROGRESS"]
          }
        }
      })
    ]);

    return {
      clients,
      quotes,
      leads,
      matters,
      pendingTasks
    };
  }
}
