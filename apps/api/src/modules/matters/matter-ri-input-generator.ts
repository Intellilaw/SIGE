import { findRusconiIntelligenceConnection, type Matter } from "@sige/contracts";

import { env } from "../../config/env";
import { AppError } from "../../core/errors/app-error";
import { getTelegramGroupIdCandidates } from "./telegram-group-name-resolver";

export type RiMatterTaskContext = {
  source: string;
  subject: string;
  responsible?: string | null;
  dueDate?: string | null;
  status?: string | null;
};

type BotGroupPayload = {
  found?: boolean;
  source?: unknown;
  chat_id?: unknown;
  chat_title?: unknown;
  chatTitle?: unknown;
  title?: unknown;
  chat_type?: unknown;
  last_seen_at?: unknown;
  summary?: unknown;
  context?: unknown;
  text?: unknown;
  messages?: unknown;
  recent_messages?: unknown;
  items?: unknown;
};

type TelegramContext = {
  groupId: string;
  groupName?: string | null;
  source?: string | null;
  lastSeenAt?: string | null;
  text: string;
  hasOperationalContext: boolean;
};

const RI_001_CONNECTION_ID = "RI-001";
const RI_004_CONNECTION_ID = "RI-004";
const CADUCIDAD_NOT_APPLICABLE_TEXT = "En este procedimiento no opera la caducidad";
const MAX_TELEGRAM_CONTEXT_CHARS = 12000;
const MAX_RI_INPUT_CHARS = 900;
const MAX_RI_EXPIRATION_OUTPUT_CHARS = 240;
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RI_EXPIRATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["date", "not_applicable", "missing_context"]
    },
    expirationDate: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}$"
    },
    message: {
      type: ["string", "null"],
      maxLength: MAX_RI_EXPIRATION_OUTPUT_CHARS
    }
  },
  required: ["status", "expirationDate", "message"]
} as const;

function normalizeText(value?: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function getBotHeaders() {
  return env.INTELLILAW_BOT_API_KEY
    ? { "X-SIGE-Integration-Key": env.INTELLILAW_BOT_API_KEY }
    : undefined;
}

function titleFromPayload(payload: BotGroupPayload | null) {
  return normalizeText(payload?.chat_title) ||
    normalizeText(payload?.chatTitle) ||
    normalizeText(payload?.title) ||
    null;
}

function stringifyMessage(message: unknown) {
  if (typeof message === "string") {
    return normalizeText(message);
  }

  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return "";
  }

  const record = message as Record<string, unknown>;
  const timestamp = normalizeText(record.timestamp ?? record.created_at ?? record.date);
  const author = normalizeText(record.author ?? record.sender ?? record.username ?? record.user_name ?? record.role);
  const text = normalizeText(record.text ?? record.content ?? record.message ?? record.body);
  const parts = [timestamp, author].filter(Boolean).join(" | ");

  return text ? `${parts ? `${parts}: ` : ""}${text}` : "";
}

function extractContextText(payload: BotGroupPayload | null) {
  if (!payload) {
    return "";
  }

  const directContext =
    normalizeText(payload.context) ||
    normalizeText(payload.summary) ||
    normalizeText(payload.text);
  if (directContext) {
    return directContext;
  }

  const messageSource = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.recent_messages)
      ? payload.recent_messages
      : Array.isArray(payload.items)
        ? payload.items
        : [];

  return messageSource
    .map(stringifyMessage)
    .filter(Boolean)
    .slice(-40)
    .join("\n");
}

