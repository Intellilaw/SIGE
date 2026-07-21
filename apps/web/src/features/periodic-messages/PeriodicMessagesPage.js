import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
const EMPTY = {
    teamKey: "", name: "", senderEmail: "", toRecipients: [], ccRecipients: [], bccRecipients: [], subject: "", bodyHtml: "", signatureText: "",
    attachments: [], frequency: "MONTHLY", interval: 1, weekdays: [], dayOfMonth: 1, startAt: "", endAt: null,
    timezone: "America/Mexico_City", nonBusinessDayPolicy: "NEXT_BUSINESS_DAY", nonBusinessOverrideAck: false, status: "PAUSED"
};
const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function csv(value) { return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean); }
function localDateTime(value) { return value ? new Date(value).toISOString().slice(0, 16) : ""; }
function apiDateTime(value) { return value ? new Date(value).toISOString() : null; }
function frequencyLabel(message) {
    if (message.frequency === "DAILY")
        return `Cada ${message.interval} día(s)`;
    if (message.frequency === "WEEKLY")
        return `Semanal: ${message.weekdays.map((day) => DAY_LABELS[day]).join(", ")}`;
    if (message.frequency === "MONTHLY")
        return `Mensual, día ${message.dayOfMonth}`;
    return `Personalizada, cada ${message.interval} día(s)`;
}
const GOOGLE_CALLBACK_MESSAGES = {
    GOOGLE_OAUTH_DENIED: "La autorización de Google fue cancelada.",
    GOOGLE_OAUTH_EMAIL_MISMATCH: "Debes elegir una cuenta de Google Workspace terminada en @rusconi.law.",
    GOOGLE_OAUTH_EMAIL_IN_USE: "Esa cuenta de Google Workspace ya está conectada a otro usuario de SIGE.",
    GOOGLE_OAUTH_SCOPE_MISSING: "Google no concedió el permiso para enviar correos.",
    GOOGLE_OAUTH_REFRESH_TOKEN_MISSING: "Google no devolvió autorización para envíos posteriores.",
    GOOGLE_OAUTH_STATE_EXPIRED: "La autorización expiró. Intenta conectar la cuenta nuevamente."
};
function GoogleWorkspaceConnectionPanel() {
    const [connection, setConnection] = useState(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [notice, setNotice] = useState(null);
    const [panelError, setPanelError] = useState(null);
    async function loadConnection() {
        setConnection(await apiGet("/google-workspace/connection"));
    }
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const googleStatus = params.get("google");
        if (googleStatus === "connected") {
            setNotice("Tu cuenta de Google Workspace quedó conectada correctamente.");
        }
        else if (googleStatus === "error") {
            const code = params.get("googleCode") ?? "";
            setPanelError(GOOGLE_CALLBACK_MESSAGES[code] ?? "Google no pudo completar la autorización. Inténtalo nuevamente.");
        }
        if (googleStatus) {
            window.history.replaceState({}, "", window.location.pathname);
        }
        void loadConnection()
            .catch((reason) => setPanelError(reason instanceof Error ? reason.message : "No fue posible consultar Google Workspace."))
            .finally(() => setLoading(false));
    }, []);
    async function connect() {
        setWorking(true);
        setPanelError(null);
        setNotice(null);
        try {
            const response = await apiPost("/google-workspace/oauth/start", {
                returnPath: window.location.pathname
            });
            window.location.assign(response.authorizationUrl);
        }
        catch (reason) {
            setPanelError(reason instanceof Error ? reason.message : "No fue posible iniciar la autorización de Google.");
            setWorking(false);
        }
    }
    async function disconnect() {
        if (!window.confirm("¿Desconectar tu cuenta de Google Workspace de SIGE?"))
            return;
        setWorking(true);
        setPanelError(null);
        setNotice(null);
        try {
            await apiDelete("/google-workspace/connection");
            await loadConnection();
            setNotice("La cuenta fue desconectada de SIGE.");
        }
        catch (reason) {
            setPanelError(reason instanceof Error ? reason.message : "No fue posible desconectar la cuenta.");
        }
        finally {
            setWorking(false);
        }
    }
    async function sendTest() {
        setWorking(true);
        setPanelError(null);
        setNotice(null);
        try {
            const response = await apiPost("/google-workspace/test", {});
            setNotice(`Prueba enviada a ${response.recipient}. Revisa Recibidos y Enviados en Gmail.`);
            await loadConnection();
        }
        catch (reason) {
            setPanelError(reason instanceof Error ? reason.message : "Gmail no pudo enviar el mensaje de prueba.");
        }
        finally {
            setWorking(false);
        }
    }
    const isActive = connection?.status === "ACTIVE";
    const statusLabel = loading ? "Consultando" : isActive ? "Conectada" : connection?.status === "REAUTH_REQUIRED" ? "Requiere reconexión" : "Sin conectar";
    return _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Google Workspace" }), _jsx("span", { children: statusLabel })] }), loading ? _jsx("div", { className: "centered-inline-message", children: "Verificando la conexi\u00F3n\u2026" }) : null, !loading && !connection?.configured ? _jsxs("div", { className: "message-banner message-warning", children: [_jsx("strong", { children: "Credenciales locales no disponibles." }), " ", connection?.configurationError] }) : null, !loading && connection?.configured && isActive ? _jsxs("div", { className: "message-banner message-success", children: [_jsx("strong", { children: "Cuenta conectada:" }), " ", connection.email] }) : null, !loading && connection?.configured && !isActive ? _jsxs("div", { className: "message-banner message-warning", children: [_jsx("strong", { children: "Conecta una cuenta @rusconi.law." }), " SIGE s\u00F3lo solicitar\u00E1 identidad y permiso para enviar correo."] }) : null, notice ? _jsx("div", { className: "message-banner message-success", children: notice }) : null, panelError ? _jsx("div", { className: "message-banner message-error", children: panelError }) : null, !loading && connection?.configured ? _jsx("div", { className: "periodic-form-actions", children: isActive
                    ? _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "primary-button", disabled: working, onClick: () => void sendTest(), children: working ? "Procesando…" : "Enviar prueba a mi correo" }), _jsx("button", { type: "button", className: "secondary-button", disabled: working, onClick: () => void disconnect(), children: "Desconectar" })] })
                    : _jsx("button", { type: "button", className: "primary-button", disabled: working, onClick: () => void connect(), children: working ? "Abriendo Google…" : "Conectar cuenta @rusconi.law" }) }) : null] });
}
export function PeriodicMessagesPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const canViewIndex = Boolean(user?.permissions?.includes("*") || user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN");
    useEffect(() => { apiGet("/periodic-messages/teams").then(setTeams).finally(() => setLoading(false)); }, []);
    if (!loading && !slug && teams.length === 1 && !canViewIndex)
        return _jsx(Navigate, { to: `/app/periodic-messages/${encodeURIComponent(teams[0].id)}`, replace: true });
    if (slug)
        return _jsx(TeamMessages, { teams: teams, slug: slug, onBack: () => navigate("/app/periodic-messages") });
    return _jsxs("section", { className: "page-stack periodic-messages-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", children: "\u2709" }), _jsx("div", { children: _jsx("h2", { children: "Mensajes peri\u00F3dicos programados" }) })] }), _jsx("p", { className: "muted", children: "Programaci\u00F3n central de correos por equipo, con remitentes autorizados e historial de ejecuci\u00F3n." })] }), _jsx(GoogleWorkspaceConnectionPanel, {}), _jsxs("div", { className: "message-banner message-warning", children: [_jsx("strong", { children: "Env\u00EDos autom\u00E1ticos a\u00FAn deshabilitados." }), " La conexi\u00F3n y el env\u00EDo de prueba ya pueden validarse; las programaciones permanecer\u00E1n pausadas hasta habilitar el worker."] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Equipos" }), _jsx("span", { children: loading ? "Cargando" : `${teams.length} módulos` })] }), _jsx("div", { className: "execution-module-grid", children: teams.map((team) => _jsxs("button", { className: "execution-module-card", onClick: () => navigate(`/app/periodic-messages/${encodeURIComponent(team.id)}`), children: [_jsx("span", { className: "execution-module-icon", children: "\u2709" }), _jsx("strong", { children: team.label }), _jsxs("p", { children: ["Programaciones, remitentes e historial de ", team.label, "."] })] }, team.id)) })] })] });
}
function TeamMessages({ teams, slug, onBack }) {
    const team = teams.find((candidate) => candidate.id === slug);
    const [senders, setSenders] = useState([]);
    const [messages, setMessages] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [historyFor, setHistoryFor] = useState(null);
    const [deliveries, setDeliveries] = useState([]);
    const bodyRef = useRef(null);
    async function load(moduleId) {
        const [senderRows, messageRows] = await Promise.all([
            apiGet(`/periodic-messages/senders?teamKey=${encodeURIComponent(moduleId)}`),
            apiGet(`/periodic-messages?teamKey=${encodeURIComponent(moduleId)}`)
        ]);
        setSenders(senderRows);
        setMessages(messageRows);
        const preferredSender = senderRows.find((sender) => sender.connectionStatus === "ACTIVE") ?? senderRows[0];
        setForm((current) => ({ ...current, teamKey: moduleId, senderEmail: current.senderEmail || preferredSender?.email || "" }));
    }
    useEffect(() => { if (team)
        void load(team.id).catch((reason) => setError(reason instanceof Error ? reason.message : "No fue posible cargar el módulo.")); }, [team?.id]);
    const totalFailures = useMemo(() => 0, [messages]);
    function applyFormat(before, after = before) {
        const element = bodyRef.current;
        if (!element)
            return;
        const start = element.selectionStart;
        const end = element.selectionEnd;
        setForm((current) => ({ ...current, bodyHtml: current.bodyHtml.slice(0, start) + before + current.bodyHtml.slice(start, end) + after + current.bodyHtml.slice(end) }));
    }
    function edit(message) {
        setEditingId(message.id);
        setForm({ ...message, startAt: localDateTime(message.startAt), endAt: localDateTime(message.endAt) || null });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function reset() { setEditingId(null); setForm({ ...EMPTY, teamKey: team?.id ?? "", senderEmail: senders[0]?.email ?? "" }); }
    async function submit(event) {
        event.preventDefault();
        setError(null);
        if (form.nonBusinessDayPolicy === "SEND_ANYWAY" && !form.nonBusinessOverrideAck) {
            setError("Confirma expresamente que deseas enviar aun en día inhábil.");
            return;
        }
        setSaving(true);
        try {
            const payload = { ...form, startAt: apiDateTime(form.startAt), endAt: apiDateTime(form.endAt) };
            if (editingId)
                await apiPatch(`/periodic-messages/${editingId}`, payload);
            else
                await apiPost("/periodic-messages", payload);
            reset();
            if (team)
                await load(team.id);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "No fue posible guardar la programación.");
        }
        finally {
            setSaving(false);
        }
    }
    async function remove(message) {
        if (!window.confirm(`¿Eliminar lógicamente “${message.name}”? El historial se conservará.`))
            return;
        await apiDelete(`/periodic-messages/${message.id}`);
        if (team)
            await load(team.id);
    }
    async function showHistory(message) {
        setHistoryFor(message);
        try {
            setDeliveries(await apiGet(`/periodic-messages/${message.id}/deliveries`));
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "No fue posible cargar el historial.");
        }
    }
    if (!team)
        return _jsx("section", { className: "page-stack", children: _jsx("div", { className: "centered-inline-message", children: "Cargando equipo\u2026" }) });
    return _jsxs("section", { className: "page-stack periodic-messages-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("button", { className: "secondary-button", onClick: onBack, children: "Volver a equipos" }), _jsxs("h2", { children: ["Mensajes peri\u00F3dicos \u2014 ", team.label] }), _jsx("p", { className: "muted", children: "Todos los integrantes del equipo y los super admins pueden administrar estas programaciones." })] }), _jsx(GoogleWorkspaceConnectionPanel, {}), _jsxs("div", { className: "message-banner message-warning", children: [_jsx("strong", { children: "Worker pendiente." }), " Puedes conectar remitentes y probar Gmail; las programaciones autom\u00E1ticas todav\u00EDa no se ejecutan."] }), error ? _jsx("div", { className: "message-banner message-error", children: error }) : null, _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: editingId ? "Editar programación" : "Nueva programación" }), _jsxs("span", { children: [senders.length, " remitentes autorizados"] })] }), _jsxs("form", { className: "periodic-message-form", onSubmit: submit, children: [_jsxs("label", { children: ["Nombre interno", _jsx("input", { value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), required: true })] }), _jsxs("label", { children: ["Remitente", _jsxs("select", { value: form.senderEmail, onChange: (e) => setForm({ ...form, senderEmail: e.target.value }), required: true, children: [_jsx("option", { value: "", children: "Seleccionar" }), senders.map((sender) => _jsxs("option", { value: sender.email, children: [sender.displayName, " \u2014 ", sender.email, sender.connectionStatus === "ACTIVE" ? " — Google conectado" : " — sin conectar"] }, sender.id))] })] }), _jsxs("label", { className: "span-2", children: ["Para", _jsx("textarea", { value: form.toRecipients.join("; "), onChange: (e) => setForm({ ...form, toRecipients: csv(e.target.value) }), placeholder: "correo@ejemplo.com; otro@ejemplo.com", required: true })] }), _jsxs("label", { children: ["CC", _jsx("textarea", { value: form.ccRecipients.join("; "), onChange: (e) => setForm({ ...form, ccRecipients: csv(e.target.value) }) })] }), _jsxs("label", { children: ["CCO", _jsx("textarea", { value: form.bccRecipients.join("; "), onChange: (e) => setForm({ ...form, bccRecipients: csv(e.target.value) }) })] }), _jsxs("label", { className: "span-2", children: ["Asunto", _jsx("input", { value: form.subject, onChange: (e) => setForm({ ...form, subject: e.target.value }), required: true })] }), _jsxs("div", { className: "span-2 periodic-editor", children: [_jsx("span", { children: "Mensaje" }), _jsxs("div", { className: "periodic-editor-toolbar", children: [_jsx("button", { type: "button", onClick: () => applyFormat("<strong>", "</strong>"), children: _jsx("strong", { children: "N" }) }), _jsx("button", { type: "button", onClick: () => applyFormat("<em>", "</em>"), children: _jsx("em", { children: "C" }) }), _jsx("button", { type: "button", onClick: () => applyFormat("<u>", "</u>"), children: _jsx("u", { children: "S" }) }), _jsx("button", { type: "button", onClick: () => applyFormat("<ul><li>", "</li></ul>"), children: "Lista" }), _jsx("button", { type: "button", onClick: () => applyFormat('<a href="https://">', "</a>"), children: "Enlace" })] }), _jsx("textarea", { ref: bodyRef, value: form.bodyHtml, onChange: (e) => setForm({ ...form, bodyHtml: e.target.value }), rows: 8, required: true })] }), _jsxs("label", { className: "span-2", children: ["Firma en texto", _jsx("textarea", { value: form.signatureText ?? "", onChange: (e) => setForm({ ...form, signatureText: e.target.value }), rows: 3 })] }), _jsxs("label", { className: "span-2", children: ["Adjuntos (m\u00E1ximo 20; se registran ahora y se cargar\u00E1n al habilitar Google Workspace)", _jsx("input", { type: "file", multiple: true, onChange: (e) => setForm({ ...form, attachments: Array.from(e.target.files ?? []).map((file) => ({ name: file.name, size: file.size, type: file.type })) }) }), form.attachments.length ? _jsx("small", { children: form.attachments.map((item) => item.name).join(", ") }) : null] }), _jsxs("label", { children: ["Frecuencia", _jsxs("select", { value: form.frequency, onChange: (e) => setForm({ ...form, frequency: e.target.value }), children: [_jsx("option", { value: "DAILY", children: "Diaria" }), _jsx("option", { value: "WEEKLY", children: "Semanal" }), _jsx("option", { value: "MONTHLY", children: "Mensual" }), _jsx("option", { value: "CUSTOM", children: "Personalizada" })] })] }), _jsxs("label", { children: ["Intervalo", _jsx("input", { type: "number", min: "1", max: "365", value: form.interval, onChange: (e) => setForm({ ...form, interval: Number(e.target.value) }) })] }), form.frequency === "WEEKLY" ? _jsx("div", { className: "span-2 weekday-picker", children: DAY_LABELS.map((label, day) => _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: form.weekdays.includes(day), onChange: () => setForm({ ...form, weekdays: form.weekdays.includes(day) ? form.weekdays.filter((value) => value !== day) : [...form.weekdays, day] }) }), label] }, label)) }) : null, form.frequency === "MONTHLY" ? _jsxs("label", { children: ["D\u00EDa del mes", _jsx("input", { type: "number", min: "1", max: "31", value: form.dayOfMonth ?? 1, onChange: (e) => setForm({ ...form, dayOfMonth: Number(e.target.value) }) })] }) : null, _jsxs("label", { children: ["Inicio", _jsx("input", { type: "datetime-local", value: form.startAt, onChange: (e) => setForm({ ...form, startAt: e.target.value }), required: true })] }), _jsxs("label", { children: ["Fecha final (opcional)", _jsx("input", { type: "datetime-local", value: form.endAt ?? "", onChange: (e) => setForm({ ...form, endAt: e.target.value || null }) })] }), _jsxs("label", { children: ["Zona horaria", _jsx("input", { value: form.timezone, onChange: (e) => setForm({ ...form, timezone: e.target.value }) })] }), _jsxs("label", { children: ["Ajuste por d\u00EDa inh\u00E1bil", _jsxs("select", { value: form.nonBusinessDayPolicy, onChange: (e) => setForm({ ...form, nonBusinessDayPolicy: e.target.value, nonBusinessOverrideAck: false }), children: [_jsx("option", { value: "NEXT_BUSINESS_DAY", children: "D\u00EDa h\u00E1bil siguiente" }), _jsx("option", { value: "PREVIOUS_BUSINESS_DAY", children: "D\u00EDa h\u00E1bil anterior" }), _jsx("option", { value: "SEND_ANYWAY", children: "Enviar aun en d\u00EDa inh\u00E1bil" })] })] }), form.nonBusinessDayPolicy === "SEND_ANYWAY" ? _jsxs("label", { className: "span-2 message-banner message-warning", children: [_jsx("input", { type: "checkbox", checked: form.nonBusinessOverrideAck, onChange: (e) => setForm({ ...form, nonBusinessOverrideAck: e.target.checked }) }), " Entiendo que el mensaje se enviar\u00E1 aunque la fecha est\u00E9 marcada como inh\u00E1bil."] }) : null, _jsxs("label", { children: ["Estado", _jsxs("select", { value: form.status, onChange: (e) => setForm({ ...form, status: e.target.value }), children: [_jsx("option", { value: "PAUSED", children: "Pausada" }), _jsx("option", { value: "ACTIVE", children: "Activa (pendiente del servicio)" })] })] }), _jsxs("div", { className: "span-2 periodic-form-actions", children: [_jsx("button", { className: "primary-button", disabled: saving, children: saving ? "Guardando…" : editingId ? "Guardar cambios futuros" : "Crear programación" }), editingId ? _jsx("button", { type: "button", className: "secondary-button", onClick: reset, children: "Cancelar" }) : null] })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Programaciones" }), _jsxs("span", { children: [messages.length, " vigentes \u00B7 ", totalFailures, " fallidas"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nombre y asunto" }), _jsx("th", { children: "Remitente" }), _jsx("th", { children: "Periodicidad" }), _jsx("th", { children: "Pr\u00F3xima ejecuci\u00F3n" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: messages.length === 0 ? _jsx("tr", { children: _jsx("td", { colSpan: 6, className: "centered-inline-message", children: "No hay programaciones para este equipo." }) }) : messages.map((message) => _jsxs("tr", { children: [_jsxs("td", { children: [_jsx("strong", { children: message.name }), _jsx("small", { children: message.subject })] }), _jsx("td", { children: message.senderEmail }), _jsx("td", { children: frequencyLabel(message) }), _jsx("td", { children: message.nextRunAt ? new Date(message.nextRunAt).toLocaleString("es-MX") : "—" }), _jsx("td", { children: _jsx("span", { className: `periodic-status periodic-status-${message.status.toLowerCase()}`, children: message.status === "ACTIVE" ? "Activa" : "Pausada" }) }), _jsx("td", { children: _jsxs("div", { className: "table-action-row", children: [_jsx("button", { className: "secondary-button", onClick: () => void showHistory(message), children: "Historial" }), _jsx("button", { className: "secondary-button", onClick: () => edit(message), children: "Editar" }), _jsx("button", { className: "danger-button", onClick: () => void remove(message), children: "Eliminar" })] }) })] }, message.id)) })] }) })] }), historyFor ? _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Historial \u2014 ", historyFor.name] }), _jsx("button", { className: "secondary-button", onClick: () => setHistoryFor(null), children: "Cerrar" })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Programado para" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Intentos" }), _jsx("th", { children: "Enviado" }), _jsx("th", { children: "Detalle" })] }) }), _jsx("tbody", { children: deliveries.length === 0 ? _jsx("tr", { children: _jsx("td", { colSpan: 5, className: "centered-inline-message", children: "Sin ejecuciones. El servicio de Google Workspace permanece deshabilitado." }) }) : deliveries.map((delivery) => _jsxs("tr", { children: [_jsx("td", { children: new Date(delivery.scheduledFor).toLocaleString("es-MX") }), _jsx("td", { children: delivery.status }), _jsxs("td", { children: [delivery.attemptCount, "/3"] }), _jsx("td", { children: delivery.sentAt ? new Date(delivery.sentAt).toLocaleString("es-MX") : "—" }), _jsx("td", { children: delivery.failureMessage ?? "—" })] }, delivery.id)) })] }) })] }) : null] });
}
