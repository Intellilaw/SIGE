import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import { applyDailyDocumentInstructions } from "./daily-document-instructions";

const writeDocumentSchema = z.object({
  templateId: z.enum([
    "general-power-letter",
    "labor-power-letter",
    "money-receipt",
    "rc-received-document-receipt",
    "rc-delivered-document-receipt",
    "property-delivery-receipt",
    "promissory-note"
  ]),
  templateTitle: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  clientId: z.string().trim().min(1),
  values: z.record(z.string()).default({})
});

const paramsSchema = z.object({
  documentId: z.string().min(1)
});

const instructionDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(240).optional(),
  paragraphs: z.array(z.string().trim().max(12000)).max(30).default([]),
  details: z.array(
    z.object({
      label: z.string().trim().min(1).max(120),
      value: z.string().trim().max(4000)
    })
  ).max(30).optional()
});

const instructionSchema = z.object({
  templateId: writeDocumentSchema.shape.templateId,
  templateTitle: z.string().trim().min(1).max(120),
  additionalInstructions: z.string().trim().min(1).max(4000),
  values: z.record(z.string()).default({}),
  document: instructionDocumentSchema
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

  app.post("/daily-documents/apply-instructions", { preHandler: writeGuards }, async (request) => {
    const payload = instructionSchema.parse(request.body ?? {});
    return applyDailyDocumentInstructions(payload);
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
