import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { TASK_MODULES, type Client, type Matter } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import type {
  ClientsRepository,
  MattersRepository,
  MatterWriteRecord,
  TaskAdditionalTaskWriteRecord,
  TaskDistributionEventWriteRecord,
  TaskDistributionWriteRecord,
  TaskTermWriteRecord,
  TaskTrackingRecordFilter,
  TaskTrackingRecordWriteRecord,
  TasksRepository
} from "./types";

type ExportRow = Record<string, unknown>;

interface ExportModuleConfig {
  moduleId: string;
  historyTable: string;
  termsTable: string;
  eventsTable: string;
  additionalTasksTable: string;
  matterTable: string;
  defaultResponsible?: string;
  verificationKeys?: string[];
  sourceTables: Array<{
    slug: string;
    sourceTable: string;
  }>;
}

interface BusinessExport {
  modules: ExportModuleConfig[];
  tables: Record<string, ExportRow[]>;
}

interface BusinessOverlay {
  tables: Record<string, ExportRow[]>;
}

const MODULE_TEAM: Record<string, NonNullable<Matter["responsibleTeam"]>> = {
  litigation: "LITIGATION",
  "corporate-labor": "CORPORATE_LABOR",
  settlements: "SETTLEMENTS",
  "financial-law": "FINANCIAL_LAW",
  "tax-compliance": "TAX_COMPLIANCE"
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}

function normalizedText(value: unknown) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isoDate(value: unknown) {
  const raw = text(value);
  if (!raw) {
    return undefined;
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);

  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function numberValue(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  return ["si", "yes", "true", "1"].includes(normalizedText(value));
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function asStringArray(value: unknown) {
  return asArray(value).map((entry) => text(entry)).filter(Boolean);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, text(entry)])
  );
}

function legacyStatus(value: unknown, completedAt?: unknown) {
  const normalized = normalizedText(value);
  if (normalized.includes("conclu")) {
    return "concluida" as const;
  }
  if (normalized.includes("present") || text(completedAt)) {
    return "presentado" as const;
  }
  return "pendiente" as const;
}

function communicationChannel(value: unknown): Matter["communicationChannel"] {
  const normalized = normalizedText(value);
  if (normalized.includes("telegram")) return "TELEGRAM";
  if (normalized.includes("wechat")) return "WECHAT";
  if (normalized.includes("mail") || normalized.includes("correo")) return "EMAIL";
  if (normalized.includes("telefono") || normalized.includes("phone")) return "PHONE";
  return "WHATSAPP";
}

function matterRfStatus(value: unknown): Matter["rfCreated"] {
  const normalized = normalizedText(value);
  if (normalized.includes("necesario") || normalized.includes("not required")) {
    return "NOT_REQUIRED";
  }
  return booleanValue(value) ? "YES" : "NO";
}

function matterType(value: unknown): Matter["matterType"] {
  const normalized = normalizedText(value);
  return normalized.includes("mensual") || normalized.includes("retainer") ? "RETAINER" : "ONE_TIME";
}

function teamFromLegacy(value: unknown) {
  const normalized = normalizedText(value);
  if (normalized.includes("litigio")) return "LITIGATION" as const;
  if (normalized.includes("corporativo") || normalized.includes("laboral")) return "CORPORATE_LABOR" as const;
  if (normalized.includes("convenio")) return "SETTLEMENTS" as const;
  if (normalized.includes("financier")) return "FINANCIAL_LAW" as const;
  if (normalized.includes("compliance") || normalized.includes("fiscal")) return "TAX_COMPLIANCE" as const;
  return undefined;
}

function unavailableWrite(): never {
  throw new AppError(
    503,
    "LOCAL_BUSINESS_FALLBACK_READ_ONLY",
    "La base de datos no esta disponible; el modo local muestra datos de solo lectura."
  );
}

export class LocalBusinessStore {
  private static readonly repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  private static readonly exportPath = resolve(this.repoRoot, "runtime-logs", "intranet-business-export.json");
  private static readonly overlayPath = resolve(this.repoRoot, "runtime-logs", "intranet-business-overrides.json");

  private data: BusinessExport | null = null;
  private overlayData: BusinessOverlay | null = null;

