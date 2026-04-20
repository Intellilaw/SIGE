import type { FastifyPluginAsync } from "fastify";

import { requireAuth } from "../../core/auth/guards";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.DashboardService(app.repositories.dashboard);
  app.get("/dashboard/summary", { preHandler: [requireAuth] }, async () => service.getSummary());
};