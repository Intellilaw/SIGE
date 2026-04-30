import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import {
  AUTH_STORAGE_EVENT,
  apiGet,
  apiPost,
  clearAuthTokens,
  hasPersistedAuthSession,
  persistAuthTokens
} from "../../api/http-client";
import type { AuthStorageChangeDetail } from "../../api/http-client";

interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  legacyRole: string;
  team?: string;
  legacyTeam?: string;
  specificRole?: string;
  shortName?: string;
  permissions: string[];
  isActive: boolean;
  passwordResetRequired: boolean;
}

interface LoginResponse {
  user: SessionUser;
}

export interface PasswordResetRequestResponse {
  deliveryMode: "generic" | "development-preview";
  message: string;
  resetUrl?: string;
  expiresAt?: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  requestPasswordReset: (identifier: string) => Promise<PasswordResetRequestResponse>;
  completePasswordReset: (token: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistSession(response: LoginResponse) {
  persistAuthTokens();
}

function isClearedAuthStorageEvent(event: Event) {
  return event instanceof CustomEvent && (event.detail as AuthStorageChangeDetail | undefined)?.reason === "cleared";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasPersistedAuthSession()) {
      setLoading(false);
      return;
    }

    apiGet<SessionUser>("/auth/me")
      .then((profile) => setUser(profile))
      .catch(() => {
        clearAuthTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleAuthStorageChange = (event: Event) => {
      if (isClearedAuthStorageEvent(event)) {
        setUser(null);
      }
    };

    window.addEventListener(AUTH_STORAGE_EVENT, handleAuthStorageChange);
    return () => window.removeEventListener(AUTH_STORAGE_EVENT, handleAuthStorageChange);
  }, []);

  async function login(identifier: string, password: string) {
    const response = await apiPost<LoginResponse>("/auth/login", { identifier, password });
    persistSession(response);
    setUser(response.user);
  }

  async function requestPasswordReset(identifier: string) {
    return apiPost<PasswordResetRequestResponse>("/auth/password-resets/request", { identifier });
  }

  async function completePasswordReset(token: string, password: string) {
    const response = await apiPost<LoginResponse>("/auth/password-resets/complete", { token, password });
    persistSession(response);
    setUser(response.user);
  }

  function logout() {
    void apiPost<void>("/auth/logout", {}).catch(() => undefined);
    clearAuthTokens();
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, login, requestPasswordReset, completePasswordReset, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
