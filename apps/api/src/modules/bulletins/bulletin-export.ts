import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Bulletin, BulletinBlock } from "@sige/contracts";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlignTable,
  VerticalPositionRelativeFrom,
  WidthType,
  convertInchesToTwip
} from "docx";
import JSZip from "jszip";
import PDFDocument from "pdfkit";

import { AppError } from "../../core/errors/app-error";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(currentDir, "../../../runtime-assets/templates/hoja-membretada-rc.docx");
const letterheadImageEntryName = "word/media/image1.jpg";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME_TYPE = "application/pdf";
const WORD_PAGE_WIDTH = convertInchesToTwip(8.5);
const WORD_PAGE_HEIGHT = convertInchesToTwip(11);
const WORD_MARGIN_X = convertInchesToTwip(0.75);
const WORD_MARGIN_TOP = convertInchesToTwip(1.24);
const WORD_MARGIN_BOTTOM = convertInchesToTwip(1.3);
const WORD_CONTENT_WIDTH = convertInchesToTwip(7);
const WORD_COLUMN_WIDTH = WORD_CONTENT_WIDTH / 2;
const NAVY = "132B45";
const BLUE = "0563A6";
const PALE_BLUE = "E9F1F8";
const MUTED = "5C6673";
const LIGHT_BORDER = "D5E1EC";
const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const PDF_LEFT = 54;
const PDF_RIGHT = 558;
const PDF_TOP = 92;
const PDF_BOTTOM = 690;
const PDF_GUTTER = 22;
const PDF_COLUMN_WIDTH = (PDF_RIGHT - PDF_LEFT - PDF_GUTTER) / 2;
const PDF_RIGHT_COLUMN_X = PDF_LEFT + PDF_COLUMN_WIDTH + PDF_GUTTER;
const PDF_DIVIDER_X = PDF_LEFT + PDF_COLUMN_WIDTH + PDF_GUTTER / 2;

let letterheadImagePromise: Promise<Buffer | null> | null = null;

export interface BulletinExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function normalizeText(value?: string | null) {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function countWords(value: string) {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function languageText(bulletin: Pick<Bulletin, "titleEs" | "titleEn" | "blocks">, language: "es" | "en") {
  const title = language === "es" ? bulletin.titleEs : bulletin.titleEn;
  return [
    title,
    ...bulletin.blocks.flatMap((block) => language === "es"
      ? [block.headingEs, block.bodyEs]
      : [block.headingEn, block.bodyEn])
  ].join(" ");
}

export function assertBulletinContentFits(
  bulletin: Pick<Bulletin, "titleEs" | "titleEn" | "pageCount" | "twoPageReason" | "blocks">
) {
  if (!normalizeText(bulletin.titleEs) || !normalizeText(bulletin.titleEn)) {
    throw new AppError(400, "BULLETIN_TITLES_REQUIRED", "El boletin necesita titulo en espanol y en ingles.");
  }

  if (bulletin.blocks.length === 0) {
    throw new AppError(400, "BULLETIN_CONTENT_REQUIRED", "El boletin necesita contenido bilingue.");
  }

  for (const block of bulletin.blocks) {
    if (!normalizeText(block.bodyEs) || !normalizeText(block.bodyEn)) {
      throw new AppError(400, "BULLETIN_BLOCK_INCOMPLETE", "Cada bloque necesita texto en espanol y en ingles.");
    }
  }

  if (bulletin.pageCount === 2 && normalizeText(bulletin.twoPageReason).length < 12) {
    throw new AppError(
      400,
      "BULLETIN_TWO_PAGE_REASON_REQUIRED",
      "Explica brevemente por que este boletin justifica dos paginas."
    );
  }

  const wordLimit = bulletin.pageCount === 2 ? 560 : 260;
  const characterLimit = bulletin.pageCount === 2 ? 4200 : 1900;

  for (const language of ["es", "en"] as const) {
    const text = languageText(bulletin, language);
    if (countWords(text) > wordLimit || text.length > characterLimit) {
      throw new AppError(
        400,
        "BULLETIN_TOO_LONG",
        bulletin.pageCount === 1
          ? "El contenido excede una pagina. Abrevialo o selecciona dos paginas e incluye la justificacion."
          : "El contenido excede incluso el limite excepcional de dos paginas. Abrevialo antes de aprobar."
      );
    }
  }
}

async function getLetterheadImage() {
  letterheadImagePromise ??= readFile(templatePath)
    .then(async (templateBuffer) => {
      const zip = await JSZip.loadAsync(templateBuffer);
      const image = zip.file(letterheadImageEntryName);
      return image ? image.async("nodebuffer") : null;
    })
    .catch(() => null);

  return letterheadImagePromise;
}

function sanitizeFilenameSegment(value: string, fallback: string) {
  return (normalizeText(value) || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 82)
    .trim() || fallback;
}

function buildFilename(bulletin: Pick<Bulletin, "bulletinDate" | "titleEs">, extension: "docx" | "pdf") {
  return `Boletin - ${bulletin.bulletinDate} - ${sanitizeFilenameSegment(bulletin.titleEs, "Rusconi Consulting")}.${extension}`;
}

function formatBulletinDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function createWordHeader(letterheadImage: Buffer | null) {
  if (!letterheadImage) {
    return new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.END,
          children: [
            new TextRun({ text: "RUSCONI", font: "Times New Roman", size: 46 }),
            new TextRun({ text: " CONSULTING", font: "Arial", size: 9, bold: true, color: BLUE })
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
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
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

const noBorder = { style: BorderStyle.NONE, color: "FFFFFF", size: 0 };
const dividerBorder = { style: BorderStyle.SINGLE, color: LIGHT_BORDER, size: 7 };

function createWordCell(
  children: Paragraph[],
  side: "left" | "right",
  options: { fill?: string; columnSpan?: number; verticalPadding?: number } = {}
) {
  const verticalPadding = options.verticalPadding ?? 70;
  return new TableCell({
    width: { size: options.columnSpan === 2 ? WORD_CONTENT_WIDTH : WORD_COLUMN_WIDTH, type: WidthType.DXA },
    columnSpan: options.columnSpan,
    verticalAlign: VerticalAlignTable.TOP,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill, color: "auto" } : undefined,
    margins: {
      top: verticalPadding,
      bottom: verticalPadding,
      left: side === "left" ? 40 : 190,
      right: side === "left" ? 190 : 40
    },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: side === "left" && options.columnSpan !== 2 ? dividerBorder : noBorder
    },
    children
  });
}

function wordParagraph(
  text: string,
  options: {
    bold?: boolean;
    color?: string;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    before?: number;
    after?: number;
    characterSpacing?: number;
    keepNext?: boolean;
  } = {}
) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.LEFT,
    keepNext: options.keepNext,
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 0,
      line: 250,
      lineRule: "auto"
    },
    children: [
      new TextRun({
        text: normalizeText(text),
        font: "Arial",
        size: options.size ?? 19,
        bold: options.bold,
        color: options.color ?? "20252B",
        characterSpacing: options.characterSpacing
      })
    ]
  });
}

