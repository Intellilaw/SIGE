import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_STORAGE_EVENT, apiGet, apiPost, clearAuthTokens, hasPersistedAuthSession, persistAuthTokens } from "../../api/http-client";
const AuthContext = createContext(null);
const AUTH_PROFILE_TIMEOUT_MS = 8_000;
function persistSession(response) {
    persistAuthTokens();
}
function isClearedAuthStorageEvent(event) {
    return event instanceof CustomEvent && event.detail?.reason === "cleared";
}
function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then(resolve, reject).finally(() => window.clearTimeout(timeoutId));
    });
}
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!hasPersistedAuthSession()) {
            setLoading(false);
            return;
        }
        withTimeout(apiGet("/auth/me"), AUTH_PROFILE_TIMEOUT_MS, "No se pudo validar la sesion actual.")
            .then((profile) => setUser(profile))
            .catch(() => {
            clearAuthTokens();
            setUser(null);
        })
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => {
        const handleAuthStorageChange = (event) => {
            if (isClearedAuthStorageEvent(event)) {
                setUser(null);
                setLoading(false);
            }
        };
        window.addEventListener(AUTH_STORAGE_EVENT, handleAuthStorageChange);
        return () => window.removeEventListener(AUTH_STORAGE_EVENT, handleAuthStorageChange);
    }, []);
    async function login(identifier, password) {
        const response = await apiPost("/auth/login", { identifier, password });
        persistSession(response);
        setUser(response.user);
    }
    async function requestPasswordReset(identifier) {
        return apiPost("/auth/password-resets/request", { identifier });
    }
    async function completePasswordReset(token, password) {
        const response = await apiPost("/auth/password-resets/complete", { token, password });
        persistSession(response);
        setUser(response.user);
    }
    function logout() {
        void apiPost("/auth/logout", {}).catch(() => undefined);
        clearAuthTokens();
        setUser(null);
    }
    const value = useMemo(() => ({ user, loading, login, requestPasswordReset, completePasswordReset, logout }), [user, loading]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }
    return context;
}
