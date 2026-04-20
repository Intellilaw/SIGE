import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../../core/auth/guards";

const leadStatusSchema = z.enum(["ACTIVE", "MOVED_TO_MATTERS", "ARCHIVED"]);
const leadChannelSchema = z.enum(["WHATSAPP", "TELEGRAM", "WECHAT", "EMAIL", "PHONE"]);

const leadWriteSchema = z.object({
  clientId: z.string().nullable().optional(),
  clientName: z.string().optional(),
  prospectName: z.string().nullable().optional(),
  commissionAssignee: z.string().nullable().optional(),
  quoteId: z.string().nullable().optional(),
  quoteNumber: z.string().nullable().optional(),
  subject: z.string().optional(),
  amountMxn: z.number().nonnegative().optional(),
  communicationChannel: leadChannelSchema.optional(),
  lastInteractionLabel: z.string().nullable().optional(),
  lastInteraction: z.string().nullable().optional(),
  nextInteractionLabel: z.string().nullable().optional(),
  nextInteraction: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sentToClientAt: z.string().nullable().optional(),
  sentToMattersAt: z.string().nullable().optional(),
  hiddenFromTracking: z.boolean().optional(),
  status: leadStatusSchema.optional()
});

const leadIdParamsSchema = z.object({
  leadId: z.string().min(1)
});

const monthlyQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12)
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1)
});

export const leadsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.LeadsService(app.repositories.leads);
  const authGuards = [requireAuth];

  app.get("/leads", { preHandler: authGuards }, async () => service.list());

  app.get("/leads/history", { preHandler: authGuards }, async () => service.listHistory());

  app.get("/leads/monthly", { preHandler: authGuards }, async (request) => {
    const query = monthlyQuerySchema.parse(request.query);
    return service.listMonthly(query.year, query.month);
  });

  app.get("/leads/short-names", { preHandler: authGuards }, async () => service.listCommissionShortNames());

  app.post("/leads", { preHandler: authGuards }, async (request) => {
    const payload = leadWriteSchema.partial().parse(request.body ?? {});
    return service.create(payload);
  });

  app.post("/leads/bulk-delete", { preHandler: authGuards }, async (request, reply) => {
    const payload = bulkDeleteSchema.parse(request.body);
    await service.bulkDelete(payload.ids);
    reply.code(204);
    return null;
  });

  app.post("/leads/:leadId/mark-sent-to-client", { preHandler: authGuards }, async (request) => {
    const params = leadIdParamsSchema.parse(request.params);
    return service.markSentToClient(params.leadId);
  });

  app.post("/leads/:leadId/send-to-matters", { preHandler: authGuards }, async (request) => {
    const params = leadIdParamsSchema.parse(request.params);
    return service.sendToMatters(params.leadId);
  });

  app.post("/leads/:leadId/return-to-active", { preHandler: authGuards }, async (request) => {
    const params = leadIdParamsSchema.parse(request.params);
    return service.returnToActive(params.leadId);
  });

  app.patch("/leads/:leadId", { preHandler: authGuards }, async (request) => {
    const params = leadIdParamsSchema.parse(request.params);
    const payload = leadWriteSchema.parse(request.body);
    return service.update(params.leadId, payload);
  });

  app.delete("/leads/:leadId", { preHandler: authGuards }, async (request, reply) => {
    const params = leadIdParamsSchema.parse(request.params);
    await service.delete(params.leadId);
    reply.code(204);
    return null;
  });
};
