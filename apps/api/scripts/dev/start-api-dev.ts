import "dotenv/config";

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { watch } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDirectory, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const localDataDirectory = path.join(repoRoot, ".local-postgres", "data");
const localLogPath = path.join(repoRoot, ".local-postgres", "postgres.stderr.log");
const prismaCliPath = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
const generatedPrismaClientPath = path.join(repoRoot, "node_modules", ".prisma", "client", "index.js");
const execFileAsync = promisify(execFile);
const SESSION_MANAGER_PLUGIN_BIN = "C:\\Program Files\\Amazon\\SessionManagerPlugin\\bin";
const DEFAULT_RDS_TUNNEL_LOCAL_HOST = "127.0.0.1";
const DEFAULT_RDS_TUNNEL_LOCAL_PORT = 15432;
const DEFAULT_RDS_TUNNEL_REMOTE_PORT = 5432;

type RuntimeSecret = {
  DATABASE_URL?: string;
  [key: string]: string | number | boolean | undefined;
};

type RdsTunnelConfig = {
  appSecretId: string;
  region: string;
  instanceId: string;
  remoteHost: string;
  remotePort: number;
  localHost: string;
  localPort: number;
};

const DEFAULT_PG_CTL_PATHS = [
  process.env.POSTGRES_BIN_DIR ? path.join(process.env.POSTGRES_BIN_DIR, "pg_ctl.exe") : null,
  "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe",
  "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
  "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe"
].filter((value): value is string => Boolean(value));

function getLocalDatabaseTarget() {
  if (process.env.SIGE_SKIP_LOCAL_POSTGRES === "true") {
    return null;
  }

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

function shouldUseRdsTunnel() {
  return true;
}

function requireDevEnv(value: string | undefined, label: string) {
  if (!value) {
    throw new Error(`${label} is required when SIGE_USE_RDS_TUNNEL=true.`);
  }

  return value;
}

function getRdsTunnelConfig(): RdsTunnelConfig {
  return {
    appSecretId: requireDevEnv(process.env.SIGE_AWS_APP_SECRET_ID, "SIGE_AWS_APP_SECRET_ID"),
    region: process.env.AWS_REGION ?? process.env.SIGE_AWS_REGION ?? "us-east-1",
    instanceId: requireDevEnv(process.env.SIGE_RDS_TUNNEL_INSTANCE_ID, "SIGE_RDS_TUNNEL_INSTANCE_ID"),
    remoteHost: requireDevEnv(process.env.SIGE_RDS_TUNNEL_REMOTE_HOST, "SIGE_RDS_TUNNEL_REMOTE_HOST"),
    remotePort: Number(process.env.SIGE_RDS_TUNNEL_REMOTE_PORT ?? DEFAULT_RDS_TUNNEL_REMOTE_PORT),
    localHost: process.env.SIGE_RDS_TUNNEL_LOCAL_HOST ?? DEFAULT_RDS_TUNNEL_LOCAL_HOST,
    localPort: Number(process.env.SIGE_RDS_TUNNEL_LOCAL_PORT ?? DEFAULT_RDS_TUNNEL_LOCAL_PORT)
  };
}

function ensureSessionManagerPluginPath() {
  if (process.platform !== "win32") {
    return;
  }

  const currentPath = process.env.PATH ?? "";
  if (currentPath.toLowerCase().includes(SESSION_MANAGER_PLUGIN_BIN.toLowerCase())) {
    return;
  }

  process.env.PATH = `${SESSION_MANAGER_PLUGIN_BIN};${currentPath}`;
}

const RUNTIME_SECRET_ENV_KEYS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "MANAGER_DE_ESCRITOS_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_QUOTE_TRANSLATION_MODEL",
  "OPENAI_QUOTE_TRANSLATION_TIMEOUT_MS",
  "OPENAI_LABOR_CONTRACT_MODEL",
  "OPENAI_LABOR_CONTRACT_TIMEOUT_MS",
  "OPENAI_EXTERNAL_CONTRACT_MODEL",
  "OPENAI_EXTERNAL_CONTRACT_TIMEOUT_MS",
  "SSO_AUDIENCE",
  "SSO_ISSUER",
  "SSO_SECRET_KEY"
];

async function getRuntimeSecret(config: RdsTunnelConfig) {
  const { stdout } = await execFileAsync("aws", [
    "secretsmanager",
    "get-secret-value",
    "--region",
    config.region,
    "--secret-id",
    config.appSecretId,
    "--query",
    "SecretString",
    "--output",
    "text"
  ]);

  return JSON.parse(stdout.trim()) as RuntimeSecret;
}

