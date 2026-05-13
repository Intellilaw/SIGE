import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import type { Quote, QuoteTemplateAmountColumn, QuoteTemplateTableRow } from "@sige/contracts";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Footer,
  Header,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlignTable,
  VerticalMergeType,
  VerticalPositionRelativeFrom,
  WidthType,
  convertInchesToTwip
} from "docx";
import PDFDocument from "pdfkit";

import { AppError } from "../../core/errors/app-error";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(currentDir, "../../../runtime-assets/quotes/quote-letterhead-template.docx");
const letterheadImageEntryName = "word/media/image1.jpg";

const pdfPageWidth = 612;
const pdfPageHeight = 792;
const pdfMarginX = 54;
const pdfContentWidth = pdfPageWidth - pdfMarginX * 2;
const pdfContentTop = 76;
const pdfContentBottom = 704;
const pdfTableHeaderHeight = 60;
const pdfNavy = "#0b1f33";
const pdfBlue = "#d8e2f0";
const pdfPaleBlue = "#c2d2e8";
const pdfPaleAmount = "#ebf0f7";
const pdfConceptFill = "#f4f7fa";
const pdfBorder = "#22364f";
const pdfText = "#1a2330";
const pdfMuted = "#4f5e70";
const wordPageWidthTwip = convertInchesToTwip(8.5);
const wordPageHeightTwip = convertInchesToTwip(11);
const wordContentWidthTwip = convertInchesToTwip(7);
const wordContentMarginXTwip = convertInchesToTwip(0.75);
const wordContentMarginTopTwip = convertInchesToTwip(1.08);
const wordContentMarginBottomTwip = convertInchesToTwip(1.18);
const wordBorder = "22364F";
const wordNavy = "0B1F33";
const wordHeaderFill = "D8E2F0";
const wordTitleFill = "0F3052";
const wordConceptFill = "F4F7FA";
const wordConceptReferenceFill = "E9EEF5";
const wordTotalLabelFill = "C2D2E8";
const wordTotalAmountFill = "EBF0F7";
const wordText = "1A2330";
const wordMuted = "4F5E70";
const IVA_RATE = 0.16;

let letterheadImageBufferPromise: Promise<Buffer | null> | null = null;

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
  excludeFromIva: boolean;
  amountCells: ExportCell[];
  paymentMoment: ExportCell;
  notesCell: ExportCell;
};

type AmountSummary = {
  subtotal: number;
  taxableSubtotal: number;
  iva: number;
  total: number;
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
  subtotalLabel: string;
  ivaLabel: string;
  totalLabel: string;
  conceptHeader: string;
  paymentHeader: string;
  notesHeader: string;
  emptyCellLabel: string;
  amountColumns: ExportAmountColumn[];
  tableRows: ExportRow[];
  amountSummaries: Array<AmountSummary | null>;
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

  if (Number.isNaN(date.getTime())) {
    return language === "en" ? "Mexico City." : "Ciudad de M\u00e9xico.";
  }

  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const spanishMonths = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre"
  ];
  const englishMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const monthIndex = date.getUTCMonth();
  const spanishMonth = spanishMonths[monthIndex] ?? "";
  const englishMonth = englishMonths[monthIndex] ?? "";

  return language === "en"
    ? `Mexico City, ${day} ${englishMonth} ${year}.`
    : `Ciudad de M\u00e9xico, ${day} de ${spanishMonth} de ${year}.`;
}

