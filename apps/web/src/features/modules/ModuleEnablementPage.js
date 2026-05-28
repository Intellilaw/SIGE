import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { appModules, canAccessGeneralSupervision, getToggleableAppModules } from "../../config/modules";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";
import { useModuleAvailability } from "./ModuleAvailabilityContext";
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
export function ModuleEnablementPage() {
    const { user } = useAuth();
    const { error, isModuleEnabled, loading, refresh, setModuleEnabled } = useModuleAvailability();
    const [flash, setFlash] = useState(null);
    const [updatingModuleId, setUpdatingModuleId] = useState(null);
    const canManageModules = canAccessGeneralSupervision(user);
    const toggleableModules = useMemo(() => getToggleableAppModules(), []);
    const enabledCount = toggleableModules.filter((module) => isModuleEnabled(module.id)).length;
    const disabledCount = toggleableModules.length - enabledCount;
    async function handleToggle(moduleId, isEnabled) {
        setFlash(null);
        setUpdatingModuleId(moduleId);
        try {
            await setModuleEnabled(moduleId, isEnabled);
            const moduleLabel = appModules.find((module) => module.id === moduleId)?.label ?? moduleId;
            setFlash({
                tone: "success",
                text: `${moduleLabel} quedo ${isEnabled ? "habilitado" : "deshabilitado"} correctamente.`
            });
        }
        catch (toggleError) {
            setFlash({ tone: "error", text: getErrorMessage(toggleError) });
        }
        finally {
            setUpdatingModuleId(null);
        }
    }
    if (!canManageModules) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return (_jsxs("section", { className: "page-stack module-enablement-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u2611\uFE0F" }), _jsx("div", { children: _jsx("h2", { children: "Habilitaci\u00F3n de m\u00F3dulos" }) })] }), _jsx("p", { className: "muted", children: "Activacion global de modulos visibles en SIGE. Deshabilitar un modulo solo lo oculta; sus datos permanecen intactos." })] }), _jsxs("div", { className: "summary-grid", children: [_jsx(SummaryCard, { label: "Modulos administrables", value: toggleableModules.length, accent: "#1d4ed8" }), _jsx(SummaryCard, { label: "Habilitados", value: enabledCount, accent: "#0f766e" }), _jsx(SummaryCard, { label: "Ocultos", value: disabledCount, accent: "#b42318" })] }), error ? _jsx("div", { className: "message-banner message-warning", children: error }) : null, flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, _jsxs("section", { className: "panel module-enablement-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Modulos del sistema" }), _jsx("button", { className: "secondary-button", disabled: loading, onClick: () => void refresh(), type: "button", children: loading ? "Actualizando..." : "Refrescar" })] }), _jsx("div", { className: "module-enablement-list", children: toggleableModules.map((module) => {
                            const enabled = isModuleEnabled(module.id);
                            const updating = updatingModuleId === module.id;
                            return (_jsxs("label", { className: `module-enablement-row ${enabled ? "is-enabled" : "is-disabled"}`, children: [_jsx("input", { checked: enabled, disabled: loading || updating || Boolean(updatingModuleId), onChange: (event) => void handleToggle(module.id, event.target.checked), type: "checkbox" }), _jsx("span", { className: "module-enablement-icon", "aria-hidden": "true", children: module.icon }), _jsxs("span", { className: "module-enablement-copy", children: [_jsx("strong", { children: module.label }), _jsx("span", { children: module.description })] }), _jsx("span", { className: `status-pill ${enabled ? "status-live" : "status-warning"}`, children: updating ? "Guardando..." : enabled ? "Visible" : "Oculto" })] }, module.id));
                        }) })] })] }));
}
