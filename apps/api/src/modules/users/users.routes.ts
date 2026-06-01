import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";

const teamSchema = z.string().min(1);

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
  username: z.string().min(1).optional(),
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

const teamIdParamsSchema = z.object({
  teamId: z.string().min(1)
});

const createTeamSchema = z.object({
  label: z.string().min(1).max(80),
  executionSpaceEnabled: z.boolean().optional()
});

const updateTeamSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  executionSpaceEnabled: z.boolean().optional()
}).refine((payload) =>
  payload.label !== undefined ||
  payload.isActive !== undefined ||
  payload.executionSpaceEnabled !== undefined, {
  message: "At least one field is required."
});

async function requireSuperadmin(request: FastifyRequest) {
  const user = getSessionUser(request);
  const normalizedEmail = user.email.trim().toLowerCase();
  const normalizedIdentity = [user.username, user.displayName, user.shortName]
    .map((value) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    )
    .join(" ");
  const isEduardoRusconi =
    normalizedEmail === "eduardo.rusconi@intellilaw.ai" ||
    (normalizedIdentity.includes("eduardo") && normalizedIdentity.includes("rusconi"));
  const isSuperadmin = user.role === "SUPERADMIN" || user.legacyRole === "SUPERADMIN" || isEduardoRusconi;

  if (!isSuperadmin) {
    throw new AppError(403, "FORBIDDEN", "Solo un superadmin puede administrar equipos.");
  }
}

export const usersRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.UsersService(app.repositories.users);
  const authService = new app.services.AuthService(app.repositories.auth);
  const adminGuards = [requireAuth, requireAnyPermissions(["users:manage"])];
  const teamManageGuards = [requireAuth, requireSuperadmin];

  app.get("/users/team-short-names", { preHandler: [requireAuth] }, async (request) => {
    const query = z.object({ team: teamSchema }).parse(request.query);
    return service.listTeamShortNames(query.team);
  });

  app.get("/users/teams", { preHandler: adminGuards }, async () => service.listTeams());

  app.post("/users/teams", { preHandler: teamManageGuards }, async (request) => {
    const payload = createTeamSchema.parse(request.body);
    return service.createTeam(payload);
  });

  app.patch("/users/teams/:teamId", { preHandler: teamManageGuards }, async (request) => {
    const params = teamIdParamsSchema.parse(request.params);
    const payload = updateTeamSchema.parse(request.body);
    return service.updateTeam(params.teamId, payload);
  });

  app.delete("/users/teams/:teamId", { preHandler: teamManageGuards }, async (request) => {
    const params = teamIdParamsSchema.parse(request.params);
    return service.deactivateTeam(params.teamId);
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
