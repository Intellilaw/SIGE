import "dotenv/config";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);
const ACCESS_COOKIE_NAME = "sige_access";

type RuntimeSecret = {
  DATABASE_URL?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
};

type RdsSecret = {
  username?: string;
  password?: string;
};

type CheckResult = {
  name: string;
  ok: boolean;
  details?: Record<string, unknown>;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }

    values.set(key, next);
    index += 1;
  }

  return {
    appSecretId: values.get("app-secret-id") ?? process.env.SIGE_AWS_APP_SECRET_ID,
    rdsSecretId: values.get("rds-secret-id") ?? process.env.SIGE_AWS_RDS_SECRET_ID,
    apiBaseUrl: values.get("api-base-url") ?? process.env.SIGE_VERIFY_API_BASE_URL,
    loginIdentifier: values.get("login-identifier") ?? process.env.SIGE_VERIFY_LOGIN_IDENTIFIER,
    loginPassword: values.get("login-password") ?? process.env.SIGE_VERIFY_LOGIN_PASSWORD,
    skipHttp: flags.has("skip-http"),
    directDb: flags.has("direct-db")
  };
}

function requireValue(value: string | undefined, label: string) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

async function getSecretJson<T>(secretId: string): Promise<T> {
  const { stdout } = await execFileAsync("aws", [
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    secretId,
    "--query",
    "SecretString",
    "--output",
    "text"
  ]);

  return JSON.parse(stdout.trim()) as T;
}

function redactDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    protocol: url.protocol,
    username: decodeURIComponent(url.username),
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, ""),
    schema: url.searchParams.get("schema") ?? "public",
    sslmode: url.searchParams.get("sslmode") ?? null
  };
}

function assertSecretShape(secret: RuntimeSecret) {
  const missing = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"].filter(
    (key) => !secret[key as keyof RuntimeSecret]
  );

  if (missing.length > 0) {
    throw new Error(`Missing runtime secret keys: ${missing.join(", ")}`);
  }

  if ((secret.JWT_ACCESS_SECRET?.length ?? 0) < 32 || (secret.JWT_REFRESH_SECRET?.length ?? 0) < 32) {
    throw new Error("JWT secrets must be at least 32 characters.");
  }
}

function assertRdsSecretMatches(databaseUrl: string, rdsSecret: RdsSecret) {
  const url = new URL(databaseUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (!rdsSecret.username || !rdsSecret.password) {
    throw new Error("RDS secret must include username and password.");
  }

  if (username !== rdsSecret.username || password !== rdsSecret.password) {
    throw new Error("Runtime DATABASE_URL credentials do not match the active RDS secret.");
  }
}

async function verifyPrismaConnection(databaseUrl: string) {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });

  try {
    const ping = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    const userCount = await prisma.user.count();
    return {
      ping: ping[0]?.ok === 1,
      userCount
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyHealth(apiBaseUrl: string) {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function verifyLogin(apiBaseUrl: string, identifier: string, password: string) {
  const loginResponse = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ identifier, password })
  });

  if (!loginResponse.ok) {
    throw new Error(`Login smoke test failed with HTTP ${loginResponse.status}.`);
  }

  const setCookie = loginResponse.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Login smoke test did not return session cookies.");
  }

  const accessCookie = setCookie
    .split(/,(?=\s*[^;]+=)/)
    .find((cookie) => cookie.trim().startsWith(`${ACCESS_COOKIE_NAME}=`));
  if (!accessCookie) {
    throw new Error("Login smoke test did not return an access-token cookie.");
  }

  const meResponse = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/auth/me`, {
    headers: {
      cookie: accessCookie.split(";")[0]
    }
  });

  if (!meResponse.ok) {
    throw new Error(`/auth/me smoke test failed with HTTP ${meResponse.status}.`);
  }

  const profile = (await meResponse.json()) as { username?: string; email?: string };
  return {
    username: profile.username,
    email: profile.email
  };
}

async function runCheck(name: string, check: () => Promise<Record<string, unknown> | void>, results: CheckResult[]) {
  try {
    const details = await check();
    results.push({ name, ok: true, details: details ?? undefined });
  } catch (error) {
    results.push({
      name,
      ok: false,
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

async function main() {
  const config = parseArgs();
  const appSecretId = requireValue(config.appSecretId, "--app-secret-id or SIGE_AWS_APP_SECRET_ID");
  const results: CheckResult[] = [];
  const runtimeSecret = await getSecretJson<RuntimeSecret>(appSecretId);
  const databaseUrl = requireValue(runtimeSecret.DATABASE_URL, "DATABASE_URL");

  await runCheck(
    "runtime secret shape",
    async () => {
      assertSecretShape(runtimeSecret);
      return redactDatabaseUrl(databaseUrl);
    },
    results
  );

  if (config.rdsSecretId) {
    await runCheck(
      "runtime secret matches RDS secret",
      async () => {
        const rdsSecret = await getSecretJson<RdsSecret>(config.rdsSecretId as string);
        assertRdsSecretMatches(databaseUrl, rdsSecret);
      },
      results
    );
  }

  if (config.directDb) {
    await runCheck(
      "Prisma database connection",
      async () => verifyPrismaConnection(databaseUrl),
      results
    );
  }

  if (!config.skipHttp && config.apiBaseUrl) {
    await runCheck(
      "API health endpoint",
      async () => verifyHealth(config.apiBaseUrl as string),
      results
    );

    if (config.loginIdentifier && config.loginPassword) {
      await runCheck(
        "login smoke test",
        async () =>
          verifyLogin(config.apiBaseUrl as string, config.loginIdentifier as string, config.loginPassword as string),
        results
      );
    }
  }

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
