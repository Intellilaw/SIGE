import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import { exportQuoteDocument } from "./quote-export";
import { translateQuoteTemplateWithLlm } from "./quote-template-translator";

const teamSchema = z.enum([
  "ADMIN",
  "CLIENT_RELATIONS",
  "FINANCE",
  "LITIGATION",
  "CORPORATE_LABOR",
  "SETTLEMENTS",
  "FINANCIAL_LAW",
  "TAX_COMPLIANCE",
  "ADMIN_OPERATIONS"
] as const);

const lineItemSchema = z.object({
  concept: z.string().min(2),
  amountMxn: z.number().nonnegative()
});

const templateCellSchema = z.object({
  value: z.string(),
  rowSpan: z.number().int().min(1),
  hidden: z.boolean()
});

const amountColumnSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  enabled: z.boolean(),
  mode: z.enum(["FIXED", "VARIABLE"])
});

const tableRowSchema = z.object({
  id: z.string().min(1),
  conceptDescription: z.string(),
  excludeFromIva: z.boolean().optional(),
  amountCells: z.array(templateCellSchema).length(2),
  paymentMoment: templateCellSchema,
  notesCell: templateCellSchema
});

const quoteSchema = z.object({
  clientId: z.string(),
  clientName: z.string().min(2),
  responsibleTeam: teamSchema.optional(),
  subject: z.string().min(3),
  status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]),
  quoteType: z.enum(["ONE_TIME", "RETAINER"]),
  language: z.enum(["es", "en"]).optional(),
  quoteDate: z.string().optional(),
  amountColumns: z.array(amountColumnSchema).length(2).optional(),
  tableRows: z.array(tableRowSchema).min(1).optional(),
  lineItems: z.array(lineItemSchema).min(1),
  milestone: z.string().optional(),
  notes: z.string().optional()
});

const quoteTemplateSchema = z.object({
  team: teamSchema,
  services: z.string().min(2),
  quoteType: z.enum(["ONE_TIME", "RETAINER"]),
  amountColumns: z.array(amountColumnSchema).length(2),
  tableRows: z.array(tableRowSchema).min(1),
  milestone: z.string().optional(),
  notes: z.string().optional()
});

const quoteTemplateLineItemSchema = z.object({
  concept: z.string(),
  amountMxn: z.number().nonnegative()
});

const quoteTemplateTranslationSchema = z.object({
  template: z.object({
    id: z.string().min(1),
    templateNumber: z.string().min(1),
    name: z.string(),
    team: teamSchema,
    subject: z.string(),
    services: z.string(),
    quoteType: z.enum(["ONE_TIME", "RETAINER"]),
    amountColumns: z.array(amountColumnSchema).length(2),
    tableRows: z.array(tableRowSchema).min(1),
    lineItems: z.array(quoteTemplateLineItemSchema),
    totalMxn: z.number().nonnegative(),
    milestone: z.string().optional(),
    notes: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string()
  })
});

const quoteTemplateIdParamsSchema = z.object({
  templateId: z.string().min(1)
});

const quoteIdParamsSchema = z.object({
  quoteId: z.string().min(1)
});

const quoteExportParamsSchema = z.object({
  quoteId: z.string().min(1),
  format: z.enum(["pdf", "word"])
});

export const quotesRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.QuotesService(app.repositories.quotes);
  const readGuards = [requireAuth, requireAnyPermissions(["quotes:read", "quotes:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["quotes:write"])];

  app.get("/quotes", { preHandler: readGuards }, async () => service.list());
  app.get("/quotes/templates", { preHandler: readGuards }, async () => service.listTemplates());
  app.post("/quotes", { preHandler: writeGuards }, async (request) => {
    const payload = quoteSchema.parse(request.body);
    return service.create(payload);
  });
  app.patch("/quotes/:quoteId", { preHandler: writeGuards }, async (request) => {
    const params = quoteIdParamsSchema.parse(request.params);
    const payload = quoteSchema.parse(request.body);
    return service.update(params.quoteId, payload);
  });
  app.delete("/quotes/:quoteId", { preHandler: writeGuards }, async (request, reply) => {
    const params = quoteIdParamsSchema.parse(request.params);
    await service.delete(params.quoteId);
    reply.code(204);
    return null;
  });
  app.get("/quotes/:quoteId/export/:format", { preHandler: readGuards }, async (request, reply) => {
    const params = quoteExportParamsSchema.parse(request.params);
    const quote = await service.findById(params.quoteId);

    if (!quote) {
      reply.code(404);
      return {
        code: "QUOTE_NOT_FOUND",
        message: "Quote was not found."
      };
    }

    const file = await exportQuoteDocument(quote, params.format);
    reply.header("Content-Type", file.contentType);
    reply.header("Content-Disposition", `attachment; filename="${file.filename}"`);
    return reply.send(file.buffer);
  });
  app.post("/quotes/templates", { preHandler: writeGuards }, async (request) => {
    const payload = quoteTemplateSchema.parse(request.body);
    return service.createTemplate(payload);
  });
  app.post("/quotes/templates/translate", { preHandler: writeGuards }, async (request) => {
    const payload = quoteTemplateTranslationSchema.parse(request.body);
    const translatedTemplate = await translateQuoteTemplateWithLlm(payload.template);

    return {
      template: translatedTemplate
    };
  });
  app.patch("/quotes/templates/:templateId", { preHandler: writeGuards }, async (request) => {
    const params = quoteTemplateIdParamsSchema.parse(request.params);
    const payload = quoteTemplateSchema.parse(request.body);
    return service.updateTemplate(params.templateId, payload);
  });
  app.delete("/quotes/templates/:templateId", { preHandler: writeGuards }, async (request, reply) => {
    const params = quoteTemplateIdParamsSchema.parse(request.params);
    await service.deleteTemplate(params.templateId);
    reply.code(204);
    return null;
  });
};
