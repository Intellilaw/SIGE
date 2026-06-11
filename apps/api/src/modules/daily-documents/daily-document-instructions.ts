import { env } from "../../config/env";
import { AppError } from "../../core/errors/app-error";

type DailyDocumentInstructionInput = {
  templateTitle: string;
  additionalInstructions: string;
  values: Record<string, string>;
  document: {
    title: string;
    subtitle?: string;
    paragraphs: string[];
    details?: Array<{ label: string; value: string }>;
  };
};

type ResponsesOutputContent = {
  text?: string;
};

type ResponsesOutput = {
  content?: ResponsesOutputContent[];
};

const DAILY_DOCUMENT_INSTRUCTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    paragraphs: {
      type: "array",
      minItems: 0,
      maxItems: 30,
      items: {
        type: "string",
        maxLength: 12000
      }
    },
    summary: {
      type: "string",
      maxLength: 600
    }
  },
  required: ["paragraphs", "summary"]
} as const;

function normalizeText(value?: unknown) {
  return String(value ?? "").trim();
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

function stripJsonFence(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fencedMatch?.[1] ?? text).trim();
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

async function throwDailyDocumentOpenAiResponseError(response: Response) {
  const openAiError = await readOpenAiError(response);
  const providerMessage = openAiError?.message ? ` OpenAI respondio: ${openAiError.message}` : "";

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      502,
      "DAILY_DOCUMENT_RI_OPENAI_AUTH_FAILED",
      `OpenAI rechazo la credencial configurada. Revisa OPENAI_API_KEY.${providerMessage}`
    );
  }

  if (response.status === 400 || response.status === 404) {
    throw new AppError(
      502,
      "DAILY_DOCUMENT_RI_OPENAI_REQUEST_FAILED",
      `OpenAI no acepto la configuracion de Rusconi Intelligence. Revisa OPENAI_RUSCONI_INTELLIGENCE_MODEL y OPENAI_BASE_URL.${providerMessage}`
    );
  }

  if (response.status === 429) {
    throw new AppError(
      502,
      "DAILY_DOCUMENT_RI_OPENAI_RATE_LIMITED",
      `OpenAI limito la solicitud o la cuenta no tiene cuota disponible.${providerMessage}`
    );
  }

  throw new AppError(
    502,
    "DAILY_DOCUMENT_RI_OPENAI_FAILED",
    `Rusconi Intelligence no pudo aplicar las indicaciones al documento.${providerMessage}`
  );
}

function parseInstructionResponse(text: string, fallbackParagraphs: string[]) {
  try {
    const parsed = JSON.parse(stripJsonFence(text)) as {
      paragraphs?: unknown;
      summary?: unknown;
    };
    const paragraphs = Array.isArray(parsed.paragraphs)
      ? parsed.paragraphs.map(normalizeText).filter(Boolean)
      : fallbackParagraphs;

    return {
      paragraphs,
      summary: normalizeText(parsed.summary)
    };
  } catch {
    throw new AppError(
      502,
      "DAILY_DOCUMENT_RI_INVALID_RESPONSE",
      "Rusconi Intelligence no devolvio un ajuste valido para el documento."
    );
  }
}

export async function applyDailyDocumentInstructions(input: DailyDocumentInstructionInput) {
  const additionalInstructions = normalizeText(input.additionalInstructions);

  if (!additionalInstructions) {
    throw new AppError(
      400,
      "DAILY_DOCUMENT_RI_INSTRUCTIONS_REQUIRED",
      "Captura indicaciones adicionales antes de aplicar Rusconi Intelligence."
    );
  }

  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "DAILY_DOCUMENT_RI_NOT_CONFIGURED",
      "Rusconi Intelligence no esta conectado a OpenAI. Falta configurar OPENAI_API_KEY en el runtime de la API."
    );
  }

  const baseParagraphs = input.document.paragraphs.map(normalizeText).filter(Boolean);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OPENAI_RUSCONI_INTELLIGENCE_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_RUSCONI_INTELLIGENCE_MODEL,
        max_output_tokens: 2200,
        text: {
          format: {
            type: "json_schema",
            name: "daily_document_instruction_adjustment",
            strict: true,
            schema: DAILY_DOCUMENT_INSTRUCTION_JSON_SCHEMA
          }
        },
        input: [
          {
            role: "system",
            content:
              "Eres Rusconi Intelligence dentro de SIGE. Eres un abogado mexicano senior. Ajusta unicamente los parrafos/texto editable de formatos de uso diario con base en indicaciones del usuario. No modifiques tablas, firmas, datos estructurados, nombres de campos ni valores capturados. No inventes hechos. Si la indicacion no amerita cambios juridicos o textuales, devuelve los parrafos originales. Responde solo JSON valido."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  `Plantilla: ${input.templateTitle}`,
                  "",
                  "Documento base:",
                  JSON.stringify(input.document, null, 2),
                  "",
                  "Valores capturados en el formulario:",
                  JSON.stringify(input.values, null, 2),
                  "",
                  "Indicaciones adicionales del usuario:",
                  additionalInstructions,
                  "",
                  "Devuelve JSON con paragraphs como arreglo final de parrafos listos para sustituir los parrafos del documento. Conserva el idioma espanol, el tono legal mexicano y los placeholders existentes cuando falten datos. No devuelvas explicaciones fuera del JSON."
                ].join("\n")
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      await throwDailyDocumentOpenAiResponseError(response);
    }

    const responseText = extractResponsesText(await response.json() as unknown);
    if (!responseText) {
      throw new AppError(502, "DAILY_DOCUMENT_RI_EMPTY", "Rusconi Intelligence no genero contenido.");
    }

    const parsed = parseInstructionResponse(responseText, baseParagraphs);
    return {
      paragraphs: parsed.paragraphs,
      summary: parsed.summary || "Indicaciones aplicadas por Rusconi Intelligence."
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "DAILY_DOCUMENT_RI_TIMEOUT", "Rusconi Intelligence tardo demasiado en responder.");
    }

    throw new AppError(502, "DAILY_DOCUMENT_RI_FAILED", "No se pudieron aplicar las indicaciones al documento.");
  } finally {
    clearTimeout(timeout);
  }
}
