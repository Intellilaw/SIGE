import { useEffect, useMemo, useState } from "react";
import type { Lead, Matter, Quote } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type ActiveTab = "leads" | "month";

type LeadPatchPayload = {
  clientId?: string | null;
  clientName?: string;
  prospectName?: string | null;
  commissionAssignee?: string | null;
  quoteId?: string | null;
  quoteNumber?: string | null;
  subject?: string;
  amountMxn?: number;
  communicationChannel?: Lead["communicationChannel"];
  lastInteractionLabel?: string | null;
  lastInteraction?: string | null;
  nextInteractionLabel?: string | null;
  nextInteraction?: string | null;
  notes?: string | null;
};

const CHANNEL_OPTIONS: Array<{ value: Lead["communicationChannel"]; label: string }> = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WECHAT", label: "WeChat" },
  { value: "EMAIL", label: "Correo-e" },
  { value: "PHONE", label: "Telefono" }
];

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeText(value?: string) {
  return (value ?? "").trim();
}

function toDateInput(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function parseDateOnly(value?: string) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("es-MX");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(value || 0);
}

function channelLabel(channel?: Lead["communicationChannel"]) {
  return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? "WhatsApp";
}

function getQuoteTypeLabel(quote?: Quote) {
  if (!quote) {
    return "-";
  }

  return quote.quoteType === "RETAINER" ? "Iguala" : "Unico";
}

function sortQuotes(items: Quote[]) {
  return [...items].sort((left, right) =>
    right.quoteNumber.localeCompare(left.quoteNumber, "es-MX", { numeric: true })
  );
}

function sortActive(items: Lead[]) {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function sortHistory(items: Lead[]) {
  return [...items].sort((left, right) => (right.sentToMattersAt ?? "").localeCompare(left.sentToMattersAt ?? ""));
}

function sortMonthly(items: Lead[]) {
  return [...items].sort((left, right) => (right.sentToClientAt ?? "").localeCompare(left.sentToClientAt ?? ""));
}

function replaceLead(items: Lead[], updated: Lead) {
  const exists = items.some((item) => item.id === updated.id);
  if (!exists) {
    return items;
  }

  return items.map((item) => (item.id === updated.id ? updated : item));
}

function upsertLead(items: Lead[], updated: Lead) {
  const exists = items.some((item) => item.id === updated.id);
  if (exists) {
    return items.map((item) => (item.id === updated.id ? updated : item));
  }

  return [...items, updated];
}

function removeLead(items: Lead[], leadId: string) {
  return items.filter((item) => item.id !== leadId);
}

function isInSelectedMonth(value: string | undefined, year: number, month: number) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
}

function nextBusinessDay(from: Date) {
  const candidate = new Date(from);
  candidate.setDate(candidate.getDate() + 1);

  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() + 1);
  }

  candidate.setHours(0, 0, 0, 0);
  return candidate;
}

function evaluateLeadRow(lead: Lead) {
  const reasons: string[] = [];
  if (!normalizeText(lead.clientName) && !normalizeText(lead.prospectName)) reasons.push("Cliente o prospecto");
  if (!normalizeText(lead.subject)) reasons.push("Asunto");
  if (!lead.communicationChannel) reasons.push("Canal");
  if (!normalizeText(lead.lastInteractionLabel)) reasons.push("Ultima interaccion");
  if (!toDateInput(lead.lastInteraction)) reasons.push("Fecha de ultima interaccion");
  if (!normalizeText(lead.nextInteractionLabel)) reasons.push("Siguiente interaccion");
  if (!toDateInput(lead.nextInteraction)) reasons.push("Fecha de siguiente interaccion");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = parseDateOnly(toDateInput(lead.nextInteraction));
  const isOverdue = !dueDate || dueDate.getTime() <= today.getTime();

  if (reasons.length > 0 || isOverdue) {
    return {
      tone: "danger" as const,
      title: reasons.length > 0 ? `Faltan datos: ${reasons.join(", ")}` : "Seguimiento vencido o programado para hoy."
    };
  }

  const nextDue = nextBusinessDay(today);
  if (dueDate && dueDate.getTime() === nextDue.getTime()) {
    return {
      tone: "next-business" as const,
      title: "Seguimiento programado para el siguiente dia habil."
    };
  }

  return {
    tone: "normal" as const,
    title: ""
  };
}

