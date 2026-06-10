import type { Matter } from "@sige/contracts";

import { env } from "../../config/env";
import { AppError } from "../../core/errors/app-error";
import { getTelegramGroupIdCandidates } from "./telegram-group-name-resolver";

type Logger = {
  warn: (message: string) => void;
};

type PromotionCommandResult = {
  status: "completed";
  provider: "intellilaw-bot";
  groupId: string;
  groupName?: string | null;
  messageText: string;
  document?: unknown;
};

type BotFetchResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  text: string;
};

const PROMOTION_COMPLETION_STATUSES = new Set([
  "completed",
  "complete",
  "accepted",
  "queued",
  "processing",
  "document_sent",
  "message_sent",
  "command_sent",
  "word_sent",
  "sent",
  "success",
  "ok"
]);

function normalizeText(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getBotHeaders() {
  return {
    "Content-Type": "application/json",
    ...(env.INTELLILAW_BOT_API_KEY
      ? { "X-SIGE-Integration-Key": env.INTELLILAW_BOT_API_KEY }
      : {})
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getNestedRecord(value: unknown, key: string) {
  const record = asRecord(value);
  return record ? asRecord(record[key]) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boolValue(value: unknown) {
  return value === true;
}

function getBotErrorStatus(status: number) {
  return status >= 500 || status === 401 || status === 403 ? 502 : status || 502;
}

function shouldTryNextEndpoint(status: number) {
  return status === 400 || status === 404 || status === 405 || status === 422 || status >= 500;
}

function isInternalBotFailure(message?: string) {
  return /could not refresh instance|traceback|sqlalchemy|internal server error/i.test(message ?? "");
}

function hasDocumentMetadata(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  const candidates = [
    record.document,
    record.file,
    record.docx,
    record.result,
    getNestedRecord(record, "data")?.document,
    getNestedRecord(record, "data")?.file
  ];

  if (candidates.some((candidate) => Boolean(candidate))) {
    return true;
  }

  return [
    record.document_id,
    record.documentId,
    record.file_id,
    record.fileId,
    record.message_id,
    record.messageId,
    record.file_name,
    record.fileName,
    record.filename
  ].some((candidate) => stringValue(candidate).length > 0);
}

function botAcceptedPromotionCommand(payload: unknown) {
  const record = asRecord(payload);
  if (!record) {
    return false;
  }

  const status = stringValue(record.status).toLowerCase();
  const resultStatus = stringValue(getNestedRecord(record, "result")?.status).toLowerCase();
  const dataStatus = stringValue(getNestedRecord(record, "data")?.status).toLowerCase();
  const explicitAccepted =
    boolValue(record.ok) ||
    boolValue(record.success) ||
    boolValue(record.document_sent) ||
    boolValue(record.documentSent) ||
    boolValue(record.message_sent) ||
    boolValue(record.messageSent) ||
    boolValue(record.command_sent) ||
    boolValue(record.commandSent) ||
    boolValue(record.word_sent) ||
    boolValue(record.wordSent) ||
    boolValue(record.completed);

  if (explicitAccepted) {
    return true;
  }

  if (PROMOTION_COMPLETION_STATUSES.has(status) || PROMOTION_COMPLETION_STATUSES.has(resultStatus) || PROMOTION_COMPLETION_STATUSES.has(dataStatus)) {
    return true;
  }

  return hasDocumentMetadata(payload);
}

async function fetchBotEndpoint(url: string, body: unknown): Promise<BotFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.INTELLILAW_BOT_PROMOTION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBotHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getBotEndpointPaths(chatId: string) {
  const encodedChatId = encodeURIComponent(chatId);
  return [
    `/telegram/groups/${encodedChatId}/promotion-command`,
    `/telegram/groups/${encodedChatId}/promotions`,
    `/telegram/groups/${encodedChatId}/commands/promocion`,
    "/promotions/generate",
    "/telegram/promotions/generate"
  ];
}

function getResponseMessage(result: BotFetchResult) {
  const payload = asRecord(result.payload);
  return stringValue(payload?.message) || stringValue(payload?.detail) || result.text;
}

function buildPromotionCommandBody(params: {
  command: string;
  taskName: string;
  messageText: string;
  chatId: string;
  groupName: string | null;
}) {
  return {
    command: params.command,
    taskName: params.taskName,
    task_name: params.taskName,
    text: params.messageText,
    message: params.messageText,
    chatId: params.chatId,
    chat_id: params.chatId,
    chatTitle: params.groupName,
    chat_title: params.groupName,
    source: "sige"
  };
}

export async function sendPromotionCommandToTelegram(params: {
  matter: Matter;
  taskName: string;
  logger?: Logger;
}): Promise<PromotionCommandResult> {
  const command = normalizeText(params.matter.promotionCommand);
  const taskName = normalizeText(params.taskName);
  const groupId = normalizeText(params.matter.internalTelegramGroupId);
  const groupName = normalizeText(params.matter.internalTelegramGroupName) || null;

  if (!command) {
    throw new AppError(
      400,
      "MATTER_PROMOTION_COMMAND_REQUIRED",
      "Selecciona un comando de promoción en Ejecución antes de generar el escrito."
    );
  }

  if (!taskName) {
    throw new AppError(400, "PROMOTION_TASK_NAME_REQUIRED", "La tarea necesita nombre para generar el escrito.");
  }

  if (!groupId) {
    throw new AppError(400, "MATTER_TELEGRAM_GROUP_REQUIRED", "El asunto necesita ID de grupo interno de Telegram.");
  }

  const botBaseUrl = normalizeText(env.INTELLILAW_BOT_API_URL);
  if (!botBaseUrl) {
    throw new AppError(503, "INTELLILAW_BOT_API_NOT_CONFIGURED", "La conexión con el bot no está configurada.");
  }

  const messageText = `${command} ${taskName}`;
  const candidates = getTelegramGroupIdCandidates(groupId);
  let lastFailure: { status: number; message: string } | null = null;

  for (const candidate of candidates) {
    const body = buildPromotionCommandBody({
      command,
      taskName,
      messageText,
      chatId: candidate,
      groupName
    });

    for (const path of getBotEndpointPaths(candidate)) {
      const url = `${botBaseUrl.replace(/\/+$/, "")}${path}`;

      try {
        const result = await fetchBotEndpoint(url, body);

        if (!result.ok) {
          const message = getResponseMessage(result);
          lastFailure = { status: result.status, message };

          if (shouldTryNextEndpoint(result.status)) {
            params.logger?.warn(`El endpoint de promocion del bot fallo (${result.status}) para grupo ${candidate}: ${message || "sin detalle"}`);
            continue;
          }

          throw new AppError(
            getBotErrorStatus(result.status),
            "TELEGRAM_PROMOTION_SEND_FAILED",
            message || "No se pudo generar y enviar la promoción desde el bot de Telegram."
          );
        }

        if (!botAcceptedPromotionCommand(result.payload)) {
          lastFailure = {
            status: 502,
            message: "El bot respondio, pero no confirmo que haya aceptado el comando de promocion."
          };
          continue;
        }

        return {
          status: "completed",
          provider: "intellilaw-bot",
          groupId: candidate,
          groupName,
          messageText,
          document: asRecord(result.payload)?.document ?? asRecord(result.payload)?.file ?? result.payload
        };
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        params.logger?.warn(`No se pudo ejecutar promoción en bot para grupo ${candidate}.`);
        lastFailure = {
          status: 502,
          message: error instanceof Error ? error.message : "Error desconocido al llamar al bot."
        };
      }
    }
  }

  const missingEndpointMessage = "El bot no tiene habilitada una ruta segura para generar y confirmar promociones desde SIGE.";
  const botFailureMessage = "El bot de Telegram no pudo procesar el comando de promocion. Ya se probaron las rutas configuradas.";
  const shouldUseMissingEndpointMessage =
    lastFailure?.status === 404 || lastFailure?.status === 405 || !lastFailure?.message;
  const shouldUseBotFailureMessage = Boolean(
    lastFailure && (lastFailure.status >= 500 || isInternalBotFailure(lastFailure.message))
  );
  const endpointFailureMessage = shouldUseBotFailureMessage
    ? botFailureMessage
    : lastFailure?.message ?? missingEndpointMessage;

  throw new AppError(
    502,
    "TELEGRAM_PROMOTION_ENDPOINT_MISSING",
    shouldUseMissingEndpointMessage ? missingEndpointMessage : endpointFailureMessage
  );
}
