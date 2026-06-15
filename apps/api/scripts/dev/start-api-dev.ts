import { spawn } from "node:child_process";
import { watch } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { assertDatabaseUrlAllowedForAppEnv } from "../../src/config/database-url-guard";
import { apiRoot, loadLocalDevEnvironment, prismaCliPath, repoRoot } from "./local-env";

const localDataDirectory = path.join(repoRoot, ".local-postgres", "data");
const localLogPath = path.join(repoRoot, ".local-postgres", "postgres.stderr.log");
const generatedPrismaClientPath = path.join(repoRoot, "node_modules", ".prisma", "client", "index.js");
const DEFAULT_LOCAL_POSTGRES_PORT = 5432;

function getDefaultPgCtlPaths() {
  return [
    process.env.POSTGRES_BIN_DIR ? path.join(process.env.POSTGRES_BIN_DIR, "pg_ctl.exe") : null,
    "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe"
  ].filter((value): value is string => Boolean(value));
}

function getLocalDatabaseTarget() {
  if (process.env.SIGE_SKIP_LOCAL_POSTGRES === "true") {
    return null;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const parsed = new URL(databaseUrl);
  const isLocalHost =
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "::1" ||
    parsed.hostname === "[::1]";
  if (!isLocalHost) {
    return null;
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port || DEFAULT_LOCAL_POSTGRES_PORT)
  };
}

function isLegacyRdsTunnelRequested() {
  const value = (process.env.SIGE_USE_RDS_TUNNEL ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function canConnect(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: apiRoot,
      stdio: "inherit",
      shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command)
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });

    child.once("error", reject);
  });
}

async function ensureLocalPrismaEngineIsEnabled() {
  let generatedClient: string;
  try {
    generatedClient = await fs.readFile(generatedPrismaClientPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  const patchedClient = generatedClient.replaceAll('"copyEngine": false', '"copyEngine": true');

  if (patchedClient !== generatedClient) {
    await fs.writeFile(generatedPrismaClientPath, patchedClient);
    console.log("[dev] Re-enabled local Prisma query engine.");
  }
}

function startLocalPrismaEngineGuard() {
  let timeout: NodeJS.Timeout | null = null;
  let isPatching = false;

  const patch = () => {
    if (isPatching) {
      return;
    }

    isPatching = true;
    void ensureLocalPrismaEngineIsEnabled()
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        isPatching = false;
      });
  };

  const schedulePatch = () => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(patch, 100);
    timeout.unref();
  };

  const watcher = watch(path.dirname(generatedPrismaClientPath), (eventType, filename) => {
    if (eventType === "change" && filename === path.basename(generatedPrismaClientPath)) {
      schedulePatch();
    }
  });
  watcher.unref();

  const interval = setInterval(patch, 1500);
  interval.unref();

  return () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    clearInterval(interval);
    watcher.close();
  };
}

async function findPgCtl() {
  for (const pgCtlPath of getDefaultPgCtlPaths()) {
    try {
      await run(pgCtlPath, ["--version"]);
      return pgCtlPath;
    } catch {
      // Try the next configured PostgreSQL installation.
    }
  }

  throw new Error("Could not find pg_ctl.exe. Set POSTGRES_BIN_DIR to your PostgreSQL bin directory.");
}

async function ensureLocalPostgres(pgCtlPath: string, host: string, port: number) {
  if (await canConnect(host, port)) {
    return;
  }

  console.log(`[dev] Starting local PostgreSQL on ${host}:${port}...`);
  await run(pgCtlPath, ["start", "-D", localDataDirectory, "-l", localLogPath, "-o", `-p ${port}`]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await canConnect(host, port)) {
      console.log(`[dev] Local PostgreSQL is ready on ${host}:${port}.`);
      return;
    }

    await sleep(500);
  }

  throw new Error(`Local PostgreSQL did not become ready on ${host}:${port}.`);
}

function startApi() {
  const child = spawn("tsx", ["watch", "src/server.ts"], {
    cwd: apiRoot,
    stdio: "inherit",
    shell: true
  });

  child.once("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.once("error", (error) => {
    console.error(error);
    process.exit(1);
  });

  return child;
}

async function main() {
  loadLocalDevEnvironment();

  if (isLegacyRdsTunnelRequested()) {
    throw new Error("SIGE_USE_RDS_TUNNEL is disabled for local development. Use APP_ENV=production in AWS for RDS.");
  }

  assertDatabaseUrlAllowedForAppEnv(process.env.DATABASE_URL, process.env.APP_ENV);

  const target = getLocalDatabaseTarget();
  const pgCtlPath = target ? await findPgCtl() : null;

  if (target && pgCtlPath) {
    await ensureLocalPostgres(pgCtlPath, target.host, target.port);
  }

  await run(process.execPath, [prismaCliPath, "generate"]);
  await ensureLocalPrismaEngineIsEnabled();
  const stopPrismaGuard = startLocalPrismaEngineGuard();
  const api = startApi();

  if (target && pgCtlPath) {
    setInterval(() => {
      void (async () => {
        if (!(await canConnect(target.host, target.port))) {
          console.warn(`[dev] Local PostgreSQL is down. Restarting ${target.host}:${target.port}...`);
          await ensureLocalPostgres(pgCtlPath, target.host, target.port);
        }
      })().catch((error: unknown) => {
        console.error(error);
      });
    }, 5000).unref();
  }

  const stop = () => {
    stopPrismaGuard();
    api.kill();
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
