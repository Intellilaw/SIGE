import type { AuthUser } from "@sige/contracts";

export interface SessionUser extends Pick<AuthUser, "id" | "organizationId" | "organizationSlug" | "organizationName" | "email" | "username" | "displayName" | "shortName" | "role" | "legacyRole" | "team" | "legacyTeam" | "secondaryTeam" | "secondaryLegacyTeam" | "specificRole" | "secondarySpecificRole" | "permissions" | "createLaborFile" | "isActive" | "passwordResetRequired"> {}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
