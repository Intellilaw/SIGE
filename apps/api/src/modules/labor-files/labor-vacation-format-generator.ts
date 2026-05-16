import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LaborFile, LaborVacationFormatFieldValues } from "@sige/contracts";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertInchesToTwip
} from "docx";
import JSZip from "jszip";
import { z } from "zod";

import { AppError } from "../../core/errors/app-error";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const laborVacationFormatFieldValuesSchema = z.object({
  employeeName: z.string().max(250).default(""),
  requestDate: z.string().max(30).default(""),
  vacationDates: z.array(z.string().min(10).max(30)).default([]),
  vacationDays: z.coerce.number().positive().default(1),
  enjoymentText: z.string().max(500).default(""),
  interestedName: z.string().max(250).default(""),
  authorizerName: z.string().max(250).default("Mayra Rubí Ordóñez Mendoza"),
  hireDate: z.string().max(30).default(""),
  vacationYearStartDate: z.string().max(30).default(""),
  completedYearsLabel: z.string().max(120).default(""),
  entitlementDays: z.coerce.number().min(0).default(0),
  pendingDays: z.coerce.number().min(0).default(0),
  enjoyedDays: z.coerce.number().min(0).default(0),
  description: z.string().max(500).default("")
});

const noBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF"
};

const softBorder = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "D9E2EC"
};

const moduleDir = dirname(fileURLToPath(import.meta.url));
const vacationLetterheadTemplateName = "hoja-membretada-rc.docx";
const vacationLetterheadTemplateCandidates = [
  resolve(moduleDir, "../../../runtime-assets/templates", vacationLetterheadTemplateName),
  resolve(process.cwd(), "runtime-assets/templates", vacationLetterheadTemplateName),
  resolve(process.cwd(), "apps/api/runtime-assets/templates", vacationLetterheadTemplateName)
];

type AlignmentValue = (typeof AlignmentType)[keyof typeof AlignmentType];

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function parseDateKey(value?: string | null) {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLongDate(value?: string | null) {
  const parsed = parseDateKey(value);
  if (!parsed) {
    return normalizeText(value) || "__ de ______ de 20__";
  }

  return parsed.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function singularPlural(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
}

function formatVacationDatesText(dates: string[]) {
  const sortedDates = Array.from(new Set(dates.filter((date) => parseDateKey(date)))).sort();
  if (sortedDates.length === 0) {
    return "";
  }

  if (sortedDates.length === 1) {
    return `el ${formatLongDate(sortedDates[0])}`;
  }

  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];
  const expectedRangeLength =
    Math.round((parseDateKey(lastDate)!.getTime() - parseDateKey(firstDate)!.getTime()) / 86_400_000) + 1;

  if (expectedRangeLength === sortedDates.length) {
    return `del ${formatLongDate(firstDate)} al ${formatLongDate(lastDate)}`;
  }

  return sortedDates.map(formatLongDate).join(", ");
}

function sanitizeFilenamePart(value: string) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "trabajador";
}

function normalizeFields(laborFile: LaborFile, payload: LaborVacationFormatFieldValues): LaborVacationFormatFieldValues {
  const vacationDates = Array.from(new Set(payload.vacationDates.filter((date) => parseDateKey(date)))).sort();
  const vacationDays = vacationDates.length || Number(payload.vacationDays) || 1;
  const enjoymentText = normalizeText(payload.enjoymentText) || formatVacationDatesText(vacationDates);

  return {
    employeeName: normalizeText(payload.employeeName) || laborFile.employeeName,
    requestDate: normalizeText(payload.requestDate) || currentDateKey(),
    vacationDates,
    vacationDays,
    enjoymentText,
    interestedName: normalizeText(payload.interestedName) || normalizeText(payload.employeeName) || laborFile.employeeName,
    authorizerName: normalizeText(payload.authorizerName) || "Mayra Rubí Ordóñez Mendoza",
    hireDate: normalizeText(payload.hireDate) || laborFile.hireDate.slice(0, 10),
    vacationYearStartDate: normalizeText(payload.vacationYearStartDate) || laborFile.vacationSummary.currentYearStartDate,
    completedYearsLabel: normalizeText(payload.completedYearsLabel) || laborFile.vacationSummary.completedYearsLabel,
    entitlementDays: Number.isFinite(Number(payload.entitlementDays))
      ? Number(payload.entitlementDays)
      : laborFile.vacationSummary.entitlementDays,
    pendingDays: Number.isFinite(Number(payload.pendingDays))
      ? Number(payload.pendingDays)
      : Math.max(0, laborFile.vacationSummary.remainingDays - vacationDays),
    enjoyedDays: Number.isFinite(Number(payload.enjoyedDays))
      ? Number(payload.enjoyedDays)
      : laborFile.vacationSummary.usedDays + vacationDays,
    description: normalizeText(payload.description)
  };
}

