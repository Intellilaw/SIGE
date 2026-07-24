const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function resolveApiBaseUrl(configuredBaseUrl?: string) {
  const browserHostname = window.location.hostname;

  if (configuredBaseUrl?.startsWith("/")) {
    return configuredBaseUrl;
  }

  if (!configuredBaseUrl) {
    return "/api/v1";
  }

  const apiUrl = new URL(configuredBaseUrl);

  if (isLoopbackHost(browserHostname) && isLoopbackHost(apiUrl.hostname)) {
    apiUrl.hostname = browserHostname;
  }

  return apiUrl.toString().replace(/\/$/, "");
}

const API_BASE_URL = resolveApiBaseUrl(configuredApiBaseUrl);
const REQUEST_TIMEOUT_MS = 75_000;
const LONG_RUNNING_REQUEST_TIMEOUT_MS = 180_000;
const TRANSIENT_RETRY_STATUS_CODES = new Set([502, 503, 504]);
const TRANSIENT_RETRY_ATTEMPTS = 2;
const TRANSIENT_RETRY_DELAY_MS = 700;

const ACCESS_TOKEN_STORAGE_KEY = "sige.accessToken";
const REFRESH_TOKEN_STORAGE_KEY = "sige.refreshToken";
const SESSION_HINT_STORAGE_KEY = "sige.hasSession";

export const AUTH_STORAGE_EVENT = "sige-auth-storage-changed";

export interface AuthStorageChangeDetail {
  reason: "cleared" | "persisted";
}

type RefreshAccessTokenResult = "refreshed" | "invalid" | "unavailable";

let refreshRequest: Promise<RefreshAccessTokenResult> | null = null;

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isAuthenticationError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function notifyAuthStorageChanged(reason: AuthStorageChangeDetail["reason"]) {
  window.dispatchEvent(new CustomEvent<AuthStorageChangeDetail>(AUTH_STORAGE_EVENT, { detail: { reason } }));
}

function clearLegacyAuthTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function hasPersistedAuthSession() {
  return window.localStorage.getItem(SESSION_HINT_STORAGE_KEY) === "true";
}

export function persistAuthTokens() {
  clearLegacyAuthTokens();
  window.localStorage.setItem(SESSION_HINT_STORAGE_KEY, "true");
  notifyAuthStorageChanged("persisted");
}

export function clearAuthTokens() {
  clearLegacyAuthTokens();
  window.localStorage.removeItem(SESSION_HINT_STORAGE_KEY);
  notifyAuthStorageChanged("cleared");
}

function withAuthHeaders(headers?: HeadersInit) {
  return new Headers(headers);
}

function shouldRetryWithRefresh(path: string) {
  if (path === "/auth/refresh" || path === "/auth/login") {
    return false;
  }

  if (path.startsWith("/auth/password-resets/")) {
    return false;
  }

  return true;
}

async function toError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { code?: string; message?: string };
    if (payload.message) {
      return new ApiError(payload.message, response.status, payload.code);
    }
  } catch {
    // Ignore invalid JSON error bodies and use the fallback instead.
  }

  return new ApiError(fallback, response.status);
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const raw = await response.text();
  if (!raw) {
    return undefined as T;
  }

  return JSON.parse(raw) as T;
}

async function refreshAccessToken(): Promise<RefreshAccessTokenResult> {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      try {
        const executeRefresh = () => fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          body: "{}"
        });
        let response = await executeRefresh();

        // Another browser tab may have rotated the shared cookie milliseconds earlier.
        if (response.status === 401) {
          await wait(200);
          response = await executeRefresh();
        }

        if (response.ok) {
          persistAuthTokens();
          return "refreshed" as const;
        }

        if (response.status === 401 || response.status === 403) {
          clearAuthTokens();
          return "invalid" as const;
        }

        return "unavailable" as const;
      } catch {
        return "unavailable" as const;
      } finally {
        refreshRequest = null;
      }
    })();
  }

  return refreshRequest;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("La solicitud tardo demasiado. Intenta refrescar la pagina.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function isSafeRetryMethod(method?: string) {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  return normalizedMethod === "GET" || normalizedMethod === "HEAD";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function executeWithTransientRetry(execute: () => Promise<Response>, init: RequestInit) {
  const canRetry = isSafeRetryMethod(init.method);
  let lastError: unknown;

  for (let attempt = 0; attempt <= TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await execute();
      if (!canRetry || !TRANSIENT_RETRY_STATUS_CODES.has(response.status) || attempt === TRANSIENT_RETRY_ATTEMPTS) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (!canRetry || attempt === TRANSIENT_RETRY_ATTEMPTS) {
        throw error;
      }
    }

    await wait(TRANSIENT_RETRY_DELAY_MS * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("La solicitud fallo temporalmente. Intenta de nuevo.");
}

async function request(path: string, init: RequestInit, fallback: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const execute = () =>
    fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: withAuthHeaders(init.headers)
    }, timeoutMs);

  let response = await executeWithTransientRetry(execute, init);
  if (response.status === 401 && shouldRetryWithRefresh(path)) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult === "refreshed") {
      response = await executeWithTransientRetry(execute, init);
    } else if (refreshResult === "invalid") {
      throw new ApiError("La sesion expiro. Inicia sesion nuevamente.", 401, "SESSION_EXPIRED");
    } else {
      throw new ApiError(
        "No fue posible renovar la sesion por un problema temporal. Intenta nuevamente.",
        503,
        "SESSION_REFRESH_UNAVAILABLE"
      );
    }
  }

  if (!response.ok) {
    if (response.status === 401 && shouldRetryWithRefresh(path)) {
      clearAuthTokens();
      throw new ApiError("La sesion expiro. Inicia sesion nuevamente.", 401, "SESSION_EXPIRED");
    }

    throw await toError(response, fallback);
  }

  return response;
}

function getFilenameFromDisposition(header: string | null) {
  if (!header) {
    return undefined;
  }

  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }

  const simpleMatch = header.match(/filename="?([^"]+)"?/i);
  return simpleMatch?.[1];
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await request(path, {
    headers: {
      "Content-Type": "application/json"
    }
  }, `GET ${path} failed with status request`);

  return readJson<T>(response);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, `POST ${path} failed with status request`);

  return readJson<T>(response);
}

export async function apiPostLongRunning<T>(path: string, body: unknown): Promise<T> {
  const response = await request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, `POST ${path} failed with status request`, LONG_RUNNING_REQUEST_TIMEOUT_MS);

  return readJson<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await request(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, `PATCH ${path} failed with status request`);

  return readJson<T>(response);
}

export async function apiDelete(path: string): Promise<void> {
  await request(path, {
    method: "DELETE"
  }, `DELETE ${path} failed with status request`);
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename?: string }> {
  const response = await request(path, {}, `GET ${path} failed with status request`);

  return {
    blob: await response.blob(),
    filename: getFilenameFromDisposition(response.headers.get("Content-Disposition"))
  };
}