function getExportCopy(language: Quote["language"]) {
  if (language === "en") {
    return {
      quoteNumberLabel: "Quote number",
      introText:
        "Herein I present to you the quotation of the services that will be provided by Rusconi Consulting, according to the terms and conditions stated below:",
      disclaimerText:
        "The amounts above do not include expenses that may be necessary for the correct execution of the services provided, such as transportation outside of Mexico City, copies, expert witnesses and/or notary public\u2019s fees or taxes, among others.",
      closingText:
        "The firm looks forward to discussing further the details of this document.",
      signatureText: "Sincerely,",
      signatureFirm: "RUSCONI CONSULTING",
      subtotalLabel: "SUBTOTAL",
      ivaLabel: "VAT",
      totalLabel: "TOTAL",
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
      "Las sumas anteriores no contemplan los gastos generados con motivo de la prestaci\u00f3n de los servicios detallados, tales como copias simples o certificadas, gastos de transportaci\u00f3n fuera de la Ciudad de M\u00e9xico, o impuestos o derechos generados a cargo del cliente, entre otros conceptos an\u00e1logos distintos a los arriba se\u00f1alados expresamente.",
    closingText:
      "El despacho se encuentra en la mejor disposici\u00f3n de comentar con mayor precisi\u00f3n los detalles, mecanismos, tiempos y dem\u00e1s consideraciones t\u00e9cnicas de los servicios propuestos.",
    signatureText: "Atentamente,",
    signatureFirm: "RUSCONI CONSULTING",
    subtotalLabel: "SUBTOTAL",
    ivaLabel: "IVA",
    totalLabel: "TOTAL",
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

function getConceptReferenceLabel(index: number, language: Quote["language"]) {
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

function extractZipEntryBuffer(archive: Buffer, entryName: string) {
  const endOfCentralDirectorySignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const localFileHeaderSignature = 0x04034b50;
  const maxCommentLength = 0xffff;
  const minimumEndOfCentralDirectoryLength = 22;
  const searchStart = Math.max(0, archive.length - minimumEndOfCentralDirectoryLength - maxCommentLength);

  let endOfCentralDirectoryOffset = -1;
  for (let index = archive.length - minimumEndOfCentralDirectoryLength; index >= searchStart; index -= 1) {
    if (archive.readUInt32LE(index) === endOfCentralDirectorySignature) {
      endOfCentralDirectoryOffset = index;
      break;
    }
  }

  if (endOfCentralDirectoryOffset < 0) {
    return null;
  }

  const centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const centralDirectoryEntries = archive.readUInt16LE(endOfCentralDirectoryOffset + 10);
  let entryOffset = centralDirectoryOffset;

  for (let entryIndex = 0; entryIndex < centralDirectoryEntries; entryIndex += 1) {
    if (archive.readUInt32LE(entryOffset) !== centralDirectorySignature) {
      return null;
    }

    const compressionMethod = archive.readUInt16LE(entryOffset + 10);
    const compressedSize = archive.readUInt32LE(entryOffset + 20);
    const fileNameLength = archive.readUInt16LE(entryOffset + 28);
    const extraFieldLength = archive.readUInt16LE(entryOffset + 30);
    const fileCommentLength = archive.readUInt16LE(entryOffset + 32);
    const localHeaderOffset = archive.readUInt32LE(entryOffset + 42);
    const fileName = archive
      .subarray(entryOffset + 46, entryOffset + 46 + fileNameLength)
      .toString("utf8");

    if (fileName === entryName) {
      if (archive.readUInt32LE(localHeaderOffset) !== localFileHeaderSignature) {
        return null;
      }

      const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const compressedData = archive.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return Buffer.from(compressedData);
      }

      if (compressionMethod === 8) {
        return inflateRawSync(compressedData);
      }

      return null;
    }

    entryOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return null;
}

function getLetterheadImageBuffer() {
  letterheadImageBufferPromise ??= readFile(templatePath)
    .then((templateBuffer) => extractZipEntryBuffer(templateBuffer, letterheadImageEntryName))
    .catch(() => null);

  return letterheadImageBufferPromise;
}

function addPdfLetterheadPage(doc: PDFKit.PDFDocument, letterheadImage: Buffer | null) {
  doc.addPage({ size: "LETTER", margin: 0 });

  if (letterheadImage) {
    doc.image(letterheadImage, 0, 0, { width: pdfPageWidth, height: pdfPageHeight });
    return;
  }

  doc
    .font("Times-Roman")
    .fontSize(28)
    .fillColor("#000000")
    .text("RUSCONI", pdfPageWidth - 170, 34, { width: 130, align: "right" });
  doc.rect(pdfPageWidth - 37, 38, 20, 24).fill("#0f77bd");
  doc
    .font("Helvetica-Bold")
    .fontSize(6)
    .fillColor("#ffffff")
    .text("CON\nSUL\nTING", pdfPageWidth - 34, 40, { width: 14, align: "center", lineGap: -1 });
  doc
    .font("Helvetica-Bold")
    .fontSize(6)
    .fillColor(pdfNavy)
    .text("L E G A L  |  T A X  |  A I  S Y S T E M S", 22, pdfPageHeight - 53);
  doc
    .font("Helvetica")
    .fontSize(6.5)
    .fillColor(pdfText)
    .text("Yacatas 215, Col. Narvarte Poniente, Alc. Benito Juarez, 03020, CDMX", 22, pdfPageHeight - 34);
}

function formatExportCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function getPdfPlainCellText(value: string, fallback: string) {
  return normalizeText(value) || fallback;
}

function getPdfAmountCellText(value: string, mode: ExportAmountColumn["mode"], fallback: string) {
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }

  if (mode === "FIXED") {
    const parsed = Number.parseFloat(text.replace(/,/g, ""));
    return Number.isFinite(parsed) ? formatExportCurrency(parsed) : fallback;
  }

  return text;
}

function measurePdfTextHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  fontSize: number,
  bold = false,
  align: PDFKit.Mixins.TextOptions["align"] = "center"
) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
  return doc.heightOfString(text || " ", { width, align, lineGap: 1 });
}

function writePdfTextBlock(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: {
    fontSize?: number;
    bold?: boolean;
    color?: string;
    align?: PDFKit.Mixins.TextOptions["align"];
    lineGap?: number;
    characterSpacing?: number;
    spaceAfter?: number;
  } = {}
) {
  const fontSize = options.fontSize ?? 10;
  const align = options.align ?? "left";
  const lineGap = options.lineGap ?? 2;

  doc
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(fontSize)
    .fillColor(options.color ?? pdfText);

  const height = doc.heightOfString(text, {
    width,
    align,
    lineGap,
    characterSpacing: options.characterSpacing
  });

  doc.text(text, x, y, {
    width,
    align,
    lineGap,
    characterSpacing: options.characterSpacing
  });

  return y + height + (options.spaceAfter ?? 10);
}

function drawPdfCell(
  doc: PDFKit.PDFDocument,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    fill?: string;
    color?: string;
    bold?: boolean;
    fontSize?: number;
    align?: PDFKit.Mixins.TextOptions["align"];
    padding?: number;
  }
) {
  const padding = options.padding ?? 6;
  const fontSize = options.fontSize ?? 8.5;
  const fill = options.fill ?? "#ffffff";
  const text = options.text ?? "";
  const align = options.align ?? "center";

  doc.lineWidth(0.55).strokeColor(pdfBorder).rect(options.x, options.y, options.width, options.height).fillAndStroke(fill, pdfBorder);

  if (!text) {
    return;
  }

  doc
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(fontSize)
    .fillColor(options.color ?? pdfText);

  const textWidth = Math.max(1, options.width - padding * 2);
  const textHeight = doc.heightOfString(text, { width: textWidth, align, lineGap: 1 });
  const textY = options.y + Math.max(3, (options.height - textHeight) / 2);
  doc.text(text, options.x + padding, textY, {
    width: textWidth,
    align,
    lineGap: 1
  });
}