function createWordBlockParagraphs(block: BulletinBlock, language: "es" | "en") {
  const heading = language === "es" ? block.headingEs : block.headingEn;
  const body = language === "es" ? block.bodyEs : block.bodyEn;
  return [
    ...(normalizeText(heading)
      ? [wordParagraph(heading, { bold: true, color: NAVY, size: 20, after: 55, keepNext: true })]
      : []),
    wordParagraph(body, { size: 18, after: 110 })
  ];
}

async function renderWordBulletin(bulletin: Bulletin) {
  const letterheadImage = await getLetterheadImage();
  const titleRow = new TableRow({
    cantSplit: true,
    children: [
      createWordCell(
        [wordParagraph(bulletin.titleEs, { bold: true, color: NAVY, size: 30, after: 60 })],
        "left",
        { fill: PALE_BLUE, verticalPadding: 120 }
      ),
      createWordCell(
        [wordParagraph(bulletin.titleEn, { bold: true, color: NAVY, size: 30, after: 60 })],
        "right",
        { fill: PALE_BLUE, verticalPadding: 120 }
      )
    ]
  });
  const languageRow = new TableRow({
    cantSplit: true,
    children: [
      createWordCell(
        [wordParagraph("ESPAÑOL", { bold: true, color: BLUE, size: 15, after: 20, characterSpacing: 30 })],
        "left",
        { verticalPadding: 80 }
      ),
      createWordCell(
        [wordParagraph("ENGLISH", { bold: true, color: BLUE, size: 15, after: 20, characterSpacing: 30 })],
        "right",
        { verticalPadding: 80 }
      )
    ]
  });
  const blockRows = bulletin.blocks.map((block) => new TableRow({
      cantSplit: true,
      children: [
        createWordCell(createWordBlockParagraphs(block, "es"), "left"),
        createWordCell(createWordBlockParagraphs(block, "en"), "right")
      ]
    }));
  const createWordTable = (rows: TableRow[]) => new Table({
    width: { size: WORD_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [WORD_COLUMN_WIDTH, WORD_COLUMN_WIDTH],
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder
    },
    rows
  });

  const document = new DocxDocument({
    title: bulletin.titleEs,
    creator: "Rusconi Consulting",
    description: "Boletin bilingue para clientes",
    sections: [
      {
        headers: { default: createWordHeader(letterheadImage) },
        properties: {
          page: {
            size: { width: WORD_PAGE_WIDTH, height: WORD_PAGE_HEIGHT },
            margin: {
              top: WORD_MARGIN_TOP,
              right: WORD_MARGIN_X,
              bottom: WORD_MARGIN_BOTTOM,
              left: WORD_MARGIN_X,
              header: 0,
              footer: 0
            }
          }
        },
        children: [
          wordParagraph("BOLETÍN PARA CLIENTES  |  CLIENT BULLETIN", {
            bold: true,
            color: BLUE,
            size: 15,
            align: AlignmentType.CENTER,
            after: 35,
            characterSpacing: 24
          }),
          wordParagraph(formatBulletinDate(bulletin.bulletinDate), {
            color: MUTED,
            size: 16,
            align: AlignmentType.CENTER,
            after: 140
          }),
          createWordTable([titleRow]),
          wordParagraph("", { size: 2, after: 0 }),
          createWordTable([languageRow]),
          wordParagraph("", { size: 2, after: 0 }),
          ...blockRows.flatMap((row) => [
            createWordTable([row]),
            wordParagraph("", { size: 2, after: 0 })
          ]),
          wordParagraph("Rusconi Consulting", {
            bold: true,
            color: NAVY,
            size: 20,
            align: AlignmentType.CENTER,
            before: 100,
            after: 0
          })
        ]
      }
    ]
  });

  return Packer.toBuffer(document);
}

