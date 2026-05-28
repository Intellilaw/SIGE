import type { ModuleSettingsActor, ModuleSettingsRepository } from "../../repositories/types";

export class ModuleSettingsService {
  public constructor(private readonly repository: ModuleSettingsRepository) {}

  public list() {
    return this.repository.list();
  }

  public setModuleEnabled(moduleId: string, isEnabled: boolean, actor: ModuleSettingsActor) {
    return this.repository.setModuleEnabled(moduleId, isEnabled, actor);
  }
}
