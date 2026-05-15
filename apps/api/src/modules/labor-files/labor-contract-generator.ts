import { Buffer } from "node:buffer";

import type {
  LaborContractFieldValues,
  LaborContractPrefillResult,
  LaborFile,
  LaborFileDocumentType
} from "@sige/contracts";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip
} from "docx";
import { z } from "zod";

import { env } from "../../config/env";
import { AppError } from "../../core/errors/app-error";
import type { LaborFileDocumentRecord } from "../../repositories/types";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_PREFILL_FILE_BYTES = 18 * 1024 * 1024;

const laborContractFieldNames = [
  "employeeName",
  "rfc",
  "curp",
  "employeeAddress",
  "employeePhone",
  "position",
  "originalContractDate",
  "workdayStart",
  "workdayEnd",
  "monthlyGrossSalary",
  "monthlyGrossSalaryText",
  "biweeklyGrossSalary",
  "biweeklyGrossSalaryText",
  "signingDate",
  "signingCity"
] as const;

const EMPTY_LABOR_CONTRACT_FIELDS: LaborContractFieldValues = {
  employeeName: "",
  rfc: "",
  curp: "",
  employeeAddress: "",
  employeePhone: "",
  position: "",
  originalContractDate: "",
  workdayStart: "",
  workdayEnd: "",
  monthlyGrossSalary: "",
  monthlyGrossSalaryText: "",
  biweeklyGrossSalary: "",
  biweeklyGrossSalaryText: "",
  signingDate: "",
  signingCity: ""
};

export const laborContractFieldValuesSchema = z.object({
  employeeName: z.string().max(250).default(""),
  rfc: z.string().max(30).default(""),
  curp: z.string().max(30).default(""),
  employeeAddress: z.string().max(1200).default(""),
  employeePhone: z.string().max(80).default(""),
  position: z.string().max(250).default(""),
  originalContractDate: z.string().max(30).default(""),
  workdayStart: z.string().max(20).default(""),
  workdayEnd: z.string().max(20).default(""),
  monthlyGrossSalary: z.string().max(80).default(""),
  monthlyGrossSalaryText: z.string().max(250).default(""),
  biweeklyGrossSalary: z.string().max(80).default(""),
  biweeklyGrossSalaryText: z.string().max(250).default(""),
  signingDate: z.string().max(30).default(""),
  signingCity: z.string().max(120).default("")
});

const llmPrefillSchema = z.object({
  fields: laborContractFieldValuesSchema,
  sources: z.array(z.object({
    field: z.enum(laborContractFieldNames),
    documentType: z.string(),
    originalFileName: z.string(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"])
  })).default([]),
  notes: z.array(z.string()).default([])
});

const fieldJsonSchema = Object.fromEntries(
  laborContractFieldNames.map((field) => [field, { type: "string" }])
);

const LABOR_CONTRACT_PREFILL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: {
      type: "object",
      additionalProperties: false,
      properties: fieldJsonSchema,
      required: [...laborContractFieldNames]
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string", enum: [...laborContractFieldNames] },
          documentType: { type: "string" },
          originalFileName: { type: "string" },
          confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] }
        },
        required: ["field", "documentType", "originalFileName", "confidence"]
      }
    },
    notes: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["fields", "sources", "notes"]
};

const DOCUMENT_LABELS: Record<LaborFileDocumentType, string> = {
  EMPLOYMENT_CONTRACT: "Contrato laboral",
  ADDENDUM: "Addendum",
  PROOF_OF_ADDRESS: "Comprobante de domicilio",
  TAX_STATUS_CERTIFICATE: "Constancia de situacion fiscal",
  OFFICIAL_ID: "Identificacion oficial",
  CV: "CV",
  PROFESSIONAL_TITLE: "Titulo profesional",
  PROFESSIONAL_LICENSE: "Cedula profesional"
};

