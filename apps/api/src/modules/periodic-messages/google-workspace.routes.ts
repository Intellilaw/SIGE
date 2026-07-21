import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { env } from "../../config/env";
import { getSessionUser, requireAuth } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";
import { prisma } from "../../lib/prisma";
import {
  GOOGLE_WORKSPACE_SCOPES,
  GoogleWorkspaceClientError,
  buildGoogleAuthorizationUrl,
  buildTestMessageRaw,
  createGoogleOAuthState,
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  exchangeGoogleAuthorizationCode,
  getGoogleUserProfile,
  getGoogleWorkspaceConfigurationStatus,
  parseGoogleOAuthState,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  sendGoogleGmailRawMessage
} from "./google-workspace.client";

const startSchema = z.object({
  returnPath: z.string().max(500).optional()
});

const callbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional()
});

function safeReturnPath(value?: string) {
  if (!value || !value.startsWith("/app/periodic-messages") || value.startsWith("//")) {
    return "/app/periodic-messages";
  }

  return value.split(/[?#]/, 1)[0];
}

function redirectToWeb(returnPath: string, status: "connected" | "error", code?: string) {
  const url = new URL(safeReturnPath(returnPath), env.WEB_ORIGIN);
  url.searchParams.set("google", status);
  if (code) {
    url.searchParams.set("googleCode", code);
  }
  return url.toString();
}

function normalizeGoogleError(error: unknown) {
  if (error instanceof GoogleWorkspaceClientError) {
    return error;
  }

  return new GoogleWorkspaceClientError(
    "GOOGLE_WORKSPACE_UNEXPECTED",
    "Google Workspace no pudo completar la operación.",
    502
  );
}

function connectionResponse(connection: {
  email: string;
  status: string;
  connectedAt: Date;
  lastValidatedAt: Date | null;
  lastUsedAt: Date | null;
  lastError: string | null;
} | null, configured: boolean, configurationError: string | null) {
  return {
    configured,
    configurationError,
    status: connection?.status ?? "NOT_CONNECTED",
    email: connection?.email ?? null,
    connectedAt: connection?.connectedAt ?? null,
    lastValidatedAt: connection?.lastValidatedAt ?? null,
    lastUsedAt: connection?.lastUsedAt ?? null,
    lastError: connection?.lastError ?? null
  };
}

export const googleWorkspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/google-workspace/connection", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    const [configuration, connection] = await Promise.all([
      getGoogleWorkspaceConfigurationStatus(),
      prisma.googleWorkspaceConnection.findFirst({
        where: { organizationId: user.organizationId, userId: user.id }
      })
    ]);

    return connectionResponse(connection, configuration.configured, configuration.error);
  });

  app.post("/google-workspace/oauth/start", { preHandler: [requireAuth] }, async (request) => {
    const payload = startSchema.parse(request.body ?? {});
    const user = getSessionUser(request);
    const normalizedEmail = user.email.trim().toLowerCase();
    if (!user.isActive) {
      throw new AppError(403, "GOOGLE_WORKSPACE_ACCOUNT_FORBIDDEN", "Tu usuario de SIGE no está activo.");
    }

    const returnPath = safeReturnPath(payload.returnPath);
    const state = createGoogleOAuthState({
      userId: user.id,
      organizationId: user.organizationId,
      email: normalizedEmail,
      returnPath
    });

    try {
      return {
        authorizationUrl: await buildGoogleAuthorizationUrl(
          state,
          normalizedEmail.endsWith("@rusconi.law") ? normalizedEmail : undefined
        )
      };
    } catch (error) {
      const normalized = normalizeGoogleError(error);
      throw new AppError(normalized.httpStatus, normalized.code, normalized.message);
    }
  });

  app.get("/google-workspace/oauth/callback", async (request, reply) => {
    const query = callbackSchema.parse(request.query);
    let returnPath = "/app/periodic-messages";

    try {
      if (!query.state) {
        throw new GoogleWorkspaceClientError("GOOGLE_OAUTH_STATE_MISSING", "Google no devolvió el estado de autorización.", 400);
      }

      const state = parseGoogleOAuthState(query.state);
      returnPath = state.returnPath;
      if (query.error || !query.code) {
        throw new GoogleWorkspaceClientError("GOOGLE_OAUTH_DENIED", "La autorización de Google fue cancelada.", 400);
      }

      const user = await prisma.user.findFirst({
        where: {
          id: state.userId,
          organizationId: state.organizationId,
          email: { equals: state.email, mode: "insensitive" },
          isActive: true
        }
      });
      if (!user) {
        throw new GoogleWorkspaceClientError("GOOGLE_OAUTH_USER_INVALID", "El usuario de SIGE ya no está disponible.", 403);
      }

      const tokens = await exchangeGoogleAuthorizationCode(query.code);
      const profile = await getGoogleUserProfile(tokens.accessToken);
      if (!profile.emailVerified || !profile.email.endsWith("@rusconi.law")) {
        throw new GoogleWorkspaceClientError(
          "GOOGLE_OAUTH_EMAIL_MISMATCH",
          "Debes autorizar una cuenta de Google Workspace terminada en @rusconi.law.",
          403
        );
      }

      const requiredScope = GOOGLE_WORKSPACE_SCOPES[2];
      if (tokens.grantedScopes.length > 0 && !tokens.grantedScopes.includes(requiredScope)) {
        throw new GoogleWorkspaceClientError(
          "GOOGLE_OAUTH_SCOPE_MISSING",
          "Google no concedió el permiso para enviar correos.",
          403
        );
      }

      const existing = await prisma.googleWorkspaceConnection.findFirst({
        where: { organizationId: state.organizationId, userId: state.userId }
      });
      const connectedByAnotherUser = await prisma.googleWorkspaceConnection.findFirst({
        where: {
          organizationId: state.organizationId,
          email: profile.email,
          userId: { not: state.userId }
        }
      });
      if (connectedByAnotherUser) {
        throw new GoogleWorkspaceClientError(
          "GOOGLE_OAUTH_EMAIL_IN_USE",
          "Esa cuenta de Google Workspace ya está conectada a otro usuario de SIGE.",
          409
        );
      }
      const refreshTokenCiphertext = tokens.refreshToken
        ? encryptGoogleRefreshToken(tokens.refreshToken, profile.email)
        : existing?.email === profile.email
          ? existing.refreshTokenCiphertext
          : null;
      if (!refreshTokenCiphertext) {
        throw new GoogleWorkspaceClientError(
          "GOOGLE_OAUTH_REFRESH_TOKEN_MISSING",
          "Google no devolvió autorización para uso sin conexión. Inténtalo nuevamente.",
          400
        );
      }

      const now = new Date();
      await prisma.googleWorkspaceConnection.upsert({
        where: { userId: state.userId },
        create: {
          organizationId: state.organizationId,
          userId: state.userId,
          email: profile.email,
          refreshTokenCiphertext,
          grantedScopes: tokens.grantedScopes,
          status: "ACTIVE",
          connectedAt: now,
          lastValidatedAt: now
        },
        update: {
          email: profile.email,
          refreshTokenCiphertext,
          grantedScopes: tokens.grantedScopes,
          status: "ACTIVE",
          connectedAt: now,
          lastValidatedAt: now,
          revokedAt: null,
          lastError: null
        }
      });

      return reply.redirect(redirectToWeb(returnPath, "connected"));
    } catch (error) {
      const normalized = normalizeGoogleError(error);
      request.log.warn({ code: normalized.code }, "Google Workspace OAuth callback failed.");
      return reply.redirect(redirectToWeb(returnPath, "error", normalized.code));
    }
  });

  app.delete("/google-workspace/connection", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getSessionUser(request);
    const connection = await prisma.googleWorkspaceConnection.findFirst({
      where: { organizationId: user.organizationId, userId: user.id }
    });
    if (!connection) {
      reply.code(204);
      return;
    }

    if (connection.refreshTokenCiphertext) {
      try {
        const refreshToken = decryptGoogleRefreshToken(connection.refreshTokenCiphertext, connection.email);
        await revokeGoogleToken(refreshToken);
      } catch (error) {
        request.log.warn({ code: error instanceof GoogleWorkspaceClientError ? error.code : "UNKNOWN" }, "Unable to revoke Google token before local disconnect.");
      }
    }

    await prisma.googleWorkspaceConnection.update({
      where: { userId: user.id },
      data: {
        refreshTokenCiphertext: null,
        status: "REVOKED",
        revokedAt: new Date(),
        lastError: null
      }
    });
    reply.code(204);
  });

  app.post("/google-workspace/test", { preHandler: [requireAuth] }, async (request) => {
    const user = getSessionUser(request);
    const connection = await prisma.googleWorkspaceConnection.findFirst({
      where: { organizationId: user.organizationId, userId: user.id }
    });
    if (!connection?.refreshTokenCiphertext || connection.status !== "ACTIVE") {
      throw new AppError(409, "GOOGLE_WORKSPACE_NOT_CONNECTED", "Conecta primero tu cuenta de Google Workspace.");
    }

    try {
      const refreshToken = decryptGoogleRefreshToken(connection.refreshTokenCiphertext, connection.email);
      const tokens = await refreshGoogleAccessToken(refreshToken);
      const result = await sendGoogleGmailRawMessage(
        tokens.accessToken,
        buildTestMessageRaw(connection.email, user.displayName)
      );
      const existingScopes = Array.isArray(connection.grantedScopes)
        ? connection.grantedScopes.filter((scope): scope is string => typeof scope === "string")
        : [];
      await prisma.googleWorkspaceConnection.update({
        where: { userId: user.id },
        data: {
          lastValidatedAt: new Date(),
          lastUsedAt: new Date(),
          lastError: null,
          grantedScopes: tokens.grantedScopes.length ? tokens.grantedScopes : existingScopes
        }
      });

      return {
        sent: true,
        recipient: connection.email,
        messageId: result.messageId,
        threadId: result.threadId
      };
    } catch (error) {
      const normalized = normalizeGoogleError(error);
      await prisma.googleWorkspaceConnection.update({
        where: { userId: user.id },
        data: {
          status: normalized.code === "GOOGLE_OAUTH_REAUTH_REQUIRED" ? "REAUTH_REQUIRED" : connection.status,
          lastError: normalized.message.slice(0, 1000)
        }
      });
      throw new AppError(normalized.httpStatus, normalized.code, normalized.message);
    }
  });
};

