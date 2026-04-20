import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireRoles } from "../../core/auth/guards";

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

export const mattersRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.MattersService(app.repositories.matters);
  const authGuards = [requireAuth];
  const superadminGuards = [requireAuth, requireRoles(["SUPERADMIN"])];

  app.get("/matters", { preHandler: authGuards }, async () => service.list());

  app.get("/matters/recycle-bin", { preHandler: authGuards }, async () => service.listDeleted());

  app.get("/matters/short-names", { preHandler: authGuards }, async () => service.listCommissionShortNames());

  app.post("/matters", { preHandler: authGuards }, async (request) => {
    const payload = matterSchema.partial().parse(request.body ?? {});
    return service.create(payload);
  });

  app.patch("/matters/:matterId", { preHandler: authGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    const payload = matterSchema.parse(request.body);
    return service.update(params.matterId, payload);
  });

  app.post("/matters/bulk-trash", { preHandler: authGuards }, async (request, reply) => {
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

  app.post("/matters/:matterId/trash", { preHandler: authGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.trash(params.matterId);
  });

  app.post("/matters/:matterId/restore", { preHandler: authGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.restore(params.matterId);
  });

  app.post("/matters/:matterId/generate-identifier", { preHandler: authGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.generateIdentifier(params.matterId);
  });

  app.post("/matters/:matterId/send-to-execution", { preHandler: authGuards }, async (request) => {
    const params = matterIdParamsSchema.parse(request.params);
    return service.sendToExecution(params.matterId);
  });
};