const fieldLabels: Record<keyof LaborContractFieldValues, string> = {
  employeeName: "Nombre completo",
  rfc: "RFC",
  curp: "CURP",
  employeeAddress: "Domicilio",
  employeePhone: "Telefono",
  position: "Puesto o labor",
  originalContractDate: "Fecha de contrato/ingreso",
  workdayStart: "Hora de entrada",
  workdayEnd: "Hora de salida",
  monthlyGrossSalary: "Salario mensual bruto",
  monthlyGrossSalaryText: "Salario mensual en letra",
  biweeklyGrossSalary: "Pago quincenal bruto",
  biweeklyGrossSalaryText: "Pago quincenal en letra",
  signingDate: "Fecha de firma",
  signingCity: "Ciudad de firma"
};

const noBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF"
};

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeFields(fields: LaborContractFieldValues): LaborContractFieldValues {
  return laborContractFieldNames.reduce<LaborContractFieldValues>((normalized, field) => ({
    ...normalized,
    [field]: normalizeText(fields[field])
  }), { ...EMPTY_LABOR_CONTRACT_FIELDS });
}

function mergeFieldValues(base: LaborContractFieldValues, next: LaborContractFieldValues) {
  const merged = { ...base };

  for (const field of laborContractFieldNames) {
    const value = normalizeText(next[field]);
    if (value) {
      merged[field] = value;
    }
  }

  return merged;
}

export function buildLaborContractDefaultFields(laborFile: LaborFile): LaborContractFieldValues {
  const hireDate = laborFile.hireDate?.slice(0, 10) ?? "";

  return {
    employeeName: laborFile.employeeName,
    rfc: "",
    curp: "",
    employeeAddress: "",
    employeePhone: "",
    position: laborFile.specificRole ?? "",
    originalContractDate: hireDate,
    workdayStart: "09:00",
    workdayEnd: "18:00",
    monthlyGrossSalary: "",
    monthlyGrossSalaryText: "",
    biweeklyGrossSalary: "",
    biweeklyGrossSalaryText: "",
    signingDate: currentDateKey(),
    signingCity: "Ciudad de Mexico"
  };
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractResponsesText(payload: unknown) {
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") {
    return direct;
  }

  const output = (payload as {
    output?: Array<{
      content?: Array<{
        text?: unknown;
      }>;
    }>;
  }).output;

  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((entry) => entry.content ?? [])
    .map((entry) => (typeof entry.text === "string" ? entry.text : ""))
    .filter(Boolean)
    .join("\n");
}

async function readOpenAiError(response: Response) {
  const rawBody = await response.text();

  try {
    const payload = JSON.parse(rawBody) as {
      error?: {
        message?: string;
      };
    };

    return payload.error;
  } catch {
    return undefined;
  }
}

async function throwOpenAiResponseError(response: Response) {
  const openAiError = await readOpenAiError(response);
  const providerMessage = openAiError?.message ? ` OpenAI respondio: ${openAiError.message}` : "";

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      502,
      "LABOR_CONTRACT_OPENAI_AUTH_FAILED",
      `OpenAI rechazo la credencial configurada. Revisa OPENAI_API_KEY.${providerMessage}`
    );
  }

  if (response.status === 400 || response.status === 404) {
    throw new AppError(
      502,
      "LABOR_CONTRACT_OPENAI_REQUEST_FAILED",
      `OpenAI no acepto la configuracion para contratos laborales. Revisa OPENAI_LABOR_CONTRACT_MODEL y OPENAI_BASE_URL.${providerMessage}`
    );
  }

  if (response.status === 429) {
    throw new AppError(
      502,
      "LABOR_CONTRACT_OPENAI_RATE_LIMITED",
      `OpenAI limito la solicitud o la cuenta no tiene cuota disponible.${providerMessage}`
    );
  }

  throw new AppError(
    502,
    "LABOR_CONTRACT_PREFILL_FAILED",
    `No se pudo prellenar el contrato laboral con OpenAI.${providerMessage}`
  );
}

