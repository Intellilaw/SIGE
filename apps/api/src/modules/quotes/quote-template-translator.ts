import { z } from "zod";

import type { QuoteTemplate } from "@sige/contracts";

import { env } from "../../config/env";
import { AppError } from "../../core/errors/app-error";

type TranslationPayload = {
  name: string;
  subject: string;
  services: string;
  milestone: string;
  notes: string;
  amountColumns: Array<{
    id: string;
    title: string;
  }>;
  tableRows: Array<{
    id: string;
    conceptDescription: string;
    amountCells: Array<{
      value: string;
    }>;
    paymentMoment: {
      value: string;
    };
    notesCell: {
      value: string;
    };
  }>;
  lineItems: Array<{
    concept: string;
  }>;
};

const translationPayloadSchema = z.object({
  name: z.string(),
  subject: z.string(),
  services: z.string(),
  milestone: z.string(),
  notes: z.string(),
  amountColumns: z.array(z.object({
    id: z.string(),
    title: z.string()
  })),
  tableRows: z.array(z.object({
    id: z.string(),
    conceptDescription: z.string(),
    amountCells: z.array(z.object({
      value: z.string()
    })),
    paymentMoment: z.object({
      value: z.string()
    }),
    notesCell: z.object({
      value: z.string()
    })
  })),
  lineItems: z.array(z.object({
    concept: z.string()
  }))
});

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function buildTranslationPayload(template: QuoteTemplate): TranslationPayload {
  return {
    name: normalizeText(template.name),
    subject: normalizeText(template.subject),
    services: normalizeText(template.services),
    milestone: normalizeText(template.milestone),
    notes: normalizeText(template.notes),
    amountColumns: template.amountColumns.map((column) => ({
      id: column.id,
      title: normalizeText(column.title)
    })),
    tableRows: template.tableRows.map((row) => ({
      id: row.id,
      conceptDescription: normalizeText(row.conceptDescription),
      amountCells: row.amountCells.map((cell) => ({
        value: normalizeText(cell.value)
      })),
      paymentMoment: {
        value: normalizeText(row.paymentMoment.value)
      },
      notesCell: {
        value: normalizeText(row.notesCell.value)
      }
    })),
    lineItems: template.lineItems.map((item) => ({
      concept: normalizeText(item.concept)
    }))
  };
}

function assertSameShape(original: TranslationPayload, translated: TranslationPayload) {
  if (
    original.amountColumns.length !== translated.amountColumns.length ||
    original.tableRows.length !== translated.tableRows.length ||
    original.lineItems.length !== translated.lineItems.length
  ) {
    throw new AppError(502, "QUOTE_TEMPLATE_TRANSLATION_INVALID", "La plantilla no pudo ser traducida.");
  }

  original.amountColumns.forEach((column, index) => {
    if (translated.amountColumns[index]?.id !== column.id) {
      throw new AppError(502, "QUOTE_TEMPLATE_TRANSLATION_INVALID", "La plantilla no pudo ser traducida.");
    }
  });

  original.tableRows.forEach((row, rowIndex) => {
    const translatedRow = translated.tableRows[rowIndex];
    if (!translatedRow || translatedRow.id !== row.id || translatedRow.amountCells.length !== row.amountCells.length) {
      throw new AppError(502, "QUOTE_TEMPLATE_TRANSLATION_INVALID", "La plantilla no pudo ser traducida.");
    }
  });
}

