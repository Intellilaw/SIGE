import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/sige_2"),
  JWT_ACCESS_SECRET: z.string().min(32).default("replace-this-in-dev-with-a-real-secret-value-1234"),
  JWT_REFRESH_SECRET: z.string().min(32).default("replace-this-in-dev-with-a-second-secret-value-1234"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(120)
});

export const env = envSchema.parse(process.env);
