const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const postgresqlProtocols = new Set(["postgres:", "postgresql:"]);

export type AppEnvironment = "local" | "test" | "production";

export function normalizeAppEnvironment(value: unknown): AppEnvironment {
  if (value === undefined || value === null || value === "") {
    return "local";
  }

  if (typeof value !== "string") {
    throw new Error("APP_ENV must be a string.");
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "development") {
    return "local";
  }

  if (normalized === "local" || normalized === "test" || normalized === "production") {
    return normalized;
  }

  throw new Error("APP_ENV must be one of: local, production, test.");
}

function parseDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (!postgresqlProtocols.has(parsed.protocol)) {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
  }

  if (!parsed.hostname) {
    throw new Error("DATABASE_URL must include a database host.");
  }

  return parsed;
}

function isLocalDatabaseHost(hostname: string) {
  return localDatabaseHosts.has(hostname.toLowerCase());
}

function isAwsRdsHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized.includes(".rds.amazonaws.com") || normalized.includes(".rds.amazonaws.com.cn");
}

function describeDatabaseUrl(parsed: URL) {
  const database = parsed.pathname.replace(/^\//, "") || "(no database)";
  return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "5432"}/${database}`;
}

export function assertDatabaseUrlAllowedForAppEnv(databaseUrl: string | undefined, appEnvValue: unknown) {
  const appEnv = normalizeAppEnvironment(appEnvValue);
  const parsed = parseDatabaseUrl(databaseUrl);
  const description = describeDatabaseUrl(parsed);

  if (appEnv === "production") {
    if (isLocalDatabaseHost(parsed.hostname)) {
      throw new Error(`APP_ENV=production cannot use a local DATABASE_URL (${description}).`);
    }

    return;
  }

  if (!isLocalDatabaseHost(parsed.hostname)) {
    const rdsHint = isAwsRdsHost(parsed.hostname) ? " The host looks like an AWS RDS endpoint." : "";
    throw new Error(
      `APP_ENV=${appEnv} must use local PostgreSQL on localhost, 127.0.0.1, or ::1. ` +
        `Received ${description}.${rdsHint} Refusing to start so local code cannot connect to production.`
    );
  }
}
