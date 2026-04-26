import "dotenv/config";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";
import { TASK_MODULES, type Team } from "@sige/contracts";
import { z } from "zod";

import { LEGACY_EXECUTION_MODULES } from "./legacy-business-config";

const prisma = new PrismaClient();

const ExportPayloadSchema = z.object({
  source: z.string(),
  exportedAt: z.string(),
  tables: z.record(z.array(z.record(z.string(), z.unknown()))),
  summary: z
    .object({
      totalTables: z.number(),
      totalRows: z.number(),
      tableCounts: z.record(z.number())
    })
    .optional()
});

type LegacyRow = Record<string, unknown>;
type ExportPayload = z.infer<typeof ExportPayloadSchema>;

function countRows(parsed: ExportPayload, tableName: string) {
  return parsed.tables[tableName]?.length ?? 0;
}

function buildImportCounts() {
  return {
    archivedRows: 0,
    clients: 0,
    quoteTemplates: 0,
    quotes: 0,
    leads: 0,
    matters: 0,
    financeRecords: 0,
    financeSnapshots: 0,
    generalExpenses: 0,
    commissionReceivers: 0,
    commissionSnapshots: 0,
    holidays: 0,
    taskTrackingRecords: 0,
    taskTerms: 0,
    taskDistributionEvents: 0,
    taskDistributionHistory: 0,
    taskAdditionalTasks: 0
  };
}

function buildPlannedCounts(parsed: ExportPayload) {
  const counts = buildImportCounts();
  counts.archivedRows = Object.values(parsed.tables).reduce((sum, rows) => sum + rows.length, 0);
  counts.clients = countRows(parsed, "clients");
  counts.quoteTemplates = countRows(parsed, "quote_types");
  counts.quotes = countRows(parsed, "quotes");
  counts.leads = countRows(parsed, "leads_tracking");
  counts.matters = countRows(parsed, "active_matters");
  counts.financeRecords = countRows(parsed, "finance_records");
  counts.financeSnapshots = countRows(parsed, "finance_snapshots");
  counts.generalExpenses = countRows(parsed, "gastos_generales");
  counts.commissionReceivers = countRows(parsed, "commission_receivers");
  counts.commissionSnapshots = countRows(parsed, "commission_snapshots");
  counts.holidays = (parsed.tables.dias_inhabiles ?? []).filter((row) =>
    normalizeDate(pickFirst(row, ["fecha", "date"]))
  ).length;

  for (const module of LEGACY_EXECUTION_MODULES) {
    counts.taskTerms += countRows(parsed, module.termsTable);
    counts.taskTrackingRecords += module.sourceTables.reduce(
      (sum, table) => sum + countRows(parsed, table.sourceTable),
      0
    );
    counts.taskDistributionEvents += countRows(parsed, module.eventsTable);
    counts.taskDistributionHistory += countRows(parsed, module.historyTable);
    counts.taskAdditionalTasks += countRows(parsed, module.additionalTasksTable);
  }

  return counts;
}

function parseCommandLine() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "../../../..");
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      "input-url": { type: "string" },
      report: { type: "string" },
      apply: { type: "boolean" },
      replace: { type: "boolean" }
    },
    allowPositionals: false
  });

  return {
    repoRoot,
    inputPath: path.resolve(
      repoRoot,
      values.input ?? "runtime-logs/intranet-business-export.json"
    ),
    inputUrl: values["input-url"],
    reportPath: path.resolve(
      repoRoot,
      values.report ?? "runtime-logs/intranet-business-import-report.json"
    ),
    apply: values.apply ?? false,
    replace: values.replace ?? false
  };
}

