import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const apiRoot = path.resolve(scriptDirectory, "../..");
export const repoRoot = path.resolve(apiRoot, "../..");
export const prismaCliPath = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
export const tsxCliPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

function loadEnvFile(filePath: string, override: boolean) {
  dotenv.config({ path: filePath, override });
}

export function loadLocalDevEnvironment() {
  loadEnvFile(path.join(repoRoot, ".env"), false);
  loadEnvFile(path.join(apiRoot, ".env"), false);
  loadEnvFile(path.join(repoRoot, ".env.local"), true);
  loadEnvFile(path.join(apiRoot, ".env.local"), true);
  process.env.APP_ENV = "local";
}
