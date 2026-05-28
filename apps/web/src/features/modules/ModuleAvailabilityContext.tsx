import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { SystemModuleSetting, SystemModuleSettingsResponse } from "@sige/contracts";

import { apiGet, apiPatch } from "../../api/http-client";
import { isAlwaysEnabledModule } from "../../config/modules";

interface ModuleAvailabilityContextValue {
  disabledModuleIds: string[];
  loading: boolean;
  error: string | null;
  isModuleEnabled: (moduleId: string) => boolean;
  refresh: () => Promise<void>;
  setModuleEnabled: (moduleId: string, isEnabled: boolean) => Promise<SystemModuleSetting>;
}

const ModuleAvailabilityContext = createContext<ModuleAvailabilityContextValue | null>(null);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

export function ModuleAvailabilityProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<SystemModuleSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiGet<SystemModuleSettingsResponse>("/module-settings");
      setSettings(response.settings);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const settingsByModuleId = useMemo(
    () => new Map(settings.map((setting) => [setting.moduleId, setting])),
    [settings]
  );

  const disabledModuleIds = useMemo(
    () => settings
      .filter((setting) => !setting.isEnabled && !isAlwaysEnabledModule(setting.moduleId))
      .map((setting) => setting.moduleId),
    [settings]
  );

  function isModuleEnabled(moduleId: string) {
    return isAlwaysEnabledModule(moduleId) || settingsByModuleId.get(moduleId)?.isEnabled !== false;
  }

  async function setModuleEnabled(moduleId: string, isEnabled: boolean) {
    const updatedSetting = await apiPatch<SystemModuleSetting>(`/module-settings/${moduleId}`, { isEnabled });
    setSettings((current) => {
      const withoutTarget = current.filter((setting) => setting.moduleId !== moduleId);
      return [...withoutTarget, updatedSetting].sort((left, right) => left.moduleId.localeCompare(right.moduleId));
    });
    setError(null);
    return updatedSetting;
  }

  const value = useMemo(
    () => ({
      disabledModuleIds,
      loading,
      error,
      isModuleEnabled,
      refresh,
      setModuleEnabled
    }),
    [disabledModuleIds, error, loading, settingsByModuleId]
  );

  return <ModuleAvailabilityContext.Provider value={value}>{children}</ModuleAvailabilityContext.Provider>;
}

export function useModuleAvailability() {
  const context = useContext(ModuleAvailabilityContext);
  if (!context) {
    throw new Error("useModuleAvailability must be used inside ModuleAvailabilityProvider");
  }

  return context;
}
