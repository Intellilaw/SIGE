import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function normalizeText(value) {
    return (value ?? "").trim();
}
function compareClientNumbers(left, right) {
    const leftValue = Number.parseInt(left.replace(/\D/g, ""), 10);
    const rightValue = Number.parseInt(right.replace(/\D/g, ""), 10);
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue !== rightValue) {
        return leftValue - rightValue;
    }
    return left.localeCompare(right, "es-MX", { numeric: true, sensitivity: "base" });
}
function sortClients(items) {
    return [...items].sort((left, right) => {
        const numberDelta = compareClientNumbers(left.clientNumber, right.clientNumber);
        if (numberDelta !== 0) {
            return numberDelta;
        }
        return left.name.localeCompare(right.name, "es-MX", { sensitivity: "base" });
    });
}
function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleDateString("es-MX");
}
export function ClientsPage() {
    const { user } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [flash, setFlash] = useState(null);
    const [search, setSearch] = useState("");
    const [newClientName, setNewClientName] = useState("");
    const [editingClientId, setEditingClientId] = useState(null);
    const [editName, setEditName] = useState("");
    const [creating, setCreating] = useState(false);
    const [savingClientId, setSavingClientId] = useState(null);
    const [deletingClientId, setDeletingClientId] = useState(null);
    const canWriteClients = Boolean(user?.permissions.includes("*") || user?.permissions.includes("clients:write"));
    const canReadClients = Boolean(canWriteClients || user?.permissions.includes("clients:read"));
    async function loadClients() {
        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiGet("/clients");
            setRows(sortClients(data));
        }
        catch (error) {
            setFetchError(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!canReadClients) {
            setLoading(false);
            return;
        }
        void loadClients();
    }, [canReadClients]);
    const filteredRows = useMemo(() => {
        const term = normalizeText(search).toLowerCase();
        if (!term) {
            return rows;
        }
        return rows.filter((client) => {
            const nameMatch = client.name.toLowerCase().includes(term);
            const numberMatch = client.clientNumber.toLowerCase().includes(term);
            return nameMatch || numberMatch;
        });
    }, [rows, search]);
    function resetEditingState() {
        setEditingClientId(null);
        setEditName("");
    }
    function handleStartEdit(client) {
        setFlash(null);
        setEditingClientId(client.id);
        setEditName(client.name);
    }
    async function handleCreate(event) {
        event.preventDefault();
        const normalizedName = normalizeText(newClientName);
        if (normalizedName.length < 2) {
            setFlash({ tone: "error", text: "El nombre del cliente debe tener al menos 2 caracteres." });
            return;
        }
        setFlash(null);
        setCreating(true);
        try {
            const created = await apiPost("/clients", { name: normalizedName });
            setRows((current) => sortClients([...current, created]));
            setNewClientName("");
            setFlash({
                tone: "success",
                text: `Cliente ${created.clientNumber} creado correctamente.`
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setCreating(false);
        }
    }
    async function handleSave(clientId) {
        const normalizedName = normalizeText(editName);
        if (normalizedName.length < 2) {
            setFlash({ tone: "error", text: "El nombre del cliente debe tener al menos 2 caracteres." });
            return;
        }
        setFlash(null);
        setSavingClientId(clientId);
        try {
            const updated = await apiPatch(`/clients/${clientId}`, { name: normalizedName });
            setRows((current) => sortClients(current.map((client) => (client.id === clientId ? updated : client))));
            resetEditingState();
            setFlash({
                tone: "success",
                text: `Cliente ${updated.clientNumber} actualizado correctamente.`
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingClientId(null);
        }
    }
    async function handleDelete(client) {
        if (!window.confirm(`Seguro que deseas borrar al cliente ${client.clientNumber} - ${client.name}?`)) {
            return;
        }
        setFlash(null);
        setDeletingClientId(client.id);
        try {
            await apiDelete(`/clients/${client.id}`);
            setRows((current) => current.filter((entry) => entry.id !== client.id));
            if (editingClientId === client.id) {
                resetEditingState();
            }
            setFlash({
                tone: "success",
                text: `Cliente ${client.clientNumber} borrado correctamente.`
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingClientId(null);
        }
    }
    function handleEditKeyDown(event, clientId) {
        if (event.key === "Enter") {
            event.preventDefault();
            void handleSave(clientId);
        }
        if (event.key === "Escape") {
            event.preventDefault();
            resetEditingState();
        }
    }
    if (!canReadClients) {
        return (_jsx("section", { className: "page-stack", children: _jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: "Clientes" }) }) }), _jsx("p", { className: "muted", children: "Este modulo conserva el padron central de clientes del despacho. Tu perfil actual no tiene permisos para consultarlo." })] }) }));
    }
    return (_jsxs("section", { className: "page-stack clients-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: "Directorio de Clientes" }) }) }), _jsx("p", { className: "muted", children: "Replica funcional del modulo legado: busqueda por nombre o numero, alta operativa inmediata, edicion inline y borrado cuando el cliente todavia no tiene cotizaciones, leads o asuntos vinculados." })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Herramientas" }), _jsxs("span", { children: [filteredRows.length, " de ", rows.length, " registros"] })] }), _jsxs("div", { className: "clients-toolbar", children: [_jsxs("label", { className: "form-field clients-search-field", children: [_jsx("span", { children: "Buscar cliente" }), _jsx("input", { type: "text", value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Buscar por nombre o numero..." })] }), _jsx("div", { className: "clients-toolbar-actions", children: _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadClients(), children: "Refrescar" }) })] })] }), canWriteClients ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Agregar cliente" }), _jsx("span", { children: "Alta rapida" })] }), _jsxs("form", { className: "clients-create-form", onSubmit: handleCreate, children: [_jsxs("label", { className: "form-field clients-create-input", children: [_jsx("span", { children: "Nombre del nuevo cliente" }), _jsx("input", { type: "text", value: newClientName, onChange: (event) => setNewClientName(event.target.value), placeholder: "Captura el nombre completo o razon social", disabled: creating })] }), _jsx("div", { className: "clients-create-actions", children: _jsx("button", { className: "primary-button", type: "submit", disabled: creating, children: creating ? "Agregando..." : "+ Agregar cliente" }) })] })] })) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Registro" }), _jsxs("span", { children: [rows.length, " clientes"] })] }), fetchError ? _jsx("div", { className: "message-banner message-error", children: fetchError }) : null, _jsx("div", { className: "clients-table-shell", children: _jsx("div", { className: "clients-table-wrapper", children: _jsxs("table", { className: "data-table clients-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Nombre" }), _jsx("th", { children: "Alta" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "centered-inline-message", children: "Cargando clientes..." }) })) : filteredRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "centered-inline-message", children: "No se encontraron clientes." }) })) : (filteredRows.map((client) => {
                                            const isEditing = editingClientId === client.id;
                                            const isSaving = savingClientId === client.id;
                                            const isDeleting = deletingClientId === client.id;
                                            return (_jsxs("tr", { children: [_jsx("td", { className: "clients-number-cell", children: client.clientNumber }), _jsx("td", { className: "clients-name-cell", children: isEditing ? (_jsx("input", { className: "clients-inline-input", type: "text", value: editName, autoFocus: true, disabled: isSaving, onChange: (event) => setEditName(event.target.value), onKeyDown: (event) => handleEditKeyDown(event, client.id) })) : (_jsx("strong", { children: client.name })) }), _jsx("td", { children: formatDate(client.createdAt) }), _jsx("td", { children: canWriteClients ? (isEditing ? (_jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "primary-button", type: "button", disabled: isSaving, onClick: () => void handleSave(client.id), children: isSaving ? "Guardando..." : "Guardar" }), _jsx("button", { className: "secondary-button", type: "button", disabled: isSaving, onClick: resetEditingState, children: "Cancelar" })] })) : (_jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", type: "button", disabled: Boolean(savingClientId) || Boolean(deletingClientId), onClick: () => handleStartEdit(client), children: "Editar" }), _jsx("button", { className: "danger-button", type: "button", disabled: Boolean(savingClientId) || isDeleting, onClick: () => void handleDelete(client), children: isDeleting ? "Borrando..." : "Borrar" })] }))) : (_jsx("span", { className: "muted", children: "Solo lectura" })) })] }, client.id));
                                        })) })] }) }) })] })] }));
}
