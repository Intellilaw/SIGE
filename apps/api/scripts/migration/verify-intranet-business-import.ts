import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import { LEGACY_EXECUTION_MODULES } from "./legacy-business-config";

type LegacyRow = Record<string, unknown>;
type ExportPayload = {
  source: string;
  exportedAt: string;
  tables: Record<string, LegacyRow[]>;
  summary?: {
    totalTables: number;
    totalRows: number;
    tableCounts: Record<string, number>;
  };
};

type Check = {
  name: string;
  expected: number | string;
  actual: number | string;
  status: "pass" | "warn" | "fail";
  details?: unknown;
};

const prisma = new PrismaClient();
const PLACEHOLDER_TASK_LABELS = ["Tarea legacy", "Termino legacy", "Distribucion legacy", "Evento legacy"];
const MODULE_TEAM_BY_ID: Record<string, string> = {
  litigation: "LITIGATION",
  "corporate-labor": "CORPORATE_LABOR",
  settlements: "SETTLEMENTS",
  "financial-law": "FINANCIAL_LAW",
  "tax-compliance": "TAX_COMPLIANCE"
};

function parseCommandLine() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "../../../..");
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      "input-url": { type: "string" },
      report: { type: "string" }
    },
    allowPositionals: false
  });

  return {
    inputPath: path.resolve(repoRoot, values.input ?? "runtime-logs/intranet-business-export.json"),
    inputUrl: values["input-url"],
    reportPath: path.resolve(
      repoRoot,
      values.report ?? "runtime-logs/intranet-business-verification-report.json"
    )
  };
}

