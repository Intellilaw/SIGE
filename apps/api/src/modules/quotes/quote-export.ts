import { Buffer } from "node:buffer";

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType
} from "docx";
import PDFDocument from "pdfkit";

import type { Quote, QuoteTemplateAmountColumn, QuoteTemplateTableRow } from "@sige/contracts";

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
  formattedDate: string;
  quoteNumberLabel: string;
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
  subject: string;
  milestone: string;
  notes: string;
  quoteTypeLabel: string;
  teamLabel: string;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function getContentType(format: QuoteExportFormat) {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function getExtension(format: QuoteExportFormat) {
  return format === "pdf" ? "pdf" : "docx";
}

function getQuoteTypeLabel(quoteType: Quote["quoteType"]) {
  return quoteType === "RETAINER" ? "Iguala" : "Por evento";
}

function getTeamLabel(team?: Quote["responsibleTeam"]) {
  switch (team) {
    case "ADMIN":
      return "Administracion";
    case "CLIENT_RELATIONS":
      return "Relacion con clientes";
    case "FINANCE":
      return "Finanzas";
    case "LITIGATION":
      return "Litigio";
    case "CORPORATE_LABOR":
      return "Corporativo laboral";
    case "SETTLEMENTS":
      return "Convenios";
    case "FINANCIAL_LAW":
      return "Financiero";
    case "TAX_COMPLIANCE":
      return "Compliance";
    case "ADMIN_OPERATIONS":
      return "Operacion administrativa";
    default:
      return "Sin equipo asignado";
  }
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

function buildPayload(quote: Quote): QuoteExportPayload {
  const exportTable = buildExportTable(quote);

  return {
    quoteNumber: quote.quoteNumber,
    clientName: quote.clientName,
    createdAt: quote.createdAt,
    formattedDate: formatQuoteDate(quote.createdAt),
    quoteNumberLabel: "Numero de cotizacion",
    introText:
      "Por medio de este documento le hacemos llegar la cotizacion de los honorarios que serian generados por el despacho con motivo de la prestacion de los servicios detallados a continuacion:",
    disclaimerText:
      "Las sumas anteriores no contemplan los gastos generados con motivo de la prestacion de los servicios detallados, tales como copias simples o certificadas, gastos de transportacion fuera de la Ciudad de Mexico, o impuestos o derechos generados a cargo del cliente, entre otros conceptos analogos distintos a los arriba senalados expresamente. Asimismo, a las sumas anteriores les debera ser agregado el monto correspondiente al Impuesto al Valor Agregado.",
    closingText:
      "El despacho se encuentra en la mejor disposicion de comentar con mayor precision los detalles, mecanismos, tiempos y demas consideraciones tecnicas de los servicios propuestos.",
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
    totalMxn: quote.totalMxn,
    subject: normalizeText(quote.subject),
    milestone: normalizeText(quote.milestone),
    notes: normalizeText(quote.notes),
    quoteTypeLabel: getQuoteTypeLabel(quote.quoteType),
    teamLabel: getTeamLabel(quote.responsibleTeam)
  };
}

function buildFilename(quote: Quote, format: QuoteExportFormat) {
  return `${sanitizeFileSegment(quote.quoteNumber)}_${sanitizeFileSegment(
    quote.clientName.toUpperCase()
  )}.${getExtension(format)}`;
}

function normalizeCellValue(value: string, emptyCellLabel: string) {
  const normalized = normalizeText(value);
  return normalized || emptyCellLabel;
}

function getVerticalMerge(cell: ExportCell) {
  if (cell.hidden) {
    return VerticalMergeType.CONTINUE;
  }

  if (cell.rowSpan > 1) {
    return VerticalMergeType.RESTART;
  }

  return undefined;
}

function createDocxCell(
  text: string,
  options?: {
    width?: number;
    bold?: boolean;
    fill?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType];
  }
) {
  return new TableCell({
    width: options?.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    verticalMerge: options?.verticalMerge,
    shading: options?.fill ? { fill: options.fill } : undefined,
    margins: {
      top: 90,
      bottom: 90,
      left: 100,
      right: 100
    },
    borders: {
      top: { style: BorderStyle.SINGLE, color: "D8D4CC", size: 4 },
      bottom: { style: BorderStyle.SINGLE, color: "D8D4CC", size: 4 },
      left: { style: BorderStyle.SINGLE, color: "D8D4CC", size: 4 },
      right: { style: BorderStyle.SINGLE, color: "D8D4CC", size: 4 }
    },
    children: [
      new Paragraph({
        alignment: options?.alignment ?? AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: options?.bold ?? false,
            size: 21
          })
        ]
      })
    ]
  });
}