function addPdfLetterheadPage(doc: PDFKit.PDFDocument, letterheadImage: Buffer | null) {
  doc.addPage({ size: "LETTER", margin: 0 });
  if (letterheadImage) {
    doc.image(letterheadImage, 0, 0, { width: PDF_WIDTH, height: PDF_HEIGHT });
    return;
  }

  doc.font("Times-Roman").fontSize(27).fillColor("#000000").text("RUSCONI", 420, 32, { width: 140, align: "right" });
}

function pdfTextHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  options: { width: number; font: string; size: number; lineGap?: number }
) {
  doc.font(options.font).fontSize(options.size);
  return doc.heightOfString(normalizeText(text), {
    width: options.width,
    lineGap: options.lineGap ?? 0
  });
}

function pdfBlockHeight(doc: PDFKit.PDFDocument, block: BulletinBlock, language: "es" | "en") {
  const heading = language === "es" ? block.headingEs : block.headingEn;
  const body = language === "es" ? block.bodyEs : block.bodyEn;
  const headingHeight = normalizeText(heading)
    ? pdfTextHeight(doc, heading, { width: PDF_COLUMN_WIDTH, font: "Helvetica-Bold", size: 9.6, lineGap: 1.4 }) + 4
    : 0;
  return headingHeight
    + pdfTextHeight(doc, body, { width: PDF_COLUMN_WIDTH, font: "Helvetica", size: 9.1, lineGap: 2.1 })
    + 13;
}

