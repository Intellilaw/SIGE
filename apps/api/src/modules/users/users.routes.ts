import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const teamSchema = z.enum([
  "ADMIN",
  "CLIENT_RELATIONS",
  "FINANCE",
  "LITIGATION",
  "CORPORATE_LABOR",
  "SETTLEMENTS",
  "FINANCIAL_LAW",
  "TAX_COMPLIANCE",
  "AUDIT",
  "ADMIN_OPERATIONS"
]);

const createUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(10).max(128),
  displayName: z.string().min(1).optional(),
  shortName: z.string().max(10).optional(),
  legacyRole: z.enum(["SUPERADMIN", "INTRANET", "PUBLIC"]).optional(),
  legacyTeam: z.string().optional(),
  specificRole: z.string().optional()
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  password: z.string().min(10).max(128).optional(),
  shortName: z.string().max(10).nullable().optional(),
  legacyRole: z.enum(["SUPERADMIN", "INTRANET", "PUBLIC"]).optional(),
  legacyTeam: z.string().nullable().optional(),
  specificRole: z.string().nullable().optional(),
  isActive: z.boolean().optional()
});

const userIdParamsSchema = z.object({
  userId: z.string().min(1)
});

export const usersRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.UsersService(app.repositories.users);
  const authService = new app.services.AuthService(app.repositories.auth);
  const adminGuards = [requireAuth, requireAnyPermissions(["users:manage"])];

  app.get("/users/team-short-names", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ team: teamSchema }).parse(request.query);
    return service.listTeamShortNames(query.team);
  });

  app.get("/users", { preHandler: adminGuards }, async () => service.list());

  app.post("/users", { preHandler: adminGuards }, async (request) => {
    const payload = createUserSchema.parse(request.body);
    return service.create(payload);
  });

  app.patch("/users/:userId", { preHandler: adminGuards }, async (request) => {
    const params = userIdParamsSchema.parse(request.params);
    const payload = updateUserSchema.parse(request.body);
    return service.update(params.userId, payload);
  });

  app.post("/users/:userId/password-reset-link", { preHandler: adminGuards }, async (request) => {
    const params = userIdParamsSchema.parse(request.params);
    const origin = typeof request.headers.origin === "string" && request.headers.origin.length > 0
      ? request.headers.origin
      : app.config.WEB_ORIGIN;

    return authService.createPasswordResetLinkForUser(
      params.userId,
      origin,
      app.config.PASSWORD_RESET_TTL_MINUTES
    );
  });

  app.delete("/users/:userId", { preHandler: adminGuards }, async (request, reply) => {
    const params = userIdParamsSchema.parse(request.params);
    await service.delete(params.userId);
    reply.code(204);
    return null;
  });
};