function inferMimeType(document: LaborFileDocumentRecord) {
  const configuredMimeType = normalizeText(document.fileMimeType).toLowerCase();
  const filename = document.originalFileName.toLowerCase();

  if (configuredMimeType) {
    return configuredMimeType;
  }

  if (filename.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filename.endsWith(".png")) {
    return "image/png";
  }

  return "application/octet-stream";
}

function isSupportedPrefillMimeType(mimeType: string) {
  return mimeType === "application/pdf" || mimeType === "image/jpeg" || mimeType === "image/png";
}

function buildDocumentInputs(documents: LaborFileDocumentRecord[]) {
  const inputs: Array<Record<string, unknown>> = [];
  const notes: string[] = [];
  let totalBytes = 0;

  for (const document of documents) {
    const mimeType = inferMimeType(document);

    if (!isSupportedPrefillMimeType(mimeType)) {
      notes.push(`${document.originalFileName} no se envio a IA porque no es PDF, JPG o PNG.`);
      continue;
    }

    if (totalBytes + document.fileContent.byteLength > MAX_PREFILL_FILE_BYTES) {
      notes.push(`${document.originalFileName} no se envio a IA para mantener la solicitud dentro del limite de tamano.`);
      continue;
    }

    totalBytes += document.fileContent.byteLength;
    inputs.push({
      type: "input_text",
      text: `Documento: ${DOCUMENT_LABELS[document.documentType]} (${document.documentType}) - ${document.originalFileName}`
    });

    const dataUrl = `data:${mimeType};base64,${document.fileContent.toString("base64")}`;
    if (mimeType === "application/pdf") {
      inputs.push({
        type: "input_file",
        filename: document.originalFileName,
        file_data: dataUrl
      });
    } else {
      inputs.push({
        type: "input_image",
        image_url: dataUrl,
        detail: "high"
      });
    }
  }

  return { inputs, notes };
}

async function requestLlmPrefill(laborFile: LaborFile, documents: LaborFileDocumentRecord[]) {
  const { inputs, notes } = buildDocumentInputs(documents);
  if (inputs.length === 0) {
    return {
      fields: buildLaborContractDefaultFields(laborFile),
      sources: [],
      notes: notes.length > 0 ? notes : ["No hay documentos personales cargados para leer con IA."]
    } satisfies LaborContractPrefillResult;
  }

  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "LABOR_CONTRACT_OPENAI_NOT_CONFIGURED",
      "La generacion de contratos laborales no esta conectada a OpenAI. Falta configurar OPENAI_API_KEY en el runtime de la API."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OPENAI_LABOR_CONTRACT_TIMEOUT_MS);
  const defaults = buildLaborContractDefaultFields(laborFile);

  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_LABOR_CONTRACT_MODEL,
        temperature: 0.1,
        max_output_tokens: 1800,
        text: {
          format: {
            type: "json_schema",
            name: "labor_contract_prefill",
            strict: true,
            schema: LABOR_CONTRACT_PREFILL_JSON_SCHEMA
          }
        },
        input: [
          {
            role: "system",
            content:
              "Eres un asistente juridico mexicano. Extrae datos de documentos personales para prellenar un contrato individual de trabajo. Devuelve solamente JSON valido. No inventes datos: usa cadena vacia cuando no tengas evidencia documental."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Prellena los campos del contrato laboral con base en los documentos adjuntos y estos datos del expediente. " +
                  "Conserva fechas como YYYY-MM-DD cuando puedas. Los salarios deben quedar vacios si no aparecen en documentos. " +
                  "Relaciona sources con el documento que soporte cada campo.\n\n" +
                  JSON.stringify({
                    laborFile: {
                      employeeName: laborFile.employeeName,
                      employeeEmail: laborFile.employeeEmail,
                      employeeUsername: laborFile.employeeUsername,
                      employeeShortName: laborFile.employeeShortName,
                      legacyTeam: laborFile.legacyTeam,
                      specificRole: laborFile.specificRole,
                      hireDate: laborFile.hireDate
                    },
                    defaults,
                    fields: fieldLabels
                  })
              },
              ...inputs
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      await throwOpenAiResponseError(response);
    }

    const rawResponse = await response.json() as unknown;
    const content = extractResponsesText(rawResponse);
    if (!content) {
      throw new AppError(502, "LABOR_CONTRACT_PREFILL_EMPTY", "OpenAI no devolvio datos para el contrato laboral.");
    }

    const parsed = llmPrefillSchema.parse(JSON.parse(stripJsonFence(content)));
    return {
      fields: mergeFieldValues(defaults, parsed.fields),
      sources: parsed.sources
        .filter((source) => laborContractFieldNames.includes(source.field))
        .map((source) => ({
          field: source.field,
          documentType: source.documentType as LaborFileDocumentType,
          originalFileName: source.originalFileName || undefined,
          confidence: source.confidence
        })),
      notes: [...notes, ...parsed.notes.map(normalizeText).filter(Boolean)]
    } satisfies LaborContractPrefillResult;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(
        504,
        "LABOR_CONTRACT_OPENAI_TIMEOUT",
        "OpenAI tardo demasiado en leer los documentos. Revisa OPENAI_LABOR_CONTRACT_TIMEOUT_MS o intenta nuevamente."
      );
    }

    throw new AppError(502, "LABOR_CONTRACT_PREFILL_FAILED", "No se pudo prellenar el contrato laboral.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function prefillLaborContractFields(
  laborFile: LaborFile,
  documents: LaborFileDocumentRecord[]
) {
  return requestLlmPrefill(laborFile, documents);
}

