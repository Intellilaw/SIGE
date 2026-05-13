import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { deriveEffectivePermissions } from "@sige/contracts";

import { getSessionUser, requireAnyPermissions, requireAuth, requireRoles } from "../../core/auth/guards";

const teamSchema = z.enum([
  "CLIENT_RELATIONS",
  "FINANCE",
  "LITIGATION",
  "CORPORATE_LABOR",
  "SETTLEMENTS",
  "FINANCIAL_LAW",
  "TAX_COMPLIANCE",
  "ADMIN",
  "ADMIN_OPERATIONS"
]);

const matterSchema = z.object({
  clientId: z.string().nullable().optional(),
  clientNumber: z.string().nullable().optional(),
  clientName: z.string().optional(),
  quoteId: z.string().nullable().optional(),
  quoteNumber: z.string().nullable().optional(),
  commissionAssignee: z.string().nullable().optional(),
  matterType: z.enum(["ONE_TIME", "RETAINER"]).optional(),
  subject: z.string().optional(),
  specificProcess: z.string().nullable().optional(),
  totalFeesMxn: z.number().nonnegative().optional(),
  responsibleTeam: teamSchema.nullable().optional(),
  nextPaymentDate: z.string().nullable().optional(),
  communicationChannel: z.enum(["WHATSAPP", "TELEGRAM", "WECHAT", "EMAIL", "PHONE"]).optional(),
  r1InternalCreated: z.boolean().optional(),
  telegramBotLinked: z.boolean().optional(),
  rdCreated: z.boolean().optional(),
  rfCreated: z.enum(["YES", "NO", "NOT_REQUIRED"]).optional(),
  r1ExternalCreated: z.boolean().optional(),
  billingChatCreated: z.boolean().optional(),
  matterIdentifier: z.string().nullable().optional(),
  executionLinkedModule: z.string().nullable().optional(),
  executionLinkedAt: z.string().nullable().optional(),
  executionPrompt: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  nextActionDueAt: z.string().nullable().optional(),
  nextActionSource: z.string().nullable().optional(),
  milestone: z.string().nullable().optional(),
  concluded: z.boolean().optional(),
  stage: z.enum(["INTAKE", "EXECUTION", "CLOSED"]).optional(),
  origin: z.enum(["MANUAL", "LEAD", "QUOTE"]).optional(),
  notes: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional()
});

const matterIdParamsSchema = z.object({
  matterId: z.string().min(1)
});

const bulkTrashSchema = z.object({
  ids: z.array(z.string().min(1)).min(1)
});

const executionPermissionByTeam = {
  LITIGATION: "execution:litigation",
  CORPORATE_LABOR: "execution:corporate-labor",
  SETTLEMENTS: "execution:settlements",
  FINANCIAL_LAW: "execution:financial-law",
  TAX_COMPLIANCE: "execution:tax-compliance"
} as const;

function isFinanceNextPaymentDatePatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "nextPaymentDate";
}

function isExecutionMatterPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set(["executionPrompt", "concluded", "notes"]);
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => allowedKeys.has(key));
}

function canAccessOwnExecutionMatter(params: {
  permissions: string[];
  userTeam?: string;
  responsibleTeam?: string | null;
}) {
  if (!params.responsibleTeam || params.userTeam !== params.responsibleTeam) {
    return false;
  }

  const permission = executionPermissionByTeam[params.responsibleTeam as keyof typeof executionPermissionByTeam];
  return Boolean(permission && (params.permissions.includes("*") || params.permissions.includes(permission)));
}

export const mattersRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.MattersService(app.repositories.matters);
  const readGuards = [requireAuth, requireAnyPermissions(["matters:read", "matters:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["matters:write"])];
  const superadminGuards = [requireAuth, requireRoles(["SUPERADMIN"])];

  app.get("/matters", { preHandler: readGuards }, async () => service.list());

  app.get("/matters/recycle-bin", { preHandler: readGuards }, async () => service.listDeleted());

  app.get("/matters/short-names", { preHandler: readGuards }, async () => service.listCommissionShortNames());

  app.post("/matters", { preHandler: writeGuards }, async (request) => {
    const payload = matterSchema.partial().parse(request.body ?? {});
    return service.create(payload);
  });

  app.patch("/matters/:matterId", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);
    const permissions = deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole
    });
    const canWriteMatters = permissions.includes("*") || permissions.includes("matters:write");
    const canUpdateFinanceDate = permissions.includes("*") || (
      permissions.includes("finances:write") && isFinanceNextPaymentDatePatch(request.body)
    );
    const canUpdateOwnExecutionMatter = isExecutionMatterPatch(request.body) && canAccessOwnExecutionMatter({
      permissions,
      userTeam: user.team,
      responsibleTeam: (await service.list()).find((matter) => matter.id === params.matterId)?.responsibleTeam
    });

    if (!canWriteMatters && !canUpdateFinanceDate && !canUpdateOwnExecutionMatter) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    const payload = matterSchema.parse(request.body);
    return service.update(params.matterId, payload);
  });

  app.post("/matters/bulk-trash", { preHandler: writeGuards }, async (request, reply) => {
    const payload = bulkTrashSchema.parse(request.body);
    await service.bulkTrash(payload.ids);
    reply.code(204);
    return null;
  });

  app.post("/matters/bulk-delete", { preHandler: superadminGuards }, async (request, reply) => {
    const payload = bulkTrashSchema.parse(request.body);
    await service.bulkDelete(payload.ids);
    reply.code(204);
    return null;
  });

  app.post("/matters/:matterId/trash", { preHandler: writeGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.trash(params.matterId);
  });

  app.post("/matters/:matterId/restore", { preHandler: [requireAuth] }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const user = getSessionUser(request);
    const permissions = deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole
    });

    if (!permissions.includes("*") && !permissions.includes("matters:write")) {
      const deletedMatter = (await service.listDeleted()).find((matter) => matter.id === params.matterId);
      if (!canAccessOwnExecutionMatter({
        permissions,
        userTeam: user.team,
        responsibleTeam: deletedMatter?.responsibleTeam
      })) {
        throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
      }
    }

    return service.restore(params.matterId);
  });

  app.post("/matters/:matterId/generate-identifier", { preHandler: writeGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.generateIdentifier(params.matterId);
  });

  app.post("/matters/:matterId/send-to-execution", { preHandler: writeGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.sendToExecution(params.matterId);
  });
};
