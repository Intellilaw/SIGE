import { createHmac, randomUUID } from "node:crypto";

import type { AuthUser } from "@sige/contracts";

import type { env } from "../../config/env";

type AppConfig = typeof env;

interface SsoJwtPayload {
  iss: string;
  aud: string;
  sub: string;
  user_id: string;
  email: string;
  name: string;
  username: string;
  short_name?: string;
  role: string;
  legacy_role: string;
  is_superadmin: boolean;
  permissions: string[];
  iat: number;
  nbf: number;
  exp: number;
  issued_at: number;
  expires_at: number;
  jti: string;
}

function encodeBase64Url(value: object | string) {
  const input = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(input).toString("base64url");
}

function signHs256(payload: SsoJwtPayload, secret: string) {
  const header = encodeBase64Url({ alg: "HS256", typ: "JWT" });
  const body = encodeBase64Url(payload);
  const unsignedToken = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(unsignedToken).digest("base64url");

  return `${unsignedToken}.${signature}`;
}

export function createManagerDeEscritosSsoUrl(user: AuthUser, config: AppConfig) {
  if (!config.SSO_SECRET_KEY) {
    throw new Error("SSO_SECRET_KEY is not configured.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 120;
  const payload: SsoJwtPayload = {
    iss: config.SSO_ISSUER,
    aud: config.SSO_AUDIENCE,
    sub: user.id,
    user_id: user.id,
    email: user.email,
    name: user.displayName,
    username: user.username,
    short_name: user.shortName,
    role: user.role,
    legacy_role: user.legacyRole,
    is_superadmin: user.role === "SUPERADMIN" || user.legacyRole === "SUPERADMIN",
    permissions: user.permissions,
    iat: issuedAt,
    nbf: issuedAt - 5,
    exp: expiresAt,
    issued_at: issuedAt,
    expires_at: expiresAt,
    jti: randomUUID()
  };

  const url = new URL("/auth/sso", config.MANAGER_DE_ESCRITOS_URL);
  url.searchParams.set("token", signHs256(payload, config.SSO_SECRET_KEY));

  return {
    redirectUrl: url.toString(),
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}
