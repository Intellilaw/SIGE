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
const MAX_TELEGRAM_CONTEXT_CHARS = 12000;
const MAX_RI_INPUT_CHARS = 900;

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

function extractChatCompletionText(payload: unknown) {
  const content = (payload as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  }).choices?.[0]?.message?.content;

  return typeof content === "string" ? content.trim() : "";
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
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_RUSCONI_INTELLIGENCE_MODEL,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Eres Rusconi Intelligence dentro de SIGE. Responde en espanol, en una sola salida breve para una celda operativa. No inventes hechos, tareas, fechas ni responsables. Si el contexto de Telegram no contiene informacion operativa suficiente, dilo claramente."
          },
          {
            role: "user",
            content: [
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
      })
    });

    if (!response.ok) {
      throw new AppError(502, "RUSCONI_INTELLIGENCE_OPENAI_FAILED", "OpenAI no pudo generar el Input de RI.");
    }

    const text = extractChatCompletionText(await response.json() as unknown);
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
