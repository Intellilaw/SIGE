import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { repoRoot } from "../dev/local-env";

const postgresqlProtocols = new Set(["postgres:", "postgresql:"]);
const expectedLocalDatabase = {
  appEnv: "local",
  hostname: "127.0.0.1",
  port: "15432",
  database: "sige_2"
};

export const snapshotsDirectory = path.join(repoRoot, "db_snapshots");

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
}

export function buildSnapshotPath(prefix: string) {
  return path.join(snapshotsDirectory, `${prefix}-${timestamp()}.dump`);
}

export function resolveSnapshotPath(input: string) {
  return path.isAbsolute(input) ? input : path.resolve(repoRoot, input);
}

export async function ensureSnapshotsDirectory() {
  await mkdir(snapshotsDirectory, { recursive: true });
}

export async function assertFileExists(filePath: string) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Dump file does not exist: ${filePath}`);
  }
}

function parsePostgresUrl(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL connection URL.`);
  }

  if (!postgresqlProtocols.has(url.protocol)) {
    throw new Error(`${label} must use postgres:// or postgresql://.`);
  }

  return url;
}

export function assertStrictLocalTarget(databaseUrl: string | undefined, appEnv: string | undefined) {
  if (appEnv !== expectedLocalDatabase.appEnv) {
    throw new Error("Local restore and backup scripts require APP_ENV=local.");
  }

  const url = parsePostgresUrl(databaseUrl, "DATABASE_URL");
  const database = url.pathname.replace(/^\//, "");
  const port = url.port || "5432";

  if (
    url.hostname !== expectedLocalDatabase.hostname ||
    port !== expectedLocalDatabase.port ||
    database !== expectedLocalDatabase.database
  ) {
    throw new Error(
      `Local restore and backup scripts only allow ${expectedLocalDatabase.hostname}:` +
        `${expectedLocalDatabase.port}/${expectedLocalDatabase.database}.`
    );
  }

  return databaseUrl as string;
}

export function buildLibpqEnvironment(databaseUrl: string) {
  const url = parsePostgresUrl(databaseUrl, "database URL");
  const database = url.pathname.replace(/^\//, "");
  const sslmode = url.searchParams.get("sslmode");
  const connectTimeout = url.searchParams.get("connect_timeout");

  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: database,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
    ...(connectTimeout ? { PGCONNECT_TIMEOUT: connectTimeout } : {})
  };
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePostgresTool(toolName: "pg_dump" | "pg_restore") {
  const executableName = process.platform === "win32" ? `${toolName}.exe` : toolName;
  const candidates = [
    process.env.POSTGRES_BIN_DIR ? path.join(process.env.POSTGRES_BIN_DIR, executableName) : null,
    process.platform === "win32" ? path.join("C:\\Program Files\\PostgreSQL\\18\\bin", executableName) : null,
    process.platform === "win32" ? path.join("C:\\Program Files\\PostgreSQL\\17\\bin", executableName) : null,
    process.platform === "win32" ? path.join("C:\\Program Files\\PostgreSQL\\16\\bin", executableName) : null
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return toolName;
}

export function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env
      },
      stdio: "inherit",
      shell: false
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });

    child.once("error", reject);
  });
}
