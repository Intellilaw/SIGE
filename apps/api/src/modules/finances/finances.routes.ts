import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";

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

const yearMonthSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2100),
  month: z.coerce.number().int().min(1).max(12)
});

const financeRecordFieldsSchema = z.object({
  clientNumber: z.string().nullable().optional(),
  clientName: z.string().optional(),
  quoteNumber: z.string().nullable().optional(),
  matterType: z.enum(["ONE_TIME", "RETAINER"]).optional(),
  subject: z.string().optional(),
  contractSignedStatus: z.enum(["YES", "NO", "NOT_REQUIRED"]).optional(),
  responsibleTeam: teamSchema.nullable().optional(),
  totalMatterMxn: z.coerce.number().nonnegative().optional(),
  workingConcepts: z.string().nullable().optional(),
  conceptFeesMxn: z.coerce.number().nonnegative().optional(),
  previousPaymentsMxn: z.coerce.number().nonnegative().optional(),
  nextPaymentDate: z.string().nullable().optional(),
  nextPaymentNotes: z.string().nullable().optional(),
  paidThisMonthMxn: z.coerce.number().nonnegative().optional(),
  payment2Mxn: z.coerce.number().nonnegative().optional(),
  payment3Mxn: z.coerce.number().nonnegative().optional(),
  paymentDate1: z.string().nullable().optional(),
  paymentDate2: z.string().nullable().optional(),
  paymentDate3: z.string().nullable().optional(),
  expenseNotes1: z.string().nullable().optional(),
  expenseNotes2: z.string().nullable().optional(),
  expenseNotes3: z.string().nullable().optional(),
  expenseAmount1Mxn: z.coerce.number().nonnegative().optional(),
  expenseAmount2Mxn: z.coerce.number().nonnegative().optional(),
  expenseAmount3Mxn: z.coerce.number().nonnegative().optional(),
  pctLitigation: z.coerce.number().int().min(0).max(100).optional(),
  pctCorporateLabor: z.coerce.number().int().min(0).max(100).optional(),
  pctSettlements: z.coerce.number().int().min(0).max(100).optional(),
  pctFinancialLaw: z.coerce.number().int().min(0).max(100).optional(),
  pctTaxCompliance: z.coerce.number().int().min(0).max(100).optional(),
  clientCommissionRecipient: z.string().nullable().optional(),
  closingCommissionRecipient: z.string().nullable().optional(),
  milestone: z.string().nullable().optional(),
  concluded: z.boolean().optional(),
  financeComments: z.string().nullable().optional()
});

const createFinanceRecordSchema = yearMonthSchema.merge(financeRecordFieldsSchema);

const recordIdParamsSchema = z.object({
  recordId: z.string().min(1)
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1)
});

const sendMatterSchema = yearMonthSchema.extend({
  matterId: z.string().min(1)
});

export const financesRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.FinancesService(app.repositories.finances);
  const readGuards = [requireAuth, requireAnyPermissions(["finances:read", "finances:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["finances:write"])];
  const sendMatterGuards = [requireAuth, requireAnyPermissions(["finances:write", "matters:write"])];
  const deleteGuards = [requireAuth, requireAnyPermissions(["finances:write"])];

  app.get("/finances/records", { preHandler: readGuards }, async (request) => {
    const query = yearMonthSchema.parse(request.query);
    return service.listRecords(query.year, query.month);
  });

  app.post("/finances/records", { preHandler: writeGuards }, async (request) => {
    const payload = createFinanceRecordSchema.parse(request.body ?? {});
    return service.createRecord(payload.year, payload.month, payload);
  });

  app.patch("/finances/records/:recordId", { preHandler: writeGuards }, async (request) => {
    const params = recordIdParamsSchema.parse(request.params);
    const payload = financeRecordFieldsSchema.parse(request.body ?? {});
    return service.updateRecord(params.recordId, payload);
  });

  app.delete("/finances/records/:recordId", { preHandler: deleteGuards }, async (request, reply) => {
    const params = recordIdParamsSchema.parse(request.params);
    await service.deleteRecord(params.recordId);
    reply.code(204);
    return null;
  });

  app.post("/finances/records/bulk-delete", { preHandler: deleteGuards }, async (request, reply) => {
    const payload = bulkDeleteSchema.parse(request.body ?? {});
    await service.bulkDelete(payload.ids);
    reply.code(204);
    return null;
  });

  app.post("/finances/records/copy-to-next-month", { preHandler: writeGuards }, async (request) => {
    const payload = yearMonthSchema.parse(request.body ?? {});
    return service.copyToNextMonth(payload.year, payload.month);
  });

  app.get("/finances/snapshots", { preHandler: readGuards }, async () => service.listSnapshots());

  app.post("/finances/snapshots", { preHandler: writeGuards }, async (request) => {
    const payload = yearMonthSchema.parse(request.body ?? {});
    return service.createSnapshot(payload.year, payload.month);
  });

  app.post("/finances/send-matter", { preHandler: sendMatterGuards }, async (request) => {
    const payload = sendMatterSchema.parse(request.body ?? {});
    return service.sendMatterToFinance(payload.matterId, payload.year, payload.month);
  });

  app.get("/finances/commission-receivers", { preHandler: readGuards }, async () => service.listCommissionReceivers());
};
