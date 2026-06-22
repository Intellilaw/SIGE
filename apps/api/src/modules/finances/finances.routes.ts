import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { deriveEffectivePermissions, type FinanceRecord } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import { filterExternalVisibleMatters, isExternalScopedUser } from "../../core/auth/external-matter-access";

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
  delinquencyStatus: z.enum(["CURRENT", "DAYS_1_TO_10", "MORE_THAN_10", "MORE_THAN_20", "MORE_THAN_30"]).optional(),
  paidThisMonthMxn: z.coerce.number().nonnegative().optional(),
  payment2Mxn: z.coerce.number().nonnegative().optional(),
  payment3Mxn: z.coerce.number().nonnegative().optional(),
  paymentDate1: z.string().nullable().optional(),
  paymentDate2: z.string().nullable().optional(),
  paymentDate3: z.string().nullable().optional(),
  paymentMethod: z.enum(["blank", "T", "E"]).optional(),
  paymentMethod2: z.enum(["blank", "T", "E"]).optional(),
  paymentMethod3: z.enum(["blank", "T", "E"]).optional(),
  paymentReceived: z.boolean().optional(),
  paymentReceived2: z.boolean().optional(),
  paymentReceived3: z.boolean().optional(),
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
  highCollectionProbability: z.boolean().optional(),
  lowCollectionProbability: z.boolean().optional(),
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
  const monthlyReadGuards = [requireAuth, requireAnyPermissions(["finances:read", "finances:write", "finances:monthly:read"])];
  const readGuards = [requireAuth, requireAnyPermissions(["finances:read", "finances:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["finances:write"])];
  const sendMatterGuards = [requireAuth, requireAnyPermissions(["finances:write"])];
  const deleteGuards = [requireAuth, requireAnyPermissions(["finances:write"])];

  function normalizeComparableText(value?: string | null) {
    return (value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function buildFinanceMatchKey(input: { quoteNumber?: string | null; clientName?: string | null; subject?: string | null }) {
    const quoteNumber = normalizeComparableText(input.quoteNumber);
    if (quoteNumber) {
      return `quote:${quoteNumber}`;
    }

    const clientName = normalizeComparableText(input.clientName);
    const subject = normalizeComparableText(input.subject);
    if (!clientName || !subject) {
      return null;
    }

    return `matter:${clientName}|${subject}`;
  }

  function isEmrtUser(request: FastifyRequest) {
    const user = getSessionUser(request);
    return [user.shortName, user.username].some((value) => normalizeComparableText(value) === "emrt");
  }

  function enforcePaymentMethodPermission(
    request: FastifyRequest,
    payload: {
      paymentMethod?: FinanceRecord["paymentMethod"];
      paymentMethod2?: FinanceRecord["paymentMethod2"];
      paymentMethod3?: FinanceRecord["paymentMethod3"];
      paymentReceived?: boolean;
      paymentReceived2?: boolean;
      paymentReceived3?: boolean;
    }
  ) {
    const hasReceivedCashField = Object.prototype.hasOwnProperty.call(payload, "paymentReceived") ||
      Object.prototype.hasOwnProperty.call(payload, "paymentReceived2") ||
      Object.prototype.hasOwnProperty.call(payload, "paymentReceived3");
    if (hasReceivedCashField && !isEmrtUser(request)) {
      throw new app.errors.AppError(
        403,
        "FORBIDDEN_PAYMENT_METHOD",
        "Only EMRT can update the cash received checkbox."
      );
    }
  }

  function getEffectivePermissions(request: FastifyRequest) {
    const user = getSessionUser(request);
    return deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      secondaryTeam: user.secondaryTeam,
      secondaryLegacyTeam: user.secondaryLegacyTeam,
      specificRole: user.specificRole,
      secondarySpecificRole: user.secondarySpecificRole,
      permissions: user.permissions,
      isExternal: user.isExternal
    });
  }

  function canReadFullFinances(permissions: string[]) {
    return permissions.includes("*")
      || permissions.includes("finances:read")
      || permissions.includes("finances:write")
      || permissions.includes("finances:monthly:read");
  }

  async function filterExternalFinanceRecords(request: FastifyRequest, records: FinanceRecord[]) {
    const user = getSessionUser(request);
    const permissions = getEffectivePermissions(request);

    if (!isExternalScopedUser(user)) {
      return records;
    }

    if (!permissions.includes("external-finances:read")) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    const visibleMatters = filterExternalVisibleMatters(user, await app.repositories.matters.list());
    const matterKeys = new Set(
      visibleMatters
        .map(buildFinanceMatchKey)
        .filter((key): key is string => Boolean(key))
    );

    return records.filter((record) => {
      const key = buildFinanceMatchKey(record);
      return Boolean(key && matterKeys.has(key));
    });
  }

  app.get("/finances/records", { preHandler: [requireAuth] }, async (request) => {
    const query = yearMonthSchema.parse(request.query);
    const permissions = getEffectivePermissions(request);
    const user = getSessionUser(request);

    if (!canReadFullFinances(permissions) && !(isExternalScopedUser(user) && permissions.includes("external-finances:read"))) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    const records = isExternalScopedUser(user)
      ? await service.listRecordsReadOnly(query.year, query.month)
      : await service.listRecords(query.year, query.month);
    return filterExternalFinanceRecords(request, records);
  });

  app.post("/finances/records", { preHandler: writeGuards }, async (request) => {
    const payload = createFinanceRecordSchema.parse(request.body ?? {});
    enforcePaymentMethodPermission(request, payload);
    return service.createRecord(payload.year, payload.month, payload);
  });

  app.patch("/finances/records/:recordId", { preHandler: writeGuards }, async (request) => {
    const params = recordIdParamsSchema.parse(request.params);
    const payload = financeRecordFieldsSchema.parse(request.body ?? {});
    enforcePaymentMethodPermission(request, payload);
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

  app.get("/finances/commission-receivers", { preHandler: monthlyReadGuards }, async () => service.listCommissionReceivers());
};