function drawPdfOpening(doc: PDFKit.PDFDocument, bulletin: Bulletin, continuation: boolean) {
  doc
    .font("Helvetica-Bold")
    .fontSize(7.2)
    .fillColor("#0563A6")
    .text(
      continuation ? "BOLETÍN PARA CLIENTES  |  CLIENT BULLETIN  |  CONTINUACIÓN" : "BOLETÍN PARA CLIENTES  |  CLIENT BULLETIN",
      PDF_LEFT,
      PDF_TOP,
      { width: PDF_RIGHT - PDF_LEFT, align: "center", characterSpacing: 1.1 }
    );
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#5C6673")
    .text(formatBulletinDate(bulletin.bulletinDate), PDF_LEFT, PDF_TOP + 15, {
      width: PDF_RIGHT - PDF_LEFT,
      align: "center"
    });

  let y = PDF_TOP + 38;
  if (!continuation) {
    const titleLeftHeight = pdfTextHeight(doc, bulletin.titleEs, {
      width: PDF_COLUMN_WIDTH - 12,
      font: "Helvetica-Bold",
      size: 14.5,
      lineGap: 1.4
    });
    const titleRightHeight = pdfTextHeight(doc, bulletin.titleEn, {
      width: PDF_COLUMN_WIDTH - 12,
      font: "Helvetica-Bold",
      size: 14.5,
      lineGap: 1.4
    });
    const titleHeight = Math.max(titleLeftHeight, titleRightHeight) + 18;
    doc.roundedRect(PDF_LEFT, y, PDF_RIGHT - PDF_LEFT, titleHeight, 3).fill("#E9F1F8");
    doc
      .font("Helvetica-Bold")
      .fontSize(14.5)
      .fillColor("#132B45")
      .text(bulletin.titleEs, PDF_LEFT + 8, y + 8, { width: PDF_COLUMN_WIDTH - 16, lineGap: 1.4 });
    doc
      .font("Helvetica-Bold")
      .fontSize(14.5)
      .fillColor("#132B45")
      .text(bulletin.titleEn, PDF_RIGHT_COLUMN_X + 8, y + 8, { width: PDF_COLUMN_WIDTH - 16, lineGap: 1.4 });
    y += titleHeight + 10;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#0563A6")
    .text("ESPAÑOL", PDF_LEFT, y, { width: PDF_COLUMN_WIDTH, characterSpacing: 1.25 });
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#0563A6")
    .text("ENGLISH", PDF_RIGHT_COLUMN_X, y, { width: PDF_COLUMN_WIDTH, characterSpacing: 1.25 });

  return y + 18;
}

function drawPdfBlock(doc: PDFKit.PDFDocument, block: BulletinBlock, y: number, height: number) {
  const drawLanguage = (language: "es" | "en", x: number) => {
    const heading = language === "es" ? block.headingEs : block.headingEn;
    const body = language === "es" ? block.bodyEs : block.bodyEn;
    let textY = y;
    if (normalizeText(heading)) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9.6)
        .fillColor("#132B45")
        .text(heading, x, textY, { width: PDF_COLUMN_WIDTH, lineGap: 1.4 });
      textY += pdfTextHeight(doc, heading, {
        width: PDF_COLUMN_WIDTH,
        font: "Helvetica-Bold",
        size: 9.6,
        lineGap: 1.4
      }) + 4;
    }
    doc
      .font("Helvetica")
      .fontSize(9.1)
      .fillColor("#20252B")
      .text(body, x, textY, { width: PDF_COLUMN_WIDTH, lineGap: 2.1, align: "left" });
  };

  drawLanguage("es", PDF_LEFT);
  drawLanguage("en", PDF_RIGHT_COLUMN_X);
  doc
    .moveTo(PDF_DIVIDER_X, y - 2)
    .lineTo(PDF_DIVIDER_X, y + height - 7)
    .lineWidth(0.65)
    .strokeColor("#D5E1EC")
    .stroke();
}

async function renderPdfBulletin(bulletin: Bulletin) {
  const letterheadImage = await getLetterheadImage();
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: bulletin.titleEs,
      Author: "Rusconi Consulting",
      Subject: "Boletin bilingue para clientes"
    }
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  let renderedPages = 0;
  let y = 0;
  const startPage = (continuation: boolean) => {
    renderedPages += 1;
    addPdfLetterheadPage(doc, letterheadImage);
    y = drawPdfOpening(doc, bulletin, continuation);
  };

  startPage(false);
  for (const block of bulletin.blocks) {
    const height = Math.max(pdfBlockHeight(doc, block, "es"), pdfBlockHeight(doc, block, "en"));
    if (y + height > PDF_BOTTOM - 28) {
      startPage(true);
    }
    drawPdfBlock(doc, block, y, height);
    y += height;
  }

  if (y + 28 > PDF_BOTTOM) {
    startPage(true);
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(9.2)
    .fillColor("#132B45")
    .text("Rusconi Consulting", PDF_LEFT, y + 8, { width: PDF_RIGHT - PDF_LEFT, align: "center" });

  if (renderedPages > bulletin.pageCount) {
    doc.end();
    await completed;
    throw new AppError(
      400,
      "BULLETIN_LAYOUT_OVERFLOW",
      "El contenido no cabe en la extension aprobada. Abrevialo o autoriza dos paginas."
    );
  }

  doc.end();
  return completed;
}

export async function renderBulletinExports(bulletin: Bulletin) {
  assertBulletinContentFits(bulletin);
  const [docxBuffer, pdfBuffer] = await Promise.all([
    renderWordBulletin(bulletin),
    renderPdfBulletin(bulletin)
  ]);

  return {
    docx: {
      buffer: docxBuffer,
      contentType: DOCX_MIME_TYPE,
      filename: buildFilename(bulletin, "docx")
    } satisfies BulletinExportResult,
    pdf: {
      buffer: pdfBuffer,
      contentType: PDF_MIME_TYPE,
      filename: buildFilename(bulletin, "pdf")
    } satisfies BulletinExportResult
  };
}
