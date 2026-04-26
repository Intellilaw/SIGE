import { createHash, randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import type { AuthUser } from "@sige/contracts";

import type { TokenPair } from "./types";
import type { AuthRepository } from "../../repositories/types";
import { parseTtlSeconds } from "./token-ttl";

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueTokenPair(app: FastifyInstance, repository: AuthRepository, user: AuthUser): Promise<TokenPair> {
  const accessToken = await app.jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole,
      permissions: user.permissions,
      isActive: user.isActive,
      passwordResetRequired: user.passwordResetRequired
    },
    {
      expiresIn: app.config.JWT_ACCESS_TTL
    }
  );

  const rawRefreshToken = randomUUID();
  const refreshTtlSeconds = parseTtlSeconds(app.config.JWT_REFRESH_TTL, 7 * 24 * 60 * 60);
  await repository.saveRefreshToken({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashToken(rawRefreshToken),
    expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000).toISOString(),
    revokedAt: null,
    createdAt: new Date().toISOString()
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken
  };
}