async function fetchBotJson(path: string) {
  const baseUrl = normalizeText(env.INTELLILAW_BOT_API_URL);
  if (!baseUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.TELEGRAM_GROUP_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      headers: getBotHeaders(),
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<BotGroupPayload>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTelegramContext(groupId: string, groupName?: string | null): Promise<TelegramContext> {
  const candidates = getTelegramGroupIdCandidates(groupId);

  for (const candidate of candidates) {
    const encodedCandidate = encodeURIComponent(candidate);
    const payload =
      await fetchBotJson(`/telegram/groups/${encodedCandidate}/context`) ??
      await fetchBotJson(`/telegram/groups/${encodedCandidate}/messages`) ??
      await fetchBotJson(`/telegram/groups/${encodedCandidate}/history`);
    const text = truncate(extractContextText(payload), MAX_TELEGRAM_CONTEXT_CHARS);
    if (text) {
      return {
        groupId: candidate,
        groupName: titleFromPayload(payload) ?? groupName,
        source: normalizeText(payload?.source) || "telegram-context",
        lastSeenAt: normalizeText(payload?.last_seen_at) || null,
        text,
        hasOperationalContext: true
      };
    }
  }

  for (const candidate of candidates) {
    const payload = await fetchBotJson(`/telegram/groups/${encodeURIComponent(candidate)}`);
    if (payload?.found === false) {
      continue;
    }

    const resolvedTitle = titleFromPayload(payload);
    if (resolvedTitle || payload) {
      return {
        groupId: candidate,
        groupName: resolvedTitle ?? groupName,
        source: normalizeText(payload?.source) || null,
        lastSeenAt: normalizeText(payload?.last_seen_at) || null,
        text: "",
        hasOperationalContext: false
      };
    }
  }

  return {
    groupId,
    groupName,
    text: "",
    hasOperationalContext: false
  };
}

function formatDate(value?: string | null) {
  return normalizeText(value) || null;
}

function buildMatterPayload(matter: Matter, tasks: RiMatterTaskContext[]) {
  return {
    matterNumber: matter.matterNumber,
    clientNumber: matter.clientNumber,
    clientName: matter.clientName,
    quoteNumber: matter.quoteNumber,
    subject: matter.subject,
    specificProcess: matter.specificProcess,
    matterIdentifier: matter.matterIdentifier,
    responsibleTeam: matter.responsibleTeam,
    communicationChannel: matter.communicationChannel,
    nextAction: matter.nextAction,
    nextActionDueAt: formatDate(matter.nextActionDueAt),
    nextActionSource: matter.nextActionSource,
    milestone: matter.milestone,
    concluded: matter.concluded,
    notes: matter.notes,
    holidayAuthorityShortName: matter.holidayAuthorityShortName,
    internalTelegramGroupId: matter.internalTelegramGroupId,
    internalTelegramGroupName: matter.internalTelegramGroupName,
    activeTasks: tasks
  };
}

function buildMissingContextInput(telegramContext: TelegramContext) {
  const groupName = telegramContext.groupName ? ` (${telegramContext.groupName})` : "";
  const lastSeen = telegramContext.lastSeenAt ? ` Ultimo registro del bot: ${telegramContext.lastSeenAt}.` : "";

  return truncate(
    `RI-001: Falta contexto operativo suficiente del grupo de Telegram${groupName}; revisar manualmente el chat antes de definir nuevas tareas.${lastSeen}`,
    MAX_RI_INPUT_CHARS
  );
}

function buildMissingContextExpiration(telegramContext: TelegramContext) {
  const groupName = telegramContext.groupName ? ` (${telegramContext.groupName})` : "";
  const lastSeen = telegramContext.lastSeenAt ? ` Ultimo registro del bot: ${telegramContext.lastSeenAt}.` : "";

  return {
    expirationDate: null,
    expirationRiOutput: truncate(
      `RI-004: Falta contexto operativo suficiente del grupo de Telegram${groupName} para calcular la caducidad sin inventar fechas.${lastSeen}`,
      MAX_RI_EXPIRATION_OUTPUT_CHARS
    )
  };
}

function extractResponsesText(payload: unknown) {
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") {
    return direct.trim();
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
    .join("\n")
    .trim();
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

async function throwRusconiOpenAiResponseError(response: Response) {
  const openAiError = await readOpenAiError(response);
  const providerMessage = openAiError?.message ? ` OpenAI respondio: ${openAiError.message}` : "";

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      502,
      "RUSCONI_INTELLIGENCE_OPENAI_AUTH_FAILED",
      `OpenAI rechazo la credencial configurada. Revisa OPENAI_API_KEY.${providerMessage}`
    );
  }

  if (response.status === 400 || response.status === 404) {
    throw new AppError(
      502,
      "RUSCONI_INTELLIGENCE_OPENAI_REQUEST_FAILED",
      `OpenAI no acepto la configuracion de Rusconi Intelligence. Revisa OPENAI_RUSCONI_INTELLIGENCE_MODEL y OPENAI_BASE_URL.${providerMessage}`
    );
  }

  if (response.status === 429) {
    throw new AppError(
      502,
      "RUSCONI_INTELLIGENCE_OPENAI_RATE_LIMITED",
      `OpenAI limito la solicitud o la cuenta no tiene cuota disponible.${providerMessage}`
    );
  }

  throw new AppError(
    502,
    "RUSCONI_INTELLIGENCE_OPENAI_FAILED",
    `OpenAI no pudo generar la salida de Rusconi Intelligence.${providerMessage}`
  );
}

function parseJsonObject(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] ?? text).trim();

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function parseExpirationResult(text: string) {
  const normalized = normalizeText(text);
  const parsed = parseJsonObject(normalized);

  if (parsed) {
    const status = normalizeText(parsed.status).toLowerCase();
    const expirationDate = normalizeText(parsed.expirationDate ?? parsed.fechaCaducidad ?? parsed.date);
    const message = normalizeText(parsed.message ?? parsed.output ?? parsed.text ?? parsed.expirationRiOutput);

    if (status !== "not_applicable" && ISO_DATE_ONLY_PATTERN.test(expirationDate)) {
      return {
        expirationDate,
        expirationRiOutput: null
      };
    }

    if (status === "not_applicable" || message === CADUCIDAD_NOT_APPLICABLE_TEXT) {
      return {
        expirationDate: null,
        expirationRiOutput: CADUCIDAD_NOT_APPLICABLE_TEXT
      };
    }

    if (message) {
      return {
        expirationDate: null,
        expirationRiOutput: truncate(message, MAX_RI_EXPIRATION_OUTPUT_CHARS)
      };
    }
  }

  if (ISO_DATE_ONLY_PATTERN.test(normalized)) {
    return {
      expirationDate: normalized,
      expirationRiOutput: null
    };
  }

  if (normalized.includes(CADUCIDAD_NOT_APPLICABLE_TEXT)) {
    return {
      expirationDate: null,
      expirationRiOutput: CADUCIDAD_NOT_APPLICABLE_TEXT
    };
  }

  return {
    expirationDate: null,
    expirationRiOutput: truncate(normalized, MAX_RI_EXPIRATION_OUTPUT_CHARS)
  };
}