function getPdfTableColumns(payload: QuoteExportPayload) {
  const amountColumnCount = Math.max(1, payload.amountColumns.length);
  const referenceWidth = 58;
  const contentWidth = pdfContentWidth - referenceWidth;
  const widthRatios = amountColumnCount >= 2
    ? [0.31, 0.15, 0.15, 0.195, 0.195]
    : [0.34, 0.2, 0.23, 0.23];
  const widths = widthRatios.map((ratio) => Math.floor(contentWidth * ratio));
  widths[widths.length - 1] += contentWidth - widths.reduce((sum, width) => sum + width, 0);

  const columns: Array<{ key: string; header: string; width: number; amountIndex?: number }> = [
    { key: "reference", header: "", width: referenceWidth },
    { key: "concept", header: payload.conceptHeader, width: widths[0] ?? 170 }
  ];

  payload.amountColumns.forEach((column, index) => {
    columns.push({
      key: `amount-${index}`,
      header: column.title,
      width: widths[index + 1] ?? 80,
      amountIndex: index
    });
  });

  columns.push(
    { key: "payment", header: payload.paymentHeader, width: widths[amountColumnCount + 1] ?? 110 },
    { key: "notes", header: payload.notesHeader, width: widths[amountColumnCount + 2] ?? 110 }
  );

  let x = pdfMarginX;
  return columns.map((column) => {
    const positioned = { ...column, x };
    x += column.width;
    return positioned;
  });
}

function drawPdfTableHeader(
  doc: PDFKit.PDFDocument,
  payload: QuoteExportPayload,
  columns: ReturnType<typeof getPdfTableColumns>,
  y: number
) {
  drawPdfCell(doc, {
    x: pdfMarginX,
    y,
    width: pdfContentWidth,
    height: 30,
    text: payload.language === "en" ? "SERVICES" : "SERVICIOS",
    fill: pdfNavy,
    color: "#ffffff",
    bold: true,
    fontSize: 9.5,
    padding: 8
  });

  const headerY = y + 30;
  columns.forEach((column) => {
    const isReferenceColumn = column.key === "reference";
    drawPdfCell(doc, {
      x: column.x,
      y: headerY,
      width: column.width,
      height: 30,
      text: isReferenceColumn ? "" : column.header.toUpperCase(),
      fill: isReferenceColumn ? "#000000" : pdfBlue,
      color: isReferenceColumn ? "#ffffff" : pdfNavy,
      bold: true,
      fontSize: 7.8,
      padding: 5
    });
  });

  return y + pdfTableHeaderHeight;
}

function getCellSpanHeight(rowHeights: number[], rowIndex: number, rowSpan: number) {
  return rowHeights
    .slice(rowIndex, Math.min(rowHeights.length, rowIndex + Math.max(1, rowSpan)))
    .reduce((sum, height) => sum + height, 0);
}

function getPdfRowHeights(
  doc: PDFKit.PDFDocument,
  payload: QuoteExportPayload,
  columns: ReturnType<typeof getPdfTableColumns>
) {
  const rowHeights = payload.tableRows.map((row) => {
    const conceptColumn = columns.find((column) => column.key === "concept") ?? columns[1] ?? columns[0];
    const conceptHeight = measurePdfTextHeight(doc, row.conceptDescription, conceptColumn.width - 12, 8.5, false, "left");
    return Math.max(38, Math.ceil(conceptHeight + 14));
  });

  const spanRequirements: Array<{ rowIndex: number; rowSpan: number; requiredHeight: number }> = [];

  payload.tableRows.forEach((row, rowIndex) => {
    row.amountCells.forEach((cell, amountIndex) => {
      if (cell.hidden) {
        return;
      }

      const column = columns.find((candidate) => candidate.key === `amount-${amountIndex}`);
      const text = getPdfAmountCellText(cell.value, payload.amountColumns[amountIndex]?.mode ?? "FIXED", payload.emptyCellLabel);
      const requiredHeight = measurePdfTextHeight(doc, text, (column?.width ?? 80) - 12, 8.3, true) + 14;

      if (cell.rowSpan > 1) {
        spanRequirements.push({ rowIndex, rowSpan: cell.rowSpan, requiredHeight });
      }
      else {
        rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] ?? 38, Math.ceil(requiredHeight));
      }
    });

    [
      { key: "payment", cell: row.paymentMoment },
      { key: "notes", cell: row.notesCell }
    ].forEach(({ key, cell }) => {
      if (cell.hidden) {
        return;
      }

      const column = columns.find((candidate) => candidate.key === key);
      const text = getPdfPlainCellText(cell.value, payload.emptyCellLabel);
      const requiredHeight = measurePdfTextHeight(doc, text, (column?.width ?? 100) - 12, 8.1) + 14;

      if (cell.rowSpan > 1) {
        spanRequirements.push({ rowIndex, rowSpan: cell.rowSpan, requiredHeight });
      }
      else {
        rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] ?? 38, Math.ceil(requiredHeight));
      }
    });
  });

  spanRequirements.forEach(({ rowIndex, rowSpan, requiredHeight }) => {
    const currentHeight = getCellSpanHeight(rowHeights, rowIndex, rowSpan);
    if (currentHeight >= requiredHeight) {
      return;
    }

    const extraByRow = Math.ceil((requiredHeight - currentHeight) / rowSpan);
    for (let index = rowIndex; index < Math.min(rowHeights.length, rowIndex + rowSpan); index += 1) {
      rowHeights[index] = (rowHeights[index] ?? 38) + extraByRow;
    }
  });

  return rowHeights;
}

