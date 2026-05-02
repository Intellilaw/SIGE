import type { PrismaClient } from "@prisma/client";
import type { QuoteLineItem, QuoteTemplate } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapQuote, mapQuoteTemplate } from "./mappers";
import type { QuoteTemplateWriteRecord, QuotesRepository, QuoteWriteRecord } from "./types";

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function getQuoteSequence(value?: string | null) {
  const match = normalizeText(value).match(/^E-(\d+)$/i);
  if (!match) {
    return 0;
  }

  const numeric = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildTemplateSubject(services: string) {
  const cleanServices = normalizeText(services);
  if (!cleanServices) {
    return "Cotizacion tipo";
  }

  return cleanServices.split(/\r?\n/)[0]?.slice(0, 120) || "Cotizacion tipo";
}

function buildTemplateLineItems(payload: QuoteTemplateWriteRecord): QuoteLineItem[] {
  const enabledColumns = payload.amountColumns
    .map((column, index) => ({ ...column, index }))
    .filter((column) => column.enabled && column.mode === "FIXED");

  return payload.tableRows.flatMap((row, rowIndex) =>
    enabledColumns.flatMap((column) => {
      const cell = row.amountCells[column.index];
      if (!cell || cell.hidden) {
        return [];
      }

      const amountMxn = Number.parseFloat(String(cell.value ?? "").replace(/,/g, ""));
      if (!Number.isFinite(amountMxn) || amountMxn <= 0) {
        return [];
      }

      const conceptBase = normalizeText(row.conceptDescription) || `Concepto ${rowIndex + 1}`;
      const concept =
        enabledColumns.length > 1 ? `${conceptBase} (${column.title})` : conceptBase;

      return [{ concept, amountMxn }];
    })
  );
}

function buildQuoteTemplateData(payload: QuoteTemplateWriteRecord) {
  const lineItems = buildTemplateLineItems(payload);
  const totalMxn = lineItems.reduce((sum, item) => sum + item.amountMxn, 0);
  const subject = buildTemplateSubject(payload.services);

  return {
    team: payload.team,
    subject,
    services: payload.services,
    quoteType: payload.quoteType,
    amountColumns: payload.amountColumns as unknown as import("@prisma/client").Prisma.InputJsonValue,
    tableRows: payload.tableRows as unknown as import("@prisma/client").Prisma.InputJsonValue,
    lineItems: lineItems as unknown as import("@prisma/client").Prisma.InputJsonValue,
    totalMxn,
    milestone: payload.milestone,
    notes: payload.notes
  };
}

function buildQuoteData(payload: QuoteWriteRecord) {
  const totalMxn = payload.lineItems.reduce((sum, item) => sum + item.amountMxn, 0);

  return {
    clientId: payload.clientId,
    clientName: payload.clientName,
    responsibleTeam: payload.responsibleTeam ?? null,
    subject: payload.subject,
    status: payload.status,
    quoteType: payload.quoteType,
    language: payload.language ?? "es",
    quoteDate: payload.quoteDate ? new Date(payload.quoteDate) : new Date(),
    amountColumns: payload.amountColumns as unknown as import("@prisma/client").Prisma.InputJsonValue,
    tableRows: payload.tableRows as unknown as import("@prisma/client").Prisma.InputJsonValue,
    lineItems: payload.lineItems as unknown as import("@prisma/client").Prisma.InputJsonValue,
    totalMxn,
    milestone: payload.milestone,
    notes: payload.notes
  };
}

async function buildNextTemplateNumber(prisma: PrismaClient) {
  const templates = await prisma.quoteTemplate.findMany({
    select: { templateNumber: true }
  });

  const maxNumber = templates.reduce((currentMax, template) => {
    const match = normalizeText(template.templateNumber).match(/^T-(\d+)$/i);
    if (!match) {
      return currentMax;
    }

    const numeric = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(numeric) && numeric > currentMax ? numeric : currentMax;
  }, 0);

  return `T-${String(maxNumber + 1).padStart(3, "0")}`;
}

async function buildNextQuoteNumber(prisma: PrismaClient) {
  const quotes = await prisma.quote.findMany({
    select: { quoteNumber: true }
  });

  const maxSequence = quotes.reduce(
    (currentMax, quote) => Math.max(currentMax, getQuoteSequence(quote.quoteNumber)),
    0
  );

  const nextSequence = Math.max(maxSequence, quotes.length) + 1;
  return `E-${String(nextSequence).padStart(3, "0")}`;
}

export class PrismaQuotesRepository implements QuotesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.quote.findMany({ orderBy: [{ quoteDate: "desc" }, { createdAt: "desc" }] });
    return records.map(mapQuote);
  }

  public async findById(quoteId: string) {
    const record = await this.prisma.quote.findUnique({
      where: { id: quoteId }
    });

    return record ? mapQuote(record) : null;
  }

  public async listTemplates() {
    const records = await this.prisma.quoteTemplate.findMany({
      orderBy: [{ team: "asc" }, { createdAt: "desc" }]
    });
    return records.map(mapQuoteTemplate);
  }

  public async create(payload: QuoteWriteRecord) {
    const quoteNumber = await buildNextQuoteNumber(this.prisma);
    const record = await this.prisma.quote.create({
      data: {
        quoteNumber,
        ...buildQuoteData(payload)
      }
    });

    return mapQuote(record);
  }

  public async update(quoteId: string, payload: QuoteWriteRecord) {
    await this.findQuoteOrThrow(quoteId);

    const record = await this.prisma.quote.update({
      where: { id: quoteId },
      data: buildQuoteData(payload)
    });

    return mapQuote(record);
  }

  public async delete(quoteId: string) {
    await this.findQuoteOrThrow(quoteId);
    await this.prisma.quote.delete({
      where: { id: quoteId }
    });
  }

  public async createTemplate(payload: QuoteTemplateWriteRecord) {
    const templateNumber = await buildNextTemplateNumber(this.prisma);
    const data = buildQuoteTemplateData(payload);
    const record = await this.prisma.quoteTemplate.create({
      data: {
        templateNumber,
        name: templateNumber,
        ...data
      }
    });

    return mapQuoteTemplate(record);
  }

  public async updateTemplate(templateId: string, payload: QuoteTemplateWriteRecord) {
    await this.findTemplateOrThrow(templateId);

    const record = await this.prisma.quoteTemplate.update({
      where: { id: templateId },
      data: buildQuoteTemplateData(payload)
    });

    return mapQuoteTemplate(record);
  }

  public async deleteTemplate(templateId: string) {
    await this.findTemplateOrThrow(templateId);
    await this.prisma.quoteTemplate.delete({
      where: { id: templateId }
    });
  }

  private async findQuoteOrThrow(quoteId: string) {
    const record = await this.prisma.quote.findUnique({
      where: { id: quoteId }
    });

    if (!record) {
      throw new AppError(404, "QUOTE_NOT_FOUND", "Quote was not found.");
    }

    return record;
  }

  private async findTemplateOrThrow(templateId: string) {
    const record = await this.prisma.quoteTemplate.findUnique({
      where: { id: templateId }
    });

    if (!record) {
      throw new AppError(404, "QUOTE_TEMPLATE_NOT_FOUND", "Quote template was not found.");
    }

    return record;
  }
}
