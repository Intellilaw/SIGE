import { createHash } from "node:crypto";

import type { BulletinBlock, BulletinDraftInput } from "@sige/contracts";

import { env } from "../../config/env";
import { AppError } from "../../core/errors/app-error";
import type { BulletinAttachmentWriteRecord } from "../../repositories/types";
import { getCurrentMexicoDate } from "./bulletin-date";

type ResponsesOutputContent = {
  text?: string;
};

type ResponsesOutput = {
  content?: ResponsesOutputContent[];
};

export interface BulletinGenerationRequest {
  sourceText?: string | null;
  sourceUrls?: string[];
  attachments?: BulletinAttachmentWriteRecord[];
  organizationId: string;
  userId: string;
}

const BULLETIN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    titleEs: { type: "string", minLength: 1, maxLength: 180 },
    titleEn: { type: "string", minLength: 1, maxLength: 180 },
    pageCount: { type: "integer", enum: [1, 2] },
    twoPageReason: { type: "string", maxLength: 300 },
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          headingEs: { type: "string", maxLength: 120 },
          headingEn: { type: "string", maxLength: 120 },
          bodyEs: { type: "string", minLength: 1, maxLength: 2200 },
          bodyEn: { type: "string", minLength: 1, maxLength: 2200 }
        },
        required: ["headingEs", "headingEn", "bodyEs", "bodyEn"]
      }
    }
  },
  required: ["titleEs", "titleEn", "pageCount", "twoPageReason", "blocks"]
} as const;

function normalizeText(value?: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function stripJsonFence(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fencedMatch?.[1] ?? text).trim();
}

