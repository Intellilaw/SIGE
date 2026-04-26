import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../../core/auth/guards";

const createClientSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

const updateClientSchema = createClientSchema;

const clientIdParamsSchema = z.object({
  clientId: z.string().min(1)
});

export const clientsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.ClientsService(app.repositories.clients);

  app.get("/clients", { preHandler: [requireAuth] }, async () => service.list());
  app.post("/clients", { preHandler: [requireAuth] }, async (request) => {
    const payload = createClientSchema.parse(request.body);
    return service.create(payload.name);
  });
  app.patch("/clients/:clientId", { preHandler: [requireAuth] }, async (request) => {
    const params = clientIdParamsSchema.parse(request.params);
    const payload = updateClientSchema.parse(request.body);
    return service.update(params.clientId, payload.name);
  });
  app.delete("/clients/:clientId", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = clientIdParamsSchema.parse(request.params);
    await service.delete(params.clientId);
    reply.code(204);
    return null;
  });
};