async function requestRusconiIntelligenceInput(params: {
  prompt: string;
  matter: Matter;
  tasks: RiMatterTaskContext[];
  telegramContext: TelegramContext;
}) {
  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "RUSCONI_INTELLIGENCE_NOT_CONFIGURED",
      "Rusconi Intelligence no esta conectado a OpenAI. Falta configurar OPENAI_API_KEY en el runtime de la API."
    );
  }

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
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content:
              "Eres Rusconi Intelligence dentro de SIGE. Responde en espanol, en una sola salida breve para una celda operativa. No inventes hechos, tareas, fechas ni responsables. Si el contexto de Telegram no contiene informacion operativa suficiente, dilo claramente."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  `Prompt ${RI_001_CONNECTION_ID}: ${params.prompt}`,
                  "",
                  "Datos visibles del asunto y tareas vigentes:",
                  JSON.stringify(buildMatterPayload(params.matter, params.tasks), null, 2),
                  "",
                  "Contexto disponible del grupo de Telegram:",
                  JSON.stringify(params.telegramContext, null, 2),
                  "",
                  "Devuelve solo el texto final para la columna Input de RI. Maximo 900 caracteres."
                ].join("\n")
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      await throwRusconiOpenAiResponseError(response);
    }

    const text = extractResponsesText(await response.json() as unknown);
    if (!text) {
      throw new AppError(502, "RUSCONI_INTELLIGENCE_EMPTY", "Rusconi Intelligence no genero contenido.");
    }

    return truncate(text, MAX_RI_INPUT_CHARS);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "RUSCONI_INTELLIGENCE_TIMEOUT", "Rusconi Intelligence tardo demasiado en responder.");
    }

    throw new AppError(502, "RUSCONI_INTELLIGENCE_FAILED", "No se pudo generar el Input de RI.");
  } finally {
    clearTimeout(timeout);
  }
}

