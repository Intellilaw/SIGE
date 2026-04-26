import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { LEGACY_ALL_TABLES, LEGACY_EXECUTION_MODULES } from "./legacy-business-config";
import { fetchLegacyTableRows, readLegacyCredentials, signInLegacy } from "./legacy-source";

type LegacyRow = Record<string, unknown>;

function parseCommandLine() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "../../../..");
  const { values } = parseArgs({
    options: {
      "source-root": { type: "string" },
      output: { type: "string" },
      "page-size": { type: "string" }
    },
    allowPositionals: false
  });

  return {
    repoRoot,
    sourceRoot: path.resolve(repoRoot, values["source-root"] ?? "../Intranet"),
    outputPath: path.resolve(
      repoRoot,
      values.output ?? "runtime-logs/intranet-business-export.json"
    ),
    pageSize: Number.parseInt(values["page-size"] ?? "1000", 10) || 1000
  };
}

async function main() {
  const { sourceRoot, outputPath, pageSize } = parseCommandLine();
  const credentials = await readLegacyCredentials(sourceRoot);
  const session = await signInLegacy(credentials);

  const tables: Record<string, LegacyRow[]> = {};
  for (const tableName of LEGACY_ALL_TABLES) {
    tables[tableName] = await fetchLegacyTableRows<LegacyRow>(
      credentials,
      session,
      tableName,
      pageSize
    );
  }

  const tableCounts = Object.fromEntries(
    Object.entries(tables).map(([tableName, rows]) => [tableName, rows.length])
  );
  const totalRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);

  const exportPayload = {
    source: "Intranet Supabase business export",
    exportedAt: new Date().toISOString(),
    authenticatedAs: session.userEmail,
    modules: LEGACY_EXECUTION_MODULES,
    tables,
    summary: {
      totalTables: LEGACY_ALL_TABLES.length,
      totalRows,
      tableCounts
    }
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(exportPayload, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        totalTables: LEGACY_ALL_TABLES.length,
        totalRows
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