async function readInputPayload(inputPath: string, inputUrl?: string) {
  if (!inputUrl) {
    return readFile(inputPath, "utf8");
  }

  const response = await fetch(inputUrl);
  if (!response.ok) {
    throw new Error(`Unable to download migration input from ${inputUrl}: ${response.status} ${response.statusText}`);
  }

  return response.text();
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

function normalizeDate(value: unknown) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00.000Z`)
    : new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getUTCFullYear();
  return year >= 1900 && year <= 2100 ? parsed : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? "")
    .replace(/[,$\s]/g, "")
    .replace(/%/g, "");
  if (!text) {
    return 0;
  }

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeText(value).toLowerCase();
  return ["1", "true", "si", "sí", "yes", "y", "activo", "aprobada", "pagado"].includes(
    normalized
  );
}

function pickFirst(row: LegacyRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return undefined;
}

const LEGACY_TASK_NAME_KEYS = [
  "tarea",
  "task_name",
  "nombre",
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

function legacyTaskName(row: LegacyRow) {
  return normalizeText(pickFirst(row, LEGACY_TASK_NAME_KEYS)) || "Tarea legacy";
}

function legacyTermEventName(row: LegacyRow) {
  return legacyTaskName(row).replace(/^Tarea legacy$/, "Termino legacy");
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

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => normalizeText(entry)).filter(Boolean);
      }
    } catch {
      return trimmed
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      String(entry)
    ])
  );
}

function sanitizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asInputJson(value: unknown) {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function mapQuoteType(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "varios" || normalized === "iguala" || normalized === "retainer"
    ? "RETAINER"
    : "ONE_TIME";
}

function mapQuoteStatus(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized.startsWith("env")) {
    return "SENT";
  }
  if (normalized.startsWith("apro")) {
    return "APPROVED";
  }
  if (normalized.startsWith("rech")) {
    return "REJECTED";
  }

  return "DRAFT";
}

function mapLeadStatus(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "enviado_asuntos" || normalized === "moved_to_matters") {
    return "MOVED_TO_MATTERS";
  }
  if (normalized === "archivado" || normalized === "archived") {
    return "ARCHIVED";
  }

  return "ACTIVE";
}

function mapTaskStatus(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "concluida" || normalized === "concluido") {
    return "concluida";
  }
  if (normalized === "presentado" || normalized === "completado" || normalized === "completo") {
    return "presentado";
  }

  return "pendiente";
}

function mapCommunicationChannel(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized.includes("telegram")) {
    return "TELEGRAM";
  }
  if (normalized.includes("wechat")) {
    return "WECHAT";
  }
  if (normalized.includes("correo") || normalized.includes("mail") || normalized.includes("email")) {
    return "EMAIL";
  }
  if (normalized.includes("telefono") || normalized.includes("phone")) {
    return "PHONE";
  }

  return "WHATSAPP";
}

function mapTeam(value: unknown): Team | null {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("litig")) {
    return "LITIGATION";
  }
  if (normalized.includes("corporativo")) {
    return "CORPORATE_LABOR";
  }
  if (normalized.includes("conven")) {
    return "SETTLEMENTS";
  }
  if (normalized.includes("financ")) {
    return "FINANCIAL_LAW";
  }
  if (normalized.includes("fiscal") || normalized.includes("compliance")) {
    return "TAX_COMPLIANCE";
  }
  if (normalized.includes("cliente")) {
    return "CLIENT_RELATIONS";
  }
  if (normalized.includes("finanzas")) {
    return "FINANCE";
  }
  if (normalized.includes("admin")) {
    return "ADMIN";
  }

  return null;
}

function mapMatterRfStatus(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (["si", "sí", "yes"].includes(normalized)) {
    return "YES";
  }
  if (normalized.includes("neces")) {
    return "NOT_REQUIRED";
  }
  return "NO";
}

function mapContractSignedStatus(value: unknown) {
  if (normalizeBoolean(value)) {
    return "YES";
  }

  const normalized = normalizeText(value).toLowerCase();
  if (normalized.includes("neces")) {
    return "NOT_REQUIRED";
  }

  return "NO";
}

function collectVerificationValues(row: LegacyRow) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key.startsWith("verificado_"))
      .map(([key, value]) => [key, normalizeBoolean(value) ? "Si" : "No"])
  );
}

function buildLineItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        concept:
          normalizeText(item.concept) ||
          normalizeText(item.descripcion) ||
          normalizeText(item.name) ||
          "Concepto",
        amountMxn:
          normalizeNumber(
            pickFirst(item, ["amount_mxn", "amount", "price", "precio", "monto", "valor"])
          ) || 0
      };
    })
    .filter((entry) => entry.concept || entry.amountMxn > 0);
}

async function seedTaskModules() {
  for (const module of TASK_MODULES) {
    await prisma.taskModule.upsert({
      where: { id: module.id },
      update: {
        team: module.team,
        label: module.label,
        summary: module.summary
      },
      create: {
        id: module.id,
        team: module.team,
        label: module.label,
        summary: module.summary
      }
    });

    for (const track of module.tracks) {
      await prisma.taskTrack.upsert({
        where: {
          moduleId_trackCode: {
            moduleId: module.id,
            trackCode: track.id
          }
        },
        update: {
          label: track.label,
          mode: track.mode,
          recurring: track.recurring ?? false,
          recurrenceRule:
            track.recurrenceRule === undefined ? undefined : asInputJson(track.recurrenceRule)
        },
        create: {
          moduleId: module.id,
          trackCode: track.id,
          label: track.label,
          mode: track.mode,
          recurring: track.recurring ?? false,
          recurrenceRule:
            track.recurrenceRule === undefined ? undefined : asInputJson(track.recurrenceRule)
        }
      });
    }
  }
}

async function clearImportedDomain() {
  await prisma.legacyImportArchive.deleteMany();
  await prisma.legacyImportBatch.deleteMany();
  await prisma.taskDistributionHistory.deleteMany();
  await prisma.taskDistributionEvent.deleteMany();
  await prisma.taskAdditionalTask.deleteMany();
  await prisma.taskTrackingRecord.deleteMany();
  await prisma.taskTerm.deleteMany();
  await prisma.financeSnapshot.deleteMany();
  await prisma.commissionSnapshot.deleteMany();
  await prisma.financeRecord.deleteMany();
  await prisma.generalExpense.deleteMany();
  await prisma.matter.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.quoteTemplate.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.client.deleteMany();
  await prisma.commissionReceiver.deleteMany();
}

async function archiveRows(batchId: string, tables: Record<string, LegacyRow[]>) {
  const archives = Object.entries(tables).flatMap(([tableName, rows]) =>
    rows.map((row, index) => ({
      batchId,
      legacyTable: tableName,
      legacyId:
        normalizeOptionalText(row.id) ??
        normalizeOptionalText(row.user_id) ??
        normalizeOptionalText(row.source_id) ??
        `${tableName}-${index + 1}`,
      entityType: tableName,
      payload: asInputJson(row)
    }))
  );

  for (let index = 0; index < archives.length; index += 200) {
    await prisma.legacyImportArchive.createMany({
      data: archives.slice(index, index + 200)
    });
  }

  return archives.length;
}

async function main() {
  const { inputPath, inputUrl, reportPath, apply, replace } = parseCommandLine();
  const parsed = ExportPayloadSchema.parse(
    JSON.parse(await readInputPayload(inputPath, inputUrl))
  ) as ExportPayload;

  const report = {
    source: parsed.source,
    inputPath: inputUrl ?? inputPath,
    apply,
    replace,
    exportedAt: parsed.exportedAt,
    importedAt: new Date().toISOString(),
    summary: parsed.summary ?? null,
    plannedCounts: buildPlannedCounts(parsed),
    counts: buildImportCounts(),
    warnings: [] as string[]
  };

  if (!apply) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await seedTaskModules();
  if (replace) {
    await clearImportedDomain();
  }

  const batch = await prisma.legacyImportBatch.create({
    data: {
      source: parsed.source,
      exportName: path.basename(inputPath),
      exportedAt: normalizeDate(parsed.exportedAt),
      appliedAt: new Date(),
      summary: asInputJson(parsed.summary ?? {})
    }
  });

  report.counts.archivedRows = await archiveRows(batch.id, parsed.tables);

  type ImportedClient = { id: string; clientNumber: string; name: string };
  const importedClients = new Map<string, ImportedClient>();
  const importedClientsByName = new Map<string, ImportedClient>();
  let nextClientSequence = 1000;

  async function upsertImportedClient(input: {
    legacyId: string;
    clientNumber: string;
    name: string;
    createdAt?: Date;
  }) {
    const existingByNumber = await prisma.client.findUnique({
      where: { clientNumber: input.clientNumber }
    });
    if (existingByNumber) {
      const updated = await prisma.client.update({
        where: { id: existingByNumber.id },
        data: {
          name: input.name,
          deletedAt: null
        }
      });
      return { id: updated.id, clientNumber: updated.clientNumber, name: updated.name };
    }

    const existingByLegacyId = await prisma.client.findUnique({
      where: { id: input.legacyId }
    });
    if (existingByLegacyId) {
      const updated = await prisma.client.update({
        where: { id: existingByLegacyId.id },
        data: {
          clientNumber: input.clientNumber,
          name: input.name,
          deletedAt: null
        }
      });
      return { id: updated.id, clientNumber: updated.clientNumber, name: updated.name };
    }

    const created = await prisma.client.create({
      data: {
        id: input.legacyId,
        clientNumber: input.clientNumber,
        name: input.name,
        createdAt: input.createdAt
      }
    });
    return { id: created.id, clientNumber: created.clientNumber, name: created.name };
  }

  for (const row of parsed.tables.clients ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-client", JSON.stringify(row));
    const clientNumber =
      normalizeText(pickFirst(row, ["client_number", "numero", "numero_cliente"])) ||
      String(++nextClientSequence);
    nextClientSequence = Math.max(nextClientSequence, Number.parseInt(clientNumber, 10) || 0);
    const name = normalizeText(pickFirst(row, ["name", "nombre", "cliente"])) || "Cliente legado";
    const createdAt = normalizeDate(pickFirst(row, ["created_at", "inserted_at"])) ?? new Date();

    const entry = await upsertImportedClient({
      legacyId: id,
      clientNumber,
      name,
      createdAt
    });

    importedClients.set(id, entry);
    importedClientsByName.set(name.trim().toLowerCase(), entry);
    report.counts.clients += 1;
  }

  async function ensureClient(nameValue: unknown, explicitClientNumber?: unknown) {
    const name = normalizeText(nameValue) || "Cliente legado";
    const key = name.toLowerCase();
    const current = importedClientsByName.get(key);
    if (current) {
      return current;
    }

    const clientNumber =
      normalizeText(explicitClientNumber) || String(++nextClientSequence).padStart(4, "0");
    const id = stablePlaceholderId("legacy-client", `${clientNumber}:${name}`);

    const created = await upsertImportedClient({
      legacyId: id,
      clientNumber,
      name
    });

    importedClients.set(id, created);
    importedClientsByName.set(key, created);
    report.counts.clients += 1;
    report.warnings.push(`Created placeholder client for "${name}".`);
    return created;
  }

  for (const row of parsed.tables.quote_types ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-quote-template", JSON.stringify(row));
    const name = normalizeText(pickFirst(row, ["name", "nombre"])) || `Plantilla ${id.slice(0, 8)}`;
    const services =
      normalizeText(pickFirst(row, ["description", "descripcion"])) || "Servicios legados";
    const lineItems = buildLineItems(pickFirst(row, ["default_items", "items"]));
    const totalMxn = lineItems.reduce((sum, item) => sum + item.amountMxn, 0);

    await prisma.quoteTemplate.upsert({
      where: { id },
      update: {
        templateNumber: `LEG-${id.slice(0, 8).toUpperCase()}`,
        name,
        team: "CLIENT_RELATIONS",
        subject: services,
        services,
        quoteType: mapQuoteType(pickFirst(row, ["quote_type", "type"])),
        lineItems: asInputJson(lineItems),
        totalMxn
      },
      create: {
        id,
        templateNumber: `LEG-${id.slice(0, 8).toUpperCase()}`,
        name,
        team: "CLIENT_RELATIONS",
        subject: services,
        services,
        quoteType: mapQuoteType(pickFirst(row, ["quote_type", "type"])),
        lineItems: asInputJson(lineItems),
        totalMxn,
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.quoteTemplates += 1;
  }

  const importedQuotesByNumber = new Map<string, { id: string; quoteNumber: string }>();
  let quoteFallbackSequence = 1;
  for (const row of parsed.tables.quotes ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-quote", JSON.stringify(row));
    const client = await ensureClient(pickFirst(row, ["client_name", "cliente"]), row.numero_cliente);
    const quoteNumber =
      normalizeText(pickFirst(row, ["quote_number", "numero_cotizacion"])) ||
      `LEG-Q-${String(quoteFallbackSequence++).padStart(4, "0")}`;
    const lineItems = buildLineItems(pickFirst(row, ["items", "default_items"]));
    const totalMxn =
      normalizeNumber(pickFirst(row, ["total_mxn", "total", "honorarios_totales"])) ||
      lineItems.reduce((sum, item) => sum + item.amountMxn, 0);

    await prisma.quote.upsert({
      where: { id },
      update: {
        quoteNumber,
        clientId: client.id,
        clientName: client.name,
        subject: normalizeText(pickFirst(row, ["asunto", "subject"])) || "Cotizacion legacy",
        status: mapQuoteStatus(row.status),
        quoteType: mapQuoteType(pickFirst(row, ["quote_type", "matter_type"])),
        lineItems: asInputJson(lineItems),
        totalMxn,
        milestone: normalizeOptionalText(pickFirst(row, ["hito_conclusion", "milestone"])),
        notes: normalizeOptionalText(row.notes)
      },
      create: {
        id,
        quoteNumber,
        clientId: client.id,
        clientName: client.name,
        subject: normalizeText(pickFirst(row, ["asunto", "subject"])) || "Cotizacion legacy",
        status: mapQuoteStatus(row.status),
        quoteType: mapQuoteType(pickFirst(row, ["quote_type", "matter_type"])),
        lineItems: asInputJson(lineItems),
        totalMxn,
        milestone: normalizeOptionalText(pickFirst(row, ["hito_conclusion", "milestone"])),
        notes: normalizeOptionalText(row.notes),
        createdAt: normalizeDate(pickFirst(row, ["created_at", "quote_date"])) ?? new Date()
      }
    });

    importedQuotesByNumber.set(quoteNumber, { id, quoteNumber });
    report.counts.quotes += 1;
  }

  for (const row of parsed.tables.leads_tracking ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-lead", JSON.stringify(row));
    const client = await ensureClient(
      pickFirst(row, ["cliente", "client_name", "prospecto_cliente"]),
      row.numero_cliente
    );
    const quoteNumber = normalizeText(pickFirst(row, ["numero_cotizacion", "quote_number"]));
    const quote = quoteNumber ? importedQuotesByNumber.get(quoteNumber) : undefined;

    await prisma.lead.upsert({
      where: { id },
      update: {
        clientId: client.id,
        clientName: client.name,
        prospectName: normalizeOptionalText(pickFirst(row, ["prospecto_cliente", "prospect_name"])),
        commissionAssignee: normalizeOptionalText(pickFirst(row, ["comision_cierre", "commission_assignee"])),
        quoteId: quote?.id ?? null,
        quoteNumber: quote?.quoteNumber ?? (quoteNumber || null),
        subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
        amountMxn: normalizeNumber(pickFirst(row, ["total", "amount_mxn", "total_mxn"])),
        communicationChannel: mapCommunicationChannel(
          pickFirst(row, ["canal_comunicacion", "communication_channel"])
        ),
        lastInteractionLabel: normalizeOptionalText(
          pickFirst(row, ["ultima_interaccion", "last_interaction"])
        ),
        lastInteraction: normalizeDate(
          pickFirst(row, ["fecha_ultima_interaccion", "last_interaction_at"])
        ),
        nextInteractionLabel: normalizeOptionalText(
          pickFirst(row, ["siguiente_interaccion", "next_interaction"])
        ),
        nextInteraction: normalizeDate(
          pickFirst(row, ["fecha_siguiente_interaccion", "next_interaction_at"])
        ),
        notes: normalizeOptionalText(row.notas),
        sentToClientAt: normalizeDate(
          pickFirst(row, ["fecha_enviada_cliente", "sent_to_client_at"])
        ),
        sentToMattersAt: normalizeDate(
          pickFirst(row, ["fecha_envio_asuntos", "sent_to_matters_at"])
        ),
        hiddenFromTracking: normalizeBoolean(
          pickFirst(row, ["oculto_seguimiento", "hidden_from_tracking"])
        ),
        status: mapLeadStatus(row.status)
      },
      create: {
        id,
        clientId: client.id,
        clientName: client.name,
        prospectName: normalizeOptionalText(pickFirst(row, ["prospecto_cliente", "prospect_name"])),
        commissionAssignee: normalizeOptionalText(pickFirst(row, ["comision_cierre", "commission_assignee"])),
        quoteId: quote?.id ?? null,
        quoteNumber: quote?.quoteNumber ?? (quoteNumber || null),
        subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
        amountMxn: normalizeNumber(pickFirst(row, ["total", "amount_mxn", "total_mxn"])),
        communicationChannel: mapCommunicationChannel(
          pickFirst(row, ["canal_comunicacion", "communication_channel"])
        ),
        lastInteractionLabel: normalizeOptionalText(
          pickFirst(row, ["ultima_interaccion", "last_interaction"])
        ),
        lastInteraction: normalizeDate(
          pickFirst(row, ["fecha_ultima_interaccion", "last_interaction_at"])
        ),
        nextInteractionLabel: normalizeOptionalText(
          pickFirst(row, ["siguiente_interaccion", "next_interaction"])
        ),
        nextInteraction: normalizeDate(
          pickFirst(row, ["fecha_siguiente_interaccion", "next_interaction_at"])
        ),
        notes: normalizeOptionalText(row.notas),
        sentToClientAt: normalizeDate(
          pickFirst(row, ["fecha_enviada_cliente", "sent_to_client_at"])
        ),
        sentToMattersAt: normalizeDate(
          pickFirst(row, ["fecha_envio_asuntos", "sent_to_matters_at"])
        ),
        hiddenFromTracking: normalizeBoolean(
          pickFirst(row, ["oculto_seguimiento", "hidden_from_tracking"])
        ),
        status: mapLeadStatus(row.status),
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.leads += 1;
  }

  const executionByMatterIdentifier = new Map<string, string>();
  for (const module of LEGACY_EXECUTION_MODULES) {
    for (const row of parsed.tables[module.matterTable] ?? []) {
      const identifier =
        normalizeText(pickFirst(row, ["id_asunto", "matter_identifier", "matter_number"])) ||
        normalizeText(pickFirst(row, ["id", "active_matter_id"]));
      if (identifier) {
        executionByMatterIdentifier.set(identifier, module.moduleId);
      }
    }
  }

  const usedMatterNumbers = new Set<string>();
  function getMatterNumber(row: LegacyRow, fallbackId: string) {
    const candidates = [
      normalizeText(pickFirst(row, ["id_asunto", "matter_number", "matter_identifier"])),
      normalizeText(pickFirst(row, ["numero_cotizacion", "quote_number"]))
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (!usedMatterNumbers.has(candidate)) {
        usedMatterNumbers.add(candidate);
        return candidate;
      }
    }

    const generated = `LEG-MAT-${fallbackId.slice(0, 8).toUpperCase()}`;
    usedMatterNumbers.add(generated);
    return generated;
  }

  const mattersByNumber = new Map<string, string>();
  for (const row of parsed.tables.active_matters ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-matter", JSON.stringify(row));
    const client = await ensureClient(pickFirst(row, ["cliente", "client_name"]), row.numero_cliente);
    const quoteNumber = normalizeText(pickFirst(row, ["numero_cotizacion", "quote_number"]));
    const quote = quoteNumber ? importedQuotesByNumber.get(quoteNumber) : undefined;
    const matterNumber = getMatterNumber(row, id);
    const matterIdentifier = normalizeOptionalText(
      pickFirst(row, ["id_asunto", "matter_identifier"])
    );
    const executionModule =
      (matterIdentifier && executionByMatterIdentifier.get(matterIdentifier)) ??
      executionByMatterIdentifier.get(matterNumber) ??
      null;

    await prisma.matter.upsert({
      where: { id },
      update: {
        matterNumber,
        clientId: client.id,
        clientNumber: client.clientNumber,
        clientName: client.name,
        quoteId: quote?.id ?? null,
        quoteNumber: quote?.quoteNumber ?? (quoteNumber || null),
        commissionAssignee: normalizeOptionalText(
          pickFirst(row, ["comision_cierre", "commission_assignee"])
        ),
        matterType: mapQuoteType(pickFirst(row, ["matter_type", "quote_type"])),
        subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
        specificProcess: normalizeOptionalText(
          pickFirst(row, ["proceso_especifico", "specific_process"])
        ),
        totalFeesMxn: normalizeNumber(
          pickFirst(row, ["honorarios_totales", "total_asunto", "total_mxn"])
        ),
        responsibleTeam: mapTeam(pickFirst(row, ["equipo_responsable", "responsible_team"])),
        nextPaymentDate: normalizeDate(
          pickFirst(row, ["fecha_pactada_pago", "next_payment_date"])
        ),
        communicationChannel: mapCommunicationChannel(
          pickFirst(row, ["canal_comunicacion", "communication_channel"])
        ),
        r1InternalCreated: normalizeBoolean(row.r1_interno_creado),
        telegramBotLinked: normalizeBoolean(row.bot_telegram_vinculado),
        rdCreated: normalizeBoolean(row.rd_creado),
        rfCreated: mapMatterRfStatus(row.rf_creado),
        r1ExternalCreated: normalizeBoolean(row.r1_externo_creado),
        billingChatCreated: normalizeBoolean(row.chat_facturacion_creado),
        matterIdentifier,
        executionLinkedModule: executionModule,
        executionLinkedAt: executionModule ? normalizeDate(pickFirst(row, ["updated_at", "created_at"])) : null,
        milestone: normalizeOptionalText(pickFirst(row, ["hito_conclusion", "milestone"])),
        concluded: normalizeBoolean(pickFirst(row, ["ya_concluyo", "concluded"])),
        stage: normalizeBoolean(pickFirst(row, ["ya_concluyo", "concluded"]))
          ? "CLOSED"
          : executionModule
            ? "EXECUTION"
            : "INTAKE",
        origin: quote ? "QUOTE" : "MANUAL",
        notes: normalizeOptionalText(pickFirst(row, ["comentarios", "notes"])),
        deletedAt: normalizeDate(row.deleted_at)
      },
      create: {
        id,
        matterNumber,
        clientId: client.id,
        clientNumber: client.clientNumber,
        clientName: client.name,
        quoteId: quote?.id ?? null,
        quoteNumber: quote?.quoteNumber ?? (quoteNumber || null),
        commissionAssignee: normalizeOptionalText(
          pickFirst(row, ["comision_cierre", "commission_assignee"])
        ),
        matterType: mapQuoteType(pickFirst(row, ["matter_type", "quote_type"])),
        subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
        specificProcess: normalizeOptionalText(
          pickFirst(row, ["proceso_especifico", "specific_process"])
        ),
        totalFeesMxn: normalizeNumber(
          pickFirst(row, ["honorarios_totales", "total_asunto", "total_mxn"])
        ),
        responsibleTeam: mapTeam(pickFirst(row, ["equipo_responsable", "responsible_team"])),
        nextPaymentDate: normalizeDate(
          pickFirst(row, ["fecha_pactada_pago", "next_payment_date"])
        ),
        communicationChannel: mapCommunicationChannel(
          pickFirst(row, ["canal_comunicacion", "communication_channel"])
        ),
        r1InternalCreated: normalizeBoolean(row.r1_interno_creado),
        telegramBotLinked: normalizeBoolean(row.bot_telegram_vinculado),
        rdCreated: normalizeBoolean(row.rd_creado),
        rfCreated: mapMatterRfStatus(row.rf_creado),
        r1ExternalCreated: normalizeBoolean(row.r1_externo_creado),
        billingChatCreated: normalizeBoolean(row.chat_facturacion_creado),
        matterIdentifier,
        executionLinkedModule: executionModule,
        executionLinkedAt: executionModule ? normalizeDate(pickFirst(row, ["updated_at", "created_at"])) : null,
        milestone: normalizeOptionalText(pickFirst(row, ["hito_conclusion", "milestone"])),
        concluded: normalizeBoolean(pickFirst(row, ["ya_concluyo", "concluded"])),
        stage: normalizeBoolean(pickFirst(row, ["ya_concluyo", "concluded"]))
          ? "CLOSED"
          : executionModule
            ? "EXECUTION"
            : "INTAKE",
        origin: quote ? "QUOTE" : "MANUAL",
        notes: normalizeOptionalText(pickFirst(row, ["comentarios", "notes"])),
        deletedAt: normalizeDate(row.deleted_at),
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    mattersByNumber.set(matterNumber, id);
    if (matterIdentifier) {
      mattersByNumber.set(matterIdentifier, id);
    }
    report.counts.matters += 1;
  }

  for (const row of parsed.tables.finance_records ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-finance", JSON.stringify(row));
    await prisma.financeRecord.upsert({
      where: { id },
      update: {
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        clientNumber: normalizeOptionalText(pickFirst(row, ["numero_cliente", "client_number"])),
        clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
        quoteNumber: normalizeOptionalText(pickFirst(row, ["numero_cotizacion", "quote_number"])),
        matterType: mapQuoteType(pickFirst(row, ["matter_type", "quote_type"])),
        subject: normalizeText(pickFirst(row, ["asunto", "subject", "concept"])),
        contractSignedStatus: mapContractSignedStatus(
          pickFirst(row, ["sla_firmado", "contract_signed_status"])
        ),
        responsibleTeam: mapTeam(pickFirst(row, ["equipo_responsable", "responsible_team"])),
        totalMatterMxn: normalizeNumber(pickFirst(row, ["total_asunto", "amount", "honorarios_totales"])),
        workingConcepts: normalizeOptionalText(
          pickFirst(row, ["conceptos_trabajando", "working_concepts", "category"])
        ),
        conceptFeesMxn: normalizeNumber(pickFirst(row, ["honorarios_conceptos", "concept_fees"])),
        previousPaymentsMxn: normalizeNumber(pickFirst(row, ["pagos_previos", "previous_payments"])),
        nextPaymentDate: normalizeDate(
          pickFirst(row, ["fecha_pactada_pago", "next_payment_date"])
        ),
        nextPaymentNotes: normalizeOptionalText(
          pickFirst(row, ["detalle_fecha_pactada", "next_payment_notes"])
        ),
        paidThisMonthMxn: normalizeNumber(
          pickFirst(row, ["honorarios_pagados_este_mes", "paid_this_month"])
        ),
        payment2Mxn: normalizeNumber(pickFirst(row, ["pago_2", "payment_2"])),
        payment3Mxn: normalizeNumber(pickFirst(row, ["pago_3", "payment_3"])),
        paymentDate1: normalizeDate(
          pickFirst(row, ["fecha_pago_realizado", "fecha_pago_1", "payment_date_1"])
        ),
        paymentDate2: normalizeDate(pickFirst(row, ["fecha_pago_2", "payment_date_2"])),
        paymentDate3: normalizeDate(pickFirst(row, ["fecha_pago_3", "payment_date_3"])),
        expenseNotes1: normalizeOptionalText(pickFirst(row, ["gastos_realizados", "expense_notes_1"])),
        expenseNotes2: normalizeOptionalText(
          pickFirst(row, ["gastos_realizados_2", "expense_notes_2"])
        ),
        expenseNotes3: normalizeOptionalText(
          pickFirst(row, ["gastos_realizados_3", "expense_notes_3"])
        ),
        expenseAmount1Mxn: normalizeNumber(pickFirst(row, ["monto_gastos", "expense_amount_1"])),
        expenseAmount2Mxn: normalizeNumber(pickFirst(row, ["monto_gastos_2", "expense_amount_2"])),
        expenseAmount3Mxn: normalizeNumber(pickFirst(row, ["monto_gastos_3", "expense_amount_3"])),
        pctLitigation: Math.trunc(normalizeNumber(pickFirst(row, ["pct_litigio", "pct_litigation"]))),
        pctCorporateLabor: Math.trunc(
          normalizeNumber(pickFirst(row, ["pct_corporativo", "pct_corporate_labor"]))
        ),
        pctSettlements: Math.trunc(normalizeNumber(pickFirst(row, ["pct_convenios", "pct_settlements"]))),
        pctFinancialLaw: Math.trunc(normalizeNumber(pickFirst(row, ["pct_financiero", "pct_financial_law"]))),
        pctTaxCompliance: Math.trunc(normalizeNumber(pickFirst(row, ["pct_fiscal", "pct_tax_compliance"]))),
        clientCommissionRecipient: normalizeOptionalText(
          pickFirst(row, ["comision_cliente_quien", "client_commission_recipient"])
        ),
        closingCommissionRecipient: normalizeOptionalText(
          pickFirst(row, ["comision_cierre_quien", "closing_commission_recipient"])
        ),
        milestone: normalizeOptionalText(pickFirst(row, ["hito_conclusion", "milestone"])),
        concluded: normalizeBoolean(pickFirst(row, ["ya_concluyo", "concluded"])),
        financeComments: normalizeOptionalText(
          pickFirst(row, ["comentarios_finanzas", "finance_comments"])
        )
      },
      create: {
        id,
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        clientNumber: normalizeOptionalText(pickFirst(row, ["numero_cliente", "client_number"])),
        clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
        quoteNumber: normalizeOptionalText(pickFirst(row, ["numero_cotizacion", "quote_number"])),
        matterType: mapQuoteType(pickFirst(row, ["matter_type", "quote_type"])),
        subject: normalizeText(pickFirst(row, ["asunto", "subject", "concept"])),
        contractSignedStatus: mapContractSignedStatus(
          pickFirst(row, ["sla_firmado", "contract_signed_status"])
        ),
        responsibleTeam: mapTeam(pickFirst(row, ["equipo_responsable", "responsible_team"])),
        totalMatterMxn: normalizeNumber(pickFirst(row, ["total_asunto", "amount", "honorarios_totales"])),
        workingConcepts: normalizeOptionalText(
          pickFirst(row, ["conceptos_trabajando", "working_concepts", "category"])
        ),
        conceptFeesMxn: normalizeNumber(pickFirst(row, ["honorarios_conceptos", "concept_fees"])),
        previousPaymentsMxn: normalizeNumber(pickFirst(row, ["pagos_previos", "previous_payments"])),
        nextPaymentDate: normalizeDate(
          pickFirst(row, ["fecha_pactada_pago", "next_payment_date"])
        ),
        nextPaymentNotes: normalizeOptionalText(
          pickFirst(row, ["detalle_fecha_pactada", "next_payment_notes"])
        ),
        paidThisMonthMxn: normalizeNumber(
          pickFirst(row, ["honorarios_pagados_este_mes", "paid_this_month"])
        ),
        payment2Mxn: normalizeNumber(pickFirst(row, ["pago_2", "payment_2"])),
        payment3Mxn: normalizeNumber(pickFirst(row, ["pago_3", "payment_3"])),
        paymentDate1: normalizeDate(
          pickFirst(row, ["fecha_pago_realizado", "fecha_pago_1", "payment_date_1"])
        ),
        paymentDate2: normalizeDate(pickFirst(row, ["fecha_pago_2", "payment_date_2"])),
        paymentDate3: normalizeDate(pickFirst(row, ["fecha_pago_3", "payment_date_3"])),
        expenseNotes1: normalizeOptionalText(pickFirst(row, ["gastos_realizados", "expense_notes_1"])),
        expenseNotes2: normalizeOptionalText(
          pickFirst(row, ["gastos_realizados_2", "expense_notes_2"])
        ),
        expenseNotes3: normalizeOptionalText(
          pickFirst(row, ["gastos_realizados_3", "expense_notes_3"])
        ),
        expenseAmount1Mxn: normalizeNumber(pickFirst(row, ["monto_gastos", "expense_amount_1"])),
        expenseAmount2Mxn: normalizeNumber(pickFirst(row, ["monto_gastos_2", "expense_amount_2"])),
        expenseAmount3Mxn: normalizeNumber(pickFirst(row, ["monto_gastos_3", "expense_amount_3"])),
        pctLitigation: Math.trunc(normalizeNumber(pickFirst(row, ["pct_litigio", "pct_litigation"]))),
        pctCorporateLabor: Math.trunc(
          normalizeNumber(pickFirst(row, ["pct_corporativo", "pct_corporate_labor"]))
        ),
        pctSettlements: Math.trunc(normalizeNumber(pickFirst(row, ["pct_convenios", "pct_settlements"]))),
        pctFinancialLaw: Math.trunc(normalizeNumber(pickFirst(row, ["pct_financiero", "pct_financial_law"]))),
        pctTaxCompliance: Math.trunc(normalizeNumber(pickFirst(row, ["pct_fiscal", "pct_tax_compliance"]))),
        clientCommissionRecipient: normalizeOptionalText(
          pickFirst(row, ["comision_cliente_quien", "client_commission_recipient"])
        ),
        closingCommissionRecipient: normalizeOptionalText(
          pickFirst(row, ["comision_cierre_quien", "closing_commission_recipient"])
        ),
        milestone: normalizeOptionalText(pickFirst(row, ["hito_conclusion", "milestone"])),
        concluded: normalizeBoolean(pickFirst(row, ["ya_concluyo", "concluded"])),
        financeComments: normalizeOptionalText(
          pickFirst(row, ["comentarios_finanzas", "finance_comments"])
        ),
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.financeRecords += 1;
  }

  for (const row of parsed.tables.finance_snapshots ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-finance-snapshot", JSON.stringify(row));
    await prisma.financeSnapshot.upsert({
      where: { id },
      update: {
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        title: normalizeText(row.title) || "Snapshot legado",
        totalIncomeMxn: normalizeNumber(pickFirst(row, ["total_income", "total_income_mxn"])),
        totalExpenseMxn: normalizeNumber(pickFirst(row, ["total_expense", "total_expense_mxn"])),
        balanceMxn: normalizeNumber(pickFirst(row, ["balance", "balance_mxn"])),
        ...(row.snapshot_data === undefined || row.snapshot_data === null
          ? {}
          : { snapshotData: asInputJson(row.snapshot_data) })
      },
      create: {
        id,
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        title: normalizeText(row.title) || "Snapshot legado",
        totalIncomeMxn: normalizeNumber(pickFirst(row, ["total_income", "total_income_mxn"])),
        totalExpenseMxn: normalizeNumber(pickFirst(row, ["total_expense", "total_expense_mxn"])),
        balanceMxn: normalizeNumber(pickFirst(row, ["balance", "balance_mxn"])),
        ...(row.snapshot_data === undefined || row.snapshot_data === null
          ? {}
          : { snapshotData: asInputJson(row.snapshot_data) }),
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.financeSnapshots += 1;
  }

  for (const row of parsed.tables.gastos_generales ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-expense", JSON.stringify(row));
    await prisma.generalExpense.upsert({
      where: { id },
      update: {
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        detail: normalizeText(pickFirst(row, ["detalle", "detail"])),
        amountMxn: normalizeNumber(pickFirst(row, ["monto", "amount"])),
        countsTowardLimit: normalizeBoolean(pickFirst(row, ["cuenta_limite", "counts_toward_limit"])),
        team: normalizeText(pickFirst(row, ["equipo", "team"])) || "Sin equipo",
        generalExpense: normalizeBoolean(pickFirst(row, ["gasto_general", "general_expense"])),
        expenseWithoutTeam: normalizeBoolean(
          pickFirst(row, ["gasto_sin_equipo", "expense_without_team"])
        ),
        pctLitigation: normalizeNumber(pickFirst(row, ["pct_litigio", "pct_litigation"])),
        pctCorporateLabor: normalizeNumber(
          pickFirst(row, ["pct_corporativo", "pct_corporate_labor"])
        ),
        pctSettlements: normalizeNumber(pickFirst(row, ["pct_convenios", "pct_settlements"])),
        pctFinancialLaw: normalizeNumber(
          pickFirst(row, ["pct_financiero", "pct_financial_law"])
        ),
        pctTaxCompliance: normalizeNumber(
          pickFirst(row, ["pct_fiscal", "pct_tax_compliance"])
        ),
        paymentMethod: normalizeText(pickFirst(row, ["metodo_pago", "payment_method"])) || "Transferencia",
        bank: normalizeOptionalText(pickFirst(row, ["banco", "bank"])),
        recurring: normalizeBoolean(pickFirst(row, ["gasto_recurrente", "recurring"])),
        approvedByEmrt: normalizeBoolean(pickFirst(row, ["aprobado_emrt", "approved_by_emrt"])),
        paidByEmrtAt: normalizeDate(pickFirst(row, ["fecha_pagado_emrt", "paid_by_emrt_at"])),
        reviewedByJnls: normalizeBoolean(pickFirst(row, ["revisado_jnls", "reviewed_by_jnls"])),
        paid: normalizeBoolean(row.pagado),
        paidAt: normalizeDate(pickFirst(row, ["fecha_pago", "paid_at"]))
      },
      create: {
        id,
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        detail: normalizeText(pickFirst(row, ["detalle", "detail"])),
        amountMxn: normalizeNumber(pickFirst(row, ["monto", "amount"])),
        countsTowardLimit: normalizeBoolean(pickFirst(row, ["cuenta_limite", "counts_toward_limit"])),
        team: normalizeText(pickFirst(row, ["equipo", "team"])) || "Sin equipo",
        generalExpense: normalizeBoolean(pickFirst(row, ["gasto_general", "general_expense"])),
        expenseWithoutTeam: normalizeBoolean(
          pickFirst(row, ["gasto_sin_equipo", "expense_without_team"])
        ),
        pctLitigation: normalizeNumber(pickFirst(row, ["pct_litigio", "pct_litigation"])),
        pctCorporateLabor: normalizeNumber(
          pickFirst(row, ["pct_corporativo", "pct_corporate_labor"])
        ),
        pctSettlements: normalizeNumber(pickFirst(row, ["pct_convenios", "pct_settlements"])),
        pctFinancialLaw: normalizeNumber(
          pickFirst(row, ["pct_financiero", "pct_financial_law"])
        ),
        pctTaxCompliance: normalizeNumber(
          pickFirst(row, ["pct_fiscal", "pct_tax_compliance"])
        ),
        paymentMethod: normalizeText(pickFirst(row, ["metodo_pago", "payment_method"])) || "Transferencia",
        bank: normalizeOptionalText(pickFirst(row, ["banco", "bank"])),
        recurring: normalizeBoolean(pickFirst(row, ["gasto_recurrente", "recurring"])),
        approvedByEmrt: normalizeBoolean(pickFirst(row, ["aprobado_emrt", "approved_by_emrt"])),
        paidByEmrtAt: normalizeDate(pickFirst(row, ["fecha_pagado_emrt", "paid_by_emrt_at"])),
        reviewedByJnls: normalizeBoolean(pickFirst(row, ["revisado_jnls", "reviewed_by_jnls"])),
        paid: normalizeBoolean(row.pagado),
        paidAt: normalizeDate(pickFirst(row, ["fecha_pago", "paid_at"])),
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.generalExpenses += 1;
  }

  for (const row of parsed.tables.commission_receivers ?? []) {
    const name = normalizeText(pickFirst(row, ["name", "nombre"])) || "Comision legacy";
    await prisma.commissionReceiver.upsert({
      where: { name },
      update: {
        active: !normalizeBoolean(row.deleted_at)
      },
      create: {
        name,
        active: !normalizeBoolean(row.deleted_at),
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.commissionReceivers += 1;
  }

  for (const row of parsed.tables.commission_snapshots ?? []) {
    const id = normalizeText(row.id) || stablePlaceholderId("legacy-commission-snapshot", JSON.stringify(row));
    await prisma.commissionSnapshot.upsert({
      where: { id },
      update: {
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        section: normalizeText(row.section) || "Legacy",
        title: normalizeText(row.title) || "Snapshot legado",
        totalNetMxn: normalizeNumber(pickFirst(row, ["total_net", "total_net_mxn", "monto"])),
        snapshotData: asInputJson({
          ...(typeof row.snapshot_data === "object" && row.snapshot_data ? row.snapshot_data : {}),
          legacyManualCommissionRecords:
            parsed.tables.commission_records?.filter(
              (entry) =>
                normalizeText(entry.section) === normalizeText(row.section) &&
                Math.trunc(normalizeNumber(entry.year)) === Math.trunc(normalizeNumber(row.year)) &&
                Math.trunc(normalizeNumber(entry.month)) === Math.trunc(normalizeNumber(row.month))
            ) ?? []
        })
      },
      create: {
        id,
        year: Math.trunc(normalizeNumber(row.year)) || new Date().getFullYear(),
        month: Math.trunc(normalizeNumber(row.month)) || new Date().getMonth() + 1,
        section: normalizeText(row.section) || "Legacy",
        title: normalizeText(row.title) || "Snapshot legado",
        totalNetMxn: normalizeNumber(pickFirst(row, ["total_net", "total_net_mxn", "monto"])),
        snapshotData: asInputJson({
          ...(typeof row.snapshot_data === "object" && row.snapshot_data ? row.snapshot_data : {}),
          legacyManualCommissionRecords:
            parsed.tables.commission_records?.filter(
              (entry) =>
                normalizeText(entry.section) === normalizeText(row.section) &&
                Math.trunc(normalizeNumber(entry.year)) === Math.trunc(normalizeNumber(row.year)) &&
                Math.trunc(normalizeNumber(entry.month)) === Math.trunc(normalizeNumber(row.month))
            ) ?? []
        }),
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.commissionSnapshots += 1;
  }

  for (const row of parsed.tables.dias_inhabiles ?? []) {
    const date = normalizeDate(pickFirst(row, ["fecha", "date"]));
    if (!date) {
      report.warnings.push(`Skipped holiday row without valid date: ${JSON.stringify(row)}`);
      continue;
    }

    await prisma.holiday.upsert({
      where: { date },
      update: {
        label: normalizeText(pickFirst(row, ["label", "descripcion", "motivo"])) || "Dia inhábil"
      },
      create: {
        date,
        label: normalizeText(pickFirst(row, ["label", "descripcion", "motivo"])) || "Dia inhábil",
        createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
      }
    });

    report.counts.holidays += 1;
  }

  for (const module of LEGACY_EXECUTION_MODULES) {
    const sourceTableByName = new Map(module.sourceTables.map((table) => [table.sourceTable, table]));

    const termsRows = parsed.tables[module.termsTable] ?? [];
    for (const row of termsRows) {
      const id = normalizeText(row.id) || stablePlaceholderId("legacy-term", JSON.stringify(row));
      const matterKey =
        normalizeText(pickFirst(row, ["matter_identifier", "id_asunto", "matter_number"])) ||
        normalizeText(pickFirst(row, ["id_asunto", "matter_number"]));
      const matterId = matterKey ? mattersByNumber.get(matterKey) ?? null : null;
      const verification = {
        ...Object.fromEntries(module.verificationKeys.map((key) => [key, "No"])),
        ...collectVerificationValues(row)
      };

      await prisma.taskTerm.upsert({
        where: { id },
        update: {
          moduleId: module.moduleId,
          sourceTable: normalizeOptionalText(pickFirst(row, ["source_table", "tabla_origen"])),
          sourceRecordId: normalizeOptionalText(pickFirst(row, ["source_id", "source_record_id"])),
          matterId,
          matterNumber: normalizeOptionalText(
            pickFirst(row, ["matter_number", "id_asunto", "matter_identifier"])
          ),
          clientNumber: normalizeOptionalText(
            pickFirst(row, ["numero_cliente", "client_number"])
          ),
          clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
          subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
          specificProcess: normalizeOptionalText(
            pickFirst(row, ["proceso_especifico", "specific_process"])
          ),
          matterIdentifier: normalizeOptionalText(
            pickFirst(row, ["matter_identifier", "id_asunto"])
          ),
          eventName: legacyTermEventName(row),
          pendingTaskLabel: legacyPendingTaskLabel(row),
          responsible: normalizeText(pickFirst(row, ["responsable", "responsible"])),
          dueDate: normalizeDate(
            pickFirst(row, ["fecha_debe_presentarse", "due_date"])
          ),
          termDate: normalizeDate(pickFirst(row, ["fecha_termino", "termino", "term_date"])),
          status: mapTaskStatus(row.status),
          recurring: normalizeBoolean(
            pickFirst(row, ["recurrente", "recurring", "es_recurrente"])
          ),
          reportedMonth: normalizeOptionalText(
            pickFirst(row, ["reported_month", "mes_reportado", "archived_reported_month"])
          ),
          verification: asInputJson(verification),
          data: asInputJson(row),
          deletedAt: normalizeDate(row.deleted_at)
        },
        create: {
          id,
          moduleId: module.moduleId,
          sourceTable: normalizeOptionalText(pickFirst(row, ["source_table", "tabla_origen"])),
          sourceRecordId: normalizeOptionalText(pickFirst(row, ["source_id", "source_record_id"])),
          matterId,
          matterNumber: normalizeOptionalText(
            pickFirst(row, ["matter_number", "id_asunto", "matter_identifier"])
          ),
          clientNumber: normalizeOptionalText(
            pickFirst(row, ["numero_cliente", "client_number"])
          ),
          clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
          subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
          specificProcess: normalizeOptionalText(
            pickFirst(row, ["proceso_especifico", "specific_process"])
          ),
          matterIdentifier: normalizeOptionalText(
            pickFirst(row, ["matter_identifier", "id_asunto"])
          ),
          eventName: legacyTermEventName(row),
          pendingTaskLabel: legacyPendingTaskLabel(row),
          responsible: normalizeText(pickFirst(row, ["responsable", "responsible"])),
          dueDate: normalizeDate(
            pickFirst(row, ["fecha_debe_presentarse", "due_date"])
          ),
          termDate: normalizeDate(pickFirst(row, ["fecha_termino", "termino", "term_date"])),
          status: mapTaskStatus(row.status),
          recurring: normalizeBoolean(
            pickFirst(row, ["recurrente", "recurring", "es_recurrente"])
          ),
          reportedMonth: normalizeOptionalText(
            pickFirst(row, ["reported_month", "mes_reportado", "archived_reported_month"])
          ),
          verification: asInputJson(verification),
          data: asInputJson(row),
          deletedAt: normalizeDate(row.deleted_at),
          createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
        }
      });

      report.counts.taskTerms += 1;
    }

    for (const sourceTable of module.sourceTables) {
      for (const row of parsed.tables[sourceTable.sourceTable] ?? []) {
        const id = normalizeText(row.id) || stablePlaceholderId("legacy-task-record", JSON.stringify(row));
        const matterKey =
          normalizeText(pickFirst(row, ["matter_identifier", "id_asunto", "matter_number"])) ||
          normalizeText(pickFirst(row, ["id_asunto", "matter_number"]));
        const matterId = matterKey ? mattersByNumber.get(matterKey) ?? null : null;

        await prisma.taskTrackingRecord.upsert({
          where: { id },
          update: {
            moduleId: module.moduleId,
            tableCode: sourceTable.slug,
            sourceTable: sourceTable.sourceTable,
            matterId,
            matterNumber: normalizeOptionalText(
              pickFirst(row, ["matter_number", "id_asunto", "matter_identifier"])
            ),
            clientNumber: normalizeOptionalText(
              pickFirst(row, ["numero_cliente", "client_number"])
            ),
            clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
            subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
            specificProcess: normalizeOptionalText(
              pickFirst(row, ["proceso_especifico", "specific_process"])
            ),
            matterIdentifier: normalizeOptionalText(
              pickFirst(row, ["matter_identifier", "id_asunto"])
            ),
            taskName: legacyTaskName(row),
            eventName: normalizeOptionalText(
              pickFirst(row, ["evento_escrito", "event_name", "evento"])
            ),
            responsible: normalizeText(pickFirst(row, ["responsable", "responsible"])),
            dueDate: normalizeDate(
              pickFirst(row, [
                "fecha_debe_presentarse",
                "fecha_programada",
                "fecha_evento",
                "fecha",
                "due_date"
              ])
            ),
            termDate: normalizeDate(pickFirst(row, ["fecha_termino", "termino", "term_date"])),
            completedAt: normalizeDate(
              pickFirst(row, ["completed_at", "fecha_completado", "updated_at"])
            ),
            status: mapTaskStatus(row.status),
            workflowStage:
              Math.trunc(normalizeNumber(pickFirst(row, ["workflow_stage", "stage"]))) || 1,
            reportedMonth: normalizeOptionalText(
              pickFirst(row, ["reported_month", "mes_reportado", "archived_reported_month"])
            ),
            termId: normalizeOptionalText(pickFirst(row, ["termino_id", "term_id"])),
            data: asInputJson(row),
            deletedAt: normalizeDate(row.deleted_at)
          },
          create: {
            id,
            moduleId: module.moduleId,
            tableCode: sourceTable.slug,
            sourceTable: sourceTable.sourceTable,
            matterId,
            matterNumber: normalizeOptionalText(
              pickFirst(row, ["matter_number", "id_asunto", "matter_identifier"])
            ),
            clientNumber: normalizeOptionalText(
              pickFirst(row, ["numero_cliente", "client_number"])
            ),
            clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
            subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
            specificProcess: normalizeOptionalText(
              pickFirst(row, ["proceso_especifico", "specific_process"])
            ),
            matterIdentifier: normalizeOptionalText(
              pickFirst(row, ["matter_identifier", "id_asunto"])
            ),
            taskName: legacyTaskName(row),
            eventName: normalizeOptionalText(
              pickFirst(row, ["evento_escrito", "event_name", "evento"])
            ),
            responsible: normalizeText(pickFirst(row, ["responsable", "responsible"])),
            dueDate: normalizeDate(
              pickFirst(row, [
                "fecha_debe_presentarse",
                "fecha_programada",
                "fecha_evento",
                "fecha",
                "due_date"
              ])
            ),
            termDate: normalizeDate(pickFirst(row, ["fecha_termino", "termino", "term_date"])),
            completedAt: normalizeDate(
              pickFirst(row, ["completed_at", "fecha_completado", "updated_at"])
            ),
            status: mapTaskStatus(row.status),
            workflowStage:
              Math.trunc(normalizeNumber(pickFirst(row, ["workflow_stage", "stage"]))) || 1,
            reportedMonth: normalizeOptionalText(
              pickFirst(row, ["reported_month", "mes_reportado", "archived_reported_month"])
            ),
            termId: normalizeOptionalText(pickFirst(row, ["termino_id", "term_id"])),
            data: asInputJson(row),
            deletedAt: normalizeDate(row.deleted_at),
            createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
          }
        });

        report.counts.taskTrackingRecords += 1;
      }
    }

    for (const row of parsed.tables[module.eventsTable] ?? []) {
      const id = normalizeText(row.id) || stablePlaceholderId("legacy-event", JSON.stringify(row));
      await prisma.taskDistributionEvent.upsert({
        where: { id },
        update: {
          moduleId: module.moduleId,
          name: normalizeText(pickFirst(row, ["nombre", "name"])) || "Evento legacy",
          targetTables: asInputJson(
            parseStringArray(pickFirst(row, ["tablas", "target_tables", "tables"]))
          ),
          defaultTaskName: normalizeOptionalText(
            pickFirst(row, ["tarea", "default_task_name"])
          )
        },
        create: {
          id,
          moduleId: module.moduleId,
          name: normalizeText(pickFirst(row, ["nombre", "name"])) || "Evento legacy",
          targetTables: asInputJson(
            parseStringArray(pickFirst(row, ["tablas", "target_tables", "tables"]))
          ),
          defaultTaskName: normalizeOptionalText(
            pickFirst(row, ["tarea", "default_task_name"])
          ),
          createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
        }
      });

      report.counts.taskDistributionEvents += 1;
    }

    for (const row of parsed.tables[module.historyTable] ?? []) {
      const id = normalizeText(row.id) || stablePlaceholderId("legacy-history", JSON.stringify(row));
      const createdIds = parseStringRecord(pickFirst(row, ["created_ids", "createdIds"]));
      const targetTables = parseStringArray(pickFirst(row, ["target_tables", "targetTables"]));
      const eventNamesPerTable = parseStringArray(
        pickFirst(row, ["event_names_per_table", "eventNamesPerTable"])
      );
      const matterKey =
        normalizeText(pickFirst(row, ["matter_identifier", "id_asunto", "matter_number"])) ||
        normalizeText(pickFirst(row, ["id_asunto", "matter_number"]));
      const matterId = matterKey ? mattersByNumber.get(matterKey) ?? null : null;

      await prisma.taskDistributionHistory.upsert({
        where: { id },
        update: {
          moduleId: module.moduleId,
          matterId,
          matterNumber: normalizeOptionalText(
            pickFirst(row, ["matter_number", "id_asunto", "matter_identifier"])
          ),
          clientNumber: normalizeOptionalText(
            pickFirst(row, ["numero_cliente", "client_number"])
          ),
          clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
          subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
          specificProcess: normalizeOptionalText(
            pickFirst(row, ["proceso_especifico", "specific_process"])
          ),
          matterIdentifier: normalizeOptionalText(
            pickFirst(row, ["matter_identifier", "id_asunto"])
          ),
          eventName: normalizeText(pickFirst(row, ["nombre", "event_name"])) || "Distribucion legacy",
          targetTables: asInputJson(targetTables),
          eventNamesPerTable: asInputJson(eventNamesPerTable),
          createdIds: asInputJson(createdIds),
          data: asInputJson(row)
        },
        create: {
          id,
          moduleId: module.moduleId,
          matterId,
          matterNumber: normalizeOptionalText(
            pickFirst(row, ["matter_number", "id_asunto", "matter_identifier"])
          ),
          clientNumber: normalizeOptionalText(
            pickFirst(row, ["numero_cliente", "client_number"])
          ),
          clientName: normalizeText(pickFirst(row, ["cliente", "client_name"])),
          subject: normalizeText(pickFirst(row, ["asunto", "subject"])),
          specificProcess: normalizeOptionalText(
            pickFirst(row, ["proceso_especifico", "specific_process"])
          ),
          matterIdentifier: normalizeOptionalText(
            pickFirst(row, ["matter_identifier", "id_asunto"])
          ),
          eventName: normalizeText(pickFirst(row, ["nombre", "event_name"])) || "Distribucion legacy",
          targetTables: asInputJson(targetTables),
          eventNamesPerTable: asInputJson(eventNamesPerTable),
          createdIds: asInputJson(createdIds),
          data: asInputJson(row),
          createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
        }
      });

      report.counts.taskDistributionHistory += 1;
    }

    for (const row of parsed.tables[module.additionalTasksTable] ?? []) {
      const id = normalizeText(row.id) || stablePlaceholderId("legacy-additional-task", JSON.stringify(row));
      await prisma.taskAdditionalTask.upsert({
        where: { id },
        update: {
          moduleId: module.moduleId,
          task: normalizeText(pickFirst(row, ["tarea", "task"])) || "Tarea adicional legacy",
          responsible: normalizeText(pickFirst(row, ["responsable", "responsible"])),
          responsible2: normalizeOptionalText(
            pickFirst(row, ["responsable_2", "responsable2"])
          ),
          dueDate: normalizeDate(
            pickFirst(row, ["fecha_debe_presentarse", "due_date", "fecha"])
          ),
          status: mapTaskStatus(row.status),
          deletedAt: normalizeDate(row.deleted_at)
        },
        create: {
          id,
          moduleId: module.moduleId,
          task: normalizeText(pickFirst(row, ["tarea", "task"])) || "Tarea adicional legacy",
          responsible: normalizeText(pickFirst(row, ["responsable", "responsible"])),
          responsible2: normalizeOptionalText(
            pickFirst(row, ["responsable_2", "responsable2"])
          ),
          dueDate: normalizeDate(
            pickFirst(row, ["fecha_debe_presentarse", "due_date", "fecha"])
          ),
          status: mapTaskStatus(row.status),
          deletedAt: normalizeDate(row.deleted_at),
          createdAt: normalizeDate(pickFirst(row, ["created_at"])) ?? new Date()
        }
      });

      report.counts.taskAdditionalTasks += 1;
    }
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
