import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parseArgs } from "node:util";

import { loadLocalDevEnvironment } from "../dev/local-env";
import {
  assertFileExists,
  assertStrictLocalTarget,
  buildLibpqEnvironment,
  buildSnapshotPath,
  ensureSnapshotsDirectory,
  resolvePostgresTool,
  resolveSnapshotPath,
  runCommand
} from "./snapshot-utils";

const confirmationPhrase = "RESTORE sige_2";

function parseCommandLine() {
  const { values } = parseArgs({
    options: {
      confirm: { type: "string" },
      input: { type: "string" },
      "backup-output": { type: "string" }
    },
    strict: true
  });

  if (!values.input) {
    throw new Error("A dump file is required. Pass --input db_snapshots/latest-prod.dump.");
  }

  return {
    confirm: values.confirm,
    inputPath: resolveSnapshotPath(values.input),
    backupPath: values["backup-output"]
      ? resolveSnapshotPath(values["backup-output"])
      : buildSnapshotPath("pre-restore-local-backup")
  };
}

async function requireInteractiveConfirmation(confirm: string | undefined) {
  if (confirm !== undefined) {
    if (confirm !== confirmationPhrase) {
      throw new Error("Restore cancelled. Confirmation phrase did not match.");
    }

    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`Interactive confirmation is required. Re-run in a terminal and type: ${confirmationPhrase}`);
  }

  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question(
      `This will replace local database 127.0.0.1:15432/sige_2. Type "${confirmationPhrase}" to continue: `
    );

    if (answer !== confirmationPhrase) {
      throw new Error("Restore cancelled. Confirmation phrase did not match.");
    }
  } finally {
    readline.close();
  }
}

async function backupLocalDatabase(localUrl: string, backupPath: string) {
  const pgDump = await resolvePostgresTool("pg_dump");

  await ensureSnapshotsDirectory();
  await runCommand(
    pgDump,
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      backupPath
    ],
    buildLibpqEnvironment(localUrl)
  );
}

async function restoreLocalDatabase(localUrl: string, inputPath: string) {
  const pgRestore = await resolvePostgresTool("pg_restore");

  await runCommand(
    pgRestore,
    [
      "--clean",
      "--if-exists",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      "sige_2",
      inputPath
    ],
    buildLibpqEnvironment(localUrl)
  );
}

async function main() {
  loadLocalDevEnvironment();

  const { confirm, inputPath, backupPath } = parseCommandLine();
  await assertFileExists(inputPath);

  const localUrl = assertStrictLocalTarget(process.env.DATABASE_URL, process.env.APP_ENV);
  await requireInteractiveConfirmation(confirm);
  await backupLocalDatabase(localUrl, backupPath);
  await restoreLocalDatabase(localUrl, inputPath);

  console.log(
    JSON.stringify(
      {
        restoredTo: "127.0.0.1:15432/sige_2",
        inputPath,
        backupPath
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
