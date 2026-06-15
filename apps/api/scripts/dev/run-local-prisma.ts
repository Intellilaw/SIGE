import { spawn } from "node:child_process";

import { assertDatabaseUrlAllowedForAppEnv } from "../../src/config/database-url-guard";
import { apiRoot, loadLocalDevEnvironment, prismaCliPath } from "./local-env";

function runPrisma(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [prismaCliPath, ...args], {
      cwd: apiRoot,
      env: process.env,
      stdio: "inherit",
      shell: false
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`prisma ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });

    child.once("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error("A Prisma command is required.");
  }

  loadLocalDevEnvironment();
  assertDatabaseUrlAllowedForAppEnv(process.env.DATABASE_URL, process.env.APP_ENV);
  await runPrisma(args);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
