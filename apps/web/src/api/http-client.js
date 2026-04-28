const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const API_BASE_URL = configuredApiBaseUrl ?? "/api/v1";
const ACCESS_TOKEN_STORAGE_KEY = "sige.accessToken";
const REFRESH_TOKEN_STORAGE_KEY = "sige.refreshToken";
export const AUTH_STORAGE_EVENT = "sige-auth-storage-changed";
let refreshRequest = null;
function notifyAuthStorageChanged() {
    window.dispatchEvent(new Event(AUTH_STORAGE_EVENT));
}
function clearLegacyAuthTokens() {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}
export function persistAuthTokens() {
    clearLegacyAuthTokens();
    notifyAuthStorageChanged();
}
export function clearAuthTokens() {
    clearLegacyAuthTokens();
    notifyAuthStorageChanged();
}
function withAuthHeaders(headers) {
    return new Headers(headers);
}
function shouldRetryWithRefresh(path) {
    if (path === "/auth/refresh" || path === "/auth/login") {
        return false;
    }
    if (path.startsWith("/auth/password-resets/")) {
        return false;
    }
    return true;
}
async function toError(response, fallback) {
    try {
        const payload = await response.json();
        if (payload.message) {
            return new Error(payload.message);
        }
    }
    catch {
        // Ignore invalid JSON error bodies and use the fallback instead.
    }
    return new Error(fallback);
}
async function readJson(response) {
    if (response.status === 204 || response.status === 205) {
        return undefined;
    }
    const raw = await response.text();
    if (!raw) {
        return undefined;
    }
    return JSON.parse(raw);
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
            }
            catch {
                clearAuthTokens();
                return false;
            }
            finally {
                refreshRequest = null;
            }
        })();
    }
    return refreshRequest;
}
async function request(path, init, fallback) {
    const execute = () => fetch(`${API_BASE_URL}${path}`, {
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
function getFilenameFromDisposition(header) {
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
export async function apiGet(path) {
    const response = await request(path, {
        headers: {
            "Content-Type": "application/json"
        }
    }, `GET ${path} failed with status request`);
    return readJson(response);
}
export async function apiPost(path, body) {
    const response = await request(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    }, `POST ${path} failed with status request`);
    return readJson(response);
}
export async function apiPatch(path, body) {
    const response = await request(path, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    }, `PATCH ${path} failed with status request`);
    return readJson(response);
}
export async function apiDelete(path) {
    await request(path, {
        method: "DELETE"
    }, `DELETE ${path} failed with status request`);
}
export async function apiDownload(path) {
    const response = await request(path, {}, `GET ${path} failed with status request`);
    return {
        blob: await response.blob(),
        filename: getFilenameFromDisposition(response.headers.get("Content-Disposition"))
    };
}
