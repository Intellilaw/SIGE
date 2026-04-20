import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import type { CreateCommissionSnapshotRecord } from "../../repositories/types";

const periodQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12)
});

const receiverBodySchema = z.object({
  name: z.string().min(1).max(120)
});

const receiverParamsSchema = z.object({
  receiverId: z.string().min(1)
});

const snapshotBodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  section: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  totalNetMxn: z.number(),
  snapshotData: z.unknown().optional()
});

export const commissionsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.CommissionsService(app.repositories.commissions);
  const authGuards = [requireAuth, requireAnyPermissions(["commissions:read"])];

  app.get("/commissions/overview", { preHandler: authGuards }, async (request) => {
    const query = periodQuerySchema.parse(request.query);
    return service.getOverview(query.year, query.month);
  });

  app.get("/commissions/receivers", { preHandler: authGuards }, async () => service.listReceivers());

  app.post("/commissions/receivers", { preHandler: authGuards }, async (request) => {
    const payload = receiverBodySchema.parse(request.body ?? {});
    return service.createReceiver(payload.name);
  });

  app.patch("/commissions/receivers/:receiverId", { preHandler: authGuards }, async (request) => {
    const params = receiverParamsSchema.parse(request.params);
    const payload = receiverBodySchema.parse(request.body ?? {});
    const receiver = await service.updateReceiver(params.receiverId, payload.name);
    if (!receiver) {
      throw new app.errors.AppError(404, "COMMISSION_RECEIVER_NOT_FOUND", "The requested receiver does not exist.");
    }
    return receiver;
  });

  app.delete("/commissions/receivers/:receiverId", { preHandler: authGuards }, async (request, reply) => {
    const params = receiverParamsSchema.parse(request.params);
    await service.deleteReceiver(params.receiverId);
    reply.code(204);
    return null;
  });

  app.get("/commissions/snapshots", { preHandler: authGuards }, async () => service.listSnapshots());

  app.post("/commissions/snapshots", { preHandler: authGuards }, async (request) => {
    const payload = snapshotBodySchema.parse(request.body ?? {}) as CreateCommissionSnapshotRecord;
    return service.createSnapshot(payload);
  });
};
