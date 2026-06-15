import { parseArgs } from "node:util";

import { loadLocalDevEnvironment } from "../dev/local-env";
import {
  assertStrictLocalTarget,
  buildLibpqEnvironment,
  buildSnapshotPath,
  ensureSnapshotsDirectory,
  resolvePostgresTool,
  resolveSnapshotPath,
  runCommand
} from "./snapshot-utils";

function parseCommandLine() {
  const { values } = parseArgs({
    options: {
      output: { type: "string" }
    },
    strict: true
  });

  return {
    outputPath: values.output ? resolveSnapshotPath(values.output) : buildSnapshotPath("local-backup")
  };
}

export async function backupLocalDatabase(outputPath: string) {
  const localUrl = assertStrictLocalTarget(process.env.DATABASE_URL, process.env.APP_ENV);
  const pgDump = await resolvePostgresTool("pg_dump");

  await ensureSnapshotsDirectory();
  await runCommand(
    pgDump,
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      outputPath
    ],
    buildLibpqEnvironment(localUrl)
  );

  return outputPath;
}

async function main() {
  loadLocalDevEnvironment();

  const { outputPath } = parseCommandLine();
  const backupPath = await backupLocalDatabase(outputPath);

  console.log(
    JSON.stringify(
      {
        database: "127.0.0.1:15432/sige_2",
        outputPath: backupPath
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
