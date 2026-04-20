import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
function normalizeText(value) {
    return (value ?? "").trim();
}
function normalizeComparableText(value) {
    return normalizeText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function formatDate(value) {
    if (!value) {
        return "-";
    }
    return new Date(value).toLocaleDateString("es-MX");
}
function groupByClient(items) {
    return items.reduce((groups, matter) => {
        const clientKey = normalizeText(matter.clientName) || "Sin Cliente";
        groups[clientKey] ??= [];
        groups[clientKey].push(matter);
        return groups;
    }, {});
}
function sortCatalogMatters(items) {
    return [...items].sort((left, right) => {
        const clientCompare = normalizeText(left.clientName).localeCompare(normalizeText(right.clientName), "es-MX", {
            sensitivity: "base"
        });
        if (clientCompare !== 0) {
            return clientCompare;
        }
        return normalizeText(left.matterIdentifier).localeCompare(normalizeText(right.matterIdentifier), "es-MX", {
            numeric: true,
            sensitivity: "base"
        });
    });
}
export function MatterCatalogPage() {
    const { user } = useAuth();
    const [matters, setMatters] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
    async function loadCatalog() {
        setLoading(true);
        setErrorMessage(null);
        try {
            const loadedMatters = await apiGet("/matters");
            setMatters(sortCatalogMatters(loadedMatters.filter((matter) => normalizeText(matter.matterIdentifier))));
            setSelectedIds(new Set());
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Ocurrio un error al cargar el catalogo.");
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadCatalog();
    }, []);
    function toggleSelection(matterId, checked) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (checked) {
                next.add(matterId);
            }
            else {
                next.delete(matterId);
            }
            return next;
        });
    }
    async function handleBulkDelete() {
        if (selectedIds.size === 0) {
            return;
        }
        if (!window.confirm(`PELIGRO: Esto borrara permanentemente ${selectedIds.size} asuntos activos.\n\nEstas seguro?`)) {
            return;
        }
        setLoading(true);
        setErrorMessage(null);
        try {
            await apiPost("/matters/bulk-delete", { ids: Array.from(selectedIds) });
            window.alert("Asuntos eliminados correctamente.");
            await loadCatalog();
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "No se pudieron eliminar los asuntos seleccionados.");
            setLoading(false);
        }
    }
    const filteredMatters = useMemo(() => {
        const search = normalizeComparableText(searchTerm);
        if (!search) {
            return matters;
        }
        return matters.filter((matter) => {
            const values = [matter.clientName, matter.quoteNumber, matter.matterIdentifier, matter.subject];
            return values.some((value) => normalizeComparableText(value).includes(search));
        });
    }, [matters, searchTerm]);
    const groupedMatters = useMemo(() => groupByClient(filteredMatters), [filteredMatters]);
    const clientNames = useMemo(() => Object.keys(groupedMatters).sort((left, right) => left.localeCompare(right, "es-MX", { sensitivity: "base" })), [groupedMatters]);
    return (_jsxs("section", { className: "page-stack matter-catalog-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Catalogo" }), _jsx("div", { children: _jsx("h2", { children: "Catalogo de Asuntos" }) })] }), _jsx("p", { className: "muted", children: "Consulta de asuntos con ID asignado, agrupados por cliente y ordenados por identificador." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel matters-toolbar", children: [_jsxs("div", { className: "matters-toolbar-actions", children: [_jsxs("label", { className: "form-field matter-catalog-search", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { type: "text", value: searchTerm, onChange: (event) => setSearchTerm(event.target.value), placeholder: "Cliente, cotizacion, ID o asunto..." })] }), isSuperadmin && selectedIds.size > 0 ? (_jsxs("button", { type: "button", className: "danger-button", onClick: () => void handleBulkDelete(), children: ["Borrar seleccionados (", selectedIds.size, ")"] })) : null] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => void loadCatalog(), children: "Refrescar" })] }), loading ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando catalogo..." }) })) : filteredMatters.length === 0 ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No se encontraron asuntos con ID asignado." }) })) : (clientNames.map((clientName) => (_jsxs("section", { className: "panel matter-catalog-group", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: clientName }), _jsxs("span", { children: [groupedMatters[clientName].length, " asuntos"] })] }), _jsx("div", { className: "lead-table-shell", children: _jsx("div", { className: "lead-table-wrapper matter-catalog-table-wrapper", children: _jsxs("table", { className: "lead-table matter-catalog-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [isSuperadmin ? _jsx("th", { className: "lead-table-checkbox", children: "Sel." }) : null, _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: "Cotizacion" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Fecha creacion" })] }) }), _jsx("tbody", { children: groupedMatters[clientName].map((matter) => (_jsxs("tr", { className: selectedIds.has(matter.id) ? "matter-row-selected" : "", children: [isSuperadmin ? (_jsx("td", { className: "lead-table-checkbox", children: _jsx("input", { type: "checkbox", checked: selectedIds.has(matter.id), onChange: (event) => toggleSelection(matter.id, event.target.checked) }) })) : null, _jsx("td", { className: "lead-table-emphasis", children: matter.matterIdentifier }), _jsx("td", { children: matter.quoteNumber || "-" }), _jsx("td", { children: matter.subject || "-" }), _jsx("td", { children: _jsx("span", { className: `status-pill ${matter.concluded ? "matter-catalog-status-closed" : "matter-catalog-status-active"}`, children: matter.concluded ? "Concluido" : "Activo" }) }), _jsx("td", { children: formatDate(matter.createdAt) })] }, matter.id))) })] }) }) })] }, clientName))))] }));
}