async function readExportPayload(inputPath: string, inputUrl?: string) {
  if (!inputUrl) {
    return JSON.parse(await readFile(inputPath, "utf8")) as ExportPayload;
  }

  const response = await fetch(inputUrl);
  if (!response.ok) {
    throw new Error(`Unable to download verification input from ${inputUrl}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ExportPayload;
}

function normalizeText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeComparable(value: unknown) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pickFirst(row: LegacyRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return undefined;
}

function countRows(payload: ExportPayload, tableName: string) {
  return payload.tables[tableName]?.length ?? 0;
}

function getMatterIdentifier(row: LegacyRow) {
  return (
    normalizeText(pickFirst(row, ["id_asunto", "matter_identifier", "matter_number"])) ||
    normalizeText(pickFirst(row, ["id", "active_matter_id"]))
  );
}

function countExecutionOnlyMatterRows(payload: ExportPayload) {
  const activeMatterIdentifiers = new Set(
    (payload.tables.active_matters ?? []).map(getMatterIdentifier).filter(Boolean)
  );

  return LEGACY_EXECUTION_MODULES.reduce((sum, module) => {
    const rows = payload.tables[module.matterTable] ?? [];
    return sum + rows.filter((row) => {
      const identifier = getMatterIdentifier(row);
      return identifier && !activeMatterIdentifiers.has(identifier);
    }).length;
  }, 0);
}

function addCountCheck(checks: Check[], name: string, expected: number, actual: number) {
  checks.push({
    name,
    expected,
    actual,
    status: expected === actual ? "pass" : "fail"
  });
}

function buildExpectedCounts(payload: ExportPayload) {
  const counts = {
    archiveRows: Object.values(payload.tables).reduce((sum, rows) => sum + rows.length, 0),
    clients: countRows(payload, "clients"),
    quotes: countRows(payload, "quotes"),
    leads: countRows(payload, "leads_tracking"),
    matters: countRows(payload, "active_matters") + countExecutionOnlyMatterRows(payload),
    financeRecords: countRows(payload, "finance_records"),
    financeSnapshots: countRows(payload, "finance_snapshots"),
    generalExpenses: countRows(payload, "gastos_generales"),
    commissionReceivers: countRows(payload, "commission_receivers"),
    commissionSnapshots: countRows(payload, "commission_snapshots"),
    holidays: (payload.tables.dias_inhabiles ?? []).filter((row) =>
      normalizeText(pickFirst(row, ["fecha", "date"]))
    ).length,
    taskTrackingRecords: 0,
    taskTerms: 0,
    taskDistributionEvents: 0,
    taskDistributionHistory: 0,
    taskAdditionalTasks: 0
  };

  for (const module of LEGACY_EXECUTION_MODULES) {
    counts.taskTerms += countRows(payload, module.termsTable);
    counts.taskDistributionEvents += countRows(payload, module.eventsTable);
    counts.taskDistributionHistory += countRows(payload, module.historyTable);
    counts.taskAdditionalTasks += countRows(payload, module.additionalTasksTable);

    for (const table of module.sourceTables) {
      counts.taskTrackingRecords += countRows(payload, table.sourceTable);
    }
  }

  return counts;
}

function getLegacyClientNumber(row: LegacyRow) {
  return normalizeText(pickFirst(row, ["client_number", "numero", "numero_cliente"]));
}

function getLegacyClientName(row: LegacyRow) {
  return normalizeText(pickFirst(row, ["name", "nombre", "cliente"]));
}

async function main() {
  const { inputPath, inputUrl, reportPath } = parseCommandLine();
  const payload = await readExportPayload(inputPath, inputUrl);
  const expected = buildExpectedCounts(payload);
  const checks: Check[] = [];

  const [
    archiveRows,
    clients,
    quotes,
    leads,
    importedMatters,
    financeRecords,
    financeSnapshots,
    generalExpenses,
    commissionReceivers,
    commissionSnapshots,
    holidays,
    taskTrackingRecords,
    taskTerms,
    taskDistributionEvents,
    taskDistributionHistory,
    taskAdditionalTasks
  ] = await Promise.all([
    prisma.legacyImportArchive.count(),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { clientNumber: true, name: true }
    }),
    prisma.quote.count(),
    prisma.lead.count(),
    prisma.matter.findMany({
      select: { matterIdentifier: true, responsibleTeam: true }
    }),
    prisma.financeRecord.count(),
    prisma.financeSnapshot.count(),
    prisma.generalExpense.count(),
    prisma.commissionReceiver.count(),
    prisma.commissionSnapshot.count(),
    prisma.holiday.count(),
    prisma.taskTrackingRecord.count(),
    prisma.taskTerm.count(),
    prisma.taskDistributionEvent.count(),
    prisma.taskDistributionHistory.count(),
    prisma.taskAdditionalTask.count()
  ]);

  addCountCheck(checks, "legacy archive rows", expected.archiveRows, archiveRows);
  addCountCheck(checks, "quotes", expected.quotes, quotes);
  addCountCheck(checks, "leads", expected.leads, leads);
  addCountCheck(checks, "matters", expected.matters, importedMatters.length);
  addCountCheck(checks, "finance records", expected.financeRecords, financeRecords);
  addCountCheck(checks, "finance snapshots", expected.financeSnapshots, financeSnapshots);
  addCountCheck(checks, "general expenses", expected.generalExpenses, generalExpenses);
  addCountCheck(checks, "commission receivers", expected.commissionReceivers, commissionReceivers);
  addCountCheck(checks, "commission snapshots", expected.commissionSnapshots, commissionSnapshots);
  addCountCheck(checks, "holidays", expected.holidays, holidays);
  addCountCheck(checks, "task tracking records", expected.taskTrackingRecords, taskTrackingRecords);
  addCountCheck(checks, "task terms", expected.taskTerms, taskTerms);
  addCountCheck(checks, "task distribution events", expected.taskDistributionEvents, taskDistributionEvents);
  addCountCheck(checks, "task distribution history", expected.taskDistributionHistory, taskDistributionHistory);
  addCountCheck(checks, "task additional tasks", expected.taskAdditionalTasks, taskAdditionalTasks);

  const clientsByNumber = new Map(clients.map((client) => [client.clientNumber, client]));
  const missingClients = (payload.tables.clients ?? [])
    .map((row) => ({
      clientNumber: getLegacyClientNumber(row),
      name: getLegacyClientName(row)
    }))
    .filter((client) => client.clientNumber && !clientsByNumber.has(client.clientNumber));

  const renamedClients = (payload.tables.clients ?? [])
    .map((row) => {
      const clientNumber = getLegacyClientNumber(row);
      const name = getLegacyClientName(row);
      const imported = clientsByNumber.get(clientNumber);
      return {
        clientNumber,
        expectedName: name,
        actualName: imported?.name ?? ""
      };
    })
    .filter(
      (client) =>
        client.clientNumber &&
        client.actualName &&
        normalizeComparable(client.expectedName) !== normalizeComparable(client.actualName)
    );

  checks.push({
    name: "legacy client numbers preserved",
    expected: expected.clients,
    actual: expected.clients - missingClients.length,
    status: missingClients.length === 0 ? "pass" : "fail",
    details: { missingClients: missingClients.slice(0, 25) }
  });

  checks.push({
    name: "legacy client names preserved",
    expected: 0,
    actual: renamedClients.length,
    status: renamedClients.length === 0 ? "pass" : "warn",
    details: { renamedClients: renamedClients.slice(0, 25) }
  });

  const extraClients = clients.filter((client) => {
    const legacyClientNumbers = new Set((payload.tables.clients ?? []).map(getLegacyClientNumber));
    return !legacyClientNumbers.has(client.clientNumber);
  });
  checks.push({
    name: "extra placeholder clients",
    expected: 0,
    actual: extraClients.length,
    status: extraClients.length === 0 ? "pass" : "warn",
    details: { extraClients: extraClients.slice(0, 25) }
  });

  const importedExecutionMatterKeys = new Set(
    importedMatters
      .map((matter) =>
        matter.matterIdentifier && matter.responsibleTeam
          ? `${matter.responsibleTeam}:${matter.matterIdentifier}`
          : ""
      )
      .filter(Boolean)
  );
  const unmatchedExecutionMatterRows = LEGACY_EXECUTION_MODULES.flatMap((module) =>
    (payload.tables[module.matterTable] ?? [])
      .map((row) => ({
        moduleId: module.moduleId,
        team: MODULE_TEAM_BY_ID[module.moduleId],
        table: module.matterTable,
        identifier: getMatterIdentifier(row),
        clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
        subject: normalizeText(pickFirst(row, ["asunto", "subject"]))
      }))
      .filter((row) => row.identifier && !importedExecutionMatterKeys.has(`${row.team}:${row.identifier}`))
  );
  checks.push({
    name: "execution matter rows represented by SIGE matters",
    expected: 0,
    actual: unmatchedExecutionMatterRows.length,
    status: unmatchedExecutionMatterRows.length === 0 ? "pass" : "warn",
    details: { unmatchedRows: unmatchedExecutionMatterRows.slice(0, 25) }
  });

  const [placeholderTrackingRecords, placeholderTerms] = await Promise.all([
    prisma.taskTrackingRecord.count({
      where: { taskName: { in: PLACEHOLDER_TASK_LABELS } }
    }),
    prisma.taskTerm.count({
      where: {
        OR: [
          { eventName: { in: PLACEHOLDER_TASK_LABELS } },
          { pendingTaskLabel: { in: PLACEHOLDER_TASK_LABELS } }
        ]
      }
    })
  ]);
  checks.push({
    name: "execution task names are concrete",
    expected: 0,
    actual: placeholderTrackingRecords + placeholderTerms,
    status: placeholderTrackingRecords + placeholderTerms === 0 ? "pass" : "fail",
    details: { placeholderTrackingRecords, placeholderTerms }
  });

  const report = {
    source: payload.source,
    inputPath: inputUrl ?? inputPath,
    reportPath,
    exportedAt: payload.exportedAt,
    verifiedAt: new Date().toISOString(),
    expected,
    actual: {
      archiveRows,
      clients: clients.length,
      quotes,
      leads,
      matters: importedMatters.length,
      financeRecords,
      financeSnapshots,
      generalExpenses,
      commissionReceivers,
      commissionSnapshots,
      holidays,
      taskTrackingRecords,
      taskTerms,
      taskDistributionEvents,
      taskDistributionHistory,
      taskAdditionalTasks
    },
    checks,
    summary: {
      passed: checks.filter((check) => check.status === "pass").length,
      warnings: checks.filter((check) => check.status === "warn").length,
      failed: checks.filter((check) => check.status === "fail").length
    }
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