function buildLeadPatch(lead: Lead): LeadPatchPayload {
  return {
    clientId: lead.clientId ?? null,
    clientName: lead.clientName,
    prospectName: normalizeText(lead.prospectName) ? lead.prospectName ?? null : null,
    commissionAssignee: normalizeText(lead.commissionAssignee) ? lead.commissionAssignee ?? null : null,
    quoteId: lead.quoteId ?? null,
    quoteNumber: normalizeText(lead.quoteNumber) ? lead.quoteNumber ?? null : null,
    subject: lead.subject,
    amountMxn: Number(lead.amountMxn || 0),
    communicationChannel: lead.communicationChannel,
    lastInteractionLabel: normalizeText(lead.lastInteractionLabel) ? lead.lastInteractionLabel ?? null : null,
    lastInteraction: toDateInput(lead.lastInteraction) || null,
    nextInteractionLabel: normalizeText(lead.nextInteractionLabel) ? lead.nextInteractionLabel ?? null : null,
    nextInteraction: toDateInput(lead.nextInteraction) || null,
    notes: normalizeText(lead.notes) ? lead.notes ?? null : null
  };
}

export function LeadsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [activeTab, setActiveTab] = useState<ActiveTab>("leads");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [activeItems, setActiveItems] = useState<Lead[]>([]);
  const [historyItems, setHistoryItems] = useState<Lead[]>([]);
  const [monthlyItems, setMonthlyItems] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [commissionShortNames, setCommissionShortNames] = useState<string[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uniqueClients = useMemo(
    () =>
      [...new Set(quotes.map((quote) => normalizeText(quote.clientName)).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right, "es-MX")
      ),
    [quotes]
  );

  const commissionOptions = useMemo(
    () =>
      [...new Set(
        [
          ...commissionShortNames,
          normalizeText(user?.shortName).toUpperCase()
        ].filter(Boolean)
      )].sort(),
    [commissionShortNames, user?.shortName]
  );

  const sentMonthlyTotal = useMemo(
    () => monthlyItems.reduce((sum, item) => sum + Number(item.amountMxn || 0), 0),
    [monthlyItems]
  );

  const contractedMonthlyTotal = useMemo(
    () =>
      monthlyItems.reduce(
        (sum, item) => sum + (item.status === "MOVED_TO_MATTERS" ? Number(item.amountMxn || 0) : 0),
        0
      ),
    [monthlyItems]
  );

  const selectedYearOptions = useMemo(
    () => Array.from({ length: 10 }, (_, index) => now.getFullYear() - 5 + index),
    [now]
  );

  async function loadBoard() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [activeRows, historyRows, quoteRows, shortNames] = await Promise.all([
        apiGet<Lead[]>("/leads"),
        apiGet<Lead[]>("/leads/history"),
        apiGet<Quote[]>("/quotes"),
        apiGet<string[]>("/leads/short-names")
      ]);

      setActiveItems(sortActive(activeRows));
      setHistoryItems(sortHistory(historyRows));
      setQuotes(sortQuotes(quoteRows));
      setCommissionShortNames(shortNames);
      setSelectedLeads(new Set());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadMonthly() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [monthlyRows, quoteRows, shortNames] = await Promise.all([
        apiGet<Lead[]>(`/leads/monthly?year=${selectedYear}&month=${selectedMonth}`),
        apiGet<Quote[]>("/quotes"),
        apiGet<string[]>("/leads/short-names")
      ]);

      setMonthlyItems(sortMonthly(monthlyRows));
      setQuotes(sortQuotes(quoteRows));
      setCommissionShortNames(shortNames);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "leads") {
      void loadBoard();
      return;
    }

    void loadMonthly();
  }, [activeTab, selectedMonth, selectedYear]);

  function syncLeadAcrossViews(updated: Lead) {
    setActiveItems((items) => {
      const next = updated.status === "ACTIVE" ? upsertLead(items, updated) : removeLead(items, updated.id);
      return sortActive(next);
    });
    setHistoryItems((items) => {
      const next = updated.status === "MOVED_TO_MATTERS" && !updated.hiddenFromTracking
        ? upsertLead(items, updated)
        : removeLead(items, updated.id);
      return sortHistory(next);
    });
    setMonthlyItems((items) => {
      const next = isInSelectedMonth(updated.sentToClientAt, selectedYear, selectedMonth)
        ? upsertLead(items, updated)
        : removeLead(items, updated.id);
      return sortMonthly(next);
    });
  }

  function updateActiveLeadLocal(leadId: string, updater: (lead: Lead) => Lead) {
    const current = activeItems.find((item) => item.id === leadId);
    if (!current) {
      return null;
    }

    const updated = updater({ ...current });
    setActiveItems((items) => replaceLead(items, updated));
    return updated;
  }

  async function persistLead(lead: Lead) {
    try {
      const updated = await apiPatch<Lead>(`/leads/${lead.id}`, buildLeadPatch(lead));
      syncLeadAcrossViews(updated);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      if (activeTab === "leads") {
        await loadBoard();
      } else {
        await loadMonthly();
      }
    }
  }

  function findQuoteByNumber(quoteNumber?: string) {
    const cleanQuoteNumber = normalizeText(quoteNumber);
    if (!cleanQuoteNumber) {
      return undefined;
    }

    return quotes.find((quote) => normalizeText(quote.quoteNumber) === cleanQuoteNumber);
  }

  async function handleAddRow() {
    try {
      const created = await apiPost<Lead>("/leads", {});
      setActiveItems((items) => sortActive([...items, created]));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleDelete(leadId: string) {
    if (!window.confirm("Seguro que deseas eliminar este registro permanentemente?")) {
      return;
    }

    try {
      await apiDelete(`/leads/${leadId}`);
      setActiveItems((items) => removeLead(items, leadId));
      setHistoryItems((items) => removeLead(items, leadId));
      setMonthlyItems((items) => removeLead(items, leadId));
      setSelectedLeads((items) => {
        const next = new Set(items);
        next.delete(leadId);
        return next;
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleBulkDelete() {
    if (selectedLeads.size === 0) {
      return;
    }

    if (!window.confirm(`Estas seguro de borrar ${selectedLeads.size} leads seleccionados?`)) {
      return;
    }

    try {
      await apiPost<void>("/leads/bulk-delete", { ids: Array.from(selectedLeads) });
      setActiveItems((items) => items.filter((item) => !selectedLeads.has(item.id)));
      setMonthlyItems((items) => items.filter((item) => !selectedLeads.has(item.id)));
      setSelectedLeads(new Set());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleLeadFieldChange(leadId: string, field: keyof LeadPatchPayload, value: string) {
    if (field === "quoteNumber") {
      const updated = updateActiveLeadLocal(leadId, (lead) => {
        const cleanValue = normalizeText(value);
        const linkedQuote = findQuoteByNumber(cleanValue);

        lead.quoteNumber = cleanValue || undefined;
        if (linkedQuote) {
          lead.quoteId = linkedQuote.id;
          lead.clientId = linkedQuote.clientId;
          lead.clientName = linkedQuote.clientName;
          lead.prospectName = undefined;
          lead.subject = linkedQuote.subject;
          lead.amountMxn = linkedQuote.totalMxn;
        } else {
          lead.quoteId = undefined;
          if (!cleanValue) {
            lead.subject = "";
            lead.amountMxn = 0;
          }
        }

        return lead;
      });

      if (updated) {
        void persistLead(updated);
      }

      return;
    }

    if (field === "clientName") {
      updateActiveLeadLocal(leadId, (lead) => {
        lead.clientName = value;
        const linkedQuote = findQuoteByNumber(lead.quoteNumber);
        if (linkedQuote && normalizeText(linkedQuote.clientName) !== normalizeText(value)) {
          lead.quoteId = undefined;
          lead.quoteNumber = undefined;
          lead.subject = "";
          lead.amountMxn = 0;
        }

        return lead;
      });
      return;
    }

    updateActiveLeadLocal(leadId, (lead) => {
      switch (field) {
        case "prospectName":
          lead.prospectName = value;
          break;
        case "commissionAssignee":
          lead.commissionAssignee = value;
          break;
        case "subject":
          lead.subject = value;
          break;
        case "amountMxn":
          lead.amountMxn = Number(value || 0);
          break;
        case "communicationChannel":
          lead.communicationChannel = value as Lead["communicationChannel"];
          break;
        case "lastInteractionLabel":
          lead.lastInteractionLabel = value;
          break;
        case "lastInteraction":
          lead.lastInteraction = value || undefined;
          break;
        case "nextInteractionLabel":
          lead.nextInteractionLabel = value;
          break;
        case "nextInteraction":
          lead.nextInteraction = value || undefined;
          break;
        case "notes":
          lead.notes = value;
          break;
        default:
          break;
      }

      return lead;
    });
  }

  function handleLeadBlur(leadId: string) {
    const lead = activeItems.find((item) => item.id === leadId);
    if (!lead) {
      return;
    }

    void persistLead(lead);
  }

  async function handleMarkSentToClient(leadId: string) {
    const lead = activeItems.find((item) => item.id === leadId);
    if (!lead) {
      return;
    }

    if (!normalizeText(lead.quoteNumber)) {
      window.alert("No se puede marcar como enviada.\n\nDebes asignar un No. de Cotizacion primero.");
      return;
    }

    if (
      !window.confirm(
        `Marcar la cotizacion ${lead.quoteNumber} como 'Enviada a cliente' con fecha de HOY?\nEsto hara que sume a las cotizaciones mensuales y aparezca en la Pestana 2.`
      )
    ) {
      return;
    }

    try {
      const updated = await apiPost<Lead>(`/leads/${leadId}/mark-sent-to-client`, {});
      syncLeadAcrossViews(updated);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleSendToMatters(leadId: string) {
    const lead = activeItems.find((item) => item.id === leadId);
    if (!lead) {
      return;
    }

    if (!normalizeText(lead.quoteNumber)) {
      window.alert("No se puede enviar a 'Asuntos Activos'.\n\nDebes asignar un No. de Cotizacion primero.");
      return;
    }

    let existsInMatters = false;
    try {
      const matters = await apiGet<Matter[]>("/matters");
      existsInMatters = matters.some((matter) => normalizeText(matter.quoteNumber) === normalizeText(lead.quoteNumber));
    } catch {
      existsInMatters = false;
    }

    const confirmMessage = existsInMatters
      ? `La cotizacion ${lead.quoteNumber} YA EXISTE en Asuntos Activos.\nDeseas ACTUALIZAR la informacion en Asuntos Activos y mover este lead al historial?`
      : `Enviar a 'Asuntos Activos'?\nEsto movera el registro a la tabla inferior y creara un nuevo Asunto Activo vinculando la cotizacion ${lead.quoteNumber}.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await apiPost<Lead>(`/leads/${leadId}/send-to-matters`, {});
      await loadBoard();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleReturnToActive(leadId: string) {
    if (!window.confirm("Regresar este lead a Activos?")) {
      return;
    }

    try {
      await apiPost<Lead>(`/leads/${leadId}/return-to-active`, {});
      await loadBoard();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  return (
    <section className="page-stack leads-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Leads
          </span>
          <div>
            <h2>Seguimiento a Leads y Cotizaciones</h2>
          </div>
        </div>
        <p className="muted">
          Replica funcional del tablero de Intranet: seguimiento diario, historial de conversion a asuntos y vista mensual
          de cotizaciones enviadas.
        </p>
      </header>

      <section className="panel">
        <div className="leads-tabs" role="tablist" aria-label="Vistas de leads">
          <button
            type="button"
            className={`lead-tab ${activeTab === "leads" ? "is-active" : ""}`}
            onClick={() => setActiveTab("leads")}
          >
            1. Leads Activos y Diario
          </button>
          <button
            type="button"
            className={`lead-tab ${activeTab === "month" ? "is-active" : ""}`}
            onClick={() => setActiveTab("month")}
          >
            2. Vista Mensual de Cotizaciones
          </button>
        </div>
      </section>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      {activeTab === "leads" ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>1. Leads Activos</h2>
              <span>{activeItems.length} registros</span>
            </div>

            <div className="lead-toolbar">
              <div className="lead-toolbar-actions">
                <button type="button" className="primary-button" onClick={() => void handleAddRow()}>
                  + Agregar Fila
                </button>
                {selectedLeads.size > 0 ? (
                  <button type="button" className="danger-button" onClick={() => void handleBulkDelete()}>
                    Borrar ({selectedLeads.size})
                  </button>
                ) : null}
              </div>
              <button type="button" className="secondary-button" onClick={() => void loadBoard()}>
                Refrescar
              </button>
            </div>

            <div className="lead-table-shell">
              <div className="lead-table-wrapper">
                <table className="lead-table lead-table-active">
                  <thead>
                    <tr>
                      <th className="lead-table-checkbox">
                        <input
                          type="checkbox"
                          checked={activeItems.length > 0 && selectedLeads.size === activeItems.length}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedLeads(new Set(activeItems.map((item) => item.id)));
                              return;
                            }

                            setSelectedLeads(new Set());
                          }}
                        />
                      </th>
                      <th>Comision cierre</th>
                      <th>Cliente</th>
                      <th>Prospecto</th>
                      <th>No. Cotizacion</th>
                      <th>Tipo</th>
                      <th>Asunto</th>
                      <th>Total</th>
                      <th>Canal</th>
                      <th>Ultima</th>
                      <th>Fecha</th>
                      <th>Siguiente</th>
                      <th>Fecha</th>
                      <th>Notas</th>
                      <th>Accion</th>
                      <th>Borrar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={16} className="centered-inline-message">
                          Cargando leads...
                        </td>
                      </tr>
                    ) : activeItems.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="centered-inline-message">
                          No hay leads activos.
                        </td>
                      </tr>
                    ) : (
                      activeItems.map((item) => {
                        const rowState = evaluateLeadRow(item);
                        const linkedQuote = findQuoteByNumber(item.quoteNumber);

                        return (
                          <tr
                            key={item.id}
                            className={[
                              rowState.tone === "danger" ? "lead-row-danger" : "",
                              rowState.tone === "next-business" ? "lead-row-next-business" : "",
                              selectedLeads.has(item.id) ? "lead-row-selected" : ""
                            ].join(" ").trim()}
                            title={rowState.title}
                          >
                            <td className="lead-table-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedLeads.has(item.id)}
                                onChange={(event) => {
                                  const next = new Set(selectedLeads);
                                  if (event.target.checked) next.add(item.id);
                                  else next.delete(item.id);
                                  setSelectedLeads(next);
                                }}
                              />
                            </td>
                            <td>
                              <select
                                className="lead-cell-input"
                                value={item.commissionAssignee ?? ""}
                                onChange={(event) => {
                                  const updated = updateActiveLeadLocal(item.id, (lead) => ({
                                    ...lead,
                                    commissionAssignee: event.target.value
                                  }));
                                  if (updated) void persistLead(updated);
                                }}
                              >
                                <option value="">Seleccionar</option>
                                {commissionOptions.map((shortName) => (
                                  <option key={shortName} value={shortName}>
                                    {shortName}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className={`lead-cell-input ${item.quoteNumber ? "is-readonly" : ""}`}
                                value={item.clientName}
                                readOnly={Boolean(item.quoteNumber)}
                                list={`lead-clients-${item.id}`}
                                onChange={(event) => handleLeadFieldChange(item.id, "clientName", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                                title={item.quoteNumber ? "Campo bloqueado por cotizacion vinculada." : "Escribe o elige un cliente."}
                              />
                              <datalist id={`lead-clients-${item.id}`}>
                                {uniqueClients.map((clientName) => (
                                  <option key={clientName} value={clientName} />
                                ))}
                              </datalist>
                            </td>
                            <td>
                              <input
                                className={`lead-cell-input ${item.quoteNumber ? "is-readonly" : ""}`}
                                value={item.prospectName ?? ""}
                                readOnly={Boolean(item.quoteNumber)}
                                onChange={(event) => handleLeadFieldChange(item.id, "prospectName", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <select
                                className="lead-cell-input"
                                value={item.quoteNumber ?? ""}
                                onChange={(event) => handleLeadFieldChange(item.id, "quoteNumber", event.target.value)}
                              >
                                <option value="">Manual (Sin cot.)</option>
                                {quotes
                                  .filter((quote) => !normalizeText(item.clientName) || normalizeText(quote.clientName) === normalizeText(item.clientName))
                                  .map((quote) => (
                                    <option key={quote.id} value={quote.quoteNumber}>
                                      {quote.quoteNumber} - {quote.subject}
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td>
                              <span className={`lead-type-pill ${linkedQuote?.quoteType === "RETAINER" ? "is-retainer" : ""}`}>
                                {getQuoteTypeLabel(linkedQuote)}
                              </span>
                            </td>
                            <td>
                              <input
                                className={`lead-cell-input ${item.quoteNumber ? "is-readonly" : ""}`}
                                value={item.subject}
                                readOnly={Boolean(item.quoteNumber)}
                                onChange={(event) => handleLeadFieldChange(item.id, "subject", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <input
                                className={`lead-cell-input lead-cell-input-number ${item.quoteNumber ? "is-readonly" : ""}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={Number(item.amountMxn || 0)}
                                readOnly={Boolean(item.quoteNumber)}
                                onChange={(event) => handleLeadFieldChange(item.id, "amountMxn", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <select
                                className="lead-cell-input"
                                value={item.communicationChannel}
                                onChange={(event) => {
                                  const updated = updateActiveLeadLocal(item.id, (lead) => ({
                                    ...lead,
                                    communicationChannel: event.target.value as Lead["communicationChannel"]
                                  }));
                                  if (updated) void persistLead(updated);
                                }}
                              >
                                {CHANNEL_OPTIONS.map((channel) => (
                                  <option key={channel.value} value={channel.value}>
                                    {channel.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className="lead-cell-input"
                                value={item.lastInteractionLabel ?? ""}
                                onChange={(event) => handleLeadFieldChange(item.id, "lastInteractionLabel", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <input
                                className="lead-cell-input"
                                type="date"
                                value={toDateInput(item.lastInteraction)}
                                onChange={(event) => handleLeadFieldChange(item.id, "lastInteraction", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <input
                                className="lead-cell-input"
                                value={item.nextInteractionLabel ?? ""}
                                onChange={(event) => handleLeadFieldChange(item.id, "nextInteractionLabel", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <input
                                className="lead-cell-input"
                                type="date"
                                value={toDateInput(item.nextInteraction)}
                                onChange={(event) => handleLeadFieldChange(item.id, "nextInteraction", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <input
                                className="lead-cell-input"
                                value={item.notes ?? ""}
                                onChange={(event) => handleLeadFieldChange(item.id, "notes", event.target.value)}
                                onBlur={() => handleLeadBlur(item.id)}
                              />
                            </td>
                            <td>
                              <div className="lead-action-stack">
                                <button
                                  type="button"
                                  className="primary-button lead-action-button"
                                  disabled={Boolean(item.sentToClientAt)}
                                  onClick={() => void handleMarkSentToClient(item.id)}
                                >
                                  {item.sentToClientAt ? "Ya enviada" : "Enviada a cliente"}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button lead-action-button"
                                  onClick={() => void handleSendToMatters(item.id)}
                                >
                                  Enviar a asuntos activos
                                </button>
                              </div>
                            </td>
                            <td>
                              <button type="button" className="danger-button lead-delete-button" onClick={() => void handleDelete(item.id)}>
                                Borrar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>2. Historial (Enviados a Asuntos Activos)</h2>
              <span>{historyItems.length} registros</span>
            </div>
            <p className="muted lead-panel-copy">
              Los registros enviados se ocultan automaticamente despues de 30 dias, igual que en la referencia.
            </p>

            <div className="lead-table-shell">
              <div className="lead-table-wrapper">
                <table className="lead-table lead-table-history">
                  <thead>
                    <tr>
                      <th>Comision cierre</th>
                      <th>Cliente</th>
                      <th>Prospecto</th>
                      <th>No. Cotizacion</th>
                      <th>Tipo</th>
                      <th>Asunto</th>
                      <th>Total</th>
                      <th>Canal</th>
                      <th>Ultima interaccion</th>
                      <th>Fecha de envio</th>
                      <th>Notas</th>
                      <th>Accion</th>
                      <th>Borrar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={13} className="centered-inline-message">
                          Cargando historial...
                        </td>
                      </tr>
                    ) : historyItems.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="centered-inline-message">
                          No hay historial reciente.
                        </td>
                      </tr>
                    ) : (
                      historyItems.map((item) => {
                        const linkedQuote = findQuoteByNumber(item.quoteNumber);

                        return (
                          <tr key={item.id}>
                            <td>{item.commissionAssignee ?? "-"}</td>
                            <td>{item.clientName || "-"}</td>
                            <td>{item.prospectName || "-"}</td>
                            <td>{item.quoteNumber || "-"}</td>
                            <td>
                              <span className={`lead-type-pill ${linkedQuote?.quoteType === "RETAINER" ? "is-retainer" : ""}`}>
                                {getQuoteTypeLabel(linkedQuote)}
                              </span>
                            </td>
                            <td>{item.subject || "-"}</td>
                            <td>{formatCurrency(Number(item.amountMxn || 0))}</td>
                            <td>{channelLabel(item.communicationChannel)}</td>
                            <td>{item.lastInteractionLabel || "-"}</td>
                            <td>{formatDate(item.sentToMattersAt)}</td>
                            <td>{item.notes || "-"}</td>
                            <td>
                              <button type="button" className="secondary-button" onClick={() => void handleReturnToActive(item.id)}>
                                Regresar
                              </button>
                            </td>
                            <td>
                              <button type="button" className="danger-button lead-delete-button" onClick={() => void handleDelete(item.id)}>
                                Borrar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="panel lead-month-toolbar">
            <div className="lead-month-filters">
              <label className="form-field">
                <span>Ano</span>
                <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                  {selectedYearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Mes</span>
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                  {MONTH_NAMES.map((monthName, index) => (
                    <option key={monthName} value={index + 1}>
                      {monthName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="lead-summary-grid">
              <article className="lead-summary-card is-sent">
                <span>Total Enviado (Mes)</span>
                <strong>{formatCurrency(sentMonthlyTotal)}</strong>
              </article>
              <article className="lead-summary-card is-contracted">
                <span>Total Contratadas (Mes)</span>
                <strong>{formatCurrency(contractedMonthlyTotal)}</strong>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Cotizaciones enviadas en {MONTH_NAMES[selectedMonth - 1]}</h2>
              <span>{monthlyItems.length} registros</span>
            </div>

            <div className="lead-table-shell">
              <div className="lead-table-wrapper">
                <table className="lead-table">
                  <thead>
                    <tr>
                      <th>Comision cierre</th>
                      <th>Cliente</th>
                      <th>No. Cotizacion</th>
                      <th>Asunto</th>
                      <th>Total</th>
                      <th>Fecha de envio</th>
                      <th>Estatus</th>
                      <th>Borrar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="centered-inline-message">
                          Cargando vista mensual...
                        </td>
                      </tr>
                    ) : monthlyItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="centered-inline-message">
                          No hay cotizaciones enviadas este mes.
                        </td>
                      </tr>
                    ) : (
                      monthlyItems.map((item) => (
                        <tr key={item.id} className={item.status === "MOVED_TO_MATTERS" ? "lead-row-contracted" : ""}>
                          <td>{item.commissionAssignee || "-"}</td>
                          <td>{item.clientName || item.prospectName || "-"}</td>
                          <td className="lead-table-emphasis">{item.quoteNumber || "-"}</td>
                          <td>{item.subject || "-"}</td>
                          <td>{formatCurrency(Number(item.amountMxn || 0))}</td>
                          <td>{formatDate(item.sentToClientAt)}</td>
                          <td>
                            <span className={`lead-status-pill ${item.status === "MOVED_TO_MATTERS" ? "is-success" : "is-pending"}`}>
                              {item.status === "MOVED_TO_MATTERS" ? "Contratada" : "Pendiente / Activa"}
                            </span>
                          </td>
                          <td>
                            <button type="button" className="danger-button lead-delete-button" onClick={() => void handleDelete(item.id)}>
                              Borrar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
