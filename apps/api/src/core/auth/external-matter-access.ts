import { buildTaskModuleIdFromTeamKey, type Matter } from "@sige/contracts";

import type { SessionUser } from "./types";

type MatterReferenceRecord = {
  matterId?: string | null;
  matterNumber?: string | null;
  matterIdentifier?: string | null;
};

export function normalizeExternalAccessText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isExternalScopedUser(user: Pick<SessionUser, "isExternal">) {
  return user.isExternal === true;
}

export function getExternalVisibilityKeys(user: Pick<SessionUser, "shortName" | "username" | "displayName">) {
  const keys = [user.shortName, user.username, user.displayName]
    .map(normalizeExternalAccessText)
    .filter((value) => value.length > 0 && value !== "general");

  return new Set(keys);
}

export function canAccessExternalMatter(
  user: Pick<SessionUser, "shortName" | "username" | "displayName">,
  matter: Pick<Matter, "visibility">
) {
  const visibility = normalizeExternalAccessText(matter.visibility);
  return visibility.length > 0 && getExternalVisibilityKeys(user).has(visibility);
}

export function filterExternalVisibleMatters<T extends Pick<Matter, "visibility">>(
  user: Pick<SessionUser, "shortName" | "username" | "displayName">,
  matters: T[]
) {
  return matters.filter((matter) => canAccessExternalMatter(user, matter));
}

export function buildMatterReferenceKeys(matters: Array<Pick<Matter, "id" | "matterNumber" | "matterIdentifier">>) {
  const keys = new Set<string>();
  for (const matter of matters) {
    for (const value of [matter.id, matter.matterNumber, matter.matterIdentifier]) {
      const key = normalizeExternalAccessText(value);
      if (key) {
        keys.add(key);
      }
    }
  }

  return keys;
}

export function matchesMatterReference(keys: Set<string>, record: MatterReferenceRecord) {
  return [record.matterId, record.matterNumber, record.matterIdentifier].some((value) => {
    const key = normalizeExternalAccessText(value);
    return key.length > 0 && keys.has(key);
  });
}

export function buildExternalTaskModuleIds(matters: Array<Pick<Matter, "responsibleTeam" | "executionLinkedModule">>) {
  const moduleIds = new Set<string>();
  for (const matter of matters) {
    const linkedModule = normalizeExternalAccessText(matter.executionLinkedModule);
    if (linkedModule) {
      moduleIds.add(matter.executionLinkedModule!.trim());
      continue;
    }

    const moduleId = buildTaskModuleIdFromTeamKey(matter.responsibleTeam);
    if (moduleId) {
      moduleIds.add(moduleId);
    }
  }

  return moduleIds;
}
