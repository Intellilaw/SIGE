import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAuth } from "../../core/auth/guards";
import { PASSWORD_POLICY_MESSAGE } from "../../core/auth/password-policy";
import { hashToken, issueTokenPair } from "../../core/auth/token-service";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().uuid()
});

const passwordResetRequestSchema = z.object({
  identifier: z.string().min(1)
});

const passwordResetTokenSchema = z.object({
  token: z.string().min(32)
});

const passwordResetCompleteSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(10).max(128)
});

function getAppOrigin(request: { headers: Record<string, unknown> }, fallbackOrigin: string) {
  const origin = request.headers.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : fallbackOrigin;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.AuthService(app.repositories.auth);

  app.post("/auth/login", async (request) => {
    const payload = loginSchema.parse(request.body);
    const user = await service.login(payload.identifier, payload.password);
    const tokens = await issueTokenPair(app, app.repositories.auth, user);

    return {
      user,
      tokens
    };
  });

  app.post("/auth/refresh", async (request) => {
    const payload = refreshSchema.parse(request.body);
    const tokenHash = hashToken(payload.refreshToken);
    const record = await app.repositories.auth.findRefreshToken(tokenHash);

    if (!record) {
      throw new app.errors.AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired.");
    }

    const user = await service.getProfile(record.userId);
    await app.repositories.auth.revokeRefreshToken(tokenHash);
    const tokens = await issueTokenPair(app, app.repositories.auth, user);

    return {
      user,
      tokens
    };
  });

  app.post("/auth/password-resets/request", async (request) => {
    const payload = passwordResetRequestSchema.parse(request.body);
    return service.requestPasswordReset(
      payload.identifier,
      getAppOrigin(request, app.config.WEB_ORIGIN),
      app.config.PASSWORD_RESET_TTL_MINUTES,
      { exposePreview: app.config.APP_ENV !== "production" }
    );
  });

  app.post("/auth/password-resets/verify", async (request) => {
    const payload = passwordResetTokenSchema.parse(request.body);
    return service.verifyPasswordResetToken(payload.token);
  });

  app.post("/auth/password-resets/complete", async (request) => {
    const payload = passwordResetCompleteSchema.parse(request.body);
    if (payload.password.length > 128) {
      throw new app.errors.AppError(400, "WEAK_PASSWORD", PASSWORD_POLICY_MESSAGE);
    }

    return service.completePasswordReset(app, payload.token, payload.password);
  });

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    return service.getProfile(user.id);
  });
};
