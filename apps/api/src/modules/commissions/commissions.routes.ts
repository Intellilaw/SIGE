import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { deriveEffectivePermissions } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
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
  return Boolean(user.specificRole) && normalizeComparableText(section) === normalizeComparableText(user.specificRole);
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
      specificRole: user.specificRole,
      permissions: user.permissions
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
    const hasSuperadminAccess = permissions.includes("*")
      || user.role === "SUPERADMIN"
      || user.legacyRole === "SUPERADMIN";
    const emailLocalPart = user.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
    const isEduardoRusconi = [user.shortName, user.username, user.displayName, user.email, emailLocalPart].some((value) => {
      const normalized = normalizeIdentityText(value);
      return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
    });

    return hasSuperadminAccess && isEduardoRusconi;
  }

  app.get("/commissions/overview", { preHandler: readGuards }, async (request) => {
    const query = periodQuerySchema.parse(request.query);
    return service.getOverview(query.year, query.month);
  });

  app.get("/commissions/receivers", { preHandler: readGuards }, async () => service.listReceivers());

  app.patch("/commissions/exclusions", { preHandler: [requireAuth] }, async (request) => {
    if (!canManageCommissionExclusions(request)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Only Eduardo Rusconi can manage commission exclusions.");
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
