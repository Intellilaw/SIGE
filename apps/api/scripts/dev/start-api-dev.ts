import "dotenv/config";

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDirectory, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const localDataDirectory = path.join(repoRoot, ".local-postgres", "data");
const localLogPath = path.join(repoRoot, ".local-postgres", "postgres.stderr.log");
const prismaCliPath = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");

const DEFAULT_PG_CTL_PATHS = [
  process.env.POSTGRES_BIN_DIR ? path.join(process.env.POSTGRES_BIN_DIR, "pg_ctl.exe") : null,
  "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe",
  "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
  "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe"
].filter((value): value is string => Boolean(value));

function getLocalDatabaseTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const parsed = new URL(databaseUrl);
  const isLocalHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!isLocalHost) {
    return null;
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432)
  };
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

async function findPgCtl() {
  for (const pgCtlPath of DEFAULT_PG_CTL_PATHS) {
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
  const target = getLocalDatabaseTarget();
  const pgCtlPath = target ? await findPgCtl() : null;

  if (target && pgCtlPath) {
    await ensureLocalPostgres(pgCtlPath, target.host, target.port);
  }

  await run(process.execPath, [prismaCliPath, "generate"]);
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
    api.kill();
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
