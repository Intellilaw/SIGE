import { cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptDir, "../..");

await cp(join(apiRoot, "templates"), join(apiRoot, "dist", "templates"), {
  recursive: true
});
