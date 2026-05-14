const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const PRODUCTION_API_BASE_URL = "https://api.pruebasb.online/api/v1";

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function resolveApiBaseUrl(configuredBaseUrl?: string) {
  const browserHostname = window.location.hostname;

  if (configuredBaseUrl?.startsWith("/")) {
    if (browserHostname === "pruebasb.online" || browserHostname === "www.pruebasb.online") {
      return PRODUCTION_API_BASE_URL;
    }

    return configuredBaseUrl;
  }

  if (!configuredBaseUrl) {
    if (browserHostname === "pruebasb.online" || browserHostname === "www.pruebasb.online") {
      return PRODUCTION_API_BASE_URL;
    }

    return "/api/v1";
  }

  const apiUrl = new URL(configuredBaseUrl);

  if (isLoopbackHost(browserHostname) && isLoopbackHost(apiUrl.hostname)) {
    apiUrl.hostname = browserHostname;
  }

  return apiUrl.toString().replace(/\/$/, "");
}

const API_BASE_URL = resolveApiBaseUrl(configuredApiBaseUrl);

const ACCESS_TOKEN_STORAGE_KEY = "sige.accessToken";
const REFRESH_TOKEN_STORAGE_KEY = "sige.refreshToken";
const SESSION_HINT_STORAGE_KEY = "sige.hasSession";

export const AUTH_STORAGE_EVENT = "sige-auth-storage-changed";

export interface AuthStorageChangeDetail {
  reason: "cleared" | "persisted";
}

let refreshRequest: Promise<boolean> | null = null;

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
    const payload = await response.json() as { message?: string };
    if (payload.message) {
      return new Error(payload.message);
    }
  } catch {
    // Ignore invalid JSON error bodies and use the fallback instead.
  }

  return new Error(fallback);
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

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          body: "{}"
        });

        if (!response.ok) {
          clearAuthTokens();
          return false;
        }

        persistAuthTokens();
        return true;
      } catch {
        clearAuthTokens();
        return false;
      } finally {
        refreshRequest = null;
      }
    })();
  }

  return refreshRequest;
}

async function request(path: string, init: RequestInit, fallback: string): Promise<Response> {
  const execute = () =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: withAuthHeaders(init.headers)
    });

  let response = await execute();
  if (response.status === 401 && shouldRetryWithRefresh(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await execute();
    }
  }

  if (!response.ok) {
    if (response.status === 401 && shouldRetryWithRefresh(path)) {
      throw new Error("La sesion expiro. Inicia sesion nuevamente.");
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
