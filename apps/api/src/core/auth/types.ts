import type { AuthUser } from "@sige/contracts";

export interface SessionUser extends Pick<AuthUser, "id" | "email" | "username" | "displayName" | "shortName" | "role" | "legacyRole" | "team" | "legacyTeam" | "specificRole" | "permissions" | "isActive" | "passwordResetRequired"> {}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
