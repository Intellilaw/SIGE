import {
  buildDisplayName,
  buildLegacyEmail,
  derivePermissions,
  deriveSystemRole,
  findTeamOptionByLabel,
  normalizeLegacyUsername,
  normalizeShortName,
  type CreateManagedTeamInput,
  type Team,
  type CreateManagedUserInput,
  type ManagedTeam,
  type UpdateManagedTeamInput,
  type UpdateManagedUserInput
} from "@sige/contracts";

import { AppError } from "../../core/errors/app-error";
import { assertStrongPassword } from "../../core/auth/password-policy";
import { hashPassword } from "../../core/auth/passwords";
import type { UsersRepository } from "../../repositories/types";

function normalizeEditableUsername(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTeamLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildTeamKeyBase(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "EQUIPO";
}

export class UsersService {
  public constructor(private readonly repository: UsersRepository) {}

  public list() {
    return this.repository.list();
  }

  public async listTeamShortNames(team: Team) {
    const users = await this.repository.list();
    const shortNames = users
      .filter((user) => user.isActive && user.team === team)
      .map((user) => normalizeShortName(user.shortName))
      .filter((shortName): shortName is string => Boolean(shortName));

    return Array.from(new Set(shortNames)).sort((left, right) => left.localeCompare(right));
  }

  public async create(payload: CreateManagedUserInput) {
    const username = normalizeLegacyUsername(payload.username);
    if (!username) {
      throw new AppError(400, "INVALID_USERNAME", "Username is required.");
    }

    const legacyRole = payload.legacyRole ?? "INTRANET";
    const requestedLegacyTeam = payload.legacyTeam?.trim() || undefined;
    const managedTeam = requestedLegacyTeam
      ? await this.resolveManagedTeamByLabel(requestedLegacyTeam)
      : undefined;
    const legacyTeam = managedTeam?.label ?? requestedLegacyTeam;
    const specificRole = payload.specificRole?.trim() || undefined;
    const team = managedTeam?.key ?? findTeamOptionByLabel(legacyTeam)?.key;
    const role = deriveSystemRole({ legacyRole, legacyTeam, specificRole });
    const permissions = derivePermissions({ legacyRole, team, legacyTeam, specificRole });
    assertStrongPassword(payload.password);

    return this.repository.create({
      email: buildLegacyEmail(username),
      username,
      displayName: payload.displayName?.trim() || buildDisplayName(username),
      shortName: normalizeShortName(payload.shortName),
      role,
      legacyRole,
      team,
      legacyTeam,
      specificRole,
      permissions,
      passwordHash: hashPassword(payload.password)
    });
  }

  public async update(userId: string, payload: UpdateManagedUserInput) {
    const currentUser = await this.repository.findById(userId);
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    }

    const legacyRole = payload.legacyRole ?? currentUser.legacyRole;
    const requestedLegacyTeam = payload.legacyTeam === undefined
      ? currentUser.legacyTeam
      : payload.legacyTeam?.trim() || undefined;
    const managedTeam = payload.legacyTeam === undefined || !requestedLegacyTeam
      ? undefined
      : await this.resolveManagedTeamByLabel(requestedLegacyTeam);
    const legacyTeam = managedTeam?.label ?? requestedLegacyTeam;
    const specificRole = payload.specificRole === undefined
      ? currentUser.specificRole
      : payload.specificRole?.trim() || undefined;
    const username = payload.username === undefined
      ? undefined
      : normalizeEditableUsername(payload.username);
    const displayName = payload.displayName === undefined
      ? undefined
      : normalizeEditableUsername(payload.displayName);
    const team = payload.legacyTeam === undefined
      ? currentUser.team
      : managedTeam?.key ?? findTeamOptionByLabel(legacyTeam)?.key;
    const role = deriveSystemRole({ legacyRole, legacyTeam, specificRole });
    const permissions = derivePermissions({ legacyRole, team, legacyTeam, specificRole });
    const nextPassword = payload.password?.trim();

    if (payload.username !== undefined && !username) {
      throw new AppError(400, "INVALID_USERNAME", "Username is required.");
    }

    if (payload.displayName !== undefined && !displayName) {
      throw new AppError(400, "INVALID_DISPLAY_NAME", "Display name is required.");
    }

    if (nextPassword) {
      assertStrongPassword(nextPassword);
    }

    return this.repository.update(userId, {
      username,
      displayName,
      passwordHash: nextPassword ? hashPassword(nextPassword) : undefined,
      shortName: payload.shortName === undefined ? undefined : normalizeShortName(payload.shortName) ?? null,
      role,
      legacyRole,
      team,
      legacyTeam: legacyTeam ?? null,
      specificRole: specificRole ?? null,
      permissions,
      isActive: payload.isActive,
      passwordResetRequired: nextPassword ? false : undefined,
      emailConfirmedAt: nextPassword
        ? (currentUser.emailConfirmedAt ?? new Date().toISOString())
        : undefined
    });
  }

  public async delete(userId: string) {
    const currentUser = await this.repository.findById(userId);
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    }

    await this.repository.delete(userId);
  }

  public listTeams() {
    return this.repository.listTeams();
  }

  public async createTeam(payload: CreateManagedTeamInput) {
    const label = this.validateTeamLabel(payload.label);
    const teams = await this.repository.listTeams();
    this.assertUniqueTeamLabel(teams, label);

    return this.repository.createTeam({
      key: this.buildUniqueTeamKey(label, teams),
      label,
      executionSpaceEnabled: payload.executionSpaceEnabled ?? false
    });
  }

  public async updateTeam(teamId: string, payload: UpdateManagedTeamInput) {
    const teams = await this.repository.listTeams();
    const currentTeam = teams.find((team) => team.id === teamId);
    if (!currentTeam) {
      throw new AppError(404, "TEAM_NOT_FOUND", "El equipo no fue encontrado.");
    }

    const label = payload.label === undefined ? undefined : this.validateTeamLabel(payload.label);
    if (label !== undefined) {
      this.assertUniqueTeamLabel(teams, label, currentTeam.id);
    }

    const updatedTeam = await this.repository.updateTeam(teamId, {
      label,
      isActive: payload.isActive,
      executionSpaceEnabled: payload.executionSpaceEnabled
    });
    if (!updatedTeam) {
      throw new AppError(404, "TEAM_NOT_FOUND", "El equipo no fue encontrado.");
    }

    return updatedTeam;
  }

  public async deactivateTeam(teamId: string) {
    const updatedTeam = await this.repository.deactivateTeam(teamId);
    if (!updatedTeam) {
      throw new AppError(404, "TEAM_NOT_FOUND", "El equipo no fue encontrado.");
    }

    return updatedTeam;
  }

  private validateTeamLabel(label: string) {
    const normalizedLabel = label.replace(/\s+/g, " ").trim();
    if (!normalizedLabel) {
      throw new AppError(400, "INVALID_TEAM_LABEL", "El nombre del equipo es obligatorio.");
    }

    if (normalizedLabel.length > 80) {
      throw new AppError(400, "INVALID_TEAM_LABEL", "El nombre del equipo no puede exceder 80 caracteres.");
    }

    return normalizedLabel;
  }

  private assertUniqueTeamLabel(teams: ManagedTeam[], label: string, currentTeamId?: string) {
    const normalizedLabel = normalizeTeamLabel(label);
    const duplicatedTeam = teams.find((team) =>
      team.id !== currentTeamId && normalizeTeamLabel(team.label) === normalizedLabel
    );
    if (duplicatedTeam) {
      throw new AppError(409, "TEAM_LABEL_ALREADY_EXISTS", "Ya existe un equipo con ese nombre.");
    }
  }

  private buildUniqueTeamKey(label: string, teams: ManagedTeam[]) {
    const existingKeys = new Set(teams.map((team) => team.key));
    const baseKey = buildTeamKeyBase(label);
    let key = baseKey;
    let suffix = 2;

    while (existingKeys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    return key;
  }

  private async resolveManagedTeamByLabel(label: string) {
    const normalizedLabel = normalizeTeamLabel(label);
    const team = (await this.repository.listTeams()).find((entry) => normalizeTeamLabel(entry.label) === normalizedLabel);
    if (!team) {
      throw new AppError(400, "TEAM_NOT_FOUND", "El equipo seleccionado no existe. Crea o reactiva el equipo antes de asignarlo.");
    }

    if (!team.isActive) {
      throw new AppError(400, "TEAM_INACTIVE", "El equipo seleccionado esta desactivado.");
    }

    return team;
  }
}
