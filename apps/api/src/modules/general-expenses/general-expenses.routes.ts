import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { deriveEffectivePermissions } from "@sige/contracts";
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
  hasVat: z.boolean().optional(),
  hasWithholdings: z.boolean().optional(),
  recurring: z.boolean().optional(),
  approvedByEmrt: z.boolean().optional(),
  paidByEmrtAt: z.string().nullable().optional(),
  emrtReimbursementPending: z.boolean().optional(),
  reviewedByJnls: z.boolean().optional(),
  paid: z.boolean().optional(),
  paidAt: z.string().nullable().optional()
});

const paramsSchema = z.object({
  expenseId: z.string().min(1)
});

const emrtAcknowledgementParamsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const emrtAcknowledgementUpdateSchema = z.object({
  receivedByAle: z.boolean().optional(),
  paidByEmrt: z.boolean().optional()
});

const copySchema = z.object({
  year: z.number().int().min(2024).max(2035),
  month: z.number().int().min(1).max(12)
});

const payrollCreateSchema = z.object({
  year: z.number().int().min(2024).max(2035).optional(),
  month: z.number().int().min(1).max(12).optional(),
  half: z.union([z.literal(1), z.literal(2)]).optional(),
  laborFileId: z.string().nullable().optional()
});

const payrollUpdateSchema = z.object({
  laborFileId: z.string().nullable().optional(),
  isPartTime: z.boolean().optional(),
  grossSalaryMxn: z.number().nonnegative().optional(),
  absenceDays: z.number().nonnegative().optional(),
  overtimeHours: z.number().nonnegative().optional(),
  overtimeDetail: z.string().optional(),
  generalExpense: z.boolean().optional(),
  pctLitigation: z.number().min(0).max(100).optional(),
  pctCorporateLabor: z.number().min(0).max(100).optional(),
  pctSettlements: z.number().min(0).max(100).optional(),
  pctFinancialLaw: z.number().min(0).max(100).optional(),
  pctTaxCompliance: z.number().min(0).max(100).optional(),
  isrWithholdingMxn: z.number().nonnegative().optional(),
  imssWithholdingMxn: z.number().nonnegative().optional(),
  employmentSubsidyMxn: z.number().nonnegative().optional(),
  infonavitCreditMxn: z.number().nonnegative().optional(),
  punctualityBonusExcluded: z.boolean().optional(),
  attendanceBonusExcluded: z.boolean().optional(),
  advanceVacationDaysPaid: z.boolean().optional(),
  payrollStampedByAraceli: z.boolean().optional(),
  finalPaymentApprovedByEmrt: z.boolean().optional(),
  reviewedByJnls: z.boolean().optional()
});

const payrollDistributionUpdateSchema = z.object({
  pctLitigation: z.number().min(0).max(100),
  pctCorporateLabor: z.number().min(0).max(100),
  pctSettlements: z.number().min(0).max(100),
  pctFinancialLaw: z.number().min(0).max(100),
  pctTaxCompliance: z.number().min(0).max(100)
}).strict();

const payrollParamsSchema = z.object({
  payrollEntryId: z.string().min(1)
});

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isFinanceUser(user: ReturnType<typeof getSessionUser>) {
  return user.team === "FINANCE" ||
    user.secondaryTeam === "FINANCE" ||
    normalizeComparableText(user.legacyTeam) === "finanzas" ||
    normalizeComparableText(user.secondaryLegacyTeam) === "finanzas" ||
    normalizeComparableText(user.specificRole) === "finanzas" ||
    normalizeComparableText(user.secondarySpecificRole) === "finanzas";
}

function isAraceliLozano(user: ReturnType<typeof getSessionUser>) {
  const normalizedEmail = normalizeComparableText(user.email);
  const normalizedUsername = normalizeComparableText(user.username);
  const normalizedDisplayName = normalizeComparableText(user.displayName);
  return isFinanceUser(user) && (
    normalizedUsername === "araceli lozano" ||
    normalizedUsername === "araceli lozano escamilla" ||
    normalizedDisplayName === "araceli lozano" ||
    normalizedDisplayName === "araceli lozano escamilla" ||
    normalizedEmail.startsWith("araceli lozano") ||
    normalizedEmail.startsWith("araceli.lozano")
  );
}