function buildTableWidths(amountColumnCount: number) {
  const conceptWidth = amountColumnCount === 2 ? 30 : 38;
  const amountWidth = amountColumnCount === 2 ? 14 : 18;
  const paymentWidth = amountColumnCount === 2 ? 21 : 22;
  const notesWidth = amountColumnCount === 2 ? 21 : 22;

  return {
    conceptWidth,
    amountWidth,
    paymentWidth,
    notesWidth
  };
}

function buildDocxTable(payload: QuoteExportPayload) {
  const widths = buildTableWidths(payload.amountColumns.length);
  const rows: TableRow[] = [];

  rows.push(
    new TableRow({
      tableHeader: true,
      children: [
        createDocxCell(payload.conceptHeader, {
          width: widths.conceptWidth,
          bold: true,
          fill: "EEE7D8",
          alignment: AlignmentType.CENTER
        }),
        ...payload.amountColumns.map((column) =>
          createDocxCell(column.title, {
            width: widths.amountWidth,
            bold: true,
            fill: "EEE7D8",
            alignment: AlignmentType.CENTER
          })
        ),
        createDocxCell(payload.paymentHeader, {
          width: widths.paymentWidth,
          bold: true,
          fill: "EEE7D8",
          alignment: AlignmentType.CENTER
        }),
        createDocxCell(payload.notesHeader, {
          width: widths.notesWidth,
          bold: true,
          fill: "EEE7D8",
          alignment: AlignmentType.CENTER
        })
      ]
    })
  );

  for (const row of payload.tableRows) {
    rows.push(
      new TableRow({
        children: [
          createDocxCell(row.conceptDescription, {
            width: widths.conceptWidth
          }),
          ...row.amountCells.map((cell) =>
            createDocxCell(
              cell.hidden ? "" : normalizeCellValue(cell.value, payload.emptyCellLabel),
              {
                width: widths.amountWidth,
                alignment: AlignmentType.CENTER,
                verticalMerge: getVerticalMerge(cell)
              }
            )
          ),
          createDocxCell(
            row.paymentMoment.hidden
              ? ""
              : normalizeCellValue(row.paymentMoment.value, payload.emptyCellLabel),
            {
              width: widths.paymentWidth,
              verticalMerge: getVerticalMerge(row.paymentMoment)
            }
          ),
          createDocxCell(
            row.notesCell.hidden ? "" : normalizeCellValue(row.notesCell.value, payload.emptyCellLabel),
            {
              width: widths.notesWidth,
              verticalMerge: getVerticalMerge(row.notesCell)
            }
          )
        ]
      })
    );
  }

  rows.push(
    new TableRow({
      children: [
        createDocxCell(payload.totalLabel, {
          width: widths.conceptWidth,
          bold: true,
          fill: "F7F2E6"
        }),
        ...payload.amountSummaries.map((summary) =>
          createDocxCell(summary == null ? "Variable" : formatCurrency(summary), {
            width: widths.amountWidth,
            bold: true,
            fill: "F7F2E6",
            alignment: AlignmentType.CENTER
          })
        ),
        createDocxCell(payload.emptyCellLabel, {
          width: widths.paymentWidth,
          bold: true,
          fill: "F7F2E6",
          alignment: AlignmentType.CENTER
        }),
        createDocxCell(payload.emptyCellLabel, {
          width: widths.notesWidth,
          bold: true,
          fill: "F7F2E6",
          alignment: AlignmentType.CENTER
        })
      ]
    })
  );

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    layout: TableLayoutType.FIXED,
    rows
  });
}

