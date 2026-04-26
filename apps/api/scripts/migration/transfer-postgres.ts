import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

type Mode = "dump" | "restore" | "copy";

function parseCommandLine() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string" },
      output: { type: "string" },
      input: { type: "string" },
      "source-url": { type: "string" },
      "target-url": { type: "string" }
    },
    allowPositionals: false
  });

  const mode = (values.mode ?? "copy") as Mode;
  if (!["dump", "restore", "copy"].includes(mode)) {
    throw new Error("mode must be one of: dump, restore, copy");
  }

  return {
    mode,
    output: values.output,
    input: values.input,
    sourceUrl: values["source-url"] ?? process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL,
    targetUrl: values["target-url"] ?? process.env.TARGET_DATABASE_URL
  };
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function dumpDatabase(sourceUrl: string, outputPath: string) {
  await runCommand("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    outputPath,
    sourceUrl
  ]);
}

async function restoreDatabase(targetUrl: string, inputPath: string) {
  await runCommand("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    targetUrl,
    inputPath
  ]);
}

async function main() {
  const { mode, output, input, sourceUrl, targetUrl } = parseCommandLine();

  if (mode === "dump") {
    if (!sourceUrl) {
      throw new Error("A source database URL is required for dump mode.");
    }

    if (!output) {
      throw new Error("An --output path is required for dump mode.");
    }

    await dumpDatabase(sourceUrl, path.resolve(output));
    console.log(JSON.stringify({ mode, output: path.resolve(output) }, null, 2));
    return;
  }

  if (mode === "restore") {
    if (!targetUrl) {
      throw new Error("A target database URL is required for restore mode.");
    }

    if (!input) {
      throw new Error("An --input path is required for restore mode.");
    }

    await restoreDatabase(targetUrl, path.resolve(input));
    console.log(JSON.stringify({ mode, input: path.resolve(input) }, null, 2));
    return;
  }

  if (!sourceUrl) {
    throw new Error("A source database URL is required for copy mode.");
  }
  if (!targetUrl) {
    throw new Error("A target database URL is required for copy mode.");
  }

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "sige-db-transfer-"));
  const dumpPath = output
    ? path.resolve(output)
    : path.join(tempDirectory, "sige-transfer.dump");

  try {
    await dumpDatabase(sourceUrl, dumpPath);
    await restoreDatabase(targetUrl, dumpPath);
    console.log(
      JSON.stringify(
        {
          mode,
          dumpPath,
          restoredTo: targetUrl
        },
        null,
        2
      )
    );
  } finally {
    if (!output) {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
