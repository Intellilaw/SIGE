import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const yearMonthSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2100),
  month: z.coerce.number().int().min(1).max(12)
});

const accountTypeSchema = z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "COST", "EXPENSE"]);
const accountNatureSchema = z.enum(["DEBIT", "CREDIT"]);

const accountPayloadSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(180),
  type: accountTypeSchema,
  subtype: z.string().nullable().optional(),
  satGroupingCode: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  nature: accountNatureSchema.optional()
});

const accountPatchSchema = accountPayloadSchema.partial().extend({
  isActive: z.boolean().optional()
});

const accountParamsSchema = z.object({
  accountId: z.string().min(1)
});

const journalLineSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().nullable().optional(),
  debitMxn: z.coerce.number().nonnegative().optional(),
  creditMxn: z.coerce.number().nonnegative().optional()
});

const journalEntrySchema = yearMonthSchema.extend({
  entryDate: z.string().min(1),
  entryType: z.enum(["OPENING", "MANUAL", "FINANCE_INCOME", "FINANCE_PAYMENT", "GENERAL_EXPENSE", "CFDI", "ADJUSTMENT"]).optional(),
  description: z.string().nullable().optional(),
  lines: z.array(journalLineSchema).min(2)
});

const openingBalanceSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2100),
  accountId: z.string().min(1),
  debitMxn: z.coerce.number().nonnegative().optional(),
  creditMxn: z.coerce.number().nonnegative().optional(),
  description: z.string().nullable().optional()
});

const cfdiUploadSchema = z.object({
  files: z.array(z.object({
    originalFileName: z.string().min(1),
    xmlBase64: z.string().min(1)
  })).min(1).max(200)
});

const catalogXmlUploadSchema = z.object({
  originalFileName: z.string().min(1),
  xmlBase64: z.string().min(1),
  replaceActiveCatalog: z.boolean().optional()
});

const catalogXmlImportSchema = catalogXmlUploadSchema.extend({
  confirm: z.literal(true)
});

const settingsSchema = z.object({
  companyRfc: z.string().nullable().optional(),
  legalName: z.string().nullable().optional()
});

const exportXmlSchema = yearMonthSchema.extend({
  format: z.enum(["CATALOGO", "BALANZA", "POLIZAS", "AUXILIAR_CUENTAS", "AUXILIAR_FOLIOS"])
});

function getActor(request: FastifyRequest) {
  const user = getSessionUser(request);
  return {
    userId: user.id,
    displayName: user.displayName || user.username || user.email
  };
}

export const accountingRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.AccountingService(app.repositories.accounting);
  const readGuards = [requireAuth, requireAnyPermissions(["accounting:read", "accounting:write", "finances:read", "finances:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["accounting:write", "finances:write"])];

  app.get("/accounting/overview", { preHandler: readGuards }, async (request) => {
    const query = yearMonthSchema.parse(request.query ?? {});
    return service.getOverview(query.year, query.month);
  });

  app.patch("/accounting/settings", { preHandler: writeGuards }, async (request) => {
    const payload = settingsSchema.parse(request.body ?? {});
    return service.updateSettings(payload);
  });

  app.post("/accounting/catalog/standard", { preHandler: writeGuards }, async () => service.initializeStandardCatalog());

  app.post("/accounting/catalog/xml/preview", { preHandler: writeGuards }, async (request) => {
    const payload = catalogXmlUploadSchema.parse(request.body ?? {});
    return service.previewCatalogXml(payload);
  });

  app.post("/accounting/catalog/xml/import", { preHandler: writeGuards }, async (request) => {
    const payload = catalogXmlImportSchema.parse(request.body ?? {});
    return service.importCatalogXml(payload);
  });

  app.post("/accounting/accounts", { preHandler: writeGuards }, async (request) => {
    const payload = accountPayloadSchema.parse(request.body ?? {});
    return service.createAccount(payload);
  });

  app.patch("/accounting/accounts/:accountId", { preHandler: writeGuards }, async (request) => {
    const params = accountParamsSchema.parse(request.params ?? {});
    const payload = accountPatchSchema.parse(request.body ?? {});
    return service.updateAccount(params.accountId, payload);
  });

  app.post("/accounting/journal-entries", { preHandler: writeGuards }, async (request) => {
    const payload = journalEntrySchema.parse(request.body ?? {});
    return service.createJournalEntry(payload, getActor(request));
  });

  app.post("/accounting/opening-balances", { preHandler: writeGuards }, async (request) => {
    const payload = openingBalanceSchema.parse(request.body ?? {});
    return service.createOpeningBalance(payload, getActor(request));
  });

  app.post("/accounting/cfdi/upload", { preHandler: writeGuards }, async (request) => {
    const payload = cfdiUploadSchema.parse(request.body ?? {});
    return service.uploadCfdiDocuments(payload.files);
  });

  app.post("/accounting/generate-automatic", { preHandler: writeGuards }, async (request) => {
    const payload = yearMonthSchema.parse(request.body ?? {});
    return service.generateAutomaticEntries(payload.year, payload.month);
  });

  app.post("/accounting/sat-xml", { preHandler: writeGuards }, async (request) => {
    const payload = exportXmlSchema.parse(request.body ?? {});
    return service.exportSatXml(payload.year, payload.month, payload.format);
  });
};