function drawPdfTableRowsSegment(
  doc: PDFKit.PDFDocument,
  payload: QuoteExportPayload,
  columns: ReturnType<typeof getPdfTableColumns>,
  rowHeights: number[],
  startRowIndex: number,
  endRowIndex: number,
  y: number
) {
  const rowYPositions = new Map<number, number>();
  let currentY = y;

  for (let rowIndex = startRowIndex; rowIndex < endRowIndex; rowIndex += 1) {
    const row = payload.tableRows[rowIndex];
    const rowHeight = rowHeights[rowIndex] ?? 38;
    const referenceColumn = columns.find((column) => column.key === "reference");
    const conceptColumn = columns.find((column) => column.key === "concept");
    rowYPositions.set(rowIndex, currentY);

    if (referenceColumn) {
      drawPdfCell(doc, {
        x: referenceColumn.x,
        y: currentY,
        width: referenceColumn.width,
        height: rowHeight,
        text: getConceptReferenceLabel(rowIndex, payload.language),
        fill: pdfConceptFill,
        color: pdfNavy,
        bold: true,
        fontSize: 6.2,
        padding: 4
      });
    }

    if (conceptColumn) {
      drawPdfCell(doc, {
        x: conceptColumn.x,
        y: currentY,
        width: conceptColumn.width,
        height: rowHeight,
        text: getPdfPlainCellText(row.conceptDescription, payload.emptyCellLabel),
        fill: pdfConceptFill,
        color: pdfText,
        fontSize: 8.2,
        align: "left"
      });
    }

    currentY += rowHeight;
  }

  const drawSpanFragment = (
    columnKey: string,
    rowIndex: number,
    rowSpan: number,
    text: string,
    options: { bold?: boolean; color?: string; fontSize?: number }
  ) => {
    const column = columns.find((candidate) => candidate.key === columnKey);
    if (!column) {
      return;
    }

    const spanStartIndex = rowIndex;
    const spanEndIndex = Math.min(payload.tableRows.length, rowIndex + Math.max(1, rowSpan));
    const fragmentStartIndex = Math.max(spanStartIndex, startRowIndex);
    const fragmentEndIndex = Math.min(spanEndIndex, endRowIndex);
    if (fragmentStartIndex >= fragmentEndIndex) {
      return;
    }

    const fragmentY = rowYPositions.get(fragmentStartIndex);
    if (fragmentY == null) {
      return;
    }

    drawPdfCell(doc, {
      x: column.x,
      y: fragmentY,
      width: column.width,
      height: getCellSpanHeight(rowHeights, fragmentStartIndex, fragmentEndIndex - fragmentStartIndex),
      text,
      fill: "#ffffff",
      color: options.color ?? pdfText,
      bold: options.bold,
      fontSize: options.fontSize
    });
  };

  payload.tableRows.forEach((row, rowIndex) => {
    row.amountCells.forEach((cell, amountIndex) => {
      if (cell.hidden) {
        return;
      }

      drawSpanFragment(
        `amount-${amountIndex}`,
        rowIndex,
        cell.rowSpan,
        getPdfAmountCellText(cell.value, payload.amountColumns[amountIndex]?.mode ?? "FIXED", payload.emptyCellLabel),
        { bold: true, color: pdfNavy, fontSize: 8.2 }
      );
    });

    [
      { key: "payment", cell: row.paymentMoment },
      { key: "notes", cell: row.notesCell }
    ].forEach(({ key, cell }) => {
      if (cell.hidden) {
        return;
      }

      drawSpanFragment(
        key,
        rowIndex,
        cell.rowSpan,
        getPdfPlainCellText(cell.value, payload.emptyCellLabel),
        { color: pdfText, fontSize: 8.1 }
      );
    });
  });

  return currentY;
}

