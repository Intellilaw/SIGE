import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { TaskModuleDefinition } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type Sender = { id: string; email: string; displayName: string };
type Attachment = { name: string; size: number; type: string };
type Delivery = { id: string; scheduledFor: string; status: string; attemptCount: number; sentAt: string | null; failureMessage: string | null };
type Message = FormState & { id: string; nextRunAt: string | null; updatedAt: string; createdByName: string };
type FormState = {
  teamKey: string; name: string; senderEmail: string; toRecipients: string[]; ccRecipients: string[]; bccRecipients: string[];
  subject: string; bodyHtml: string; signatureText: string | null; attachments: Attachment[]; frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
  interval: number; weekdays: number[]; dayOfMonth: number | null; startAt: string; endAt: string | null; timezone: string;
  nonBusinessDayPolicy: "PREVIOUS_BUSINESS_DAY" | "NEXT_BUSINESS_DAY" | "SEND_ANYWAY"; nonBusinessOverrideAck: boolean; status: "ACTIVE" | "PAUSED";
};

const EMPTY: FormState = {
  teamKey: "", name: "", senderEmail: "", toRecipients: [], ccRecipients: [], bccRecipients: [], subject: "", bodyHtml: "", signatureText: "",
  attachments: [], frequency: "MONTHLY", interval: 1, weekdays: [], dayOfMonth: 1, startAt: "", endAt: null,
  timezone: "America/Mexico_City", nonBusinessDayPolicy: "NEXT_BUSINESS_DAY", nonBusinessOverrideAck: false, status: "PAUSED"
};
const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function csv(value: string) { return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean); }
function localDateTime(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 16) : ""; }
function apiDateTime(value: string | null) { return value ? new Date(value).toISOString() : null; }
function frequencyLabel(message: Message) {
  if (message.frequency === "DAILY") return `Cada ${message.interval} día(s)`;
  if (message.frequency === "WEEKLY") return `Semanal: ${message.weekdays.map((day) => DAY_LABELS[day]).join(", ")}`;
  if (message.frequency === "MONTHLY") return `Mensual, día ${message.dayOfMonth}`;
  return `Personalizada, cada ${message.interval} día(s)`;
}

export function PeriodicMessagesPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [teams, setTeams] = useState<TaskModuleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const canViewIndex = Boolean(user?.permissions?.includes("*") || user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN");

  useEffect(() => { apiGet<TaskModuleDefinition[]>("/periodic-messages/teams").then(setTeams).finally(() => setLoading(false)); }, []);
  if (!loading && !slug && teams.length === 1 && !canViewIndex) return <Navigate to={`/app/periodic-messages/${encodeURIComponent(teams[0].id)}`} replace />;
  if (slug) return <TeamMessages teams={teams} slug={slug} onBack={() => navigate("/app/periodic-messages")} />;

  return <section className="page-stack periodic-messages-page">
    <header className="hero module-hero"><div className="module-hero-head"><span className="module-hero-icon">✉</span><div><h2>Mensajes periódicos programados</h2></div></div>
      <p className="muted">Programación central de correos por equipo, con remitentes autorizados e historial de ejecución.</p></header>
    <div className="message-banner message-warning"><strong>Servicio de envío pendiente de configuración.</strong> Google Workspace todavía no está autorizado; las programaciones se guardarán sin enviar mensajes.</div>
    <section className="panel"><div className="panel-header"><h2>Equipos</h2><span>{loading ? "Cargando" : `${teams.length} módulos`}</span></div>
      <div className="execution-module-grid">{teams.map((team) => <button key={team.id} className="execution-module-card" onClick={() => navigate(`/app/periodic-messages/${encodeURIComponent(team.id)}`)}>
        <span className="execution-module-icon">✉</span><strong>{team.label}</strong><p>Programaciones, remitentes e historial de {team.label}.</p></button>)}</div></section>
  </section>;
}

