import type { FastifyReply } from "fastify";

import type { env } from "../../config/env";
import type { TokenPair } from "./types";
import { parseTtlSeconds } from "./token-ttl";

export const ACCESS_TOKEN_COOKIE_NAME = "sige_access";
export const REFRESH_TOKEN_COOKIE_NAME = "sige_refresh";

type AppConfig = typeof env;

function getCookieOptions(config: AppConfig, maxAge: number) {
  const secure = config.APP_ENV === "production" || config.APP_ENV === "staging" || config.AUTH_COOKIE_SAME_SITE === "none";

  return {
    httpOnly: true,
    secure,
    sameSite: config.AUTH_COOKIE_SAME_SITE,
    path: "/api/v1",
    domain: config.AUTH_COOKIE_DOMAIN,
    maxAge
  } as const;
}

export function setAuthCookies(reply: FastifyReply, config: AppConfig, tokens: TokenPair) {
  reply
    .setCookie(
      ACCESS_TOKEN_COOKIE_NAME,
      tokens.accessToken,
      getCookieOptions(config, parseTtlSeconds(config.JWT_ACCESS_TTL, 15 * 60))
    )
    .setCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      tokens.refreshToken,
      getCookieOptions(config, parseTtlSeconds(config.JWT_REFRESH_TTL, 7 * 24 * 60 * 60))
    );
}

export function clearAuthCookies(reply: FastifyReply, config: AppConfig) {
  const options = {
    path: "/api/v1",
    domain: config.AUTH_COOKIE_DOMAIN
  } as const;

  reply.clearCookie(ACCESS_TOKEN_COOKIE_NAME, options).clearCookie(REFRESH_TOKEN_COOKIE_NAME, options);
}