function parseMoney(value?: string | null) {
  const normalized = normalizeText(value).replace(/,/g, "").replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMoney(value?: string | null) {
  const parsed = parseMoney(value);
  if (!parsed) {
    return normalizeText(value) || "__________";
  }

  return parsed.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

const units = [
  "",
  "un",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciseis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiun",
  "veintidos",
  "veintitres",
  "veinticuatro",
  "veinticinco",
  "veintiseis",
  "veintisiete",
  "veintiocho",
  "veintinueve"
];
const tens = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const hundreds = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos"
];

function numberBelowOneHundredToSpanish(value: number): string {
  if (value < units.length) {
    return units[value];
  }

  const ten = Math.floor(value / 10);
  const unit = value % 10;
  return unit === 0 ? tens[ten] : `${tens[ten]} y ${units[unit]}`;
}

function numberBelowOneThousandToSpanish(value: number): string {
  if (value === 100) {
    return "cien";
  }

  if (value < 100) {
    return numberBelowOneHundredToSpanish(value);
  }

  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  return rest === 0 ? hundreds[hundred] : `${hundreds[hundred]} ${numberBelowOneHundredToSpanish(rest)}`;
}

function numberToSpanish(value: number): string {
  if (value === 0) {
    return "cero";
  }

  if (value < 1000) {
    return numberBelowOneThousandToSpanish(value);
  }

  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1000);
    const rest = value % 1000;
    const prefix = thousands === 1 ? "mil" : `${numberBelowOneThousandToSpanish(thousands)} mil`;
    return rest === 0 ? prefix : `${prefix} ${numberBelowOneThousandToSpanish(rest)}`;
  }

  const millions = Math.floor(value / 1_000_000);
  const rest = value % 1_000_000;
  const prefix = millions === 1 ? "un millon" : `${numberBelowOneThousandToSpanish(millions)} millones`;
  return rest === 0 ? prefix : `${prefix} ${numberToSpanish(rest)}`;
}

function formatMoneyText(amountValue: string, explicitText: string) {
  const text = normalizeText(explicitText);
  if (text) {
    return text;
  }

  const parsed = parseMoney(amountValue);
  if (!parsed) {
    return "__________ pesos 00/100, Moneda Nacional";
  }

  const pesos = Math.trunc(parsed);
  const cents = Math.round((parsed - pesos) * 100);
  return `${numberToSpanish(pesos)} pesos ${String(cents).padStart(2, "0")}/100, Moneda Nacional`;
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

function formatTime(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "00:00";
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return normalized;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function textOrBlank(value: string, fallback = "__________") {
  return normalizeText(value) || fallback;
}

function createParagraph(
  text: string,
  options: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    size?: number;
    spacingAfter?: number;
    spacingBefore?: number;
    indentLeft?: number;
  } = {}
) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.BOTH,
    indent: options.indentLeft ? { left: options.indentLeft } : undefined,
    spacing: {
      after: options.spacingAfter ?? 160,
      before: options.spacingBefore ?? 0,
      line: 280
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        size: options.size ?? 21,
        font: "Arial"
      })
    ]
  });
}