function textRun(text: string, options: { bold?: boolean; color?: string; size?: number; font?: string } = {}) {
  return new TextRun({
    text,
    bold: options.bold,
    color: options.color,
    size: options.size ?? 22,
    font: options.font ?? "Calibri"
  });
}

function paragraph(
  children: Array<TextRun | string>,
  options: {
    align?: AlignmentValue;
    spacingAfter?: number;
    spacingBefore?: number;
    size?: number;
    bold?: boolean;
    color?: string;
  } = {}
) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.LEFT,
    spacing: {
      before: options.spacingBefore ?? 0,
      after: options.spacingAfter ?? 120
    },
    children: children.map((child) =>
      typeof child === "string"
        ? textRun(child, { bold: options.bold, color: options.color, size: options.size })
        : child
    )
  });
}

function cell(
  children: Paragraph[],
  options: {
    width?: number;
    fill?: string;
    align?: AlignmentValue;
    borders?: "none" | "all" | "soft";
  } = {}
) {
  const borders = (() => {
    if (options.borders === "all") {
      return undefined;
    }

    if (options.borders === "soft") {
      return {
        top: softBorder,
        bottom: softBorder,
        left: softBorder,
        right: softBorder,
        insideHorizontal: softBorder,
        insideVertical: softBorder
      };
    }

    return {
        top: noBorder,
        bottom: noBorder,
        left: noBorder,
        right: noBorder,
        insideHorizontal: noBorder,
        insideVertical: noBorder
      };
  })();

  return new TableCell({
    borders,
    shading: options.fill ? { fill: options.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    width: options.width
      ? {
          size: options.width,
          type: WidthType.PERCENTAGE
        }
      : undefined,
    margins: {
      top: 90,
      bottom: 90,
      left: 120,
      right: 120
    },
    children
  });
}

function signatureLine(
  leftText: string,
  rightText: string,
  options: {
    bold?: boolean;
    color?: string;
    size?: number;
    spacingAfter?: number;
    spacingBefore?: number;
  } = {}
) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    tabStops: [
      { type: TabStopType.CENTER, position: 2350 },
      { type: TabStopType.CENTER, position: 7050 }
    ],
    spacing: {
      before: options.spacingBefore ?? 0,
      after: options.spacingAfter ?? 0
    },
    children: [
      new TextRun({
        children: [new Tab(), leftText, new Tab(), rightText],
        bold: options.bold,
        color: options.color,
        font: "Calibri",
        size: options.size ?? 21
      })
    ]
  });
}

function summaryRow(label: string, value: string | number, fill?: string) {
  return new TableRow({
    children: [
      cell([paragraph([label], { bold: true, color: "102A43", size: 20, spacingAfter: 0 })], {
        width: 58,
        fill,
        borders: "soft"
      }),
      cell([paragraph([String(value)], { align: AlignmentType.CENTER, color: "243447", size: 20, spacingAfter: 0 })], {
        width: 40,
        fill,
        align: AlignmentType.CENTER,
        borders: "soft"
      })
    ]
  });
}

function infoTile(label: string, value: string, width: number, align: AlignmentValue = AlignmentType.LEFT) {
  return cell([
    paragraph([textRun(label, { bold: true, color: "52657A", size: 17 })], {
      align,
      spacingAfter: 35
    }),
    paragraph([textRun(value, { bold: true, color: "102A43", size: 21 })], {
      align,
      spacingAfter: 0
    })
  ], { width, fill: "F7FAFC", borders: "soft" });
}