function drawPdfQuoteTable(
  doc: PDFKit.PDFDocument,
  payload: QuoteExportPayload,
  y: number,
  letterheadImage: Buffer | null
) {
  const columns = getPdfTableColumns(payload);
  const rowHeights = getPdfRowHeights(doc, payload, columns);
  let tableStartY = y;

  if (payload.tableRows.length > 0 && tableStartY + pdfTableHeaderHeight + 38 > pdfContentBottom) {
    addPdfLetterheadPage(doc, letterheadImage);
    tableStartY = pdfContentTop;
  }

  let currentY = drawPdfTableHeader(doc, payload, columns, tableStartY);
  let rowIndex = 0;

  while (rowIndex < payload.tableRows.length) {
    const segmentStartRowIndex = rowIndex;
    let segmentHeight = 0;

    while (rowIndex < payload.tableRows.length) {
      const rowHeight = rowHeights[rowIndex] ?? 38;
      const rowFits = currentY + segmentHeight + rowHeight <= pdfContentBottom;

      if (!rowFits && rowIndex > segmentStartRowIndex) {
        break;
      }

      segmentHeight += rowHeight;
      rowIndex += 1;

      if (!rowFits) {
        break;
      }
    }

    currentY = drawPdfTableRowsSegment(
      doc,
      payload,
      columns,
      rowHeights,
      segmentStartRowIndex,
      rowIndex,
      currentY
    );

    if (rowIndex < payload.tableRows.length) {
      addPdfLetterheadPage(doc, letterheadImage);
      currentY = drawPdfTableHeader(doc, payload, columns, pdfContentTop);
    }
  }

  const summaryHeight = 26;
  const summaryRows = [
    {
      label: payload.subtotalLabel,
      fill: pdfPaleAmount,
      value: (summary: AmountSummary) => summary.subtotal
    },
    {
      label: payload.ivaLabel,
      fill: pdfPaleBlue,
      value: (summary: AmountSummary) => summary.iva
    },
    {
      label: payload.totalLabel,
      fill: pdfPaleAmount,
      value: (summary: AmountSummary) => summary.total
    }
  ];

  if (currentY + summaryHeight * summaryRows.length > pdfContentBottom) {
    addPdfLetterheadPage(doc, letterheadImage);
    currentY = drawPdfTableHeader(doc, payload, columns, pdfContentTop);
  }

  summaryRows.forEach((summaryRow) => {
    const referenceColumn = columns.find((candidate) => candidate.key === "reference");
    const conceptColumn = columns.find((candidate) => candidate.key === "concept");
    if (referenceColumn) {
      drawPdfCell(doc, {
        x: referenceColumn.x,
        y: currentY,
        width: referenceColumn.width,
        height: summaryHeight,
        text: "",
        fill: "#000000",
        color: "#ffffff"
      });
    }

    if (!conceptColumn) {
      currentY += summaryHeight;
      return;
    }

    drawPdfCell(doc, {
      x: conceptColumn.x,
      y: currentY,
      width: conceptColumn.width,
      height: summaryHeight,
      text: summaryRow.label,
      fill: summaryRow.fill,
      color: pdfNavy,
      bold: true,
      fontSize: 8.2
    });

    payload.amountColumns.forEach((_column, amountIndex) => {
      const column = columns.find((candidate) => candidate.key === `amount-${amountIndex}`);
      if (!column) {
        return;
      }

      const summary = payload.amountSummaries[amountIndex];
      drawPdfCell(doc, {
        x: column.x,
        y: currentY,
        width: column.width,
        height: summaryHeight,
        text: summary == null ? payload.emptyCellLabel : formatExportCurrency(summaryRow.value(summary)),
        fill: summaryRow.fill,
        color: pdfNavy,
        bold: true,
        fontSize: 8.2
      });
    });

    ["payment", "notes"].forEach((key) => {
      const column = columns.find((candidate) => candidate.key === key);
      if (!column) {
        return;
      }

      drawPdfCell(doc, {
        x: column.x,
        y: currentY,
        width: column.width,
        height: summaryHeight,
        text: "",
        fill: "#000000",
        color: "#ffffff"
      });
    });

    currentY += summaryHeight;
  });

  return currentY + 24;
}

function ensurePdfSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  requiredHeight: number,
  letterheadImage: Buffer | null
) {
  if (y + requiredHeight <= pdfContentBottom) {
    return y;
  }

  addPdfLetterheadPage(doc, letterheadImage);
  return pdfContentTop;
}

