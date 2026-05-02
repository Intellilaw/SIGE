import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import { LEGACY_EXECUTION_MODULES } from "./legacy-business-config";

type LegacyRow = Record<string, unknown>;

const prisma = new PrismaClient();

const LEGACY_TASK_NAME_KEYS = [
  "tarea",
  "task_name",
  "nombre",
  "nombre_tarea",
  "escrito",
  "evento_escrito",
  "evento_nombre",
  "event_name",
  "evento",
  "tramite",
  "reporte",
  "actividad",
  "concepto",
  "descripcion",
  "detalle"
];

function parseCommandLine() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "../../../..");
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      apply: { type: "boolean" }
    },
    allowPositionals: false
  });

  return {
    inputPath: path.resolve(repoRoot, values.input ?? "runtime-logs/intranet-business-export.json"),
    apply: values.apply ?? false
  };
}

function stablePlaceholderId(prefix: string, value: string) {
  const digest = createHash("sha1")
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);

  return `${prefix}-${digest}`;
}

function normalizeText(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function pickFirst(row: LegacyRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return undefined;
}

function legacyTaskName(row: LegacyRow, fallbackName = "Tarea") {
  return normalizeText(pickFirst(row, LEGACY_TASK_NAME_KEYS)) || fallbackName;
}

function legacyTermEventName(row: LegacyRow) {
  return legacyTaskName(row, "Termino");
}

function legacyPendingTaskLabel(row: LegacyRow) {
  return normalizeOptionalText(
    pickFirst(row, [
      "tarea_pendiente",
      "pending_task_label",
      ...LEGACY_TASK_NAME_KEYS
    ])
  );
}

function taskRecordCandidateIds(row: LegacyRow) {
  return [
    normalizeText(row.id),
    stablePlaceholderId("legacy-task-record", JSON.stringify(row))
  ].filter(Boolean);
}

function termCandidateIds(row: LegacyRow) {
  return [
    normalizeText(row.id),
    stablePlaceholderId("legacy-term", JSON.stringify(row))
  ].filter(Boolean);
}

async function main() {
  const { inputPath, apply } = parseCommandLine();
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as {
    tables: Record<string, LegacyRow[]>;
  };
  const counts = {
    plannedTaskRecords: 0,
    updatedTaskRecords: 0,
    plannedTerms: 0,
    updatedTerms: 0
  };

  for (const module of LEGACY_EXECUTION_MODULES) {
    for (const sourceTable of module.sourceTables) {
      for (const row of payload.tables[sourceTable.sourceTable] ?? []) {
        const taskName = legacyTaskName(row, sourceTable.title);

        counts.plannedTaskRecords += 1;
        if (!apply) {
          continue;
        }

        const result = await prisma.taskTrackingRecord.updateMany({
          where: {
            id: { in: taskRecordCandidateIds(row) },
            taskName: { in: ["", "Tarea legacy"] }
          },
          data: { taskName }
        });
        counts.updatedTaskRecords += result.count;
      }
    }

    for (const row of payload.tables[module.termsTable] ?? []) {
      const eventName = legacyTermEventName(row);
      const pendingTaskLabel = legacyPendingTaskLabel(row);
      if (!eventName && !pendingTaskLabel) {
        continue;
      }

      counts.plannedTerms += 1;
      if (!apply) {
        continue;
      }

      const result = await prisma.taskTerm.updateMany({
        where: {
          id: { in: termCandidateIds(row) },
          OR: [
            { eventName: { in: ["", "Termino legacy"] } },
            { pendingTaskLabel: { in: ["", "Tarea legacy"] } },
            { pendingTaskLabel: null }
          ]
        },
        data: {
          eventName,
          pendingTaskLabel
        }
      });
      counts.updatedTerms += result.count;
    }
  }

  console.log(JSON.stringify({ inputPath, apply, ...counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
