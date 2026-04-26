import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_STORAGE_EVENT, apiGet, apiPost, clearAuthTokens, persistAuthTokens } from "../../api/http-client";
const AuthContext = createContext(null);
function persistSession(response) {
    persistAuthTokens();
}
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        apiGet("/auth/me")
            .then((profile) => setUser(profile))
            .catch(() => {
            clearAuthTokens();
            setUser(null);
        })
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => {
        const handleAuthStorageChange = () => {
            setUser(null);
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
