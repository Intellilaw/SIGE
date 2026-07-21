import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import {
  AUTH_STORAGE_EVENT,
  apiGet,
  apiPost,
  clearAuthTokens,
  hasPersistedAuthSession,
  isAuthenticationError,
  persistAuthTokens
} from "../../api/http-client";
import type { AuthStorageChangeDetail } from "../../api/http-client";

interface SessionUser {
  id: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  legacyRole: string;
  team?: string;
  legacyTeam?: string;
  secondaryTeam?: string;
  secondaryLegacyTeam?: string;
  specificRole?: string;
  secondarySpecificRole?: string;
  shortName?: string;
  permissions: string[];
  isExternal: boolean;
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
  login: (identifier: string, password: string, organizationSlug?: string) => Promise<void>;
  requestPasswordReset: (identifier: string, organizationSlug?: string) => Promise<PasswordResetRequestResponse>;
  completePasswordReset: (token: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_PROFILE_TIMEOUT_MS = 20_000;
const AUTH_PROFILE_RETRY_DELAY_MS = 3_000;

function persistSession(response: LoginResponse) {
  persistAuthTokens();
}

function isClearedAuthStorageEvent(event: Event) {
  return event instanceof CustomEvent && (event.detail as AuthStorageChangeDetail | undefined)?.reason === "cleared";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    promise.then(resolve, reject).finally(() => window.clearTimeout(timeoutId));
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let retryTimerId: number | undefined;
    const sessionWasExpected = hasPersistedAuthSession();

    const validateSession = async () => {
      try {
        const profile = await withTimeout(
          apiGet<SessionUser>("/auth/me"),
          AUTH_PROFILE_TIMEOUT_MS,
          "No se pudo validar la sesion actual."
        );
        if (cancelled) {
          return;
        }

        persistAuthTokens();
        setUser(profile);
        setLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isAuthenticationError(error)) {
          clearAuthTokens();
          setUser(null);
          setLoading(false);
          return;
        }

        if (!sessionWasExpected) {
          setLoading(false);
          return;
        }

        retryTimerId = window.setTimeout(() => {
          void validateSession();
        }, AUTH_PROFILE_RETRY_DELAY_MS);
      }
    };

    void validateSession();

    return () => {
      cancelled = true;
      if (retryTimerId !== undefined) {
        window.clearTimeout(retryTimerId);
      }
    };
  }, []);

  useEffect(() => {
    const handleAuthStorageChange = (event: Event) => {
      if (isClearedAuthStorageEvent(event)) {
        setUser(null);
        setLoading(false);
      }
    };

    window.addEventListener(AUTH_STORAGE_EVENT, handleAuthStorageChange);
    return () => window.removeEventListener(AUTH_STORAGE_EVENT, handleAuthStorageChange);
  }, []);

  async function login(identifier: string, password: string, organizationSlug?: string) {
    const response = await apiPost<LoginResponse>("/auth/login", { identifier, password, organizationSlug });
    persistSession(response);
    setUser(response.user);
  }

  async function requestPasswordReset(identifier: string, organizationSlug?: string) {
    return apiPost<PasswordResetRequestResponse>("/auth/password-resets/request", { identifier, organizationSlug });
  }

  async function completePasswordReset(token: string, password: string) {
    const response = await apiPost<LoginResponse>("/auth/password-resets/complete", { token, password });
    persistSession(response);
    setUser(response.user);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const response = await apiPost<LoginResponse>("/auth/me/password", { currentPassword, newPassword });
    persistSession(response);
    setUser(response.user);
  }

  function logout() {
    void apiPost<void>("/auth/logout", {}).catch(() => undefined);
    clearAuthTokens();
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, login, requestPasswordReset, completePasswordReset, changePassword, logout }),
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