async function renderPdfQuoteDocument(payload: QuoteExportPayload) {
  const letterheadImage = await getLetterheadImageBuffer();

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margin: 0, size: "LETTER" });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    addPdfLetterheadPage(doc, letterheadImage);

    let y = 82;
    y = writePdfTextBlock(doc, payload.formattedDate, pdfPageWidth - 252, y, 200, {
      align: "right",
      color: pdfMuted,
      fontSize: 9,
      spaceAfter: 5
    });
    y = writePdfTextBlock(
      doc,
      `${payload.quoteNumberLabel.toUpperCase()}: ${payload.quoteNumber}`,
      pdfPageWidth - 302,
      y,
      250,
      {
        align: "right",
        bold: true,
        color: pdfNavy,
        fontSize: 11,
        spaceAfter: 30
      }
    );

    y = Math.max(y, 150);
    y = writePdfTextBlock(doc, payload.clientName.toUpperCase(), pdfMarginX, y, pdfContentWidth, {
      bold: true,
      color: pdfNavy,
      fontSize: 11.2,
      spaceAfter: payload.presentText ? 5 : 18
    });

    if (payload.presentText) {
      y = writePdfTextBlock(doc, payload.presentText, pdfMarginX, y, pdfContentWidth, {
        color: pdfText,
        fontSize: 10,
        characterSpacing: 1.2,
        spaceAfter: 18
      });
    }

    y = writePdfTextBlock(doc, payload.introText, pdfMarginX, y, pdfContentWidth, {
      align: "justify",
      color: pdfText,
      fontSize: 10,
      lineGap: 2,
      spaceAfter: 18
    });

    y = drawPdfQuoteTable(doc, payload, y, letterheadImage);

    const disclaimerHeight = measurePdfTextHeight(doc, payload.disclaimerText, pdfContentWidth, 9.6, false, "justify") + 14;
    y = ensurePdfSpace(doc, y, disclaimerHeight, letterheadImage);
    y = writePdfTextBlock(doc, payload.disclaimerText, pdfMarginX, y, pdfContentWidth, {
      align: "justify",
      color: pdfText,
      fontSize: 9.6,
      lineGap: 2,
      spaceAfter: 14
    });

    const closingHeight = measurePdfTextHeight(doc, payload.closingText, pdfContentWidth, 9.6, false, "justify") + 18;
    y = ensurePdfSpace(doc, y, closingHeight, letterheadImage);
    y = writePdfTextBlock(doc, payload.closingText, pdfMarginX, y, pdfContentWidth, {
      align: "justify",
      color: pdfText,
      fontSize: 9.6,
      lineGap: 2,
      spaceAfter: 22
    });

    y = ensurePdfSpace(doc, y, 48, letterheadImage);
    y = writePdfTextBlock(doc, payload.signatureText, pdfMarginX, y, pdfContentWidth, {
      align: "center",
      color: pdfText,
      fontSize: 10,
      spaceAfter: 10
    });
    writePdfTextBlock(doc, payload.signatureFirm, pdfMarginX, y, pdfContentWidth, {
      align: "center",
      bold: true,
      color: pdfNavy,
      fontSize: 10,
      spaceAfter: 0
    });

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      const currentPage = pageIndex - pageRange.start + 1;
      const label = payload.language === "en"
        ? `${currentPage} of ${pageRange.count}`
        : `${currentPage} de ${pageRange.count}`;
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(pdfMuted)
        .text(label, 0, pdfPageHeight - 58, { width: pdfPageWidth, align: "center" });
    }

    doc.end();
  });
}

function createWordParagraph(
  text: string,
  options: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    color?: string;
    size?: number;
    spacingAfter?: number;
    spacingBefore?: number;
    characterSpacing?: number;
  } = {}
) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.START,
    spacing: {
      after: options.spacingAfter ?? 160,
      before: options.spacingBefore ?? 0
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        color: options.color ?? wordText,
        size: options.size ?? 20,
        font: "Aptos",
        characterSpacing: options.characterSpacing
      })
    ]
  });
}

function createWordFooter(payload: QuoteExportPayload) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ children: [PageNumber.CURRENT], color: wordMuted, size: 15, font: "Aptos" }),
          new TextRun({ text: payload.language === "en" ? " of " : " de ", color: wordMuted, size: 15, font: "Aptos" }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], color: wordMuted, size: 15, font: "Aptos" })
        ]
      })
    ]
  });
}

function createWordHeader(letterheadImage: Buffer | null) {
  if (!letterheadImage) {
    return new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.END,
          children: [
            new TextRun({ text: "RUSCONI", font: "Times New Roman", size: 48, color: "000000" }),
            new TextRun({ text: " CONSULTING", font: "Aptos", size: 10, color: "0F77BD", bold: true })
          ]
        })
      ]
    });
  }

  return new Header({
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new ImageRun({
            type: "jpg",
            data: letterheadImage,
            transformation: { width: 816, height: 1056 },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: 0
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: 0
              },
              behindDocument: true,
              allowOverlap: true,
              lockAnchor: true,
              wrap: { type: TextWrappingType.NONE }
            }
          })
        ]
      })
    ]
  });
}

function createWordBorders(color = wordBorder, size = 6) {
  const border = { style: BorderStyle.SINGLE, color, size };
  return {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border
  };
}

function createWordCell(
  text: string,
  options: {
    width?: number;
    fill?: string;
    color?: string;
    bold?: boolean;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    columnSpan?: number;
    verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType];
  } = {}
) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    columnSpan: options.columnSpan,
    verticalMerge: options.verticalMerge,
    verticalAlign: VerticalAlignTable.CENTER,
    margins: {
      top: 90,
      bottom: 90,
      left: 110,
      right: 110
    },
    shading: {
      type: ShadingType.CLEAR,
      fill: options.fill ?? "FFFFFF",
      color: "auto"
    },
    borders: createWordBorders(),
    children: [
      new Paragraph({
        alignment: options.align ?? AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text,
            bold: options.bold,
            color: options.color ?? wordText,
            size: options.size ?? 17,
            font: "Aptos"
          })
        ]
      })
    ]
  });
}

function getWordTableColumns(payload: QuoteExportPayload) {
  const amountColumnCount = Math.max(1, payload.amountColumns.length);
  const referenceWidth = 760;
  const contentWidth = wordContentWidthTwip - referenceWidth;
  const widthRatios = amountColumnCount >= 2
    ? [0.31, 0.15, 0.15, 0.195, 0.195]
    : [0.34, 0.2, 0.23, 0.23];
  const widths = widthRatios.map((ratio) => Math.floor(contentWidth * ratio));
  widths[widths.length - 1] += contentWidth - widths.reduce((sum, width) => sum + width, 0);

  return [referenceWidth, ...widths];
}

