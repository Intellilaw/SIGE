import { Buffer } from "node:buffer";

import JSZip from "jszip";
import { z } from "zod";
import type { ExternalContractPrefillFields, ExternalContractPrefillResult } from "@sige/contracts";

import { env } from "../../config/env";
import { AppError } from "../../core/errors/app-error";

const MAX_PREFILL_FILE_BYTES = 12 * 1024 * 1024;
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const externalContractFieldNames = [
  "title",
  "propertyAddress",
  "landlordName",
  "tenantName",
  "leaseStartDate",
  "leaseEndDate",
  "renewalDate",
  "rentIncreaseDate",
  "monthlyRentMxn",
  "rentIncreasePct"
] as const satisfies ReadonlyArray<keyof ExternalContractPrefillFields>;

const emptyPrefillFields: ExternalContractPrefillFields = {
  title: "",
  propertyAddress: "",
  landlordName: "",
  tenantName: "",
  leaseStartDate: "",
  leaseEndDate: "",
  renewalDate: "",
  rentIncreaseDate: "",
  monthlyRentMxn: "",
  rentIncreasePct: ""
};

const fieldLabels: Record<keyof ExternalContractPrefillFields, string> = {
  title: "Nombre del contrato",
  propertyAddress: "Inmueble",
  landlordName: "Arrendador",
  tenantName: "Arrendatario",
  leaseStartDate: "Inicio de vigencia",
  leaseEndDate: "Fin de vigencia",
  renewalDate: "Fecha de renovacion",
  rentIncreaseDate: "Fecha de aumento de renta",
  monthlyRentMxn: "Renta mensual",
  rentIncreasePct: "% aumento"
};

const prefillSchema = z.object({
  fields: z.object({
    title: z.string(),
    propertyAddress: z.string(),
    landlordName: z.string(),
    tenantName: z.string(),
    leaseStartDate: z.string(),
    leaseEndDate: z.string(),
    renewalDate: z.string(),
    rentIncreaseDate: z.string(),
    monthlyRentMxn: z.string(),
    rentIncreasePct: z.string()
  }),
  notes: z.array(z.string())
});

const stringFieldSchema = { type: "string" };
const EXTERNAL_CONTRACT_PREFILL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(externalContractFieldNames.map((field) => [field, stringFieldSchema])),
      required: externalContractFieldNames
    },
    notes: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["fields", "notes"]
};

export interface ExternalContractPrefillInput {
  originalFileName: string;
  fileMimeType?: string | null;
  fileContent: Buffer;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
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
      "EXTERNAL_CONTRACT_OPENAI_AUTH_FAILED",
      `OpenAI rechazo la credencial configurada. Revisa OPENAI_API_KEY.${providerMessage}`
    );
  }

  if (response.status === 400 || response.status === 404) {
    throw new AppError(
      502,
      "EXTERNAL_CONTRACT_OPENAI_REQUEST_FAILED",
      `OpenAI no acepto la configuracion para contratos externos. Revisa OPENAI_EXTERNAL_CONTRACT_MODEL y OPENAI_BASE_URL.${providerMessage}`
    );
  }

  if (response.status === 429) {
    throw new AppError(
      502,
      "EXTERNAL_CONTRACT_OPENAI_RATE_LIMITED",
      `OpenAI limito la solicitud o la cuenta no tiene cuota disponible.${providerMessage}`
    );
  }

  throw new AppError(
    502,
    "EXTERNAL_CONTRACT_PREFILL_FAILED",
    `No se pudo prellenar el contrato externo con OpenAI.${providerMessage}`
  );
}

