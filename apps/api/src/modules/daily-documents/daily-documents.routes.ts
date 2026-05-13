import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const writeDocumentSchema = z.object({
  templateId: z.enum([
    "general-power-letter",
    "labor-power-letter",
    "money-receipt",
    "rc-received-document-receipt",
    "rc-delivered-document-receipt",
    "property-delivery-receipt"
  ]),
  templateTitle: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  clientId: z.string().trim().min(1),
  values: z.record(z.string()).default({})
});

const paramsSchema = z.object({
  documentId: z.string().min(1)
});

export const dailyDocumentsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.DailyDocumentsService(app.repositories.dailyDocuments);
  const readGuards = [requireAuth, requireAnyPermissions(["daily-documents:read", "daily-documents:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["daily-documents:write"])];

  app.get("/daily-documents", { preHandler: readGuards }, async () => service.list());

  app.post("/daily-documents", { preHandler: writeGuards }, async (request) => {
    const payload = writeDocumentSchema.parse(request.body ?? {});
    return service.create(payload);
  });

  app.patch("/daily-documents/:documentId", { preHandler: writeGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const payload = writeDocumentSchema.parse(request.body ?? {});
    return service.update(params.documentId, payload);
  });

  app.delete("/daily-documents/:documentId", { preHandler: writeGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    await service.delete(params.documentId);
    reply.code(204);
    return null;
  });
};