function TeamMessages({ teams, slug, onBack }: { teams: TaskModuleDefinition[]; slug: string; onBack: () => void }) {
  const team = teams.find((candidate) => candidate.id === slug);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<Message | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  async function load(moduleId: string) {
    const [senderRows, messageRows] = await Promise.all([
      apiGet<Sender[]>(`/periodic-messages/senders?teamKey=${encodeURIComponent(moduleId)}`),
      apiGet<Message[]>(`/periodic-messages?teamKey=${encodeURIComponent(moduleId)}`)
    ]);
    setSenders(senderRows); setMessages(messageRows);
    setForm((current) => ({ ...current, teamKey: moduleId, senderEmail: current.senderEmail || senderRows[0]?.email || "" }));
  }
  useEffect(() => { if (team) void load(team.id).catch((reason) => setError(reason instanceof Error ? reason.message : "No fue posible cargar el módulo.")); }, [team?.id]);
  const totalFailures = useMemo(() => 0, [messages]);

  function applyFormat(before: string, after = before) {
    const element = bodyRef.current; if (!element) return;
    const start = element.selectionStart; const end = element.selectionEnd;
    setForm((current) => ({ ...current, bodyHtml: current.bodyHtml.slice(0, start) + before + current.bodyHtml.slice(start, end) + after + current.bodyHtml.slice(end) }));
  }
  function edit(message: Message) {
    setEditingId(message.id); setForm({ ...message, startAt: localDateTime(message.startAt), endAt: localDateTime(message.endAt) || null }); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() { setEditingId(null); setForm({ ...EMPTY, teamKey: team?.id ?? "", senderEmail: senders[0]?.email ?? "" }); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    if (form.nonBusinessDayPolicy === "SEND_ANYWAY" && !form.nonBusinessOverrideAck) { setError("Confirma expresamente que deseas enviar aun en día inhábil."); return; }
    setSaving(true);
    try {
      const payload = { ...form, startAt: apiDateTime(form.startAt), endAt: apiDateTime(form.endAt) };
      if (editingId) await apiPatch(`/periodic-messages/${editingId}`, payload); else await apiPost("/periodic-messages", payload);
      reset(); if (team) await load(team.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible guardar la programación."); }
    finally { setSaving(false); }
  }
  async function remove(message: Message) {
    if (!window.confirm(`¿Eliminar lógicamente “${message.name}”? El historial se conservará.`)) return;
    await apiDelete(`/periodic-messages/${message.id}`); if (team) await load(team.id);
  }
  async function showHistory(message: Message) {
    setHistoryFor(message);
    try { setDeliveries(await apiGet<Delivery[]>(`/periodic-messages/${message.id}/deliveries`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible cargar el historial."); }
  }
  if (!team) return <section className="page-stack"><div className="centered-inline-message">Cargando equipo…</div></section>;

  return <section className="page-stack periodic-messages-page">
    <header className="hero module-hero"><button className="secondary-button" onClick={onBack}>Volver a equipos</button><h2>Mensajes periódicos — {team.label}</h2>
      <p className="muted">Todos los integrantes del equipo y los super admins pueden administrar estas programaciones.</p></header>
    <div className="message-banner message-warning"><strong>Servicio de envío pendiente de configuración de Google Workspace.</strong> Puedes preparar y pausar programaciones; no se enviará ningún correo todavía.</div>
    {error ? <div className="message-banner message-error">{error}</div> : null}
    <section className="panel"><div className="panel-header"><h2>{editingId ? "Editar programación" : "Nueva programación"}</h2><span>{senders.length} remitentes autorizados</span></div>
      <form className="periodic-message-form" onSubmit={submit}>
        <label>Nombre interno<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Remitente<select value={form.senderEmail} onChange={(e) => setForm({ ...form, senderEmail: e.target.value })} required><option value="">Seleccionar</option>{senders.map((sender) => <option key={sender.id} value={sender.email}>{sender.displayName} — {sender.email}</option>)}</select></label>
        <label className="span-2">Para<textarea value={form.toRecipients.join("; ")} onChange={(e) => setForm({ ...form, toRecipients: csv(e.target.value) })} placeholder="correo@ejemplo.com; otro@ejemplo.com" required /></label>
        <label>CC<textarea value={form.ccRecipients.join("; ")} onChange={(e) => setForm({ ...form, ccRecipients: csv(e.target.value) })} /></label>
        <label>CCO<textarea value={form.bccRecipients.join("; ")} onChange={(e) => setForm({ ...form, bccRecipients: csv(e.target.value) })} /></label>
        <label className="span-2">Asunto<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></label>
        <div className="span-2 periodic-editor"><span>Mensaje</span><div className="periodic-editor-toolbar"><button type="button" onClick={() => applyFormat("<strong>", "</strong>")}><strong>N</strong></button><button type="button" onClick={() => applyFormat("<em>", "</em>")}><em>C</em></button><button type="button" onClick={() => applyFormat("<u>", "</u>")}><u>S</u></button><button type="button" onClick={() => applyFormat("<ul><li>", "</li></ul>")}>Lista</button><button type="button" onClick={() => applyFormat('<a href="https://">', "</a>")}>Enlace</button></div><textarea ref={bodyRef} value={form.bodyHtml} onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} rows={8} required /></div>
        <label className="span-2">Firma en texto<textarea value={form.signatureText ?? ""} onChange={(e) => setForm({ ...form, signatureText: e.target.value })} rows={3} /></label>
        <label className="span-2">Adjuntos (máximo 20; se registran ahora y se cargarán al habilitar Google Workspace)<input type="file" multiple onChange={(e) => setForm({ ...form, attachments: Array.from(e.target.files ?? []).map((file) => ({ name: file.name, size: file.size, type: file.type })) })} />{form.attachments.length ? <small>{form.attachments.map((item) => item.name).join(", ")}</small> : null}</label>
        <label>Frecuencia<select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as FormState["frequency"] })}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="CUSTOM">Personalizada</option></select></label>
        <label>Intervalo<input type="number" min="1" max="365" value={form.interval} onChange={(e) => setForm({ ...form, interval: Number(e.target.value) })} /></label>
        {form.frequency === "WEEKLY" ? <div className="span-2 weekday-picker">{DAY_LABELS.map((label, day) => <label key={label}><input type="checkbox" checked={form.weekdays.includes(day)} onChange={() => setForm({ ...form, weekdays: form.weekdays.includes(day) ? form.weekdays.filter((value) => value !== day) : [...form.weekdays, day] })} />{label}</label>)}</div> : null}
        {form.frequency === "MONTHLY" ? <label>Día del mes<input type="number" min="1" max="31" value={form.dayOfMonth ?? 1} onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })} /></label> : null}
        <label>Inicio<input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} required /></label>
        <label>Fecha final (opcional)<input type="datetime-local" value={form.endAt ?? ""} onChange={(e) => setForm({ ...form, endAt: e.target.value || null })} /></label>
        <label>Zona horaria<input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></label>
        <label>Ajuste por día inhábil<select value={form.nonBusinessDayPolicy} onChange={(e) => setForm({ ...form, nonBusinessDayPolicy: e.target.value as FormState["nonBusinessDayPolicy"], nonBusinessOverrideAck: false })}><option value="NEXT_BUSINESS_DAY">Día hábil siguiente</option><option value="PREVIOUS_BUSINESS_DAY">Día hábil anterior</option><option value="SEND_ANYWAY">Enviar aun en día inhábil</option></select></label>
        {form.nonBusinessDayPolicy === "SEND_ANYWAY" ? <label className="span-2 message-banner message-warning"><input type="checkbox" checked={form.nonBusinessOverrideAck} onChange={(e) => setForm({ ...form, nonBusinessOverrideAck: e.target.checked })} /> Entiendo que el mensaje se enviará aunque la fecha esté marcada como inhábil.</label> : null}
        <label>Estado<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}><option value="PAUSED">Pausada</option><option value="ACTIVE">Activa (pendiente del servicio)</option></select></label>
        <div className="span-2 periodic-form-actions"><button className="primary-button" disabled={saving}>{saving ? "Guardando…" : editingId ? "Guardar cambios futuros" : "Crear programación"}</button>{editingId ? <button type="button" className="secondary-button" onClick={reset}>Cancelar</button> : null}</div>
      </form>
    </section>
    <section className="panel"><div className="panel-header"><h2>Programaciones</h2><span>{messages.length} vigentes · {totalFailures} fallidas</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Nombre y asunto</th><th>Remitente</th><th>Periodicidad</th><th>Próxima ejecución</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {messages.length === 0 ? <tr><td colSpan={6} className="centered-inline-message">No hay programaciones para este equipo.</td></tr> : messages.map((message) => <tr key={message.id}><td><strong>{message.name}</strong><small>{message.subject}</small></td><td>{message.senderEmail}</td><td>{frequencyLabel(message)}</td><td>{message.nextRunAt ? new Date(message.nextRunAt).toLocaleString("es-MX") : "—"}</td><td><span className={`periodic-status periodic-status-${message.status.toLowerCase()}`}>{message.status === "ACTIVE" ? "Activa" : "Pausada"}</span></td><td><div className="table-action-row"><button className="secondary-button" onClick={() => void showHistory(message)}>Historial</button><button className="secondary-button" onClick={() => edit(message)}>Editar</button><button className="danger-button" onClick={() => void remove(message)}>Eliminar</button></div></td></tr>)}</tbody></table></div>
    </section>
    {historyFor ? <section className="panel"><div className="panel-header"><h2>Historial — {historyFor.name}</h2><button className="secondary-button" onClick={() => setHistoryFor(null)}>Cerrar</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Programado para</th><th>Estado</th><th>Intentos</th><th>Enviado</th><th>Detalle</th></tr></thead><tbody>{deliveries.length === 0 ? <tr><td colSpan={5} className="centered-inline-message">Sin ejecuciones. El servicio de Google Workspace permanece deshabilitado.</td></tr> : deliveries.map((delivery) => <tr key={delivery.id}><td>{new Date(delivery.scheduledFor).toLocaleString("es-MX")}</td><td>{delivery.status}</td><td>{delivery.attemptCount}/3</td><td>{delivery.sentAt ? new Date(delivery.sentAt).toLocaleString("es-MX") : "—"}</td><td>{delivery.failureMessage ?? "—"}</td></tr>)}</tbody></table></div>
    </section> : null}
  </section>;
}