function createWordQuoteTable(payload: QuoteExportPayload) {
  const widths = getWordTableColumns(payload);
  const columnCount = 2 + payload.amountColumns.length + 2;
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      height: { value: 440, rule: HeightRule.ATLEAST },
      children: [
        createWordCell(payload.language === "en" ? "SERVICES" : "SERVICIOS", {
          columnSpan: columnCount,
          fill: wordTitleFill,
          color: "FFFFFF",
          bold: true,
          size: 19
        })
      ]
    }),
    new TableRow({
      tableHeader: true,
      height: { value: 420, rule: HeightRule.ATLEAST },
      children: [
        createWordCell("", {
          width: widths[0],
          fill: "000000",
          color: "FFFFFF",
          bold: true,
          size: 12
        }),
        createWordCell(payload.conceptHeader.toUpperCase(), {
          width: widths[1],
          fill: wordHeaderFill,
          color: wordNavy,
          bold: true,
          size: 16
        }),
        ...payload.amountColumns.map((column, index) =>
          createWordCell(column.title.toUpperCase(), {
            width: widths[index + 2],
            fill: wordHeaderFill,
            color: wordNavy,
            bold: true,
            size: 16
          })
        ),
        createWordCell(payload.paymentHeader.toUpperCase(), {
          width: widths[payload.amountColumns.length + 2],
          fill: wordHeaderFill,
          color: wordNavy,
          bold: true,
          size: 16
        }),
        createWordCell(payload.notesHeader.toUpperCase(), {
          width: widths[payload.amountColumns.length + 3],
          fill: wordHeaderFill,
          color: wordNavy,
          bold: true,
          size: 16
        })
      ]
    })
  ];

  payload.tableRows.forEach((row, rowIndex) => {
    rows.push(
      new TableRow({
        cantSplit: true,
        height: { value: 520, rule: HeightRule.ATLEAST },
        children: [
          createWordCell(getConceptReferenceLabel(rowIndex, payload.language), {
            width: widths[0],
            fill: wordConceptReferenceFill,
            color: wordNavy,
            bold: true,
            size: 12
          }),
          createWordCell(getPdfPlainCellText(row.conceptDescription, payload.emptyCellLabel), {
            width: widths[1],
            fill: wordConceptFill,
            align: AlignmentType.START,
            size: 16
          }),
          ...row.amountCells.map((cell, amountIndex) =>
            createWordCell(
              cell.hidden
                ? ""
                : getPdfAmountCellText(
                    cell.value,
                    payload.amountColumns[amountIndex]?.mode ?? "FIXED",
                    payload.emptyCellLabel
                  ),
              {
                width: widths[amountIndex + 2],
                bold: !cell.hidden,
                color: wordNavy,
                size: 16,
                verticalMerge: cell.hidden
                  ? VerticalMergeType.CONTINUE
                  : cell.rowSpan > 1
                    ? VerticalMergeType.RESTART
                    : undefined
              }
            )
          ),
          createWordCell(row.paymentMoment.hidden ? "" : getPdfPlainCellText(row.paymentMoment.value, payload.emptyCellLabel), {
            width: widths[payload.amountColumns.length + 2],
            size: 16,
            verticalMerge: row.paymentMoment.hidden
              ? VerticalMergeType.CONTINUE
              : row.paymentMoment.rowSpan > 1
                ? VerticalMergeType.RESTART
                : undefined
          }),
          createWordCell(row.notesCell.hidden ? "" : getPdfPlainCellText(row.notesCell.value, payload.emptyCellLabel), {
            width: widths[payload.amountColumns.length + 3],
            size: 16,
            verticalMerge: row.notesCell.hidden
              ? VerticalMergeType.CONTINUE
              : row.notesCell.rowSpan > 1
                ? VerticalMergeType.RESTART
                : undefined
          })
        ]
      })
    );
  });

  [
    {
      label: payload.subtotalLabel,
      labelFill: wordTotalLabelFill,
      amountFill: wordTotalAmountFill,
      value: (summary: AmountSummary) => summary.subtotal
    },
    {
      label: payload.ivaLabel,
      labelFill: wordHeaderFill,
      amountFill: wordHeaderFill,
      value: (summary: AmountSummary) => summary.iva
    },
    {
      label: payload.totalLabel,
      labelFill: wordTotalLabelFill,
      amountFill: wordTotalAmountFill,
      value: (summary: AmountSummary) => summary.total
    }
  ].forEach((summaryRow) => {
    rows.push(
      new TableRow({
        cantSplit: true,
        height: { value: 420, rule: HeightRule.ATLEAST },
        children: [
          createWordCell("", {
            width: widths[0],
            fill: "000000"
          }),
          createWordCell(summaryRow.label, {
            width: widths[1],
            fill: summaryRow.labelFill,
            color: wordNavy,
            bold: true,
            size: 16
          }),
          ...payload.amountColumns.map((_column, amountIndex) => {
            const summary = payload.amountSummaries[amountIndex];
            return createWordCell(
              summary == null ? payload.emptyCellLabel : formatExportCurrency(summaryRow.value(summary)),
              {
                width: widths[amountIndex + 2],
                fill: summaryRow.amountFill,
                color: wordNavy,
                bold: true,
                size: 16
              }
            );
          }),
          createWordCell("", {
            width: widths[payload.amountColumns.length + 2],
            fill: "000000"
          }),
          createWordCell("", {
            width: widths[payload.amountColumns.length + 3],
            fill: "000000"
          })
        ]
      })
    );
  });

  return new Table({
    rows,
    width: { size: wordContentWidthTwip, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: createWordBorders()
  });
}

