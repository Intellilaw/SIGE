import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { SignJWT } from "jose";

import { prisma } from "../../lib/prisma";

const SSO_REDIRECT_FALLBACK = "/intranet-login";
const BRIEF_MANAGER_TOKEN_TTL_SECONDS = 120;

export const ssoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/sso/brief-manager", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.redirect(SSO_REDIRECT_FALLBACK, 302);
    }

    const secret = app.config.SSO_SECRET_KEY;
    const destinationUrl = app.config.BRIEF_MANAGER_SSO_URL;

    if (!secret || !destinationUrl) {
      app.log.error(
        { hasSecret: Boolean(secret), hasDestination: Boolean(destinationUrl) },
        "SSO brief-manager misconfigured: SSO_SECRET_KEY or BRIEF_MANAGER_SSO_URL missing"
      );
      return reply
        .code(503)
        .type("text/plain")
        .send("SSO Manager de Escritos no esta configurado en este entorno.");
    }

    const claims = request.user as { id?: string };
    const userId = claims?.id;
    if (!userId) {
      return reply.redirect(SSO_REDIRECT_FALLBACK, 302);
    }

    const user = await app.repositories.auth.findUserById(userId);
    if (!user || !user.isActive) {
      return reply.redirect(SSO_REDIRECT_FALLBACK, 302);
    }

    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAtSeconds + BRIEF_MANAGER_TOKEN_TTL_SECONDS;
    const jti = randomUUID();

    const token = await new SignJWT({
      user_id: user.id,
      name: user.displayName,
      email: user.email,
      issued_at: issuedAtSeconds,
      expires_at: expiresAtSeconds
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("sige")
      .setAudience("manager-de-escritos")
      .setSubject(user.id)
      .setJti(jti)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(new TextEncoder().encode(secret));

    void prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: "sso.brief_manager.issued",
          entityType: "User",
          entityId: user.id,
          payload: {
            jti,
            audience: "manager-de-escritos",
            issuedAt: issuedAtSeconds,
            expiresAt: expiresAtSeconds
          }
        }
      })
      .catch((error: unknown) => {
        app.log.warn({ err: error }, "Failed to persist SSO audit log entry");
      });

    const separator = destinationUrl.includes("?") ? "&" : "?";
    const redirectUrl = `${destinationUrl}${separator}token=${encodeURIComponent(token)}`;

    return reply.redirect(redirectUrl, 302);
  });
};
