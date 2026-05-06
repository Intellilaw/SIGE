import "dotenv/config";

import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
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
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(120),
  PASSWORD_RESET_EXPOSE_PREVIEW: z.coerce.boolean().default(false),
  OPENAI_API_KEY: optionalNonEmptyString,
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_QUOTE_TRANSLATION_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_QUOTE_TRANSLATION_TIMEOUT_MS: z.coerce.number().int().positive().default(45000)
});

export const env = envSchema.parse(process.env);
