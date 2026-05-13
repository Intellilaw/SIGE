import type { FastifyReply, FastifyRequest } from "fastify";
import type { SystemRole, Team } from "@sige/contracts";
import { deriveEffectivePermissions } from "@sige/contracts";

import { AppError } from "../errors/app-error";
import type { SessionUser } from "./types";

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  await request.jwtVerify();
}

export function getSessionUser(request: FastifyRequest) {
  return request.user as SessionUser;
}

export function requireRoles(allowedRoles: SystemRole[]) {
  return async function roleGuard(request: FastifyRequest) {
    const user = getSessionUser(request);
    if (!allowedRoles.includes(user.role)) {
      throw new AppError(403, "FORBIDDEN", "You do not have enough privileges for this action.");
    }
  };
}

export function requireTeams(allowedTeams: Team[]) {
  return async function teamGuard(request: FastifyRequest) {
    const user = getSessionUser(request);
    if (user.role === "SUPERADMIN") {
      return;
    }

    if (!user.team || !allowedTeams.includes(user.team)) {
      throw new AppError(403, "FORBIDDEN", "This team cannot access the requested module.");
    }
  };
}

export function requireAnyPermissions(allowedPermissions: string[]) {
  return async function permissionGuard(request: FastifyRequest) {
    const user = getSessionUser(request);
    const permissions = deriveEffectivePermissions({
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole
    });

    if (permissions.includes("*")) {
      return;
    }

    if (!allowedPermissions.some((permission) => permissions.includes(permission))) {
      throw new AppError(403, "FORBIDDEN", "You do not have enough permissions for this action.");
    }
  };
}