function inferMimeType(input: ExternalContractPrefillInput) {
  const configuredMimeType = normalizeText(input.fileMimeType).toLowerCase();
  const filename = input.originalFileName.toLowerCase();

  if (configuredMimeType) {
    return configuredMimeType;
  }

  if (filename.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (filename.endsWith(".docx")) {
    return DOCX_MIME_TYPE;
  }

  if (filename.endsWith(".doc")) {
    return "application/msword";
  }

  return "application/octet-stream";
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractWordXmlText(xml: string) {
  return decodeXmlEntities(xml)
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(content: Buffer) {
  const zip = await JSZip.loadAsync(content);
  const textParts: string[] = [];
  const xmlFileNames = Object.keys(zip.files).filter((name) =>
    name === "word/document.xml" || /^word\/(?:header|footer)\d+\.xml$/.test(name)
  );

  for (const fileName of xmlFileNames) {
    const file = zip.file(fileName);
    if (!file) {
      continue;
    }

    const xml = await file.async("string");
    const text = extractWordXmlText(xml);
    if (text) {
      textParts.push(text);
    }
  }

  return textParts.join("\n\n").trim();
}

function normalizePrefillFields(fields: ExternalContractPrefillFields): ExternalContractPrefillFields {
  return {
    title: normalizeText(fields.title),
    propertyAddress: normalizeText(fields.propertyAddress),
    landlordName: normalizeText(fields.landlordName),
    tenantName: normalizeText(fields.tenantName),
    leaseStartDate: normalizeDate(fields.leaseStartDate),
    leaseEndDate: normalizeDate(fields.leaseEndDate),
    renewalDate: normalizeDate(fields.renewalDate),
    rentIncreaseDate: normalizeDate(fields.rentIncreaseDate),
    monthlyRentMxn: normalizeNumberText(fields.monthlyRentMxn),
    rentIncreasePct: normalizeNumberText(fields.rentIncreasePct)
  };
}

function normalizeDate(value?: string | null) {
  const normalized = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeNumberText(value?: string | null) {
  const normalized = normalizeText(value).replace(/,/g, "");
  const parsed = Number(normalized.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

async function buildDocumentContent(input: ExternalContractPrefillInput) {
  const mimeType = inferMimeType(input);

  if (input.fileContent.byteLength > MAX_PREFILL_FILE_BYTES) {
    throw new AppError(400, "EXTERNAL_CONTRACT_PREFILL_FILE_TOO_LARGE", "El archivo es demasiado grande para leerlo con IA.");
  }

  if (mimeType === "application/pdf") {
    return {
      content: [{
        type: "input_file",
        filename: input.originalFileName,
        file_data: `data:${mimeType};base64,${input.fileContent.toString("base64")}`
      }],
      notes: [] as string[]
    };
  }

  if (mimeType === DOCX_MIME_TYPE || input.originalFileName.toLowerCase().endsWith(".docx")) {
    const text = await extractDocxText(input.fileContent);
    if (!text) {
      throw new AppError(400, "EXTERNAL_CONTRACT_PREFILL_DOCX_EMPTY", "No se pudo leer texto del archivo DOCX.");
    }

    return {
      content: [{
        type: "input_text",
        text: `Texto extraido del archivo DOCX ${input.originalFileName}:\n\n${text.slice(0, 60000)}`
      }],
      notes: text.length > 60000 ? ["El DOCX se recorto para mantener la solicitud dentro del limite de tamano."] : []
    };
  }

  throw new AppError(400, "EXTERNAL_CONTRACT_PREFILL_UNSUPPORTED_FILE", "La extraccion con IA acepta PDF o DOCX.");
}

export async function prefillExternalContractFields(input: ExternalContractPrefillInput): Promise<ExternalContractPrefillResult> {
  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "EXTERNAL_CONTRACT_OPENAI_NOT_CONFIGURED",
      "La extraccion de contratos externos no esta conectada a OpenAI. Falta configurar OPENAI_API_KEY en el runtime de la API."
    );
  }

  const { content, notes } = await buildDocumentContent(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OPENAI_EXTERNAL_CONTRACT_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_EXTERNAL_CONTRACT_MODEL,
        temperature: 0,
        max_output_tokens: 1400,
        text: {
          format: {
            type: "json_schema",
            name: "external_contract_prefill",
            strict: true,
            schema: EXTERNAL_CONTRACT_PREFILL_JSON_SCHEMA
          }
        },
        input: [
          {
            role: "system",
            content:
              "Eres un asistente juridico mexicano especializado en contratos de arrendamiento. Extrae datos del rubro, caratula, encabezado y clausulas del contrato. Devuelve solamente JSON valido. No inventes datos: usa cadena vacia cuando no tengas evidencia clara."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Extrae los campos para prellenar un formulario de administracion de contratos externos. " +
                  "Usa fechas en formato YYYY-MM-DD. Usa monthlyRentMxn como numero sin simbolo de moneda. Usa rentIncreasePct como porcentaje, por ejemplo 10 para diez por ciento. " +
                  "Para renewalDate usa la fecha de terminacion o renovacion del contrato si no hay fecha de aviso separada. " +
                  "Para rentIncreaseDate usa la primera fecha de aumento de renta si aparece expresamente o puede inferirse de una regla anual clara. " +
                  "No incluyas explicaciones fuera del JSON.\n\n" +
                  JSON.stringify({ fields: fieldLabels, originalFileName: input.originalFileName })
              },
              ...content
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      await throwOpenAiResponseError(response);
    }

    const rawResponse = await response.json() as unknown;
    const responseText = extractResponsesText(rawResponse);
    if (!responseText) {
      throw new AppError(502, "EXTERNAL_CONTRACT_PREFILL_EMPTY", "OpenAI no devolvio datos para el contrato externo.");
    }

    const parsed = prefillSchema.parse(JSON.parse(stripJsonFence(responseText)));
    return {
      fields: normalizePrefillFields({ ...emptyPrefillFields, ...parsed.fields }),
      notes: [...notes, ...parsed.notes.map(normalizeText).filter(Boolean)]
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(
        504,
        "EXTERNAL_CONTRACT_OPENAI_TIMEOUT",
        "OpenAI tardo demasiado en leer el contrato externo. Revisa OPENAI_EXTERNAL_CONTRACT_TIMEOUT_MS o intenta nuevamente."
      );
    }

    throw new AppError(502, "EXTERNAL_CONTRACT_PREFILL_FAILED", "No se pudo prellenar el contrato externo.");
  } finally {
    clearTimeout(timeout);
  }
}