export const generalExpensesRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.GeneralExpensesService(app.repositories.generalExpenses);
  const readGuards = [requireAuth, requireAnyPermissions(["general-expenses:read", "general-expenses:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["general-expenses:write"])];
  const payrollPatchGuards = [requireAuth, async (request: FastifyRequest) => {
    const payload = payrollUpdateSchema.parse(request.body ?? {});
    const payloadKeys = Object.keys(payload);
    const user = getSessionUser(request);
    const permissions = deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      secondaryTeam: user.secondaryTeam,
      secondaryLegacyTeam: user.secondaryLegacyTeam,
      specificRole: user.specificRole,
      secondarySpecificRole: user.secondarySpecificRole,
      permissions: user.permissions,
      isExternal: user.isExternal
    });
    const isStampOnlyPatch = payloadKeys.length === 1 && Object.prototype.hasOwnProperty.call(payload, "payrollStampedByAraceli");
    const isJnlsApprovalOnlyPatch = payloadKeys.length === 1 && Object.prototype.hasOwnProperty.call(payload, "reviewedByJnls");

    if (isStampOnlyPatch && isAraceliLozano(user)) {
      return;
    }

    if (isJnlsApprovalOnlyPatch) {
      if (!permissions.includes("general-expenses:jnls-approval:write")) {
        throw new app.errors.AppError(403, "FORBIDDEN", "Only the audit team can update the JNLS approval flag.");
      }
      return;
    }

    if (payloadKeys.includes("reviewedByJnls")) {
      throw new app.errors.AppError(403, "FORBIDDEN", "The JNLS approval flag must be updated separately by the audit team.");
    }

    if (permissions.includes("*") || permissions.includes("general-expenses:write")) {
      return;
    }

    throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
  }];
  const patchGuards = [requireAuth, async (request: FastifyRequest) => {
    const payload = updateSchema.parse(request.body ?? {});
    const payloadKeys = Object.keys(payload);
    const isJnlsApprovalOnlyPatch = payloadKeys.length === 1 && Object.prototype.hasOwnProperty.call(payload, "reviewedByJnls");
    const user = getSessionUser(request);
    const permissions = deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      secondaryTeam: user.secondaryTeam,
      secondaryLegacyTeam: user.secondaryLegacyTeam,
      specificRole: user.specificRole,
      secondarySpecificRole: user.secondarySpecificRole,
      permissions: user.permissions,
      isExternal: user.isExternal
    });

    if (isJnlsApprovalOnlyPatch) {
      if (!permissions.includes("general-expenses:jnls-approval:write")) {
        throw new app.errors.AppError(403, "FORBIDDEN", "Only the audit team can update the JNLS approval flag.");
      }
      return;
    }

    if (payloadKeys.includes("reviewedByJnls")) {
      throw new app.errors.AppError(403, "FORBIDDEN", "The JNLS approval flag must be updated separately by the audit team.");
    }

    if (!permissions.includes("*") && !permissions.includes("general-expenses:write")) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }
  }];

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

  app.get("/general-expenses/payroll-employees", { preHandler: readGuards }, async () => {
    return service.listPayrollEmployeeOptions();
  });

  app.get("/general-expenses/payroll", { preHandler: readGuards }, async (request) => {
    const query = querySchema.parse(request.query ?? {});
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    return service.listPayrollEntries(year, month);
  });

  app.get("/general-expenses/emrt-acknowledgements", { preHandler: readGuards }, async (request) => {
    const query = querySchema.parse(request.query ?? {});
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    return service.listEmrtAcknowledgements(year, month);
  });

  app.post("/general-expenses/payroll", { preHandler: writeGuards }, async (request) => {
    const payload = payrollCreateSchema.parse(request.body ?? {});
    return service.createPayrollEntry(payload);
  });

  app.post("/general-expenses/payroll/copy-to-next-month", { preHandler: writeGuards }, async (request) => {
    const payload = copySchema.parse(request.body ?? {});
    return service.copyPayrollToNextMonth(payload.year, payload.month);
  });

  app.patch("/general-expenses/payroll/:payrollEntryId/distribution", { preHandler: writeGuards }, async (request) => {
    const params = payrollParamsSchema.parse(request.params);
    const payload = payrollDistributionUpdateSchema.parse(request.body ?? {});
    return service.updatePayrollDistribution(params.payrollEntryId, payload);
  });

  app.patch("/general-expenses/payroll/:payrollEntryId", { preHandler: payrollPatchGuards }, async (request) => {
    const params = payrollParamsSchema.parse(request.params);
    const payload = payrollUpdateSchema.parse(request.body ?? {});
    const actor = getSessionUser(request);
    return service.updatePayrollEntry(params.payrollEntryId, payload, actor);
  });

  app.delete("/general-expenses/payroll/:payrollEntryId", { preHandler: writeGuards }, async (request, reply) => {
    const params = payrollParamsSchema.parse(request.params);
    await service.deletePayrollEntry(params.payrollEntryId);
    reply.code(204);
    return null;
  });

  app.patch("/general-expenses/emrt-acknowledgements/:date", { preHandler: [requireAuth] }, async (request) => {
    const params = emrtAcknowledgementParamsSchema.parse(request.params);
    const payload = emrtAcknowledgementUpdateSchema.parse(request.body ?? {});
    const actor = getSessionUser(request);
    return service.updateEmrtAcknowledgement(params.date, payload, actor);
  });

  app.patch("/general-expenses/:expenseId", { preHandler: patchGuards }, async (request) => {
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
