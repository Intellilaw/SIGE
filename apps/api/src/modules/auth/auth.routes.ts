import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAuth } from "../../core/auth/guards";
import { PASSWORD_POLICY_MESSAGE } from "../../core/auth/password-policy";
import { createManagerDeEscritosSsoUrl } from "../../core/auth/sso-ticket";
import { hashToken, issueTokenPair } from "../../core/auth/token-service";
import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE_NAME,
  setAuthCookies
} from "../../core/auth/session-cookies";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(8)
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

function canOpenBriefManager(user: { permissions: string[] }) {
  return user.permissions.includes("*")
    || user.permissions.includes("brief-manager:read")
    || user.permissions.includes("brief-manager:write");
}

function getAppOrigin(request: { headers: Record<string, unknown> }, fallbackOrigin: string) {
  const origin = request.headers.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : fallbackOrigin;
}

function getRefreshTokenFromCookie(request: { cookies: Record<string, string | undefined> }) {
  return request.cookies[REFRESH_TOKEN_COOKIE_NAME];
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.AuthService(app.repositories.auth);

  app.post("/auth/login", async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const user = await service.login(payload.identifier, payload.password);
    const tokens = await issueTokenPair(app, app.repositories.auth, user);
    setAuthCookies(reply, app.config, tokens);

    return {
      user
    };
  });

  app.post("/auth/refresh", async (request, reply) => {
    const refreshToken = getRefreshTokenFromCookie(request);
    if (!refreshToken) {
      clearAuthCookies(reply, app.config);
      throw new app.errors.AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired.");
    }

    const tokenHash = hashToken(refreshToken);
    const record = await app.repositories.auth.findRefreshToken(tokenHash);

    if (!record) {
      clearAuthCookies(reply, app.config);
      throw new app.errors.AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired.");
    }

    const user = await service.getProfile(record.userId);
    await app.repositories.auth.revokeRefreshToken(tokenHash);
    const tokens = await issueTokenPair(app, app.repositories.auth, user);
    setAuthCookies(reply, app.config, tokens);

    return {
      user
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    const refreshToken = getRefreshTokenFromCookie(request);
    if (refreshToken) {
      await app.repositories.auth.revokeRefreshToken(hashToken(refreshToken));
    }

    clearAuthCookies(reply, app.config);
    reply.code(204);
    return null;
  });

  app.post("/auth/password-resets/request", async (request) => {
    const payload = passwordResetRequestSchema.parse(request.body);
    return service.requestPasswordReset(
      payload.identifier,
      getAppOrigin(request, app.config.WEB_ORIGIN),
      app.config.PASSWORD_RESET_TTL_MINUTES,
      { exposePreview: app.config.PASSWORD_RESET_EXPOSE_PREVIEW }
    );
  });

  app.post("/auth/password-resets/verify", async (request) => {
    const payload = passwordResetTokenSchema.parse(request.body);
    return service.verifyPasswordResetToken(payload.token);
  });

  app.post("/auth/password-resets/complete", async (request, reply) => {
    const payload = passwordResetCompleteSchema.parse(request.body);
    if (payload.password.length > 128) {
      throw new app.errors.AppError(400, "WEAK_PASSWORD", PASSWORD_POLICY_MESSAGE);
    }

    const session = await service.completePasswordReset(app, payload.token, payload.password);
    setAuthCookies(reply, app.config, session.tokens);

    return {
      user: session.user
    };
  });

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    return service.getProfile(user.id);
  });

  app.get("/auth/sso/manager-de-escritos", { preHandler: [requireAuth] }, async (request) => {
    const user = await service.getProfile(getSessionUser(request).id);
    if (!user.isActive || user.passwordResetRequired) {
      throw new app.errors.AppError(403, "SSO_USER_NOT_ALLOWED", "This account cannot open Manager de escritos.");
    }

    if (!canOpenBriefManager(user)) {
      throw new app.errors.AppError(403, "SSO_FORBIDDEN", "This account is not authorized for Manager de escritos.");
    }

    try {
      return createManagerDeEscritosSsoUrl(user, app.config);
    } catch {
      throw new app.errors.AppError(503, "SSO_NOT_CONFIGURED", "Manager de escritos SSO is not configured.");
    }
  });
};
