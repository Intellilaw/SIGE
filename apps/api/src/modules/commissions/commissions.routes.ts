import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { deriveEffectivePermissions } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import { getCurrentOrganizationIdOrDefault } from "../../core/tenant/tenant-context";
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

const exclusionBodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  section: z.string().min(1).max(120),
  group: z.enum(["EXECUTION", "CLIENT", "CLOSING"]),
  financeRecordId: z.string().min(1),
  excluded: z.boolean()
});

const matterExclusionBodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  matterId: z.string().min(1),
  excluded: z.boolean()
});

const projectorCommissionParamsSchema = z.object({
  entryId: z.string().min(1)
});

const projectorCommissionBodySchema = z.object({
  amountMxn: z.number().finite().min(0).max(1000000000).optional(),
  authorized: z.boolean().optional()
}).refine((payload) => payload.amountMxn !== undefined || payload.authorized !== undefined, {
  message: "At least one projector commission field is required."
});

const paymentAcknowledgementReconcileSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  rows: z.array(z.object({
    section: z.string().min(1).max(120),
    amountMxn: z.number().finite().min(0).max(1000000000)
  })).max(100)
});

const paymentAcknowledgementUpdateSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  section: z.string().min(1).max(120),
  paidByTransfer: z.boolean().optional(),
  receivedByAraceli: z.boolean().optional(),
  receivedByEmrt: z.boolean().optional(),
  excluded: z.boolean().optional()
}).superRefine((payload, context) => {
  const fields = ["paidByTransfer", "receivedByAraceli", "receivedByEmrt", "excluded"]
    .filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
  if (fields.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Update exactly one commission payment field at a time."
    });
  }
});

const signedReceiptUploadSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  section: z.string().min(1).max(120),
  originalFileName: z.string().min(1).max(240),
  fileBase64: z.string().min(1).max(14_000_000)
});

const signedReceiptQuerySchema = periodQuerySchema.extend({
  section: z.string().min(1).max(120)
});