function extractResponsesText(payload: unknown) {
  const response = payload as {
    output_text?: unknown;
    output?: ResponsesOutput[];
  };

  if (typeof response.output_text === "string") {
    return response.output_text.trim();
  }

  return (response.output ?? [])
    .flatMap((entry) => entry.content ?? [])
    .map((entry) => (typeof entry.text === "string" ? entry.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stripEmoji(value: string) {
  return value.replace(
    /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,
    ""
  );
}

function sanitizeGeneratedText(value: unknown) {
  return stripEmoji(normalizeText(value))
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isSourceHeading(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.includes("fuente") || normalized.includes("source") || normalized.includes("referencia");
}

function parseBulletinResponse(text: string): Omit<BulletinDraftInput, "bulletinDate"> {
  try {
    const parsed = JSON.parse(stripJsonFence(text)) as {
      titleEs?: unknown;
      titleEn?: unknown;
      pageCount?: unknown;
      twoPageReason?: unknown;
      blocks?: unknown;
    };

    const blocks: BulletinBlock[] = Array.isArray(parsed.blocks)
      ? parsed.blocks
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .map((entry, index) => ({
            id: `block-${index + 1}`,
            headingEs: sanitizeGeneratedText(entry.headingEs),
            headingEn: sanitizeGeneratedText(entry.headingEn),
            bodyEs: sanitizeGeneratedText(entry.bodyEs),
            bodyEn: sanitizeGeneratedText(entry.bodyEn)
          }))
          .filter((entry) =>
            entry.bodyEs
            && entry.bodyEn
            && !isSourceHeading(entry.headingEs)
            && !isSourceHeading(entry.headingEn)
          )
      : [];

    const titleEs = sanitizeGeneratedText(parsed.titleEs);
    const titleEn = sanitizeGeneratedText(parsed.titleEn);
    const pageCount = parsed.pageCount === 2 ? 2 : 1;
    const twoPageReason = pageCount === 2 ? sanitizeGeneratedText(parsed.twoPageReason) : "";

    if (!titleEs || !titleEn || blocks.length === 0) {
      throw new Error("Incomplete bulletin response.");
    }

    return {
      titleEs,
      titleEn,
      pageCount,
      twoPageReason,
      blocks
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      502,
      "BULLETIN_OPENAI_INVALID_RESPONSE",
      "OpenAI no devolvio un borrador bilingue valido."
    );
  }
}

function inferMimeType(attachment: BulletinAttachmentWriteRecord) {
  const provided = normalizeText(attachment.fileMimeType).toLowerCase();
  if (provided && provided !== "application/octet-stream") {
    return provided;
  }

  const filename = attachment.originalFileName.toLowerCase();
  if (filename.endsWith(".pdf")) return "application/pdf";
  if (filename.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (filename.endsWith(".txt")) return "text/plain";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function buildAttachmentContent(attachments: BulletinAttachmentWriteRecord[]): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];

  for (const attachment of attachments) {
    const mimeType = inferMimeType(attachment);
    const dataUrl = `data:${mimeType};base64,${attachment.fileContent.toString("base64")}`;
    const label: Record<string, unknown> = {
      type: "input_text",
      text: `Adjunto proporcionado por el usuario: ${attachment.originalFileName}`
    };

    content.push(label);
    if (mimeType === "image/jpeg" || mimeType === "image/png") {
      content.push({
        type: "input_image",
        image_url: dataUrl,
        detail: "high"
      });
      continue;
    }

    content.push({
      type: "input_file",
      filename: attachment.originalFileName,
      file_data: dataUrl
    });
  }

  return content;
}

async function readOpenAiError(response: Response) {
  const rawBody = await response.text();
  try {
    const payload = JSON.parse(rawBody) as { error?: { message?: string } };
    return payload.error?.message;
  } catch {
    return undefined;
  }
}

async function throwOpenAiResponseError(response: Response) {
  const providerMessage = await readOpenAiError(response);
  const detail = providerMessage ? ` OpenAI respondio: ${providerMessage}` : "";

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      502,
      "BULLETIN_OPENAI_AUTH_FAILED",
      `OpenAI rechazo la credencial configurada. Revisa OPENAI_API_KEY.${detail}`
    );
  }

  if (response.status === 400 || response.status === 404) {
    throw new AppError(
      502,
      "BULLETIN_OPENAI_REQUEST_FAILED",
      `OpenAI no acepto la configuracion de boletines. Revisa OPENAI_BULLETIN_MODEL y OPENAI_BASE_URL.${detail}`
    );
  }

  if (response.status === 429) {
    throw new AppError(
      502,
      "BULLETIN_OPENAI_RATE_LIMITED",
      `OpenAI limito la solicitud o la cuenta no tiene cuota disponible.${detail}`
    );
  }

  throw new AppError(
    502,
    "BULLETIN_OPENAI_FAILED",
    `OpenAI no pudo generar el boletin.${detail}`
  );
}

export async function generateBulletinDraft(input: BulletinGenerationRequest): Promise<BulletinDraftInput> {
  const sourceText = normalizeText(input.sourceText);
  const sourceUrls = (input.sourceUrls ?? []).map(normalizeText).filter(Boolean);
  const attachments = input.attachments ?? [];

  if (!sourceText && sourceUrls.length === 0 && attachments.length === 0) {
    throw new AppError(
      400,
      "BULLETIN_INPUT_REQUIRED",
      "Proporciona texto, al menos una URL o un archivo para generar el boletin."
    );
  }

  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "BULLETIN_OPENAI_NOT_CONFIGURED",
      "La generacion de boletines no esta conectada a OpenAI. Falta configurar OPENAI_API_KEY."
    );
  }

  const today = getCurrentMexicoDate();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OPENAI_BULLETIN_TIMEOUT_MS);
  const safetyIdentifier = createHash("sha256")
    .update(`${input.organizationId}:${input.userId}`)
    .digest("hex");

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: [
        `Fecha actual: ${today}.`,
        "",
        "Informacion e instrucciones del usuario:",
        sourceText || "(Sin texto adicional)",
        "",
        "URLs proporcionadas:",
        sourceUrls.length ? sourceUrls.join("\n") : "(Sin URLs)",
        "",
        "Genera el borrador bilingue solicitado. Investiga en internet cuando la informacion sea reciente, cambiante, juridica o dependa de una publicacion oficial. Verifica fechas, entrada en vigor, alcance y efectos practicos antes de redactar."
      ].join("\n")
    },
    ...buildAttachmentContent(attachments)
  ];

  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_BULLETIN_MODEL,
        safety_identifier: safetyIdentifier,
        store: false,
        reasoning: { effort: "medium" },
        tools: [
          {
            type: "web_search",
            search_context_size: "medium",
            user_location: {
              type: "approximate",
              country: "MX",
              city: "Mexico City",
              region: "Ciudad de Mexico"
            }
          }
        ],
        tool_choice: "auto",
        max_output_tokens: 3200,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "rusconi_client_bulletin",
            strict: true,
            schema: BULLETIN_JSON_SCHEMA
          }
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "Eres el editor senior de boletines para clientes de Rusconi Consulting, un despacho premium en Mexico.",
                  "Redacta para personas que no son abogadas: explica lo importante con precision, elegancia y utilidad practica.",
                  "Ve al punto. No uses saludos, introducciones genericas, muletillas, chistes, tono informal, emojis ni lenguaje promocional.",
                  "No incluyas fuentes, citas, URLs, notas al pie, bibliografia ni una seccion de referencias en el contenido final.",
                  "La investigacion debe priorizar fuentes oficiales: DOF, gacetas oficiales, congresos, tribunales, autoridades regulatorias y comunicados institucionales.",
                  "No inventes hechos. Cuando la evidencia sea insuficiente, formula el alcance con prudencia sin trasladar la incertidumbre al lector como choro.",
                  "El espanol y el ingles deben comunicar exactamente la misma sustancia, con ingles profesional natural y no una traduccion literal torpe.",
                  "Organiza el contenido en uno a cuatro bloques alineados. Cada bloque puede tener un encabezado corto y debe explicar que ocurrio, por que importa y, cuando proceda, que conviene hacer.",
                  "La regla es una sola pagina: apunta a 130-220 palabras por idioma. Usa dos paginas solo si la complejidad lo justifica; en ese caso limita cada idioma a 260-450 palabras y explica la razon en twoPageReason.",
                  "La firma Rusconi Consulting se agrega durante la exportacion; no la repitas en los bloques.",
                  "Devuelve exclusivamente el JSON solicitado."
                ].join("\n")
              }
            ]
          },
          {
            role: "user",
            content: userContent
          }
        ]
      })
    });

    if (!response.ok) {
      await throwOpenAiResponseError(response);
    }

    const responseText = extractResponsesText(await response.json() as unknown);
    if (!responseText) {
      throw new AppError(502, "BULLETIN_OPENAI_EMPTY", "OpenAI no genero contenido para el boletin.");
    }

    const draft = parseBulletinResponse(responseText);
    return {
      bulletinDate: today,
      ...draft
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "BULLETIN_OPENAI_TIMEOUT", "OpenAI tardo demasiado en investigar y redactar el boletin.");
    }

    throw new AppError(502, "BULLETIN_OPENAI_FAILED", "No se pudo generar el boletin con OpenAI.");
  } finally {
    clearTimeout(timeout);
  }
}
