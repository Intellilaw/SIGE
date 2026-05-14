import type { FastifyPluginAsync } from "fastify";

import { getSessionUser, requireAuth } from "../../core/auth/guards";

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

export const generalSupervisionRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.GeneralSupervisionService({
    tasks: app.repositories.tasks,
    users: app.repositories.users,
    kpis: app.repositories.kpis
  });

  app.get("/general-supervision/overview", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    if (!isAuthorizedSupervisor(user)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Only EMRT can access general supervision.");
    }

    return service.getOverview();
  });
};