function createSectionHeading(text: string) {
  return createParagraph(text, {
    align: AlignmentType.CENTER,
    bold: true,
    size: 22,
    spacingBefore: 220,
    spacingAfter: 180
  });
}

function createClause(title: string, body: string) {
  return createParagraph(`${title} ${body}`, {
    spacingAfter: 170
  });
}

function createListItem(text: string) {
  return createParagraph(text, {
    indentLeft: 360,
    spacingAfter: 80,
    size: 20
  });
}

function createSignatureCell(lines: string[]) {
  return new TableCell({
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder
    },
    width: {
      size: 50,
      type: WidthType.PERCENTAGE
    },
    children: lines.map((line, index) =>
      createParagraph(line, {
        align: AlignmentType.CENTER,
        bold: index === 1,
        spacingAfter: index === lines.length - 1 ? 0 : 80
      })
    )
  });
}

function createSignatureTable(employeeName: string) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
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
          createSignatureCell([
            "______________________________",
            "EDUARDO MIGUEL RUSCONI TRUJILLO",
            "Representante legal de R&S"
          ]),
          createSignatureCell([
            "______________________________",
            employeeName,
            "El Trabajador"
          ])
        ]
      })
    ]
  });
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

export async function renderLaborContractDocx(laborFile: LaborFile, payload: LaborContractFieldValues) {
  const fields = normalizeFields(mergeFieldValues(buildLaborContractDefaultFields(laborFile), payload));
  const employeeName = textOrBlank(fields.employeeName, laborFile.employeeName);
  const position = textOrBlank(fields.position);
  const originalContractDate = formatLongDate(fields.originalContractDate);
  const signingDate = formatLongDate(fields.signingDate);
  const signingCity = textOrBlank(fields.signingCity, "Ciudad de Mexico");
  const monthlySalary = formatMoney(fields.monthlyGrossSalary);
  const monthlySalaryText = formatMoneyText(fields.monthlyGrossSalary, fields.monthlyGrossSalaryText);
  const biweeklySalary = formatMoney(fields.biweeklyGrossSalary);
  const biweeklySalaryText = formatMoneyText(fields.biweeklyGrossSalary, fields.biweeklyGrossSalaryText);

  const children = [
    createParagraph(
      `CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO INDETERMINADO CON PERIODO DE PRUEBA, QUE CELEBRAN POR UNA PARTE ${employeeName.toUpperCase()} EN CALIDAD DE TRABAJADOR (EL "TRABAJADOR"), Y POR LA OTRA PARTE RUSCONI & SAUZA S.C., A TRAVES DE SU REPRESENTANTE LEGAL, EDUARDO MIGUEL RUSCONI TRUJILLO, EN CALIDAD DE PATRON ("R&S"), AL TENOR DE LAS DECLARACIONES Y CLAUSULAS SIGUIENTES.`,
      { align: AlignmentType.CENTER, bold: true, size: 22, spacingAfter: 260 }
    ),
    createSectionHeading("I. DECLARACIONES"),
    createParagraph("Las partes declaran lo siguiente:"),
    createClause("PRIMERA. Personalidad de R&S.", "Es una persona moral con capacidad suficiente para obligarse en los terminos del presente contrato."),
    createClause("SEGUNDA. Domicilio de R&S.", "Para efectos de este contrato, el domicilio de R&S es el ubicado en calle Yacatas, numero 215, colonia Narvarte Poniente, alcaldia Benito Juarez, codigo postal 03020, en la Ciudad de Mexico."),
    createClause("TERCERA. Informacion del Trabajador.", `El Trabajador es una persona fisica con Registro Federal de Contribuyentes ${textOrBlank(fields.rfc)} y con Clave Unica de Registro de Poblacion ${textOrBlank(fields.curp)}.`),
    createClause("CUARTA. Domicilio del Trabajador.", `El Trabajador senala como su domicilio el ubicado en ${textOrBlank(fields.employeeAddress)}, asimismo, senala como numero telefonico el ${textOrBlank(fields.employeePhone)}.`),
    createClause("QUINTA. Conocimientos del Trabajador.", "El Trabajador cuenta con los conocimientos y experiencia suficiente para realizar los servicios objeto del presente contrato."),
    createClause("SEXTA. Justificacion del periodo de prueba.", `Declara R&S que, para efectos de verificar que el Trabajador cumple con los requisitos y conocimientos necesarios para desarrollar la labor de ${position}, necesita contratar sus servicios con un periodo de prueba.`),
    createClause("SEPTIMA. Reconocimiento de antiguedad.", `R&S reconoce la antiguedad laboral del Trabajador, misma que comenzo a correr desde la celebracion del contrato laboral de ${originalContractDate} (el "Contrato Original").`),
    createParagraph("Habiendo sido declarado lo anterior las partes se someten a las clausulas desarrolladas a continuacion."),
    createSectionHeading("II. CLAUSULAS"),
    createParagraph("Las partes se someten a las siguientes clausulas:"),
    createClause("PRIMERA. Naturaleza del contrato.", `El Trabajador se compromete a prestar a favor de R&S sus servicios en calidad de ${position}, de acuerdo con su experiencia y destreza, de conformidad con todas y cada una de las instrucciones que le proporcione R&S de manera verbal o escrita.`),
    createClause("SEGUNDA. Unico patron.", "El Trabajador acepta que R&S es su unico patron, y que, por lo tanto, no podra recibir ordenes de ninguna otra persona fisica o moral distinta a R&S. En este sentido, el Trabajador acepta que la retribucion y conceptos analogos le seran cubiertos a este exclusivamente por R&S, por ser dicha persona moral su unico patron, de conformidad con lo establecido en los articulos 10 y 13 de la Ley Federal del Trabajo. Asimismo, el Trabajador reconoce que cualquier directivo, superior jerarquico o representante legal de R&S es, a su vez, un empleado de esta, y que, por dicha razon, ningun directivo, superior jerarquico o representante legal tendra la calidad de patron para efectos de la Ley Federal del Trabajo, sino que dicha calidad le correspondera unicamente a R&S."),
    createClause("TERCERA. Exclusividad.", "El Trabajador se obliga a prestar sus servicios profesionales unica y exclusivamente a R&S, por lo que, el Trabajador no podra prestar servicios profesionales de manera simultanea a ninguna persona fisica o moral diferente a R&S."),
    createClause("CUARTA. Antiguedad.", "La antiguedad laboral comenzara a contarse desde la fecha de celebracion del Contrato Original, por lo que R&S reconoce que la firma del presente contrato no afectara la trayectoria laboral del Trabajador."),
    createClause("QUINTA. Tipo de contrato.", "Salvo lo dispuesto en la clausula siguiente, la relacion de trabajo sera por tiempo indeterminado, despues del periodo de prueba."),
    createClause("SEXTA. Periodo de prueba.", "No obstante lo dispuesto en la clausula que antecede, las partes establecen un periodo de prueba de 30 (treinta) dias naturales, durante el cual R&S podra dar por rescindida la relacion laboral sin responsabilidad alguna, con el fin de verificar que el Trabajador cumple con los requisitos y conocimientos necesarios para desarrollar el trabajo para el que es contratado. Este periodo de prueba se establece de conformidad con lo senalado en el articulo 39-A de la Ley Federal del Trabajo."),
    createClause("SEPTIMA. Jornada de trabajo.", `La jornada laboral del Trabajador correra de las ${formatTime(fields.workdayStart)} a las ${formatTime(fields.workdayEnd)} horas, de lunes a viernes.`),
    createClause("OCTAVA. Retardos.", "Cada ocasion en la que el Trabajador se presente a sus labores con cinco minutos o mas de retraso respecto a su hora de entrada inicial, o respecto al final de su hora de comida, sera considerada como un retardo. Cada tres retardos seran considerados como una inasistencia."),
    createClause("NOVENA. Inasistencias.", "Los dias durante los cuales el Trabajador se abstenga de presentarse a realizar sus labores seran descontados de su salario. Asimismo, se considerara que el Trabajador incurre en una inasistencia y, por lo tanto, el salario de dicho dia le sera descontado, cuando este asista a sus labores despues de dos horas de retraso respecto a su hora de entrada inicial, o respecto al final de su hora de comida."),
    createClause("DECIMA. Registro de asistencia.", "El Trabajador queda obligado a registrar su asistencia, asi como sus horas de entrada y salida de la fuente de trabajo, mediante el sistema electronico que para dicho efecto sea habilitado por R&S. Salvo lo dispuesto en la clausula siguiente, ningun otro sistema o documento podra acreditar la asistencia o el horario efectivamente laborado por el Trabajador."),
    createClause("DECIMA PRIMERA. Ausencia de la obligacion de registrar asistencia.", "Sin menoscabo de lo previsto en la clausula anterior, el Trabajador quedara eximido de la obligacion de registrar su asistencia en el sistema electronico habilitado por R&S durante los dias en los cuales deba prestar sus servicios fuera de la fuente de trabajo a que se refiere la clausula siguiente, siempre que para ello reciba una orden expresa de R&S que le sea hecha llegar por escrito."),
    createClause("DECIMA SEGUNDA. Lugar de trabajo.", "El Trabajador prestara sus servicios en el domicilio ubicado en calle Yacatas numero 215, colonia Narvarte Poniente, alcaldia Benito Juarez, codigo postal 03020, en la Ciudad de Mexico."),
    createClause("DECIMA TERCERA. Cambio del lugar de trabajo.", "R&S podra cambiar de manera permanente el domicilio de la fuente de trabajo al que se refiere la clausula que precede. Para ello, R&S debera notificar dicha situacion al Trabajador de manera verbal o escrita."),
    createClause("DECIMA CUARTA. Salario.", `R&S se obliga a cubrir al Trabajador como salario bruto mensual la cantidad de ${monthlySalary} M.N. (${monthlySalaryText}).`),
    createClause("DECIMA QUINTA. Forma de pago.", `El salario al que se refiere la clausula anterior sera cubierto al Trabajador en dos pagos iguales por la cantidad de ${biweeklySalary} M.N. (${biweeklySalaryText}) los dias 10 (diez) y 25 (veinticinco) de cada mes.`),
    createListItem("El pago correspondiente al dia 10 (diez) del mes calendario correspondera a la segunda quincena del mes anterior; y"),
    createListItem("El pago correspondiente al dia 25 (veinticinco) del mes calendario correspondera a la primera quincena del mes corriente."),
    createClause("DECIMA SEXTA. Retenciones.", "Del salario a que hace referencia la clausula Decima Quinta, seran retenidas todas las contribuciones que en derecho procedan."),
    createClause("DECIMA SEPTIMA. Causas de despido.", "Seran causas de despido justificado del Trabajador, sin responsabilidad alguna para R&S, las conductas y situaciones detalladas a continuacion, mismas que son enunciadas de manera meramente ilustrativa y no limitativa:"),
    ...[
      "Enganar a R&S con certificados falsos o referencias en los que se le atribuyan al Trabajador capacidades, aptitudes o facultades de las que carezca;",
      "Incurrir durante sus labores en faltas de probidad u honradez, en actos de violencia, amagos, injurias o malos tratamientos en contra de R&S, del personal directivo o administrativo de R&S, o de sus familiares;",
      "Cometer contra alguno de sus companeros cualquiera de los actos enumerados en la fraccion anterior;",
      "Cometer fuera del servicio, contra R&S o su personal directivo o administrativo, o de sus familiares, alguno de los actos a que se refiere la fraccion anterior;",
      "Ocasionar intencionalmente perjuicios materiales durante el desempeno de las labores o con motivo de ellas;",
      "Ocasionar perjuicios graves sin dolo, pero con negligencia tal que ella sea la causa unica del perjuicio;",
      "Comprometer por su imprudencia o descuido inexcusable la seguridad del establecimiento o de las personas que se encuentren en el;",
      "Cometer actos inmorales en el establecimiento o lugar de trabajo;",
      "Revelar secretos de produccion o dar a conocer asuntos de caracter reservado, en perjuicio de R&S;",
      "Tener mas de tres faltas de asistencia en un periodo de treinta dias, sin permiso de R&S o sin causa justificada;",
      "Desobedecer a R&S o a sus representantes, sin causa justificada;",
      "Negarse a adoptar las medidas preventivas o a seguir los procedimientos indicados para evitar accidentes o enfermedades;",
      "Concurrir a sus labores en estado de embriaguez o bajo la influencia de algun narcotico o droga enervante, salvo prescripcion medica;",
      "La sentencia ejecutoriada que imponga al Trabajador una pena de prision que le impida el cumplimiento de la relacion de trabajo;",
      "Las analogas a las establecidas en las fracciones anteriores, de igual manera graves y de consecuencias semejantes en lo que al trabajo se refiere; y",
      "Realizar servicios o actividades de manera independiente que se asimilen a los prestados a R&S."
    ].map((item, index) => createListItem(`${index + 1}. ${item}`)),
    createClause("DECIMA OCTAVA. Renuncia.", "En caso de que el Trabajador desee renunciar, se obliga a avisar con 5 dias habiles de anticipacion. En caso de no cumplir con este periodo se hara acreedor a una pena convencional del 50% sobre el monto de su fondo de ahorro correspondiente."),
    createClause("DECIMA NOVENA. Confidencialidad.", "Toda la informacion tiene el caracter de confidencial, incluyendo de forma enunciativa mas no limitativa cursos, programas, procesos, metodologia, expedientes de clientes, cartera de empresas, documentos, experiencia, tecnologia, datos y demas informacion legal, financiera, contractual y contable de naturaleza confidencial relacionada con las actividades de R&S. El Trabajador se obliga a no conservar, revelar, publicar, ensenar, dar a conocer, transmitir, divulgar o proporcionar dicha informacion a cualquier tercero, por cualquier medio, ni en todo ni en parte, durante o despues de la relacion laboral."),
    createClause("VIGESIMA. Notificaciones.", "Las partes acuerdan que las notificaciones se podran realizar en los domicilios senalados en las declaraciones. Asimismo, seran validas las instrucciones o notificaciones que se realicen a traves de WhatsApp o Telegram, cuyas cuentas esten asociadas al numero senalado por el Trabajador en las declaraciones del presente contrato."),
    createParagraph(`Leido por ambas partes y enteradas del alcance de su contenido, el presente contrato se firma por duplicado en cada una de sus hojas en ${signingCity}, ${signingDate}, quedando un ejemplar en poder de cada uno de los contratantes.`, {
      spacingBefore: 220,
      spacingAfter: 520
    }),
    createSignatureTable(employeeName)
  ];

  const doc = new DocxDocument({
    title: `Contrato laboral - ${employeeName}`,
    creator: "SIGE",
    description: "Contrato individual de trabajo por tiempo indeterminado con periodo de prueba",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11)
            },
            margin: {
              top: convertInchesToTwip(0.8),
              right: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(0.8)
            }
          }
        },
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);

  return {
    buffer: Buffer.from(buffer),
    filename: `contrato-laboral-${sanitizeFilenamePart(employeeName)}-${currentDateKey()}.docx`,
    contentType: DOCX_MIME_TYPE
  };
}