function createMetadataParagraph(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        size: 22
      }),
      new TextRun({
        text: value,
        size: 22
      })
    ]
  });
}

async function renderWordDocument(payload: QuoteExportPayload) {
  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 900,
              right: 900,
              bottom: 900,
              left: 900
            },
            size: {
              orientation: PageOrientation.PORTRAIT
            }
          }
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: payload.signatureFirm,
                bold: true,
                size: 34
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 280 },
            children: [
              new TextRun({
                text: "Cotizacion de servicios",
                size: 26,
                bold: true
              })
            ]
          }),
          createMetadataParagraph(payload.quoteNumberLabel, payload.quoteNumber),
          createMetadataParagraph("Fecha", payload.formattedDate),
          createMetadataParagraph("Cliente", payload.clientName),
          createMetadataParagraph("Tipo", payload.quoteTypeLabel),
          createMetadataParagraph("Equipo", payload.teamLabel),
          ...(payload.subject ? [createMetadataParagraph("Asunto", payload.subject)] : []),
          ...(payload.milestone ? [createMetadataParagraph("Hito", payload.milestone)] : []),
          new Paragraph({
            spacing: { before: 160, after: 220 },
            children: [
              new TextRun({
                text: payload.introText,
                size: 22
              })
            ]
          }),
          buildDocxTable(payload),
          ...(payload.notes
            ? [
                new Paragraph({
                  spacing: { before: 220, after: 120 },
                  children: [
                    new TextRun({
                      text: "Notas adicionales:",
                      bold: true,
                      size: 22
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { after: 220 },
                  children: [
                    new TextRun({
                      text: payload.notes,
                      size: 22
                    })
                  ]
                })
              ]
            : []),
          new Paragraph({
            spacing: { before: 220, after: 220 },
            children: [
              new TextRun({
                text: payload.disclaimerText,
                size: 20
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 220 },
            children: [
              new TextRun({
                text: payload.closingText,
                size: 20
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 90 },
            children: [
              new TextRun({
                text: payload.signatureText,
                size: 22
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: payload.signatureFirm,
                size: 22,
                bold: true
              })
            ]
          })
        ]
      }
    ]
  });

  return Packer.toBuffer(document);
}

function drawPdfKeyValue(document: PDFKit.PDFDocument, label: string, value: string) {
  document.font("Helvetica-Bold").text(`${label}: `, { continued: true });
  document.font("Helvetica").text(value);
}

function drawPdfParagraph(document: PDFKit.PDFDocument, value: string, options?: { gap?: number }) {
  document.font("Helvetica").fontSize(10.5).text(value, {
    align: "justify"
  });
  document.moveDown(options?.gap ?? 0.8);
}

function drawPdfTable(document: PDFKit.PDFDocument, payload: QuoteExportPayload) {
  const startX = document.page.margins.left;
  const tableWidth = document.page.width - document.page.margins.left - document.page.margins.right;
  const widths = buildTableWidths(payload.amountColumns.length);
  const columns = [
    { key: "concept", title: payload.conceptHeader, width: tableWidth * (widths.conceptWidth / 100) },
    ...payload.amountColumns.map((column) => ({
      key: column.id,
      title: column.title,
      width: tableWidth * (widths.amountWidth / 100)
    })),
    { key: "payment", title: payload.paymentHeader, width: tableWidth * (widths.paymentWidth / 100) },
    { key: "notes", title: payload.notesHeader, width: tableWidth * (widths.notesWidth / 100) }
  ];

  const drawRow = (values: string[], options?: { header?: boolean }) => {
    const topY = document.y;
    let maxHeight = 24;

    for (let index = 0; index < values.length; index += 1) {
      const textHeight = document.heightOfString(values[index], {
        width: columns[index].width - 10,
        align: index === 0 ? "left" : "center"
      });
      maxHeight = Math.max(maxHeight, textHeight + 10);
    }

    if (topY + maxHeight > document.page.height - document.page.margins.bottom) {
      document.addPage();
    }

    let cursorX = startX;
    const rowY = document.y;

    for (let index = 0; index < values.length; index += 1) {
      const column = columns[index];
      document
        .save()
        .lineWidth(0.7)
        .rect(cursorX, rowY, column.width, maxHeight);

      if (options?.header) {
        document.fillColor("#EEE7D8").fill();
        document.fillColor("#000000");
      } else {
        document.stroke();
      }

      if (options?.header) {
        document.stroke();
      }

      document
        .font(options?.header ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9.5)
        .text(values[index], cursorX + 5, rowY + 5, {
          width: column.width - 10,
          align: index === 0 ? "left" : "center"
        });

      document.restore();
      cursorX += column.width;
    }

    document.y = rowY + maxHeight;
  };

  drawRow(columns.map((column) => column.title), { header: true });

  for (const row of payload.tableRows) {
    drawRow([
      row.conceptDescription,
      ...row.amountCells.map((cell) =>
        cell.hidden ? "" : normalizeCellValue(cell.value, payload.emptyCellLabel)
      ),
      row.paymentMoment.hidden
        ? ""
        : normalizeCellValue(row.paymentMoment.value, payload.emptyCellLabel),
      row.notesCell.hidden ? "" : normalizeCellValue(row.notesCell.value, payload.emptyCellLabel)
    ]);
  }

  drawRow([
    payload.totalLabel,
    ...payload.amountSummaries.map((summary) => (summary == null ? "Variable" : formatCurrency(summary))),
    payload.emptyCellLabel,
    payload.emptyCellLabel
  ]);

  document.moveDown(1);
}

async function renderPdfDocument(payload: QuoteExportPayload) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: "LETTER",
      margin: 50
    });

    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    document.font("Helvetica-Bold").fontSize(19).text(payload.signatureFirm, { align: "center" });
    document.moveDown(0.3);
    document.font("Helvetica-Bold").fontSize(14).text("Cotizacion de servicios", { align: "center" });
    document.moveDown(1.2);

    document.fontSize(11);
    drawPdfKeyValue(document, payload.quoteNumberLabel, payload.quoteNumber);
    drawPdfKeyValue(document, "Fecha", payload.formattedDate);
    drawPdfKeyValue(document, "Cliente", payload.clientName);
    drawPdfKeyValue(document, "Tipo", payload.quoteTypeLabel);
    drawPdfKeyValue(document, "Equipo", payload.teamLabel);
    if (payload.subject) {
      drawPdfKeyValue(document, "Asunto", payload.subject);
    }
    if (payload.milestone) {
      drawPdfKeyValue(document, "Hito", payload.milestone);
    }

    document.moveDown(0.8);
    drawPdfParagraph(document, payload.introText);
    drawPdfTable(document, payload);

    if (payload.notes) {
      document.font("Helvetica-Bold").fontSize(10.5).text("Notas adicionales:");
      document.moveDown(0.2);
      drawPdfParagraph(document, payload.notes, { gap: 0.8 });
    }

    drawPdfParagraph(document, payload.disclaimerText);
    drawPdfParagraph(document, payload.closingText);
    document.font("Helvetica").fontSize(10.5).text(payload.signatureText);
    document.moveDown(0.2);
    document.font("Helvetica-Bold").fontSize(11).text(payload.signatureFirm);
    document.end();
  });
}

export async function exportQuoteDocument(
  quote: Quote,
  format: QuoteExportFormat
): Promise<QuoteExportResult> {
  const payload = buildPayload(quote);
  const buffer = format === "pdf"
    ? await renderPdfDocument(payload)
    : await renderWordDocument(payload);

  return {
    buffer,
    contentType: getContentType(format),
    filename: buildFilename(quote, format)
  };
}
