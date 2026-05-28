import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { appModules, canAccessGeneralSupervision, getToggleableAppModules } from "../../config/modules";
import { SummaryCard } from "../../components/SummaryCard";
import { useAuth } from "../auth/AuthContext";
import { useModuleAvailability } from "./ModuleAvailabilityContext";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

export function ModuleEnablementPage() {
  const { user } = useAuth();
  const {
    error,
    isModuleEnabled,
    loading,
    refresh,
    setModuleEnabled
  } = useModuleAvailability();
  const [flash, setFlash] = useState<FlashState>(null);
  const [updatingModuleId, setUpdatingModuleId] = useState<string | null>(null);
  const canManageModules = canAccessGeneralSupervision(user);
  const toggleableModules = useMemo(() => getToggleableAppModules(), []);
  const enabledCount = toggleableModules.filter((module) => isModuleEnabled(module.id)).length;
  const disabledCount = toggleableModules.length - enabledCount;

  async function handleToggle(moduleId: string, isEnabled: boolean) {
    setFlash(null);
    setUpdatingModuleId(moduleId);

    try {
      await setModuleEnabled(moduleId, isEnabled);
      const moduleLabel = appModules.find((module) => module.id === moduleId)?.label ?? moduleId;
      setFlash({
        tone: "success",
        text: `${moduleLabel} quedo ${isEnabled ? "habilitado" : "deshabilitado"} correctamente.`
      });
    } catch (toggleError) {
      setFlash({ tone: "error", text: getErrorMessage(toggleError) });
    } finally {
      setUpdatingModuleId(null);
    }
  }

  if (!canManageModules) {
    return <Navigate to="/app" replace />;
  }

  return (
    <section className="page-stack module-enablement-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            {"\u2611\uFE0F"}
          </span>
          <div>
            <h2>Habilitaci&oacute;n de m&oacute;dulos</h2>
          </div>
        </div>
        <p className="muted">
          Activacion global de modulos visibles en SIGE. Deshabilitar un modulo solo lo oculta; sus datos permanecen
          intactos.
        </p>
      </header>

      <div className="summary-grid">
        <SummaryCard label="Modulos administrables" value={toggleableModules.length} accent="#1d4ed8" />
        <SummaryCard label="Habilitados" value={enabledCount} accent="#0f766e" />
        <SummaryCard label="Ocultos" value={disabledCount} accent="#b42318" />
      </div>

      {error ? <div className="message-banner message-warning">{error}</div> : null}
      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}

      <section className="panel module-enablement-panel">
        <div className="panel-header">
          <h2>Modulos del sistema</h2>
          <button className="secondary-button" disabled={loading} onClick={() => void refresh()} type="button">
            {loading ? "Actualizando..." : "Refrescar"}
          </button>
        </div>

        <div className="module-enablement-list">
          {toggleableModules.map((module) => {
            const enabled = isModuleEnabled(module.id);
            const updating = updatingModuleId === module.id;

            return (
              <label className={`module-enablement-row ${enabled ? "is-enabled" : "is-disabled"}`} key={module.id}>
                <input
                  checked={enabled}
                  disabled={loading || updating || Boolean(updatingModuleId)}
                  onChange={(event) => void handleToggle(module.id, event.target.checked)}
                  type="checkbox"
                />
                <span className="module-enablement-icon" aria-hidden="true">
                  {module.icon}
                </span>
                <span className="module-enablement-copy">
                  <strong>{module.label}</strong>
                  <span>{module.description}</span>
                </span>
                <span className={`status-pill ${enabled ? "status-live" : "status-warning"}`}>
                  {updating ? "Guardando..." : enabled ? "Visible" : "Oculto"}
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </section>
  );
}
