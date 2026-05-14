import type { FastifyPluginAsync } from "fastify";
import { deriveEffectivePermissions } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const periodQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12)
});

export const kpisRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.KpisService(app.repositories.kpis);
  const readGuards = [requireAuth, requireAnyPermissions(["kpis:read", "kpis:team-manage"])];

  app.get("/kpis/overview", { preHandler: readGuards }, async (request) => {
    const query = periodQuerySchema.parse(request.query);
    const user = getSessionUser(request);
    const permissions = deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole,
      permissions: user.permissions
    });

    if (!permissions.includes("*") && !user.team && !user.legacyTeam) {
      throw new app.errors.AppError(403, "FORBIDDEN", "This user does not belong to a KPI team.");
    }

    return service.getOverview(query.year, query.month, {
      role: user.role,
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole,
      permissions
    });
  });
};