function applyRuntimeSecretEnvironment(secret: RuntimeSecret) {
  for (const key of RUNTIME_SECRET_ENV_KEYS) {
    const value = secret[key];

    if (value === undefined || value === null || process.env[key]) {
      continue;
    }

    process.env[key] = String(value);
  }
}

function toTunnelDatabaseUrl(databaseUrl: string, config: RdsTunnelConfig) {
  const url = new URL(databaseUrl);
  url.hostname = config.localHost;
  url.port = String(config.localPort);
  url.searchParams.set("sslmode", process.env.SIGE_RDS_TUNNEL_SSLMODE ?? "require");
  url.searchParams.set("connect_timeout", process.env.SIGE_RDS_TUNNEL_CONNECT_TIMEOUT ?? "30");
  url.searchParams.set("connection_limit", process.env.SIGE_RDS_TUNNEL_CONNECTION_LIMIT ?? "1");
  url.searchParams.set("pool_timeout", process.env.SIGE_RDS_TUNNEL_POOL_TIMEOUT ?? "30");
  return url.toString();
}

function startSsmRdsTunnel(config: RdsTunnelConfig) {
  ensureSessionManagerPluginPath();

  const parameters = JSON.stringify({
    host: [config.remoteHost],
    portNumber: [String(config.remotePort)],
    localPortNumber: [String(config.localPort)]
  });

  return spawn(
    "aws",
    [
      "ssm",
      "start-session",
      "--region",
      config.region,
      "--target",
      config.instanceId,
      "--document-name",
      "AWS-StartPortForwardingSessionToRemoteHost",
      "--parameters",
      parameters
    ],
    {
      stdio: ["ignore", "inherit", "inherit"],
      shell: false
    }
  );
}

async function ensureRdsTunnel(config: RdsTunnelConfig) {
  if (await canConnect(config.localHost, config.localPort)) {
    console.log(`[dev] Reusing existing AWS RDS tunnel on ${config.localHost}:${config.localPort}.`);
    return null;
  }

  console.log(`[dev] Starting AWS RDS tunnel on ${config.localHost}:${config.localPort}...`);
  const tunnel = startSsmRdsTunnel(config);
  const tunnelState: { exit: { code: number | null; signal: NodeJS.Signals | null } | null } = { exit: null };
  tunnel.once("exit", (code, signal) => {
    tunnelState.exit = { code, signal };
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await canConnect(config.localHost, config.localPort)) {
      console.log(`[dev] AWS RDS tunnel is ready on ${config.localHost}:${config.localPort}.`);
      return tunnel;
    }

    if (tunnelState.exit) {
      throw new Error(
        `AWS RDS tunnel exited before becoming ready (code ${tunnelState.exit.code ?? "unknown"}, signal ${
          tunnelState.exit.signal ?? "none"
        }).`
      );
    }

    await sleep(500);
  }

  tunnel.kill();
  throw new Error(`AWS RDS tunnel did not become ready on ${config.localHost}:${config.localPort}.`);
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
  let rdsTunnelConfig: RdsTunnelConfig | null = null;
  let tunnelProcess: ChildProcess | null = null;

  if (shouldUseRdsTunnel()) {
    rdsTunnelConfig = getRdsTunnelConfig();
    const runtimeSecret = await getRuntimeSecret(rdsTunnelConfig);
    tunnelProcess = await ensureRdsTunnel(rdsTunnelConfig);
    applyRuntimeSecretEnvironment(runtimeSecret);
    process.env.DATABASE_URL = toTunnelDatabaseUrl(
      requireDevEnv(runtimeSecret.DATABASE_URL, "DATABASE_URL in SIGE_AWS_APP_SECRET_ID"),
      rdsTunnelConfig
    );
    process.env.SIGE_SKIP_LOCAL_POSTGRES = "true";
    console.log("[dev] API database points to AWS RDS through the local SSM tunnel.");
  }

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

  if (rdsTunnelConfig) {
    setInterval(() => {
      void (async () => {
        if (await canConnect(rdsTunnelConfig.localHost, rdsTunnelConfig.localPort)) {
          return;
        }

        console.warn(
          `[dev] AWS RDS tunnel is down. Restarting ${rdsTunnelConfig.localHost}:${rdsTunnelConfig.localPort}...`
        );
        tunnelProcess?.kill();
        tunnelProcess = await ensureRdsTunnel(rdsTunnelConfig);
      })().catch((error: unknown) => {
        console.error(error);
      });
    }, 5000).unref();
  }

  const stop = () => {
    stopPrismaGuard();
    api.kill();
    tunnelProcess?.kill();
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