function findVacationLetterheadTemplatePath() {
  return vacationLetterheadTemplateCandidates.find((candidate) => existsSync(candidate)) ?? null;
}

function extractBodyContent(documentXml: string) {
  const bodyMatch = documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) {
    throw new AppError(500, "LABOR_VACATION_FORMAT_DOCX_BODY_MISSING", "No se pudo leer el cuerpo del formato generado.");
  }

  return bodyMatch[1].replace(/\s*<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*$/u, "").trim();
}

function replaceTemplateBody(templateDocumentXml: string, generatedBody: string) {
  const withSectPrPattern = /(<w:body\b[^>]*>)([\s\S]*?)(<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*<\/w:body>)/u;
  if (withSectPrPattern.test(templateDocumentXml)) {
    return templateDocumentXml.replace(
      withSectPrPattern,
      (_match, start: string, _currentBody: string, end: string) => `${start}${generatedBody}${end}`
    );
  }

  return templateDocumentXml.replace(
    /(<w:body\b[^>]*>)([\s\S]*?)(<\/w:body>)/u,
    (_match, start: string, _currentBody: string, end: string) => `${start}${generatedBody}${end}`
  );
}

async function applyVacationLetterhead(generatedBuffer: Buffer) {
  const templatePath = findVacationLetterheadTemplatePath();
  if (!templatePath) {
    return generatedBuffer;
  }

  const [templateZip, generatedZip] = await Promise.all([
    JSZip.loadAsync(readFileSync(templatePath)),
    JSZip.loadAsync(generatedBuffer)
  ]);
  const templateDocument = templateZip.file("word/document.xml");
  const generatedDocument = generatedZip.file("word/document.xml");

  if (!templateDocument || !generatedDocument) {
    return generatedBuffer;
  }

  const [templateDocumentXml, generatedDocumentXml] = await Promise.all([
    templateDocument.async("string"),
    generatedDocument.async("string")
  ]);
  const generatedBody = extractBodyContent(generatedDocumentXml);
  templateZip.file("word/document.xml", replaceTemplateBody(templateDocumentXml, generatedBody));

  return Buffer.from(await templateZip.generateAsync({ type: "nodebuffer" }));
}

export function buildLaborVacationFormatDefaultFields(laborFile: LaborFile): LaborVacationFormatFieldValues {
  return {
    employeeName: laborFile.employeeName,
    requestDate: currentDateKey(),
    vacationDates: [],
    vacationDays: 1,
    enjoymentText: "",
    interestedName: laborFile.employeeName,
    authorizerName: "Mayra Rubí Ordóñez Mendoza",
    hireDate: laborFile.hireDate.slice(0, 10),
    vacationYearStartDate: laborFile.vacationSummary.currentYearStartDate,
    completedYearsLabel: laborFile.vacationSummary.completedYearsLabel,
    entitlementDays: laborFile.vacationSummary.entitlementDays,
    pendingDays: laborFile.vacationSummary.remainingDays,
    enjoyedDays: laborFile.vacationSummary.usedDays,
    description: ""
  };
}

