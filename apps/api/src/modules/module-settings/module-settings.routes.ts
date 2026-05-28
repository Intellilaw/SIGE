import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAuth } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";

const protectedModuleIds = new Set(["users", "module-enablement"]);

const paramsSchema = z.object({
  moduleId: z.string().regex(/^[a-z0-9-]+$/)
});

const updateSchema = z.object({
  isEnabled: z.boolean()
});

function normalizeIdentity(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isEduardoRusconiIdentity(value?: string | null) {
  const normalized = normalizeIdentity(value);
  return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
}

async function requireEduardoRusconiSuperadmin(request: FastifyRequest) {
  const user = getSessionUser(request);
  const isSuperadmin = user.role === "SUPERADMIN" || user.legacyRole === "SUPERADMIN";
  const emailLocalPart = user.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user.email;
  const isEduardoRusconi = [
    user.shortName,
    user.username,
    user.displayName,
    user.email,
    emailLocalPart
  ].some(isEduardoRusconiIdentity);

  if (!isSuperadmin || !isEduardoRusconi) {
    throw new AppError(403, "MODULE_SETTINGS_FORBIDDEN", "Solo el superadmin Eduardo Rusconi puede modificar modulos.");
  }
}

export const moduleSettingsRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.ModuleSettingsService(app.repositories.moduleSettings);
  const readGuards = [requireAuth];
  const writeGuards = [requireAuth, requireEduardoRusconiSuperadmin];

  app.get("/module-settings", { preHandler: readGuards }, async () => ({
    settings: await service.list()
  }));

  app.patch("/module-settings/:moduleId", { preHandler: writeGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const payload = updateSchema.parse(request.body ?? {});

    if (protectedModuleIds.has(params.moduleId)) {
      throw new AppError(400, "MODULE_CANNOT_BE_DISABLED", "This module cannot be disabled.");
    }

    const user = getSessionUser(request);
    return service.setModuleEnabled(params.moduleId, payload.isEnabled, {
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      shortName: user.shortName
    });
  });
};
