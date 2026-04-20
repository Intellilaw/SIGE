import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const querySchema = z.object({
  year: z.coerce.number().int().min(2024).max(2035).optional(),
  month: z.coerce.number().int().min(1).max(12).optional()
});

const createSchema = z.object({
  year: z.number().int().min(2024).max(2035).optional(),
  month: z.number().int().min(1).max(12).optional()
});

const updateSchema = z.object({
  detail: z.string().optional(),
  amountMxn: z.number().nonnegative().optional(),
  countsTowardLimit: z.boolean().optional(),
  team: z.enum([
    "Sin equipo",
    "General",
    "Litigio",
    "Corporativo y laboral",
    "Convenios",
    "Der Financiero",
    "Compliance Fiscal"
  ]).optional(),
  generalExpense: z.boolean().optional(),
  expenseWithoutTeam: z.boolean().optional(),
  pctLitigation: z.number().optional(),
  pctCorporateLabor: z.number().optional(),
  pctSettlements: z.number().optional(),
  pctFinancialLaw: z.number().optional(),
  pctTaxCompliance: z.number().optional(),
  paymentMethod: z.enum(["Transferencia", "Efectivo"]).optional(),
  bank: z.enum(["Banamex", "HSBC"]).nullable().optional(),
  recurring: z.boolean().optional(),
  approvedByEmrt: z.boolean().optional(),
  paidByEmrtAt: z.string().nullable().optional(),
  reviewedByJnls: z.boolean().optional(),
  paid: z.boolean().optional(),
  paidAt: z.string().nullable().optional()
});

const paramsSchema = z.object({
  expenseId: z.string().min(1)
});

const copySchema = z.object({
  year: z.number().int().min(2024).max(2035),
  month: z.number().int().min(1).max(12)
});

export const generalExpensesRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.GeneralExpensesService(app.repositories.generalExpenses);
  const readGuards = [requireAuth, requireAnyPermissions(["general-expenses:read", "general-expenses:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["general-expenses:write"])];

  app.get("/general-expenses", { preHandler: readGuards }, async (request) => {
    const query = querySchema.parse(request.query ?? {});
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    return service.list(year, month);
  });

  app.post("/general-expenses", { preHandler: writeGuards }, async (request) => {
    const payload = createSchema.parse(request.body ?? {});
    return service.create(payload);
  });

  app.patch("/general-expenses/:expenseId", { preHandler: writeGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const payload = updateSchema.parse(request.body ?? {});
    const actor = getSessionUser(request);
    return service.update(params.expenseId, payload, actor);
  });

  app.delete("/general-expenses/:expenseId", { preHandler: writeGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    await service.delete(params.expenseId);
    reply.code(204);
    return null;
  });

  app.post("/general-expenses/copy-to-next-month", { preHandler: writeGuards }, async (request) => {
    const payload = copySchema.parse(request.body ?? {});
    return service.copyRecurringToNextMonth(payload.year, payload.month);
  });
};
