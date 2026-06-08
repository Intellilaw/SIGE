import { env } from "../../config/env";
import type { MatterWriteRecord } from "../../repositories/types";

type Logger = {
  warn: (message: string) => void;
};

type BotGroupLookupResponse = {
  found?: boolean;
  chat?: {
    title?: unknown;
    chat_title?: unknown;
    chatTitle?: unknown;
  };
  chat_title?: unknown;
  chatTitle?: unknown;
  title?: unknown;
  result?: TelegramGetChatResponse["result"];
};

type TelegramGetChatResponse = {
  ok?: boolean;
  result?: {
    type?: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
};

type GroupNameEnrichmentContext = {
  currentInternalTelegramGroupId?: string | null;
  logger?: Logger;
};

function hasOwn<T extends object>(payload: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function titleFromUnknown(value: unknown) {
  return typeof value === "string" ? normalizeOptionalText(value) : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function getTelegramGroupIdCandidates(groupId: string) {
  const normalized = normalizeOptionalText(groupId);
  if (!normalized) {
    return [];
  }

  const compact = normalized.replace(/\s+/g, "");
  const candidates = [normalized, compact];
  if (!/^-?\d+$/.test(compact)) {
    return unique(candidates);
  }

  const unsigned = compact.replace(/^-/, "");
  const bases = unsigned.startsWith("100") && unsigned.length > 3
    ? [unsigned, unsigned.slice(3)]
    : [unsigned];

  bases.forEach((base) => {
    candidates.push(base);
    candidates.push(`-${base}`);
    if (!base.startsWith("100")) {
      candidates.push(`-100${base}`);
    }
  });

  return unique(candidates);
}

function titleFromTelegramChat(result?: TelegramGetChatResponse["result"]) {
  if (!result) {
    return null;
  }

  return normalizeOptionalText(
    result.title ??
      result.username ??
      [result.first_name, result.last_name].filter(Boolean).join(" ")
  );
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.TELEGRAM_GROUP_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupViaBotApi(groupId: string) {
  const baseUrl = normalizeOptionalText(env.INTELLILAW_BOT_API_URL);
  if (!baseUrl) {
    return null;
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/telegram/groups/${encodeURIComponent(groupId)}`;
    const headers = env.INTELLILAW_BOT_API_KEY
      ? { "X-SIGE-Integration-Key": env.INTELLILAW_BOT_API_KEY }
      : undefined;
    const payload = (await fetchJson(url, headers)) as BotGroupLookupResponse | null;

    const title =
      titleFromUnknown(payload?.chat_title) ??
      titleFromUnknown(payload?.chatTitle) ??
      titleFromUnknown(payload?.title) ??
      titleFromUnknown(payload?.chat?.chat_title) ??
      titleFromUnknown(payload?.chat?.chatTitle) ??
      titleFromUnknown(payload?.chat?.title) ??
      titleFromTelegramChat(payload?.result);

    if (payload?.found === false) {
      return null;
    }

    return title;
  } catch {
    return null;
  }
}

async function lookupViaTelegramApi(groupId: string, logger?: Logger) {
  const token = normalizeOptionalText(env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    return null;
  }

  try {
    const params = new URLSearchParams({ chat_id: groupId });
    const payload = (await fetchJson(
      `https://api.telegram.org/bot${token}/getChat?${params.toString()}`
    )) as TelegramGetChatResponse | null;

    if (!payload?.ok) {
      return null;
    }

    return titleFromTelegramChat(payload.result);
  } catch (error) {
    logger?.warn(`No se pudo resolver el grupo de Telegram ${groupId} via Telegram.`);
    return null;
  }
}

export async function resolveTelegramGroupName(groupId: string, logger?: Logger) {
  const candidates = getTelegramGroupIdCandidates(groupId);

  for (const candidate of candidates) {
    const groupName = await lookupViaBotApi(candidate);
    if (groupName) {
      return groupName;
    }
  }

  for (const candidate of candidates) {
    const groupName = await lookupViaTelegramApi(candidate, logger);
    if (groupName) {
      return groupName;
    }
  }

  return null;
}

export async function enrichMatterTelegramGroupName(
  payload: MatterWriteRecord,
  context: GroupNameEnrichmentContext = {}
): Promise<MatterWriteRecord> {
  if (!hasOwn(payload, "internalTelegramGroupId")) {
    return payload;
  }

  const nextGroupId = normalizeOptionalText(payload.internalTelegramGroupId);
  if (!nextGroupId) {
    return {
      ...payload,
      internalTelegramGroupId: null,
      internalTelegramGroupName: null
    };
  }

  const groupName = await resolveTelegramGroupName(nextGroupId, context.logger);
  if (groupName) {
    return {
      ...payload,
      internalTelegramGroupId: nextGroupId,
      internalTelegramGroupName: groupName
    };
  }

  if (nextGroupId !== normalizeOptionalText(context.currentInternalTelegramGroupId)) {
    return {
      ...payload,
      internalTelegramGroupId: nextGroupId,
      internalTelegramGroupName: null
    };
  }

  return {
    ...payload,
    internalTelegramGroupId: nextGroupId
  };
}