export async function renderLaborVacationFormatDocx(laborFile: LaborFile, payload: LaborVacationFormatFieldValues) {
  const fields = normalizeFields(laborFile, {
    ...buildLaborVacationFormatDefaultFields(laborFile),
    ...payload
  });

  if (fields.vacationDates.length === 0) {
    throw new AppError(400, "LABOR_VACATION_FORMAT_DATES_REQUIRED", "Selecciona al menos un dia de vacaciones.");
  }

  const enjoymentText = fields.enjoymentText || formatVacationDatesText(fields.vacationDates);
  const vacationDaysLabel = `${fields.vacationDays} ${singularPlural(fields.vacationDays, "dia", "dias")} de vacaciones`;
  const completedYearsLabel = fields.completedYearsLabel || laborFile.vacationSummary.completedYearsLabel;

  const doc = new DocxDocument({
    title: `Formato de vacaciones - ${fields.employeeName}`,
    creator: "SIGE",
    description: "Formato de vacaciones generado desde expediente laboral",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11)
            },
            margin: {
              top: convertInchesToTwip(0.9),
              right: convertInchesToTwip(0.82),
              bottom: convertInchesToTwip(0.7),
              left: convertInchesToTwip(0.82)
            }
          }
        },
        children: [
          paragraph([textRun("FORMATO DE SOLICITUD DE VACACIONES", { bold: true, color: "1F4E79", size: 34 })], {
            align: AlignmentType.CENTER,
            spacingBefore: 80,
            spacingAfter: 190
          }),
          new Table({
            width: { size: 86, type: WidthType.PERCENTAGE },
            alignment: AlignmentType.CENTER,
            layout: TableLayoutType.FIXED,
            borders: {
              top: noBorder,
              bottom: noBorder,
              left: noBorder,
              right: noBorder,
              insideHorizontal: noBorder,
              insideVertical: noBorder
            },
            rows: [
              new TableRow({
                children: [
                  infoTile("Nombre", fields.employeeName, 58),
                  infoTile("Fecha", formatLongDate(fields.requestDate), 42, AlignmentType.RIGHT)
                ]
              })
            ]
          }),
          paragraph([""], { spacingAfter: 90 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            borders: {
              top: noBorder,
              bottom: noBorder,
              left: noBorder,
              right: noBorder,
              insideHorizontal: noBorder,
              insideVertical: noBorder
            },
            rows: [
              new TableRow({
                children: [
                  infoTile("Periodo solicitado", enjoymentText, 46),
                  infoTile("Dias solicitados", vacationDaysLabel, 28, AlignmentType.CENTER),
                  infoTile("Estado", `${fields.pendingDays} pendientes`, 26, AlignmentType.RIGHT)
                ]
              })
            ]
          }),
          paragraph([
            textRun("El presente formato respalda la solicitud y autorizacion de vacaciones registrada en el expediente laboral.", {
              color: "52657A",
              size: 19
            })
          ], { align: AlignmentType.CENTER, spacingAfter: 230, spacingBefore: 120 }),
          signatureLine("El interesado", "Autoriza", {
            bold: true,
            color: "102A43",
            size: 21,
            spacingAfter: 0
          }),
          signatureLine("____________________________", "____________________________", {
            size: 22,
            spacingBefore: 620,
            spacingAfter: 70
          }),
          signatureLine(fields.interestedName, fields.authorizerName, {
            bold: true,
            color: "102A43",
            size: 21,
            spacingAfter: 36
          }),
          signatureLine("El interesado", "Autoriza", {
            color: "52657A",
            size: 18,
            spacingAfter: 0
          }),
          paragraph([""], { spacingAfter: 180 }),
          paragraph([
            textRun("FECHA DE INGRESO: ", { bold: true, color: "102A43", size: 20 }),
            `${formatLongDate(fields.hireDate)}   `,
            textRun("FECHA DE INICIO: ", { bold: true, color: "102A43", size: 20 }),
            formatLongDate(fields.vacationYearStartDate)
          ], { align: AlignmentType.CENTER, spacingAfter: 130 }),
          paragraph([textRun("Resumen de vacaciones", { bold: true, color: "1F4E79", size: 23 })], {
            align: AlignmentType.CENTER,
            spacingAfter: 80
          }),
          new Table({
            width: { size: 76, type: WidthType.PERCENTAGE },
            alignment: AlignmentType.CENTER,
            layout: TableLayoutType.FIXED,
            rows: [
              summaryRow("Dias pendientes", fields.pendingDays, "EEF4FF"),
              summaryRow("Dias disfrutados", fields.enjoyedDays),
              summaryRow(`${completedYearsLabel} años completos cumplidos`, "", "F7FAFC"),
              summaryRow("Le corresponden", `${fields.entitlementDays} dias de vacaciones`)
            ]
          }),
          fields.description
            ? paragraph([textRun("Descripcion: ", { bold: true, color: "102A43", size: 20 }), fields.description], {
                spacingBefore: 140,
                spacingAfter: 0
              })
            : paragraph([""], { spacingAfter: 0 })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const finalBuffer = await applyVacationLetterhead(Buffer.from(buffer));

  return {
    buffer: finalBuffer,
    filename: `formato-vacaciones-${sanitizeFilenamePart(fields.employeeName)}-${currentDateKey()}.docx`,
    contentType: DOCX_MIME_TYPE,
    fields
  };
}