  public static isAvailable() {
    return existsSync(this.exportPath);
  }

  public async listClients() {
    return this.rows("clients")
      .map((row) => ({
        id: text(row.id),
        clientNumber: text(row.client_number),
        name: text(row.name),
        createdAt: isoDate(row.created_at) ?? new Date(0).toISOString()
      } satisfies Client))
      .sort((left, right) => Number(left.clientNumber) - Number(right.clientNumber));
  }

  public async createClient(_name: string) {
    return unavailableWrite();
  }

  public async updateClient(_clientId: string, _name: string) {
    return unavailableWrite();
  }

  public async deleteClient(_clientId: string) {
    unavailableWrite();
  }

  public async listMatters() {
    return this.rows("active_matters")
      .map((row) => this.mapMatter(row))
      .filter((matter) => !matter.deletedAt)
      .sort((left, right) => {
        const leftNumber = Number.parseInt(left.clientNumber ?? "", 10);
        const rightNumber = Number.parseInt(right.clientNumber ?? "", 10);

        if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
          return left.createdAt.localeCompare(right.createdAt);
        }
        if (Number.isNaN(leftNumber)) return 1;
        if (Number.isNaN(rightNumber)) return -1;
        return leftNumber - rightNumber;
      });
  }

  public async listDeletedMatters() {
    return this.modules()
      .flatMap((module) => this.rows(module.matterTable).map((row) => this.mapMatter(row, MODULE_TEAM[module.moduleId])))
      .filter((matter) => matter.deletedAt)
      .sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));
  }

  public async listCommissionShortNames() {
    return [];
  }

  public async createMatter(_payload?: MatterWriteRecord) {
    return unavailableWrite();
  }

  public async trash(_matterId: string) {
    return unavailableWrite();
  }

  public async bulkTrash(_matterIds: string[]) {
    unavailableWrite();
  }

  public async bulkDelete(_matterIds: string[]) {
    unavailableWrite();
  }

  public async restore(_matterId: string) {
    return unavailableWrite();
  }

  public async generateIdentifier(_matterId: string) {
    return unavailableWrite();
  }

  public async sendToExecution(_matterId: string) {
    return unavailableWrite();
  }

  public async listModules() {
    return TASK_MODULES;
  }

  public async listTasks(_moduleId?: string) {
    return [];
  }

  public async createTask(_payload: never) {
    return unavailableWrite();
  }

  public async updateState(_taskId: string, _state: never) {
    return unavailableWrite();
  }

  public async listTrackingRecords(filter: TaskTrackingRecordFilter) {
    const modules = filter.moduleId
      ? this.modules().filter((module) => module.moduleId === filter.moduleId)
      : this.modules();

    return modules
      .flatMap((module) =>
        module.sourceTables.flatMap((source) =>
          this.rows(source.sourceTable)
            .filter((row) => filter.includeDeleted || !text(row.deleted_at))
            .filter((row) => !filter.tableCode || filter.tableCode === source.slug || filter.tableCode === source.sourceTable)
            .map((row) => this.mapTrackingRecord(row, module, source))
        )
      )
      .sort((left, right) => (left.dueDate ?? left.termDate ?? "").localeCompare(right.dueDate ?? right.termDate ?? ""));
  }

  public async createTrackingRecord(_payload: TaskTrackingRecordWriteRecord) {
    return unavailableWrite();
  }

  public async updateTrackingRecord(_recordId: string, _payload: TaskTrackingRecordWriteRecord) {
    return unavailableWrite();
  }

  public async deleteTrackingRecord(_recordId: string) {
    unavailableWrite();
  }

  public async listTerms(moduleId: string) {
    const module = this.module(moduleId);
    if (!module) {
      return [];
    }

    return this.rows(module.termsTable)
      .filter((row) => !text(row.deleted_at))
      .map((row) => this.mapTerm(row, module))
      .sort((left, right) => (left.termDate ?? left.dueDate ?? "").localeCompare(right.termDate ?? right.dueDate ?? ""));
  }

  public async createTerm(_payload: TaskTermWriteRecord) {
    return unavailableWrite();
  }

  public async updateTerm(_termId: string, _payload: TaskTermWriteRecord) {
    return unavailableWrite();
  }

  public async deleteTerm(_termId: string) {
    unavailableWrite();
  }

  public async listDistributionEvents(moduleId: string) {
    const module = this.module(moduleId);
    if (!module) {
      return [];
    }

    return this.rows(module.eventsTable)
      .map((row) => {
        const name = text(row.nombre) || "Tarea";
        return {
          id: text(row.id),
          moduleId,
          name,
          targetTables: this.parseEventTargets(row.tablas, name),
          defaultTaskName: name,
          createdAt: isoDate(row.created_at) ?? new Date(0).toISOString(),
          updatedAt: isoDate(row.updated_at) ?? isoDate(row.created_at) ?? new Date(0).toISOString()
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public async createDistributionEvent(_payload: TaskDistributionEventWriteRecord) {
    return unavailableWrite();
  }

  public async updateDistributionEvent(_eventId: string, _payload: TaskDistributionEventWriteRecord) {
    return unavailableWrite();
  }

  public async deleteDistributionEvent(_eventId: string) {
    unavailableWrite();
  }

  public async listDistributionHistory(moduleId: string) {
    const module = this.module(moduleId);
    if (!module) {
      return [];
    }

    return this.rows(module.historyTable)
      .map((row) => ({
        id: text(row.id),
        moduleId,
        matterId: optionalText(row.id_asunto),
        matterNumber: optionalText(row.id_asunto),
        clientNumber: optionalText(row.no_cliente),
        clientName: text(row.cliente),
        subject: text(row.asunto),
        specificProcess: optionalText(row.proceso_especifico),
        matterIdentifier: optionalText(row.id_asunto),
        eventName: text(row.evento_nombre) || "Tarea",
        targetTables: asStringArray(row.target_tables),
        eventNamesPerTable: asStringArray(row.event_names_per_table),
        createdIds: asStringRecord(row.created_ids),
        data: row,
        createdAt: isoDate(row.created_at) ?? new Date(0).toISOString(),
        updatedAt: isoDate(row.updated_at) ?? isoDate(row.created_at) ?? new Date(0).toISOString()
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  public async createDistribution(payload: TaskDistributionWriteRecord) {
    const module = this.module(payload.moduleId);
    if (!module) {
      throw new AppError(404, "TASK_MODULE_NOT_FOUND", "No se encontro el modulo de tareas.");
    }

    const now = new Date().toISOString();
    const distributionId = `local-distribution-${randomUUID()}`;
    const createdIds: Record<string, string> = {};
    const targetTables: string[] = [];
    const eventNamesPerTable: string[] = [];
    const rowsByTable: Record<string, ExportRow[]> = {};

    payload.targets.forEach((target, index) => {
      const sourceTable = this.resolveSourceTable(module, target.tableCode, target.sourceTable);
      const tableCode = text(target.tableCode) || sourceTable;
      const taskName = text(target.taskName) || payload.eventName;
      const trackingId = `local-tracking-${randomUUID()}`;
      const termId = target.createTerm ? `local-term-${randomUUID()}` : undefined;

      targetTables.push(tableCode);
      eventNamesPerTable.push(taskName);
      createdIds[`${tableCode}_${index}`] = trackingId;
      createdIds[`${sourceTable}_${index}`] = trackingId;
      createdIds[tableCode] = createdIds[tableCode] ?? trackingId;
      createdIds[sourceTable] = createdIds[sourceTable] ?? trackingId;

      const trackingRow: ExportRow = {
        id: trackingId,
        created_at: now,
        updated_at: now,
        escrito: taskName,
        evento_nombre: payload.eventName,
        cliente: text(payload.clientName),
        fecha_debe_presentarse: text(target.dueDate),
        fecha_termino: text(target.termDate),
        status: target.status ?? "pendiente",
        team: module.moduleId,
        no_cliente: text(payload.clientNumber),
        id_asunto: text(payload.matterIdentifier) || text(payload.matterNumber) || text(payload.matterId),
        proceso_especifico: text(payload.specificProcess),
        asunto: text(payload.subject),
        responsable: text(payload.responsible),
        workflow_stage: target.workflowStage ?? 1,
        reported_month: text(target.reportedMonth),
        source: "local-fallback",
        deleted_at: null,
        ...(termId ? { termino_id: termId } : {})
      };

      this.addLocalRow(rowsByTable, sourceTable, trackingRow);

      if (termId) {
        createdIds[`term-${tableCode}_${index}`] = termId;
        createdIds[`term-${sourceTable}_${index}`] = termId;

        this.addLocalRow(rowsByTable, module.termsTable, {
          id: termId,
          created_at: now,
          updated_at: now,
          source_table: sourceTable,
          source_id: trackingId,
          evento: payload.eventName,
          escrito: taskName,
          cliente: text(payload.clientName),
          fecha_debe_presentarse: text(target.dueDate),
          fecha_termino: text(target.termDate),
          status: target.status ?? "pendiente",
          team: module.moduleId,
          no_cliente: text(payload.clientNumber),
          id_asunto: text(payload.matterIdentifier) || text(payload.matterNumber) || text(payload.matterId),
          proceso_especifico: text(payload.specificProcess),
          asunto: text(payload.subject),
          responsable: text(payload.responsible),
          reported_month: text(target.reportedMonth),
          es_recurrente: false,
          deleted_at: null,
          ...Object.fromEntries((module.verificationKeys ?? []).map((key) => [key, "No"]))
        });
      }
    });

    const historyRow: ExportRow = {
      id: distributionId,
      created_at: now,
      updated_at: now,
      evento_nombre: payload.eventName,
      id_asunto: text(payload.matterIdentifier) || text(payload.matterNumber) || text(payload.matterId),
      target_tables: targetTables,
      created_ids: createdIds,
      no_cliente: text(payload.clientNumber),
      cliente: text(payload.clientName),
      asunto: text(payload.subject),
      proceso_especifico: text(payload.specificProcess),
      event_names_per_table: eventNamesPerTable,
      data: payload.data ?? {},
      deleted_at: null
    };

    this.addLocalRow(rowsByTable, module.historyTable, historyRow);
    this.appendLocalRows(rowsByTable);

    return {
      id: distributionId,
      moduleId: payload.moduleId,
      matterId: optionalText(payload.matterId),
      matterNumber: optionalText(payload.matterNumber),
      clientNumber: optionalText(payload.clientNumber),
      clientName: text(payload.clientName),
      subject: text(payload.subject),
      specificProcess: optionalText(payload.specificProcess),
      matterIdentifier: optionalText(payload.matterIdentifier),
      eventName: payload.eventName,
      targetTables,
      eventNamesPerTable,
      createdIds,
      data: payload.data ?? {},
      createdAt: now,
      updatedAt: now
    };
  }

  public async listAdditionalTasks(moduleId: string) {
    const module = this.module(moduleId);
    if (!module) {
      return [];
    }

    return this.rows(module.additionalTasksTable)
      .filter((row) => !text(row.deleted_at))
      .map((row) => ({
        id: text(row.id),
        moduleId,
        task: text(row.tarea),
        responsible: text(row.responsable) || text(row.responsable2) || module.defaultResponsible || "",
        responsible2: optionalText(row.responsable2),
        dueDate: isoDate(row.fecha_limite),
        recurring: booleanValue(row.termino_recurrente) || booleanValue(row.es_recurrente) || booleanValue(row.recurring),
        status: legacyStatus(row.status),
        deletedAt: isoDate(row.deleted_at),
        createdAt: isoDate(row.created_at) ?? new Date(0).toISOString(),
        updatedAt: isoDate(row.updated_at) ?? isoDate(row.created_at) ?? new Date(0).toISOString()
      }))
      .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""));
  }

  public async createAdditionalTask(_payload: TaskAdditionalTaskWriteRecord) {
    return unavailableWrite();
  }

  public async updateAdditionalTask(_taskId: string, _payload: TaskAdditionalTaskWriteRecord) {
    return unavailableWrite();
  }

  public async deleteAdditionalTask(_taskId: string) {
    unavailableWrite();
  }

  private loadData() {
    if (!this.data) {
      const baseData = JSON.parse(readFileSync(LocalBusinessStore.exportPath, "utf8")) as BusinessExport;
      this.overlayData = this.loadOverlayData();
      this.data = {
        ...baseData,
        tables: Object.fromEntries(Object.entries(baseData.tables).map(([tableName, rows]) => [tableName, [...rows]]))
      };

      Object.entries(this.overlayData.tables).forEach(([tableName, rows]) => {
        this.data!.tables[tableName] = [...(this.data!.tables[tableName] ?? []), ...rows];
      });
    }

    return this.data;
  }

  private loadOverlayData(): BusinessOverlay {
    if (!existsSync(LocalBusinessStore.overlayPath)) {
      return { tables: {} };
    }

    try {
      const parsed = JSON.parse(readFileSync(LocalBusinessStore.overlayPath, "utf8")) as Partial<BusinessOverlay>;
      return parsed && typeof parsed === "object" && parsed.tables && typeof parsed.tables === "object"
        ? { tables: parsed.tables }
        : { tables: {} };
    } catch {
      return { tables: {} };
    }
  }

  private addLocalRow(rowsByTable: Record<string, ExportRow[]>, tableName: string, row: ExportRow) {
    rowsByTable[tableName] = [...(rowsByTable[tableName] ?? []), row];
  }

  private appendLocalRows(rowsByTable: Record<string, ExportRow[]>) {
    const data = this.loadData();
    const overlayData = this.overlayData ?? { tables: {} };
    this.overlayData = overlayData;

    Object.entries(rowsByTable).forEach(([tableName, rows]) => {
      data.tables[tableName] = [...(data.tables[tableName] ?? []), ...rows];
      overlayData.tables[tableName] = [...(overlayData.tables[tableName] ?? []), ...rows];
    });

    mkdirSync(dirname(LocalBusinessStore.overlayPath), { recursive: true });
    writeFileSync(LocalBusinessStore.overlayPath, JSON.stringify(overlayData, null, 2));
  }

  private rows(tableName: string) {
    return this.loadData().tables[tableName] ?? [];
  }

  private modules() {
    return this.loadData().modules;
  }

  private module(moduleId: string) {
    return this.modules().find((candidate) => candidate.moduleId === moduleId);
  }

  private resolveSourceTable(module: ExportModuleConfig, tableCode?: string, sourceTable?: string) {
    const normalizedTableCode = text(tableCode);
    const normalizedSourceTable = text(sourceTable);

    return (
      normalizedSourceTable ||
      module.sourceTables.find((source) =>
        source.slug === normalizedTableCode || source.sourceTable === normalizedTableCode
      )?.sourceTable ||
      normalizedTableCode
    );
  }

  private mapMatter(row: ExportRow, fallbackTeam?: Matter["responsibleTeam"]): Matter {
    const createdAt = isoDate(row.created_at) ?? new Date(0).toISOString();
    const updatedAt = isoDate(row.updated_at) ?? createdAt;
    const responsibleTeam = teamFromLegacy(row.equipo_responsable) ?? fallbackTeam;

    return {
      id: text(row.id),
      matterNumber: text(row.id_asunto) || text(row.id),
      clientNumber: optionalText(row.numero_cliente),
      clientName: text(row.cliente),
      quoteNumber: optionalText(row.numero_cotizacion),
      matterType: matterType(row.matter_type),
      subject: text(row.asunto),
      specificProcess: optionalText(row.proceso_especifico),
      totalFeesMxn: numberValue(row.honorarios_totales),
      responsibleTeam,
      nextPaymentDate: isoDate(row.fecha_pactada_pago),
      communicationChannel: communicationChannel(row.canal_comunicacion),
      r1InternalCreated: booleanValue(row.r1_interno_creado),
      telegramBotLinked: booleanValue(row.bot_telegram_vinculado),
      rdCreated: booleanValue(row.rd_creado),
      rfCreated: matterRfStatus(row.rf_creado),
      r1ExternalCreated: booleanValue(row.r1_externo_creado),
      billingChatCreated: booleanValue(row.chat_facturacion_creado),
      matterIdentifier: optionalText(row.id_asunto),
      executionLinkedModule: responsibleTeam
        ? Object.entries(MODULE_TEAM).find(([, team]) => team === responsibleTeam)?.[0]
        : undefined,
      executionLinkedAt: createdAt,
      executionPrompt: optionalText(row.comentarios_llm),
      nextAction: optionalText(row.siguiente_accion),
      nextActionDueAt: isoDate(row.fecha_siguiente_accion),
      milestone: optionalText(row.hito_conclusion),
      concluded: booleanValue(row.ya_concluyo),
      stage: "EXECUTION",
      origin: "MANUAL",
      notes: optionalText(row.comentarios),
      createdAt,
      updatedAt,
      deletedAt: isoDate(row.deleted_at)
    };
  }

  private mapTrackingRecord(row: ExportRow, module: ExportModuleConfig, source: ExportModuleConfig["sourceTables"][number]) {
    const createdAt = isoDate(row.created_at) ?? new Date(0).toISOString();
    const updatedAt = isoDate(row.updated_at) ?? createdAt;
    const completedAt = isoDate(row.fecha_presentacion);

    return {
      id: text(row.id),
      moduleId: module.moduleId,
      tableCode: source.slug,
      sourceTable: source.sourceTable,
      matterId: optionalText(row.id_asunto),
      matterNumber: optionalText(row.id_asunto),
      clientNumber: optionalText(row.no_cliente),
      clientName: text(row.cliente),
      subject: text(row.asunto),
      specificProcess: optionalText(row.proceso_especifico),
      matterIdentifier: optionalText(row.id_asunto),
      taskName: text(row.escrito) || text(row.tarea) || text(row.nombre_tarea) || text(row.evento) || source.slug,
      eventName: optionalText(row.evento_nombre) ?? optionalText(row.evento),
      responsible: text(row.responsable) || module.defaultResponsible || "",
      dueDate: isoDate(row.fecha_debe_presentarse) ?? isoDate(row.fecha_limite) ?? isoDate(row.fecha_pruebas),
      termDate: isoDate(row.fecha_termino),
      completedAt,
      status: legacyStatus(row.status, completedAt),
      workflowStage: numberValue(row.workflow_stage) || 1,
      reportedMonth: optionalText(row.reported_month),
      termId: optionalText(row.termino_id),
      data: row,
      deletedAt: isoDate(row.deleted_at),
      createdAt,
      updatedAt
    };
  }

  private mapTerm(row: ExportRow, module: ExportModuleConfig) {
    const createdAt = isoDate(row.created_at) ?? new Date(0).toISOString();
    const updatedAt = isoDate(row.updated_at) ?? createdAt;

    return {
      id: text(row.id),
      moduleId: module.moduleId,
      sourceTable: optionalText(row.source_table),
      sourceRecordId: optionalText(row.source_id),
      matterId: optionalText(row.id_asunto),
      matterNumber: optionalText(row.id_asunto),
      clientNumber: optionalText(row.no_cliente),
      clientName: text(row.cliente),
      subject: text(row.asunto),
      specificProcess: optionalText(row.proceso_especifico),
      matterIdentifier: optionalText(row.id_asunto),
      eventName: text(row.evento) || text(row.escrito) || "Termino",
      pendingTaskLabel: optionalText(row.escrito),
      responsible: text(row.responsable) || module.defaultResponsible || "",
      dueDate: isoDate(row.fecha_debe_presentarse),
      termDate: isoDate(row.fecha_termino),
      status: legacyStatus(row.status, row.fecha_presentacion),
      recurring: booleanValue(row.es_recurrente),
      reportedMonth: optionalText(row.reported_month),
      verification: Object.fromEntries((module.verificationKeys ?? [])
        .map((key) => [key, text(row[key]) || "No"])),
      data: row,
      deletedAt: isoDate(row.deleted_at),
      createdAt,
      updatedAt
    };
  }

  private parseEventTargets(value: unknown, fallbackTaskName: string) {
    return asArray(value).map((entry) => {
      if (typeof entry === "string") {
        try {
          const parsed = JSON.parse(entry) as { tabla?: unknown; nombre?: unknown };
          const tableName = text(parsed.tabla) || entry;
          const taskName = text(parsed.nombre) || fallbackTaskName;
          return `${tableName}::${encodeURIComponent(taskName)}`;
        } catch {
          return entry;
        }
      }

      if (entry && typeof entry === "object") {
        const parsed = entry as { tabla?: unknown; nombre?: unknown };
        const tableName = text(parsed.tabla);
        const taskName = text(parsed.nombre) || fallbackTaskName;
        return tableName ? `${tableName}::${encodeURIComponent(taskName)}` : "";
      }

      return text(entry);
    }).filter(Boolean);
  }
}

export class LocalClientsRepository implements ClientsRepository {
  public constructor(private readonly store: LocalBusinessStore) {}

  public list() {
    return this.store.listClients();
  }

  public create(name: string) {
    return this.store.createClient(name);
  }

  public update(clientId: string, name: string) {
    return this.store.updateClient(clientId, name);
  }

  public delete(clientId: string) {
    return this.store.deleteClient(clientId);
  }
}

export class LocalMattersRepository implements MattersRepository {
  public constructor(private readonly store: LocalBusinessStore) {}

  public list() {
    return this.store.listMatters();
  }

  public listDeleted() {
    return this.store.listDeletedMatters();
  }

  public listCommissionShortNames() {
    return this.store.listCommissionShortNames();
  }

  public create(_payload?: MatterWriteRecord) {
    return unavailableWrite();
  }

  public update(_matterId: string, _payload: MatterWriteRecord) {
    return unavailableWrite();
  }

  public trash(_matterId: string) {
    return unavailableWrite();
  }

  public async bulkTrash(_matterIds: string[]) {
    unavailableWrite();
  }

  public async bulkDelete(_matterIds: string[]) {
    unavailableWrite();
  }

  public restore(_matterId: string) {
    return unavailableWrite();
  }

  public generateIdentifier(_matterId: string) {
    return unavailableWrite();
  }

  public sendToExecution(_matterId: string) {
    return unavailableWrite();
  }
}

export class LocalTasksRepository implements TasksRepository {
  public constructor(private readonly store: LocalBusinessStore) {}

  public listModules() {
    return this.store.listModules();
  }

  public listTasks(moduleId?: string) {
    return this.store.listTasks(moduleId);
  }

  public create(_payload: Parameters<TasksRepository["create"]>[0]) {
    return unavailableWrite();
  }

  public updateState(_taskId: string, _state: Parameters<TasksRepository["updateState"]>[1]) {
    return unavailableWrite();
  }

  public listTrackingRecords(filter: TaskTrackingRecordFilter) {
    return this.store.listTrackingRecords(filter);
  }

  public createTrackingRecord(_payload: TaskTrackingRecordWriteRecord) {
    return unavailableWrite();
  }

  public updateTrackingRecord(_recordId: string, _payload: TaskTrackingRecordWriteRecord) {
    return unavailableWrite();
  }

  public async deleteTrackingRecord(_recordId: string) {
    unavailableWrite();
  }

  public listTerms(moduleId: string) {
    return this.store.listTerms(moduleId);
  }

  public createTerm(_payload: TaskTermWriteRecord) {
    return unavailableWrite();
  }

  public updateTerm(_termId: string, _payload: TaskTermWriteRecord) {
    return unavailableWrite();
  }

  public async deleteTerm(_termId: string) {
    unavailableWrite();
  }

  public listDistributionEvents(moduleId: string) {
    return this.store.listDistributionEvents(moduleId);
  }

  public createDistributionEvent(_payload: TaskDistributionEventWriteRecord) {
    return unavailableWrite();
  }

  public updateDistributionEvent(_eventId: string, _payload: TaskDistributionEventWriteRecord) {
    return unavailableWrite();
  }

  public async deleteDistributionEvent(_eventId: string) {
    unavailableWrite();
  }

  public listDistributionHistory(moduleId: string) {
    return this.store.listDistributionHistory(moduleId);
  }

  public createDistribution(payload: TaskDistributionWriteRecord) {
    return this.store.createDistribution(payload);
  }

  public listAdditionalTasks(moduleId: string) {
    return this.store.listAdditionalTasks(moduleId);
  }

  public createAdditionalTask(_payload: TaskAdditionalTaskWriteRecord) {
    return unavailableWrite();
  }

  public updateAdditionalTask(_taskId: string, _payload: TaskAdditionalTaskWriteRecord) {
    return unavailableWrite();
  }

  public async deleteAdditionalTask(_taskId: string) {
    unavailableWrite();
  }
}
