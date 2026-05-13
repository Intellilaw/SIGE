import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const yearMonthSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2035),
  month: z.coerce.number().int().min(1).max(12)
});

const updatePlanSchema = z.object({
  expectedIncomeMxn: z.coerce.number().nonnegative().optional(),
  expectedExpenseMxn: z.coerce.number().nonnegative().optional(),
  notes: z.string().nullable().optional()
});

export const budgetPlanningRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.BudgetPlanningService(app.repositories.budgetPlanning);
  const readGuards = [requireAuth, requireAnyPermissions([
    "budget-planning:read",
    "budget-planning:write"
  ])];
  const writeGuards = [requireAuth, requireAnyPermissions([
    "budget-planning:write"
  ])];

  app.get("/budget-planning", { preHandler: readGuards }, async (request) => {
    const query = yearMonthSchema.parse(request.query ?? {});
    return service.getOverview(query.year, query.month);
  });

  app.get("/budget-planning/snapshots", { preHandler: readGuards }, async (request) => {
    const query = yearMonthSchema.parse(request.query ?? {});
    return service.listSnapshotsBefore(query.year, query.month);
  });

  app.patch("/budget-planning", { preHandler: writeGuards }, async (request) => {
    const query = yearMonthSchema.parse(request.query ?? {});
    const payload = updatePlanSchema.parse(request.body ?? {});
    return service.updatePlan(query.year, query.month, payload);
  });
};
