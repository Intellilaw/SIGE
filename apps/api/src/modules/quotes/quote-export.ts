import { Buffer } from "node:buffer";
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

type ExportAmountColumn = {
  id: string;
  title: string;
  mode: "FIXED" | "VARIABLE";
};

type ExportCell = {
  value: string;
  rowSpan: number;
  hidden: boolean;
};

type ExportRow = {
  id: string;
  conceptDescription: string;
  amountCells: ExportCell[];
  paymentMoment: ExportCell;
  notesCell: ExportCell;
};

type QuoteExportPayload = {
  quoteNumber: string;
  clientName: string;
  createdAt: string;
  quoteDate?: string;
  language: Quote["language"];
  formattedDate: string;
  quoteNumberLabel: string;
  presentText?: string;
  introText: string;
  disclaimerText: string;
  closingText: string;
  signatureText: string;
  signatureFirm: string;
  totalLabel: string;
  conceptHeader: string;
  paymentHeader: string;
  notesHeader: string;
  emptyCellLabel: string;
  amountColumns: ExportAmountColumn[];
  tableRows: ExportRow[];
  amountSummaries: Array<number | null>;
  lineItems: Quote["lineItems"];
  totalMxn: number;
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

function formatQuoteDate(value: string, language: Quote["language"]) {
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateMatch
    ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12))
    : new Date(value);

  const formattedDate = new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City"
  }).format(date);

  return language === "en" ? `Mexico City, ${formattedDate}.` : formattedDate;
}

function getExportCopy(language: Quote["language"]) {
  if (language === "en") {
    return {
      quoteNumberLabel: "Quote number",
      presentText: "P R E S E N T",
      introText:
        "Herein I present to you the quotation of the services that will be provided by Rusconi Consulting, according to the terms and conditions stated below:",
      disclaimerText:
        "The Value Added Tax (IVA) as well as any expenses which might be necessary for the correct execution of the services provided, such as transportation outside of Mexico City, copies, expert witnesses and/or notary public\u2019s fees or taxes, among others, should be added to the fees contained in this quotation.",
      closingText:
        "The firm looks forward to discussing further the details of this document.",
      signatureText: "Sincerely,",
      signatureFirm: "RUSCONI CONSULTING",
      totalLabel: "TOTAL (EXCLUDING VAT)",
      conceptHeader: "CONCEPTS",
      paymentHeader: "TIME OF PAYMENT",
      notesHeader: "NOTES",
      emptyCellLabel: "-"
    };
  }

  return {
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
    emptyCellLabel: "-"
  };
}

function getDefaultAmountColumnTitle(index: number, language: Quote["language"]) {
  if (language === "en") {
    return index === 0 ? "Amount" : `Amount ${index + 1}`;
  }

  return index === 0 ? "Monto" : `Monto ${index + 1}`;
}

function localizeAmountColumnTitle(title: string, index: number, language: Quote["language"]) {
  const normalized = normalizeText(title);
  if (!normalized) {
    return getDefaultAmountColumnTitle(index, language);
  }

  if (language === "en") {
    const match = normalized.match(/^monto(?:\s+(\d+))?$/i);
    if (match) {
      const number = match[1] ?? (index === 0 ? "" : String(index + 1));
      return number ? `Amount ${number}` : "Amount";
    }
  }

  return normalized;
}

function getDefaultConceptLabel(index: number, language: Quote["language"]) {
  return language === "en" ? `Concept ${index + 1}` : `Concepto ${index + 1}`;
}

function getContentType(format: QuoteExportFormat) {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function getExtension(format: QuoteExportFormat) {
  return format === "pdf" ? "pdf" : "docx";
}

function buildLegacyExportTable(quote: Quote, language: Quote["language"]) {
  const amountColumns: QuoteTemplateAmountColumn[] = [
    { id: "primary", title: getDefaultAmountColumnTitle(0, language), enabled: true, mode: "FIXED" },
    { id: "secondary", title: getDefaultAmountColumnTitle(1, language), enabled: false, mode: "FIXED" }
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

function buildExportTable(quote: Quote, language: Quote["language"]) {
  const source = quote.amountColumns?.length && quote.tableRows?.length
    ? { amountColumns: quote.amountColumns, tableRows: quote.tableRows }
    : buildLegacyExportTable(quote, language);

  const enabledAmountColumns = source.amountColumns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.enabled);

  const amountColumns = enabledAmountColumns.map(({ column, index }) => ({
    id: column.id,
    title: localizeAmountColumnTitle(column.title, index, language),
    mode: column.mode
  }));

  const tableRows = source.tableRows.map((row, rowIndex) => ({
    id: row.id,
    conceptDescription: normalizeText(row.conceptDescription) || getDefaultConceptLabel(rowIndex, language),
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

function buildPayload(quote: Quote): QuoteExportPayload {
  const language = quote.language === "en" ? "en" : "es";
  const exportTable = buildExportTable(quote, language);
  const copy = getExportCopy(language);

  return {
    quoteNumber: quote.quoteNumber,
    clientName: quote.clientName,
    createdAt: quote.createdAt,
    quoteDate: quote.quoteDate,
    language,
    formattedDate: formatQuoteDate(quote.quoteDate ?? quote.createdAt, language),
    ...copy,
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
      "La exportacion de cotizaciones con hoja membretada solo esta disponible en Windows."
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
