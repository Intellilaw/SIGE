import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { Quote, QuoteTemplateAmountColumn, QuoteTemplateTableRow } from "@sige/contracts";

import { AppError } from "../../core/errors/app-error";

const execFileAsync = promisify(execFile);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const exportScriptPath = path.resolve(currentDir, "../../../scripts/quotes/export-quote.ps1");
const templatePath = path.resolve(currentDir, "../../../runtime-assets/quotes/quote-letterhead-template.docx");

export type QuoteExportFormat = "pdf" | "word";

export type QuoteExportResult = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

function sanitizeFileSegment(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "cotizacion";
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function formatQuoteDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City"
  }).format(date);
}

function getContentType(format: QuoteExportFormat) {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function getExtension(format: QuoteExportFormat) {
  return format === "pdf" ? "pdf" : "docx";
}

function buildLegacyExportTable(quote: Quote) {
  const amountColumns: QuoteTemplateAmountColumn[] = [
    { id: "primary", title: "Monto", enabled: true, mode: "FIXED" },
    { id: "secondary", title: "Monto 2", enabled: false, mode: "FIXED" }
  ];

  const tableRows: QuoteTemplateTableRow[] = quote.lineItems.map((item, index) => ({
    id: `quote-row-${index + 1}`,
    conceptDescription: item.concept,
    amountCells: [
      { value: String(item.amountMxn), rowSpan: 1, hidden: false },
      { value: "", rowSpan: 1, hidden: false }
    ],
    paymentMoment: { value: "", rowSpan: 1, hidden: false },
    notesCell: { value: "", rowSpan: 1, hidden: false }
  }));

  return {
    amountColumns,
    tableRows: tableRows.length
      ? tableRows
      : [
          {
            id: "quote-row-1",
            conceptDescription: "",
            amountCells: [
              { value: "", rowSpan: 1, hidden: false },
              { value: "", rowSpan: 1, hidden: false }
            ],
            paymentMoment: { value: "", rowSpan: 1, hidden: false },
            notesCell: { value: "", rowSpan: 1, hidden: false }
          }
        ]
  };
}

function buildExportTable(quote: Quote) {
  const source = quote.amountColumns?.length && quote.tableRows?.length
    ? { amountColumns: quote.amountColumns, tableRows: quote.tableRows }
    : buildLegacyExportTable(quote);

  const enabledAmountColumns = source.amountColumns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.enabled);

  const amountColumns = enabledAmountColumns.map(({ column, index }) => ({
    id: column.id,
    title: normalizeText(column.title) || `Monto ${index + 1}`,
    mode: column.mode
  }));

  const tableRows = source.tableRows.map((row, rowIndex) => ({
    id: row.id,
    conceptDescription: normalizeText(row.conceptDescription) || `Concepto ${rowIndex + 1}`,
    amountCells: enabledAmountColumns.map(({ index }) => ({
      value: String(row.amountCells[index]?.value ?? ""),
      rowSpan: row.amountCells[index]?.rowSpan ?? 1,
      hidden: Boolean(row.amountCells[index]?.hidden)
    })),
    paymentMoment: {
      value: String(row.paymentMoment?.value ?? ""),
      rowSpan: row.paymentMoment?.rowSpan ?? 1,
      hidden: Boolean(row.paymentMoment?.hidden)
    },
    notesCell: {
      value: String(row.notesCell?.value ?? ""),
      rowSpan: row.notesCell?.rowSpan ?? 1,
      hidden: Boolean(row.notesCell?.hidden)
    }
  }));

  const amountSummaries = enabledAmountColumns.map(({ column, index }) => {
    if (column.mode !== "FIXED") {
      return null;
    }

    return source.tableRows.reduce((sum, row) => {
      const cell = row.amountCells[index];
      if (!cell || cell.hidden) {
        return sum;
      }

      const parsed = Number.parseFloat(String(cell.value ?? "").replace(/,/g, ""));
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0);
  });

  return {
    amountColumns,
    tableRows,
    amountSummaries
  };
}

function buildPayload(quote: Quote) {
  const exportTable = buildExportTable(quote);

  return {
    quoteNumber: quote.quoteNumber,
    clientName: quote.clientName,
    createdAt: quote.createdAt,
    formattedDate: formatQuoteDate(quote.createdAt),
    quoteNumberLabel: "N\u00famero de cotizaci\u00f3n",
    introText:
      "Por medio de este documento le hacemos llegar la cotizaci\u00f3n de los honorarios que ser\u00edan generados por el despacho con motivo de la prestaci\u00f3n de los servicios detallados a continuaci\u00f3n:",
    disclaimerText:
      "Las sumas anteriores no contemplan los gastos generados con motivo de la prestaci\u00f3n de los servicios detallados, tales como copias simples o certificadas, gastos de transportaci\u00f3n fuera de la Ciudad de M\u00e9xico, o impuestos o derechos generados a cargo del cliente, entre otros conceptos an\u00e1logos distintos a los arriba se\u00f1alados expresamente. Asimismo, a las sumas anteriores les deber\u00e1 ser agregado el monto correspondiente al Impuesto al Valor Agregado.",
    closingText:
      "El despacho se encuentra en la mejor disposici\u00f3n de comentar con mayor precisi\u00f3n los detalles, mecanismos, tiempos y dem\u00e1s consideraciones t\u00e9cnicas de los servicios propuestos.",
    signatureText: "Atentamente,",
    signatureFirm: "RUSCONI CONSULTING",
    totalLabel: "TOTAL (SIN IVA)",
    conceptHeader: "CONCEPTOS",
    paymentHeader: "MOMENTO DE PAGO",
    notesHeader: "NOTAS",
    emptyCellLabel: "-",
    amountColumns: exportTable.amountColumns,
    tableRows: exportTable.tableRows,
    amountSummaries: exportTable.amountSummaries,
    lineItems: quote.lineItems,
    totalMxn: quote.totalMxn
  };
}

export async function exportQuoteDocument(
  quote: Quote,
  format: QuoteExportFormat
): Promise<QuoteExportResult> {
  if (process.platform !== "win32") {
    throw new AppError(
      500,
      "QUOTE_EXPORT_UNAVAILABLE",
      "La exportacion de cotizaciones solo esta disponible en hosts Windows."
    );
  }

  await access(exportScriptPath, fsConstants.F_OK);
  await access(templatePath, fsConstants.F_OK);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sige-quote-export-"));
  const payloadPath = path.join(tempDir, "quote.json");
  const wordOutputPath = path.join(tempDir, `${quote.quoteNumber}.docx`);
  const pdfOutputPath = path.join(tempDir, `${quote.quoteNumber}.pdf`);

  try {
    await writeFile(payloadPath, JSON.stringify(buildPayload(quote), null, 2), "utf8");

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      exportScriptPath,
      "-TemplatePath",
      templatePath,
      "-QuoteJsonPath",
      payloadPath,
      "-WordOutputPath",
      wordOutputPath
    ];

    if (format === "pdf") {
      args.push("-PdfOutputPath", pdfOutputPath);
    }

    await execFileAsync("powershell.exe", args, {
      timeout: 180_000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    });

    const outputPath = format === "pdf" ? pdfOutputPath : wordOutputPath;
    const buffer = await readFile(outputPath);
    const filename = `${sanitizeFileSegment(quote.quoteNumber)}_${sanitizeFileSegment(
      quote.clientName.toUpperCase()
    )}.${getExtension(format)}`;

    return {
      buffer,
      contentType: getContentType(format),
      filename
    };
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo generar el archivo de la cotizacion.";

    throw new AppError(500, "QUOTE_EXPORT_FAILED", message);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
