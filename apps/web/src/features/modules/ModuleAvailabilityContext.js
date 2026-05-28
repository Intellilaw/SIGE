import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "../../api/http-client";
import { isAlwaysEnabledModule } from "../../config/modules";
const ModuleAvailabilityContext = createContext(null);
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
export function ModuleAvailabilityProvider({ children }) {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    async function refresh() {
        setLoading(true);
        setError(null);
        try {
            const response = await apiGet("/module-settings");
            setSettings(response.settings);
        }
        catch (refreshError) {
            setError(getErrorMessage(refreshError));
            setSettings([]);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void refresh();
    }, []);
    const settingsByModuleId = useMemo(() => new Map(settings.map((setting) => [setting.moduleId, setting])), [settings]);
    const disabledModuleIds = useMemo(() => settings
        .filter((setting) => !setting.isEnabled && !isAlwaysEnabledModule(setting.moduleId))
        .map((setting) => setting.moduleId), [settings]);
    function isModuleEnabled(moduleId) {
        return isAlwaysEnabledModule(moduleId) || settingsByModuleId.get(moduleId)?.isEnabled !== false;
    }
    async function setModuleEnabled(moduleId, isEnabled) {
        const updatedSetting = await apiPatch(`/module-settings/${moduleId}`, { isEnabled });
        setSettings((current) => {
            const withoutTarget = current.filter((setting) => setting.moduleId !== moduleId);
            return [...withoutTarget, updatedSetting].sort((left, right) => left.moduleId.localeCompare(right.moduleId));
        });
        setError(null);
        return updatedSetting;
    }
    const value = useMemo(() => ({
        disabledModuleIds,
        loading,
        error,
        isModuleEnabled,
        refresh,
        setModuleEnabled
    }), [disabledModuleIds, error, loading, settingsByModuleId]);
    return _jsx(ModuleAvailabilityContext.Provider, { value: value, children: children });
}
export function useModuleAvailability() {
    const context = useContext(ModuleAvailabilityContext);
    if (!context) {
        throw new Error("useModuleAvailability must be used inside ModuleAvailabilityProvider");
    }
    return context;
}
