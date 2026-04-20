import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth } from "../../core/auth/guards";

const createClientSchema = z.object({
  name: z.string().min(2).max(120)
});

export const clientsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.ClientsService(app.repositories.clients);

  app.get("/clients", { preHandler: [requireAuth] }, async () => service.list());
  app.post("/clients", { preHandler: [requireAuth] }, async (request) => {
    const payload = createClientSchema.parse(request.body);
    return service.create(payload.name);
  });
};