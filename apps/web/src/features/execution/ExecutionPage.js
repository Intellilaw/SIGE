import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiGet } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { buildExecutionModuleDescriptors } from "./execution-config";
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "No se pudieron cargar los equipos de Ejecucion.";
}
export function ExecutionPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [taskModules, setTaskModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const visibleModules = useMemo(() => buildExecutionModuleDescriptors(taskModules), [taskModules]);
    const canViewIndex = Boolean(user?.permissions?.includes("*") || user?.team === "CLIENT_RELATIONS" || user?.team === "ADMIN" || user?.role === "SUPERADMIN");
    useEffect(() => {
        let active = true;
        async function loadModules() {
            setLoading(true);
            setErrorMessage(null);
            try {
                const loadedModules = await apiGet("/tasks/modules");
                if (active) {
                    setTaskModules(loadedModules);
                }
            }
            catch (error) {
                if (active) {
                    setErrorMessage(getErrorMessage(error));
                }
            }
            finally {
                if (active) {
                    setLoading(false);
                }
            }
        }
        void loadModules();
        return () => {
            active = false;
        };
    }, []);
    if (!loading && visibleModules.length === 1 && !canViewIndex) {
        return _jsx(Navigate, { to: `/app/execution/${visibleModules[0].slug}`, replace: true });
    }
    if (!loading && visibleModules.length === 0 && !errorMessage) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u2699\uFE0F" }), _jsx("div", { children: _jsx("h2", { children: "Ejecucion" }) })] }), _jsx("p", { className: "muted", children: "Tu equipo actual no tiene acceso a este modulo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u2699\uFE0F" }), _jsx("div", { children: _jsx("h2", { children: "Ejecucion" }) })] }), _jsx("p", { className: "muted", children: "Operacion por equipo con tablero separado y visibilidad de siguientes tareas, con resaltado en rojo cuando falta informacion o hay vencimientos." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Equipos" }), _jsx("span", { children: loading ? "Cargando" : `${visibleModules.length} modulos` })] }), _jsx("div", { className: "execution-module-grid", children: visibleModules.map((module) => (_jsxs("button", { type: "button", className: "execution-module-card", onClick: () => navigate(`/app/execution/${module.slug}`), children: [_jsx("span", { className: "execution-module-icon", style: { color: module.color }, children: module.icon }), _jsx("strong", { children: module.label }), _jsx("p", { children: module.description })] }, module.moduleId))) })] })] }));
}