function decodeFileBase64(value: string) {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(payload, "base64");
}

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeIdentityText(value?: string | null) {
  return normalizeComparableText(value)
    .replace(/[@._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isClientRelationsSection(section: string) {
  return normalizeComparableText(section) === normalizeComparableText("Comunicacion con cliente");
}

function isOwnCommissionSection(section: string, request: FastifyRequest) {
  const user = getSessionUser(request);
  const roleSections: Record<string, string> = {
    [normalizeComparableText("Proyectista 1")]: "Proyectista 1 (EKPO)",
    [normalizeComparableText("Proyectista 2")]: "Proyectista 2 (NBSG)"
  };
  const expectedSection = roleSections[normalizeComparableText(user.specificRole)] ?? user.specificRole;
  return Boolean(expectedSection) && normalizeComparableText(section) === normalizeComparableText(expectedSection);
}

export const commissionsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.CommissionsService(app.repositories.commissions);
  const readGuards = [requireAuth, requireAnyPermissions([
    "commissions:read",
    "commissions:all:read",
    "commissions:write",
    "commissions:client-relations:write",
    "commissions:own-section:write"
  ])];
  const writeGuards = [requireAuth, requireAnyPermissions(["commissions:write"])];
  const snapshotWriteGuards = [requireAuth, requireAnyPermissions([
    "commissions:write",
    "commissions:client-relations:write",
    "commissions:own-section:write"
  ])];

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

  function canReadAllCommissions(permissions: string[]) {
    return permissions.includes("*")
      || permissions.includes("commissions:write")
      || permissions.includes("commissions:all:read");
  }

  function canManageAllCommissions(permissions: string[]) {
    return permissions.includes("*") || permissions.includes("commissions:write");
  }

  function canManageCommissionExclusions(request: FastifyRequest) {
    const user = getSessionUser(request);
    const permissions = getEffectivePermissions(request);
    const canWriteCommissionExclusions = permissions.includes("commissions:exclusions:write");
    const hasSuperadminAccess = permissions.includes("*")
      || user.role === "SUPERADMIN"
      || user.legacyRole === "SUPERADMIN";
    const emailLocalPart = user.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
    const isEduardoRusconi = [user.shortName, user.username, user.displayName, user.email, emailLocalPart].some((value) => {
      const normalized = normalizeIdentityText(value);
      return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
    });

    return canWriteCommissionExclusions || (hasSuperadminAccess && isEduardoRusconi);
  }

  function canManageProjectorCommissions(request: FastifyRequest) {
    const user = getSessionUser(request);
    const emailLocalPart = user.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
    const isEduardoRusconi = [user.shortName, user.username, user.displayName, user.email, emailLocalPart].some((value) => {
      const normalized = normalizeIdentityText(value);
      return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
    });
    const hasSuperadminAccess = user.role === "SUPERADMIN"
      || user.legacyRole === "SUPERADMIN";

    return getCurrentOrganizationIdOrDefault() === "org-rusconi" && hasSuperadminAccess && isEduardoRusconi;
  }

  function isFinanceTeamMember(request: FastifyRequest) {
    const user = getSessionUser(request);
    const isFinance = user.team === "FINANCE"
      || user.secondaryTeam === "FINANCE"
      || [user.legacyTeam, user.secondaryLegacyTeam, user.specificRole, user.secondarySpecificRole]
        .some((value) => normalizeComparableText(value) === "finanzas");

    return getCurrentOrganizationIdOrDefault() === "org-rusconi" && isFinance;
  }

  function isAraceliLozano(request: FastifyRequest) {
    const user = getSessionUser(request);
    const identities = [user.username, user.displayName, user.email].map(normalizeComparableText);

    return isFinanceTeamMember(request) && identities.some((identity) =>
      identity === "araceli lozano"
      || identity === "araceli lozano escamilla"
      || identity.startsWith("araceli.lozano")
      || identity.startsWith("araceli lozano")
    );
  }

  function isEmrtSuperadmin(request: FastifyRequest) {
    return canManageProjectorCommissions(request);
  }

  function canMarkPaidByTransfer(request: FastifyRequest) {
    return isFinanceTeamMember(request) || isEmrtSuperadmin(request);
  }

  app.get("/commissions/overview", { preHandler: readGuards }, async (request) => {
    const query = periodQuerySchema.parse(request.query);
    return service.getOverview(query.year, query.month);
  });

  app.get("/commissions/period-lock", { preHandler: [requireAuth] }, async (request) => {
    const query = periodQuerySchema.parse(request.query);
    const state = await service.getPaymentFlowState(query.year, query.month);
    return {
      year: state.year,
      month: state.month,
      locked: state.locked,
      confirmedByEmrtCount: state.confirmedByEmrtCount
    };
  });

  app.post("/commissions/payment-acknowledgements/reconcile", { preHandler: readGuards }, async (request) => {
    const permissions = getEffectivePermissions(request);
    if (!canReadAllCommissions(permissions)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Only users with full commission access can reconcile payment totals.");
    }

    const payload = paymentAcknowledgementReconcileSchema.parse(request.body ?? {});
    return service.reconcilePaymentAcknowledgements(payload.year, payload.month, payload.rows);
  });

  app.patch("/commissions/payment-acknowledgements", { preHandler: [requireAuth] }, async (request) => {
    const payload = paymentAcknowledgementUpdateSchema.parse(request.body ?? {});
    if (payload.paidByTransfer !== undefined && !canMarkPaidByTransfer(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo Finanzas o EMRT pueden registrar pagos mediante transferencia.");
    }
    if (payload.receivedByAraceli !== undefined && !isAraceliLozano(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo Araceli Lozano puede confirmar su recepcion de comisiones.");
    }
    if ((payload.receivedByEmrt !== undefined || payload.excluded !== undefined) && !isEmrtSuperadmin(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo EMRT puede cerrar, reabrir o excluir pagos de comisiones.");
    }

    const user = getSessionUser(request);
    return service.updatePaymentAcknowledgement(payload, {
      userId: user.id,
      displayName: user.displayName
    });
  });

  app.post("/commissions/payment-acknowledgements/signed-receipt", {
    preHandler: [requireAuth],
    bodyLimit: 16 * 1024 * 1024
  }, async (request) => {
    if (!canMarkPaidByTransfer(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo Finanzas o EMRT pueden cargar recibos firmados de comisiones.");
    }

    const payload = signedReceiptUploadSchema.parse(request.body ?? {});
    const user = getSessionUser(request);
    return service.uploadSignedReceipt({
      year: payload.year,
      month: payload.month,
      section: payload.section,
      originalFileName: payload.originalFileName,
      fileContent: decodeFileBase64(payload.fileBase64)
    }, {
      userId: user.id,
      displayName: user.displayName
    });
  });

  app.get("/commissions/payment-acknowledgements/signed-receipt", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!canMarkPaidByTransfer(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo Finanzas o EMRT pueden consultar recibos firmados de comisiones.");
    }

    const query = signedReceiptQuerySchema.parse(request.query);
    const receipt = await service.findSignedReceipt(query.year, query.month, query.section);
    if (!receipt) {
      throw new app.errors.AppError(404, "COMMISSION_SIGNED_RECEIPT_NOT_FOUND", "No hay un recibo firmado cargado para este receptor.");
    }

    reply.header("Content-Type", receipt.fileMimeType);
    reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(receipt.originalFileName)}`);
    reply.header("Cache-Control", "private, no-store");
    return reply.send(receipt.fileContent);
  });

  app.get("/commissions/receivers", { preHandler: readGuards }, async () => service.listReceivers());

  app.patch("/commissions/exclusions", { preHandler: [requireAuth] }, async (request) => {
    if (!canManageCommissionExclusions(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Only Eduardo Rusconi or Finance team members can manage commission exclusions.");
    }

    const payload = exclusionBodySchema.parse(request.body ?? {});
    if (!payload.excluded) {
      await service.clearExclusion(payload);
      return {
        ...payload,
        excluded: false
      };
    }

    return service.setExclusion({
      year: payload.year,
      month: payload.month,
      section: payload.section,
      group: payload.group,
      financeRecordId: payload.financeRecordId,
      createdByUserId: getSessionUser(request).id,
      createdByName: getSessionUser(request).displayName
    });
  });

  app.patch("/commissions/matter-exclusions", { preHandler: [requireAuth] }, async (request) => {
    if (!isEmrtSuperadmin(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo EMRT puede excluir comisiones por asunto.");
    }

    const payload = matterExclusionBodySchema.parse(request.body ?? {});
    const user = getSessionUser(request);
    await service.setMatterExclusion({
      ...payload,
      createdByUserId: user.id,
      createdByName: user.displayName
    });
    return payload;
  });

  app.patch("/commissions/projector-commissions/:entryId", { preHandler: [requireAuth] }, async (request) => {
    if (!canManageProjectorCommissions(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Only Eduardo Rusconi can manage projector commissions.");
    }

    const params = projectorCommissionParamsSchema.parse(request.params);
    const payload = projectorCommissionBodySchema.parse(request.body ?? {});
    const user = getSessionUser(request);
    const record = await service.updateProjectorCommission(params.entryId, {
      ...payload,
      authorizedByUserId: user.id,
      authorizedByName: user.displayName
    });

    if (!record) {
      throw new app.errors.AppError(404, "PROJECTOR_COMMISSION_NOT_FOUND", "The projector commission does not exist.");
    }

    return record;
  });

  app.post("/commissions/receivers", { preHandler: writeGuards }, async (request) => {
    const payload = receiverBodySchema.parse(request.body ?? {});
    return service.createReceiver(payload.name);
  });

  app.patch("/commissions/receivers/:receiverId", { preHandler: writeGuards }, async (request) => {
    const params = receiverParamsSchema.parse(request.params);
    const payload = receiverBodySchema.parse(request.body ?? {});
    const receiver = await service.updateReceiver(params.receiverId, payload.name);
    if (!receiver) {
      throw new app.errors.AppError(404, "COMMISSION_RECEIVER_NOT_FOUND", "The requested receiver does not exist.");
    }
    return receiver;
  });

  app.delete("/commissions/receivers/:receiverId", { preHandler: writeGuards }, async (request, reply) => {
    const params = receiverParamsSchema.parse(request.params);
    await service.deleteReceiver(params.receiverId);
    reply.code(204);
    return null;
  });

  app.get("/commissions/snapshots", { preHandler: readGuards }, async (request) => {
    const snapshots = await service.listSnapshots();
    const permissions = getEffectivePermissions(request);
    if (canReadAllCommissions(permissions)) {
      return snapshots;
    }

    if (permissions.includes("commissions:client-relations:write")) {
      return snapshots.filter((snapshot) => isClientRelationsSection(snapshot.section));
    }

    if (permissions.includes("commissions:own-section:write")) {
      return snapshots.filter((snapshot) => isOwnCommissionSection(snapshot.section, request));
    }

    return snapshots;
  });

  app.post("/commissions/snapshots", { preHandler: snapshotWriteGuards }, async (request) => {
    const payload = snapshotBodySchema.parse(request.body ?? {}) as CreateCommissionSnapshotRecord;
    const permissions = getEffectivePermissions(request);
    const canCreateSnapshot = canManageAllCommissions(permissions) || (
      permissions.includes("commissions:client-relations:write") && isClientRelationsSection(payload.section)
    ) || (
      permissions.includes("commissions:own-section:write") && isOwnCommissionSection(payload.section, request)
    );

    if (!canCreateSnapshot) {
      throw new app.errors.AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }

    return service.createSnapshot(payload);
  });
};
