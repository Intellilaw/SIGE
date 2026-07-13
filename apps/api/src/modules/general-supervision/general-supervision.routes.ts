import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { ManagedUser } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAuth } from "../../core/auth/guards";

const observedUserParamsSchema = z.object({
  userId: z.string().min(1)
});

const updateObservedUserSchema = z.object({
  isObserved: z.boolean()
});

const updateObservedUserBodySchema = updateObservedUserSchema.extend({
  userId: z.string().min(1)
});

const updateKpiOverrideBodySchema = z.object({
  userId: z.string().min(1),
  metricId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isExcluded: z.boolean()
});

function normalizeIdentity(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isEmrtIdentity(value?: string | null) {
  const normalized = normalizeIdentity(value);
  return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
}

function isAuthorizedSupervisor(user: ReturnType<typeof getSessionUser>) {
  const isSuperadmin = user.role === "SUPERADMIN" || user.legacyRole === "SUPERADMIN";
  const emailLocalPart = user.email.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;

  return isSuperadmin && [
    user.shortName,
    user.username,
    user.displayName,
    user.email,
    emailLocalPart
  ].some(isEmrtIdentity);
}

function getObservedUserLookupAliases(user: ManagedUser) {
  const emailLocalPart = user.email.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
  return [
    user.id,
    user.shortName,
    user.username,
    user.displayName,
    user.email,
    emailLocalPart,
    user.specificRole,
    user.secondarySpecificRole
  ];
}

function normalizeObservedUserKey(userId: string) {
  return userId.replace(/^responsible:/i, "");
}

async function resolveObservedUser(app: Parameters<FastifyPluginAsync>[0], userId: string) {
  const directUser = await app.repositories.users.findById(userId);
  if (directUser?.isActive) {
    return directUser;
  }

  const normalizedParam = normalizeIdentity(normalizeObservedUserKey(userId));
  if (!normalizedParam) {
    return null;
  }

  const users = await app.repositories.users.list();
  return users.find((user) =>
    getObservedUserLookupAliases(user).some((alias) => normalizeIdentity(alias) === normalizedParam)
  ) ?? null;
}

export const generalSupervisionRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.GeneralSupervisionService({
    tasks: app.repositories.tasks,
    matters: app.repositories.matters,
    users: app.repositories.users,
    laborFiles: app.repositories.laborFiles,
    kpis: app.repositories.kpis,
    kpiCommissionRequirements: app.repositories.kpiCommissionRequirements,
    holidays: app.repositories.holidays,
    supervisionPreferences: app.repositories.generalSupervisionPreferences
  });

  async function requireSupervisor(request: FastifyRequest) {
    const user = getSessionUser(request);
    if (!isAuthorizedSupervisor(user)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Only EMRT can access general supervision.");
    }

    return user;
  }

  app.get("/general-supervision/overview", { preHandler: [requireAuth] }, async (request) => {
    await requireSupervisor(request);
    return service.getOverview();
  });

  async function updateObservedUserPreference(
    request: FastifyRequest,
    input: { userId: string; isObserved: boolean }
  ) {
    const user = await requireSupervisor(request);
    const observedUser = await resolveObservedUser(app, input.userId);

    if (!observedUser?.isActive) {
      throw new app.errors.AppError(404, "OBSERVED_USER_NOT_FOUND", "No se encontro un usuario activo para observar.");
    }

    return service.setObservedUser(observedUser.id, input.isObserved, {
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      shortName: user.shortName
    });
  }

  app.patch("/general-supervision/observed-users", { preHandler: [requireAuth] }, async (request) => {
    const payload = updateObservedUserBodySchema.parse(request.body ?? {});
    return updateObservedUserPreference(request, payload);
  });

  app.patch("/general-supervision/observed-users/:userId", { preHandler: [requireAuth] }, async (request) => {
    const params = observedUserParamsSchema.parse(request.params);
    const payload = updateObservedUserSchema.parse(request.body ?? {});
    return updateObservedUserPreference(request, {
      userId: params.userId,
      isObserved: payload.isObserved
    });
  });

  app.patch("/general-supervision/kpi-overrides", { preHandler: [requireAuth] }, async (request) => {
    const actor = await requireSupervisor(request);
    const payload = updateKpiOverrideBodySchema.parse(request.body ?? {});
    const targetUser = await resolveObservedUser(app, payload.userId);

    if (!targetUser?.isActive) {
      throw new app.errors.AppError(404, "KPI_OVERRIDE_USER_NOT_FOUND", "No se encontro un usuario activo para este override.");
    }

    return service.setKpiOverride(
      targetUser.id,
      payload.metricId,
      payload.date,
      payload.isExcluded,
      {
        userId: actor.id,
        displayName: actor.displayName,
        username: actor.username,
        email: actor.email,
        shortName: actor.shortName
      }
    );
  });
};