function pickTranslatedText(value: string | undefined, fallback: string) {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function applyTranslation(template: QuoteTemplate, translated: TranslationPayload): QuoteTemplate {
  return {
    ...template,
    name: pickTranslatedText(translated.name, template.name),
    subject: pickTranslatedText(translated.subject, template.subject),
    services: pickTranslatedText(translated.services, template.services),
    milestone: pickTranslatedText(translated.milestone, template.milestone ?? ""),
    notes: pickTranslatedText(translated.notes, template.notes ?? ""),
    amountColumns: template.amountColumns.map((column, index) => ({
      ...column,
      title: pickTranslatedText(translated.amountColumns[index]?.title, column.title)
    })),
    tableRows: template.tableRows.map((row, rowIndex) => {
      const translatedRow = translated.tableRows[rowIndex];

      return {
        ...row,
        conceptDescription: pickTranslatedText(translatedRow?.conceptDescription, row.conceptDescription),
        amountCells: row.amountCells.map((cell, cellIndex) => ({
          ...cell,
          value: pickTranslatedText(translatedRow?.amountCells[cellIndex]?.value, cell.value)
        })),
        paymentMoment: {
          ...row.paymentMoment,
          value: pickTranslatedText(translatedRow?.paymentMoment.value, row.paymentMoment.value)
        },
        notesCell: {
          ...row.notesCell,
          value: pickTranslatedText(translatedRow?.notesCell.value, row.notesCell.value)
        }
      };
    }),
    lineItems: template.lineItems.map((item, index) => ({
      ...item,
      concept: pickTranslatedText(translated.lineItems[index]?.concept, item.concept)
    }))
  };
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractChatCompletionText(payload: unknown) {
  const content = (payload as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  }).choices?.[0]?.message?.content;

  return typeof content === "string" ? content : "";
}

async function readOpenAiError(response: Response) {
  const rawBody = await response.text();

  try {
    const payload = JSON.parse(rawBody) as {
      error?: {
        message?: string;
        type?: string;
        code?: string;
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
      "QUOTE_TRANSLATION_OPENAI_AUTH_FAILED",
      `OpenAI rechazo la credencial configurada. Revisa OPENAI_API_KEY.${providerMessage}`
    );
  }

  if (response.status === 400 || response.status === 404) {
    throw new AppError(
      502,
      "QUOTE_TRANSLATION_OPENAI_REQUEST_FAILED",
      `OpenAI no acepto la configuracion de traduccion. Revisa OPENAI_QUOTE_TRANSLATION_MODEL y OPENAI_BASE_URL.${providerMessage}`
    );
  }

  if (response.status === 429) {
    throw new AppError(
      502,
      "QUOTE_TRANSLATION_OPENAI_RATE_LIMITED",
      `OpenAI limito la solicitud o la cuenta no tiene cuota disponible.${providerMessage}`
    );
  }

  throw new AppError(
    502,
    "QUOTE_TEMPLATE_TRANSLATION_FAILED",
    `La plantilla no pudo ser traducida por OpenAI.${providerMessage}`
  );
}

async function requestLlmTranslation(payload: TranslationPayload) {
  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "QUOTE_TRANSLATION_NOT_CONFIGURED",
      "La traduccion de plantillas no esta conectada a OpenAI. Falta configurar OPENAI_API_KEY en el runtime de la API."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OPENAI_QUOTE_TRANSLATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_QUOTE_TRANSLATION_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior legal translator for a Mexican law firm. Translate Spanish quotation template text into polished, professional English for client-facing legal fee proposals. Return only valid JSON. Preserve the JSON shape, array lengths, ids, numbers, currency amounts, percentages, MXN, blank strings, and placeholders. Do not add explanations."
          },
          {
            role: "user",
            content:
              "Translate only the human-written text values in this JSON from Spanish to English. Keep ids unchanged. Keep monetary values, numbers, percentages, dates, and already-English text unchanged.\n\n" +
              JSON.stringify(payload)
          }
        ]
      })
    });

    if (!response.ok) {
      await throwOpenAiResponseError(response);
    }

    const rawResponse = await response.json() as unknown;
    const content = extractChatCompletionText(rawResponse);
    if (!content) {
      throw new AppError(502, "QUOTE_TEMPLATE_TRANSLATION_EMPTY", "La plantilla no pudo ser traducida.");
    }

    return translationPayloadSchema.parse(JSON.parse(stripJsonFence(content)));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(
        504,
        "QUOTE_TRANSLATION_OPENAI_TIMEOUT",
        "OpenAI tardo demasiado en responder. Revisa OPENAI_QUOTE_TRANSLATION_TIMEOUT_MS o intenta nuevamente."
      );
    }

    throw new AppError(502, "QUOTE_TEMPLATE_TRANSLATION_FAILED", "La plantilla no pudo ser traducida.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function translateQuoteTemplateWithLlm(template: QuoteTemplate) {
  const originalPayload = buildTranslationPayload(template);
  const translatedPayload = await requestLlmTranslation(originalPayload);
  assertSameShape(originalPayload, translatedPayload);

  return applyTranslation(template, translatedPayload);
}