async function renderWordQuoteDocument(payload: QuoteExportPayload) {
  const letterheadImage = await getLetterheadImageBuffer();
  const children = [
    createWordParagraph(payload.formattedDate, {
      align: AlignmentType.END,
      color: wordMuted,
      size: 19,
      spacingAfter: 80
    }),
    createWordParagraph(`${payload.quoteNumberLabel.toUpperCase()}: ${payload.quoteNumber}`, {
      align: AlignmentType.END,
      bold: true,
      color: wordNavy,
      size: 23,
      spacingAfter: 460
    }),
    createWordParagraph(payload.clientName.toUpperCase(), {
      bold: true,
      color: wordNavy,
      size: 23,
      spacingAfter: payload.presentText ? 70 : 260,
      characterSpacing: 4
    }),
    ...(payload.presentText
      ? [
          createWordParagraph(payload.presentText, {
            size: 21,
            spacingAfter: 280,
            characterSpacing: 26
          })
        ]
      : []),
    createWordParagraph(payload.introText, {
      align: AlignmentType.BOTH,
      size: 21,
      spacingAfter: 280
    }),
    createWordQuoteTable(payload),
    createWordParagraph(payload.disclaimerText, {
      align: AlignmentType.BOTH,
      size: 20,
      spacingBefore: 380,
      spacingAfter: 220
    }),
    createWordParagraph(payload.closingText, {
      align: AlignmentType.BOTH,
      size: 20,
      spacingAfter: 380
    }),
    createWordParagraph(payload.signatureText, {
      align: AlignmentType.CENTER,
      size: 21,
      spacingAfter: 140
    }),
    createWordParagraph(payload.signatureFirm, {
      align: AlignmentType.CENTER,
      bold: true,
      color: wordNavy,
      size: 21,
      spacingAfter: 0
    })
  ];

  const doc = new DocxDocument({
    title: payload.quoteNumber,
    creator: "Rusconi Consulting",
    description: `Cotizacion ${payload.quoteNumber}`,
    features: {
      updateFields: true
    },
    sections: [
      {
        headers: {
          default: createWordHeader(letterheadImage)
        },
        footers: {
          default: createWordFooter(payload)
        },
        properties: {
          page: {
            size: {
              width: wordPageWidthTwip,
              height: wordPageHeightTwip
            },
            margin: {
              top: wordContentMarginTopTwip,
              right: wordContentMarginXTwip,
              bottom: wordContentMarginBottomTwip,
              left: wordContentMarginXTwip,
              header: 0,
              footer: convertInchesToTwip(0.32)
            }
          }
        },
        children
      }
    ]
  });

  return Packer.toBuffer(doc);
}

function buildLegacyExportTable(quote: Quote, language: Quote["language"]) {
  const amountColumns: QuoteTemplateAmountColumn[] = [
    { id: "primary", title: getDefaultAmountColumnTitle(0, language), enabled: true, mode: "FIXED" },
    { id: "secondary", title: getDefaultAmountColumnTitle(1, language), enabled: false, mode: "FIXED" }
  ];

  const tableRows: QuoteTemplateTableRow[] = quote.lineItems.map((item, index) => ({
    id: `quote-row-${index + 1}`,
    conceptDescription: item.concept,
    excludeFromIva: false,
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
            excludeFromIva: false,
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
    excludeFromIva: Boolean(row.excludeFromIva),
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

    const subtotal = source.tableRows.reduce((sum, row) => {
      const cell = row.amountCells[index];
      if (!cell || cell.hidden) {
        return sum;
      }

      const parsed = Number.parseFloat(String(cell.value ?? "").replace(/,/g, ""));
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0);

    const taxableSubtotal = source.tableRows.reduce((sum, row) => {
      const cell = row.amountCells[index];
      if (!cell || cell.hidden || row.excludeFromIva) {
        return sum;
      }

      const parsed = Number.parseFloat(String(cell.value ?? "").replace(/,/g, ""));
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0);
    const iva = taxableSubtotal * IVA_RATE;

    return {
      subtotal,
      taxableSubtotal,
      iva,
      total: subtotal + iva
    };
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
  const filename = `${sanitizeFileSegment(quote.quoteNumber)}_${sanitizeFileSegment(
    quote.clientName.toUpperCase()
  )}.${getExtension(format)}`;
  const payload = buildPayload(quote);

  try {
    return {
      buffer: format === "pdf"
        ? await renderPdfQuoteDocument(payload)
        : await renderWordQuoteDocument(payload),
      contentType: getContentType(format),
      filename
    };
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo generar el archivo de la cotizacion.";

    throw new AppError(500, "QUOTE_EXPORT_FAILED", message);
  }
}