async function requestRusconiIntelligenceExpiration(params: {
  prompt: string;
  matter: Matter;
  tasks: RiMatterTaskContext[];
  telegramContext: TelegramContext;
}) {
  if (!env.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "RUSCONI_INTELLIGENCE_NOT_CONFIGURED",
      "Rusconi Intelligence no esta conectado a OpenAI. Falta configurar OPENAI_API_KEY en el runtime de la API."
    );
  }

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
        max_output_tokens: 320,
        text: {
          format: {
            type: "json_schema",
            name: "ri_expiration_result",
            strict: true,
            schema: RI_EXPIRATION_JSON_SCHEMA
          }
        },
        input: [
          {
            role: "system",
            content:
              "Eres Rusconi Intelligence dentro de SIGE. Responde en espanol y devuelve solo JSON valido para una celda de Caducidad. No inventes hechos, fechas ni instancias. Si la caducidad no opera, usa exactamente el texto indicado por el prompt."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  `Prompt ${RI_004_CONNECTION_ID}: ${params.prompt}`,
                  "",
                  "Datos visibles del asunto y tareas vigentes:",
                  JSON.stringify(buildMatterPayload(params.matter, params.tasks), null, 2),
                  "",
                  "Contexto disponible del grupo de Telegram:",
                  JSON.stringify(params.telegramContext, null, 2),
                  "",
                  "Devuelve solo uno de estos JSON:",
                  "{\"status\":\"date\",\"expirationDate\":\"YYYY-MM-DD\",\"message\":null}",
                  `{\"status\":\"not_applicable\",\"expirationDate\":null,\"message\":\"${CADUCIDAD_NOT_APPLICABLE_TEXT}\"}`,
                  "{\"status\":\"missing_context\",\"expirationDate\":null,\"message\":\"RI-004: Falta contexto para calcular la caducidad sin inventar fechas.\"}"
                ].join("\n")
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      await throwRusconiOpenAiResponseError(response);
    }

    const text = extractResponsesText(await response.json() as unknown);
    if (!text) {
      throw new AppError(502, "RUSCONI_INTELLIGENCE_EMPTY", "Rusconi Intelligence no genero contenido.");
    }

    return parseExpirationResult(text);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "RUSCONI_INTELLIGENCE_TIMEOUT", "Rusconi Intelligence tardo demasiado en responder.");
    }

    throw new AppError(502, "RUSCONI_INTELLIGENCE_FAILED", "No se pudo generar la Caducidad RI.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateMatterRiInput(params: {
  matter: Matter;
  tasks: RiMatterTaskContext[];
}) {
  const connection = findRusconiIntelligenceConnection(RI_001_CONNECTION_ID);
  if (!connection) {
    throw new AppError(500, "RUSCONI_INTELLIGENCE_PROMPT_MISSING", "No se encontro el prompt RI-001.");
  }

  const groupId = normalizeText(params.matter.internalTelegramGroupId);
  if (!groupId) {
    throw new AppError(400, "MATTER_TELEGRAM_GROUP_REQUIRED", "El asunto necesita ID de grupo interno de Telegram.");
  }

  const telegramContext = await fetchTelegramContext(groupId, params.matter.internalTelegramGroupName);
  if (!telegramContext.hasOperationalContext) {
    return buildMissingContextInput(telegramContext);
  }

  return requestRusconiIntelligenceInput({
    prompt: connection.prompt,
    matter: params.matter,
    tasks: params.tasks,
    telegramContext
  });
}

export async function generateMatterRiExpiration(params: {
  matter: Matter;
  tasks: RiMatterTaskContext[];
}) {
  const connection = findRusconiIntelligenceConnection(RI_004_CONNECTION_ID);
  if (!connection) {
    throw new AppError(500, "RUSCONI_INTELLIGENCE_PROMPT_MISSING", "No se encontro el prompt RI-004.");
  }

  const groupId = normalizeText(params.matter.internalTelegramGroupId);
  if (!groupId) {
    throw new AppError(400, "MATTER_TELEGRAM_GROUP_REQUIRED", "El asunto necesita ID de grupo interno de Telegram.");
  }

  const telegramContext = await fetchTelegramContext(groupId, params.matter.internalTelegramGroupName);
  if (!telegramContext.hasOperationalContext) {
    return buildMissingContextExpiration(telegramContext);
  }

  return requestRusconiIntelligenceExpiration({
    prompt: connection.prompt,
    matter: params.matter,
    tasks: params.tasks,
    telegramContext
  });
}
