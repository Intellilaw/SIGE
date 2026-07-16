import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const yearMonthSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2035),
  month: z.coerce.number().int().min(1).max(12)
});

const areaProfitabilityRangeSchema = z.object({
  fromYear: z.coerce.number().int().min(2000).max(2100).optional(),
  fromMonth: z.coerce.number().int().min(1).max(12).optional(),
  toYear: z.coerce.number().int().min(2000).max(2100).optional(),
  toMonth: z.coerce.number().int().min(1).max(12).optional()
}).superRefine((value, context) => {
  const values = [value.fromYear, value.fromMonth, value.toYear, value.toMonth];
  const providedCount = values.filter((entry) => entry !== undefined).length;

  if (providedCount !== 0 && providedCount !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El periodo debe incluir mes y ano inicial y final."
    });
  }

  if (
    providedCount === values.length
    && value.fromYear !== undefined
    && value.fromMonth !== undefined
    && value.toYear !== undefined
    && value.toMonth !== undefined
    && (value.fromYear * 12 + value.fromMonth > value.toYear * 12 + value.toMonth)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El periodo inicial no puede ser posterior al periodo final."
    });
  }
});

const updatePlanSchema = z.object({
  expectedIncomeMxn: z.coerce.number().nonnegative().optional(),
  expectedExpenseMxn: z.coerce.number().nonnegative().optional(),
  expectedExpenseBreakdown: z.array(z.object({
    concept: z.string().nullable().optional(),
    amountMxn: z.coerce.number().nonnegative().optional()
  })).optional(),
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

  app.get("/budget-planning/area-profitability", { preHandler: readGuards }, async (request) => {
    const query = areaProfitabilityRangeSchema.parse(request.query ?? {});
    const range = query.fromYear === undefined
      ? undefined
      : {
          fromYear: query.fromYear,
          fromMonth: query.fromMonth!,
          toYear: query.toYear!,
          toMonth: query.toMonth!
        };
    return service.getAreaProfitability(range);
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

  app.post("/budget-planning/expense-breakdown/copy-to-next-month", { preHandler: writeGuards }, async (request) => {
    const payload = yearMonthSchema.parse(request.body ?? {});
    return service.copyExpenseBreakdownToNextMonth(payload.year, payload.month);
  });
};
