import "dotenv/config";

import { z } from "zod";

import { assertDatabaseUrlAllowedForAppEnv } from "./database-url-guard";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const appEnvSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return "local";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "development" ? "local" : normalized;
  }

  return value;
}, z.enum(["local", "test", "production"]));

const envSchema = z.object({
  APP_ENV: appEnvSchema,
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url(),
  WEB_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  MANAGER_DE_ESCRITOS_URL: z.string().url().default("http://localhost:8000"),
  SSO_SECRET_KEY: optionalNonEmptyString,
  SSO_ISSUER: z.string().min(1).default("sige"),
  SSO_AUDIENCE: z.string().min(1).default("manager-de-escritos"),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(120),
  PASSWORD_RESET_EXPOSE_PREVIEW: z.coerce.boolean().default(false),
  OPENAI_API_KEY: optionalNonEmptyString,
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_QUOTE_TRANSLATION_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_QUOTE_TRANSLATION_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  OPENAI_LABOR_CONTRACT_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_LABOR_CONTRACT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  OPENAI_EXTERNAL_CONTRACT_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_EXTERNAL_CONTRACT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  OPENAI_RUSCONI_INTELLIGENCE_MODEL: z.string().min(1).default("gpt-5.5"),
  OPENAI_RUSCONI_INTELLIGENCE_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  INTELLILAW_BOT_API_URL: z.string().url().default("http://localhost:8000"),
  INTELLILAW_BOT_API_KEY: optionalNonEmptyString,
  INTELLILAW_BOT_PROMOTION_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
  TELEGRAM_GROUP_LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  GOOGLE_WORKSPACE_OAUTH_CLIENT_FILE: optionalNonEmptyString,
  GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET: optionalNonEmptyString,
  GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional()
  )
});

export const env = envSchema.parse(process.env);

assertDatabaseUrlAllowedForAppEnv(env.DATABASE_URL, env.APP_ENV);
