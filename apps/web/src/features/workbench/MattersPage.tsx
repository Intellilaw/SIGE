import { useEffect, useMemo, useState } from "react";
import type { Client, Matter, Quote, TaskItem, TaskModuleDefinition, Team } from "@sige/contracts";
import { TEAM_OPTIONS } from "@sige/contracts";

import { apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type MatterPatchPayload = {
  clientId?: string | null;
  clientNumber?: string | null;
  clientName?: string;
  quoteId?: string | null;
  quoteNumber?: string | null;
  commissionAssignee?: string | null;
  matterType?: Matter["matterType"];
  subject?: string;
  specificProcess?: string | null;
  totalFeesMxn?: number;
  responsibleTeam?: Matter["responsibleTeam"] | null;
  communicationChannel?: Matter["communicationChannel"];
  r1InternalCreated?: boolean;
  telegramBotLinked?: boolean;
  rdCreated?: boolean;
  rfCreated?: Matter["rfCreated"];
  r1ExternalCreated?: boolean;
  billingChatCreated?: boolean;
  matterIdentifier?: string | null;
  executionLinkedModule?: string | null;
  executionLinkedAt?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  nextActionSource?: string | null;
  milestone?: string | null;
  concluded?: boolean;
  stage?: Matter["stage"];
  origin?: Matter["origin"];
  notes?: string | null;
  deletedAt?: string | null;
};

type MatterTableVariant = "unique" | "retainer";

const CHANNEL_OPTIONS: Array<{ value: Matter["communicationChannel"]; label: string }> = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WECHAT", label: "WeChat" },
  { value: "EMAIL", label: "Correo-e" },
  { value: "PHONE", label: "Telefono" }
];

const RF_OPTIONS: Array<{ value: Matter["rfCreated"]; label: string }> = [
  { value: "NO", label: "No" },
  { value: "YES", label: "Si" },
  { value: "NOT_REQUIRED", label: "No es necesario" }
];

const EXECUTION_TEAM_KEYS = new Set<Team>([
  "LITIGATION",
  "CORPORATE_LABOR",
  "SETTLEMENTS",
  "FINANCIAL_LAW",
  "TAX_COMPLIANCE"
]);

const EXECUTION_MODULE_BY_TEAM: Partial<Record<Team, string>> = {
  LITIGATION: "litigation",
  CORPORATE_LABOR: "corporate-labor",
  SETTLEMENTS: "settlements",
  FINANCIAL_LAW: "financial-law",
  TAX_COMPLIANCE: "tax-compliance"
};

const EXECUTION_TEAM_OPTIONS = TEAM_OPTIONS.filter((option) => EXECUTION_TEAM_KEYS.has(option.key));

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getSearchWords(value?: string | null) {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function parseDateOnly(value?: string | null) {
  const dateValue = toDateInput(value);
  if (!dateValue) {
    return null;
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isPastOrToday(value?: string | null) {
  const dueDate = parseDateOnly(value);
  if (!dueDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate.getTime() <= today.getTime();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function getTeamLabel(team?: Team | null) {
  return TEAM_OPTIONS.find((option) => option.key === team)?.label ?? "-";
}

function getChannelLabel(channel?: Matter["communicationChannel"]) {
  return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? "WhatsApp";
}

function getRfLabel(value?: Matter["rfCreated"]) {
  return RF_OPTIONS.find((option) => option.value === value)?.label ?? "No";
}

function getMatterTypeLabel(type: Matter["matterType"]) {
  return type === "RETAINER" ? "Iguala" : "Unico";
}

function sortQuotes(items: Quote[]) {
  return [...items].sort((left, right) =>
    right.quoteNumber.localeCompare(left.quoteNumber, "es-MX", { numeric: true })
  );
}

function findQuoteByNumber(quotes: Quote[], quoteNumber?: string | null) {
  const cleanQuoteNumber = normalizeText(quoteNumber);
  if (!cleanQuoteNumber) {
    return undefined;
  }

  return quotes.find((quote) => normalizeText(quote.quoteNumber) === cleanQuoteNumber);
}

function findClientMatch(clients: Client[], clientName?: string | null) {
  const normalizedClientName = normalizeComparableText(clientName);
  if (!normalizedClientName) {
    return undefined;
  }

  return clients.find((client) => normalizeComparableText(client.name) === normalizedClientName);
}

function getEffectiveMatterType(matter: Matter, quotes: Quote[]) {
  const linkedQuote = findQuoteByNumber(quotes, matter.quoteNumber);
  if (linkedQuote?.quoteType === "RETAINER") {
    return "RETAINER";
  }

  return matter.matterType ?? "ONE_TIME";
}

function getEffectiveClientNumber(matter: Matter, clients: Client[]) {
  return findClientMatch(clients, matter.clientName)?.clientNumber ?? normalizeText(matter.clientNumber);
}

interface MatterReflection {
  nextAction?: string;
  nextActionDueAt?: string;
  nextActionSource?: string;
}

function buildTrackLabelMap(modules: TaskModuleDefinition[]) {
  const labels = new Map<string, string>();

  modules.forEach((module) => {
    module.tracks.forEach((track) => {
      labels.set(`${module.id}:${track.id}`, track.label);
    });
  });

  return labels;
}

function buildMatterReflectionMap(tasks: TaskItem[], modules: TaskModuleDefinition[]) {
  const trackLabels = buildTrackLabelMap(modules);
  const reflections = new Map<string, MatterReflection>();
  const activeTasks = tasks.filter((task) => task.state !== "COMPLETED");

  activeTasks
    .slice()
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .forEach((task) => {
      const keys = [normalizeText(task.matterId), normalizeText(task.matterNumber)].filter(Boolean);
      const trackLabel = trackLabels.get(`${task.moduleId}:${task.trackId}`) ?? task.trackId;
      const source = `${task.moduleId} / ${trackLabel}`;

      keys.forEach((key) => {
        if (!reflections.has(key)) {
          reflections.set(key, {
            nextAction: trackLabel,
            nextActionDueAt: task.dueDate,
            nextActionSource: source
          });
        }
      });
    });

  return reflections;
}

function getMatterReflection(matter: Matter, reflections: Map<string, MatterReflection>) {
  return (
    reflections.get(normalizeText(matter.id)) ??
    reflections.get(normalizeText(matter.matterNumber)) ?? {
      nextAction: matter.nextAction,
      nextActionDueAt: matter.nextActionDueAt,
      nextActionSource: matter.nextActionSource
    }
  );
}

function matchesClientSearch(clientName: string | null | undefined, searchWords: string[]) {
  if (searchWords.length === 0) {
    return true;
  }

  const normalizedClientName = normalizeComparableText(clientName);
  return searchWords.every((word) => normalizedClientName.includes(word));
}

function matchesWordSearch(
  matter: Matter,
  quotes: Quote[],
  clients: Client[],
  reflection: MatterReflection,
  searchWords: string[]
) {
  if (searchWords.length === 0) {
    return true;
  }

  const haystack = normalizeComparableText(
    [
      getEffectiveClientNumber(matter, clients),
      matter.clientName,
      matter.quoteNumber,
      getMatterTypeLabel(getEffectiveMatterType(matter, quotes)),
      matter.subject,
      matter.specificProcess,
      matter.matterIdentifier,
      matter.notes,
      matter.milestone,
      matter.commissionAssignee,
      matter.origin,
      getTeamLabel(matter.responsibleTeam),
      getChannelLabel(matter.communicationChannel),
      reflection.nextAction,
      reflection.nextActionSource,
      toDateInput(reflection.nextActionDueAt)
    ]
      .filter(Boolean)
      .join(" ")
  );

  return searchWords.every((word) => haystack.includes(word));
}

function sortActiveMatters(items: Matter[], clients: Client[]) {
  return [...items].sort((left, right) => {
    const leftNumber = Number.parseInt(getEffectiveClientNumber(left, clients), 10);
    const rightNumber = Number.parseInt(getEffectiveClientNumber(right, clients), 10);

    if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    if (Number.isNaN(leftNumber)) {
      return 1;
    }
    if (Number.isNaN(rightNumber)) {
      return -1;
    }

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function sortDeletedMatters(items: Matter[]) {
  return [...items].sort((left, right) =>
    (right.deletedAt ?? right.updatedAt).localeCompare(left.deletedAt ?? left.updatedAt)
  );
}

function replaceMatter(items: Matter[], updated: Matter) {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function upsertMatter(items: Matter[], updated: Matter) {
  const exists = items.some((item) => item.id === updated.id);
  return exists ? replaceMatter(items, updated) : [...items, updated];
}

function removeMatter(items: Matter[], matterId: string) {
  return items.filter((item) => item.id !== matterId);
}

function isMatterLinked(matter: Matter) {
  if (!normalizeText(matter.matterIdentifier) || !matter.responsibleTeam) {
    return false;
  }

  const expectedModule = EXECUTION_MODULE_BY_TEAM[matter.responsibleTeam];
  if (!expectedModule) {
    return false;
  }

  return matter.executionLinkedModule === expectedModule && Boolean(matter.executionLinkedAt);
}

function evaluateMatterRow(matter: Matter, quotes: Quote[], clients: Client[], reflection: MatterReflection) {
  const matterType = getEffectiveMatterType(matter, quotes);
  const effectiveClientNumber = getEffectiveClientNumber(matter, clients);

  if (matterType === "RETAINER") {
    const requiredFields = [
      { label: "Numero de cliente", value: effectiveClientNumber },
      { label: "Cliente", value: matter.clientName },
      { label: "Numero de cotizacion", value: matter.quoteNumber },
      { label: "Asunto", value: matter.subject },
      { label: "Proceso especifico", value: matter.specificProcess }
    ];
    const missingField = requiredFields.find((field) => !normalizeText(field.value));
    if (missingField) {
      return `Falta: ${missingField.label}`;
    }

    if (!isMatterLinked(matter)) {
      return "No vinculado con ID Asunto valido";
    }

    const requiredChecks = [
      { value: matter.r1InternalCreated, label: "R1 Interno" },
      { value: matter.telegramBotLinked, label: "Bot Telegram" },
      { value: matter.rdCreated, label: "RD Creado" },
      { value: matter.r1ExternalCreated, label: "R1 Externo" },
      { value: matter.billingChatCreated, label: "Chat Facturacion" }
    ];
    const missingCheck = requiredChecks.find((check) => !check.value);
    if (missingCheck) {
      return `Falta Check: ${missingCheck.label}`;
    }

    if (isPastOrToday(reflection.nextActionDueAt)) {
      return "Fecha de siguiente tarea vencida o programada para hoy";
    }

    return null;
  }

  const requiredFields = [
    { label: "Numero de cliente", value: effectiveClientNumber },
    { label: "Cliente", value: matter.clientName },
    { label: "Asunto", value: matter.subject },
    { label: "ID Asunto", value: matter.matterIdentifier },
    { label: "Numero de cotizacion", value: matter.quoteNumber }
  ];
  const missingField = requiredFields.find((field) => !normalizeText(field.value));
  if (missingField) {
    return `Falta: ${missingField.label}`;
  }

  if (!matter.communicationChannel) {
    return "Falta: Canal de comunicacion";
  }
  if (!matter.responsibleTeam) {
    return "Falta: Equipo responsable";
  }
  if (!matter.rfCreated || matter.rfCreated === "NO") {
    return "Falta: RF Creado (o seleccionado)";
  }

  const requiredChecks = [
    { value: matter.r1InternalCreated, label: "R1 Interno" },
    { value: matter.telegramBotLinked, label: "Bot Telegram" },
    { value: matter.rdCreated, label: "RD Creado" },
    { value: matter.r1ExternalCreated, label: "R1 Externo" },
    { value: matter.billingChatCreated, label: "Chat Facturacion" }
  ];
  const missingCheck = requiredChecks.find((check) => !check.value);
  if (missingCheck) {
    return `Falta Check: ${missingCheck.label}`;
  }

  if (!isMatterLinked(matter)) {
    return "No vinculado con ID Asunto valido";
  }

  if (!normalizeText(reflection.nextAction) || !toDateInput(reflection.nextActionDueAt)) {
    return "Falta: Siguiente accion / Fecha";
  }

  if (isPastOrToday(reflection.nextActionDueAt)) {
    return "Fecha de siguiente tarea vencida o programada para hoy";
  }

  if (!normalizeText(matter.milestone)) {
    return "Falta: Hito de conclusion";
  }

  return null;
}

function buildMatterPatch(matter: Matter): MatterPatchPayload {
  return {
    clientId: matter.clientId ?? null,
    clientNumber: normalizeText(matter.clientNumber) ? matter.clientNumber ?? null : null,
    clientName: matter.clientName,
    quoteId: matter.quoteId ?? null,
    quoteNumber: normalizeText(matter.quoteNumber) ? matter.quoteNumber ?? null : null,
    commissionAssignee: normalizeText(matter.commissionAssignee) ? matter.commissionAssignee ?? null : null,
    matterType: matter.matterType,
    subject: matter.subject,
    specificProcess: normalizeText(matter.specificProcess) ? matter.specificProcess ?? null : null,
    totalFeesMxn: Number(matter.totalFeesMxn || 0),
    responsibleTeam: normalizeText(matter.responsibleTeam) ? matter.responsibleTeam ?? null : null,
    communicationChannel: matter.communicationChannel,
    r1InternalCreated: Boolean(matter.r1InternalCreated),
    telegramBotLinked: Boolean(matter.telegramBotLinked),
    rdCreated: Boolean(matter.rdCreated),
    rfCreated: matter.rfCreated,
    r1ExternalCreated: Boolean(matter.r1ExternalCreated),
    billingChatCreated: Boolean(matter.billingChatCreated),
    matterIdentifier: normalizeText(matter.matterIdentifier) ? matter.matterIdentifier ?? null : null,
    executionLinkedModule: normalizeText(matter.executionLinkedModule) ? matter.executionLinkedModule ?? null : null,
    executionLinkedAt: matter.executionLinkedAt ?? null,
    nextAction: normalizeText(matter.nextAction) ? matter.nextAction ?? null : null,
    nextActionDueAt: toDateInput(matter.nextActionDueAt) || null,
    nextActionSource: normalizeText(matter.nextActionSource) ? matter.nextActionSource ?? null : null,
    milestone: normalizeText(matter.milestone) ? matter.milestone ?? null : null,
    concluded: Boolean(matter.concluded),
    stage: matter.stage,
    origin: matter.origin,
    notes: normalizeText(matter.notes) ? matter.notes ?? null : null,
    deletedAt: matter.deletedAt ?? null
  };
}

interface MatterTableProps {
  items: Matter[];
  loading: boolean;
  quotes: Quote[];
  clients: Client[];
  reflections: Map<string, MatterReflection>;
  commissionOptions: string[];
  selectedIds: Set<string>;
  readOnly: boolean;
  variant: MatterTableVariant;
  canDeleteReadOnlyRows: boolean;
  onToggleSelection: (matterId: string) => void;
  onToggleAll: (items: Matter[]) => void;
  onLocalChange: (matterId: string, field: keyof MatterPatchPayload, value: string | number) => void;
  onImmediateChange: (matterId: string, field: keyof MatterPatchPayload, value: string | boolean) => Promise<void>;
  onQuoteChange: (matterId: string, quoteNumber: string) => Promise<void>;
  onBlur: (matterId: string) => void;
  onGenerateIdentifier: (matterId: string) => Promise<void>;
  onSendToExecution: (matterId: string) => Promise<void>;
  onTrash: (matterId: string) => Promise<void>;
}

function MatterTable({
  items,
  loading,
  quotes,
  clients,
  reflections,
  commissionOptions,
  selectedIds,
  readOnly,
  variant,
  canDeleteReadOnlyRows,
  onToggleSelection,
  onToggleAll,
  onLocalChange,
  onImmediateChange,
  onQuoteChange,
  onBlur,
  onGenerateIdentifier,
  onSendToExecution,
  onTrash
}: MatterTableProps) {
  const isRetainerTable = variant === "retainer";
  const allSelected = !readOnly && items.length > 0 && items.every((item) => selectedIds.has(item.id));

  return (
    <div className="lead-table-shell">
      <div className="lead-table-wrapper">
        <table className={`lead-table matters-table ${isRetainerTable ? "matters-table-retainer" : "matters-table-unique"}`}>
          <thead>
            <tr>
              <th className="lead-table-checkbox">
                <input type="checkbox" checked={allSelected} disabled={readOnly} onChange={() => onToggleAll(items)} />
              </th>
              <th>No. Cliente</th>
              <th>Cliente</th>
              <th>No. Cotizacion</th>
              <th>Tipo</th>
              <th>Asunto</th>
              {!isRetainerTable ? <th>Proceso especifico</th> : null}
              <th>Total</th>
              <th>Comision cierre</th>
              {!isRetainerTable ? <th>Canal</th> : null}
              {!isRetainerTable ? <th>R1 Int</th> : null}
              {!isRetainerTable ? <th>Bot TG</th> : null}
              {!isRetainerTable ? <th>RD</th> : null}
              {!isRetainerTable ? <th>RF</th> : null}
              {!isRetainerTable ? <th>R1 Ext</th> : null}
              {!isRetainerTable ? <th>Chat Fac</th> : null}
              {!isRetainerTable ? <th>Notas</th> : null}
              {!isRetainerTable ? <th>ID Asunto</th> : null}
              {!isRetainerTable ? <th>Generar</th> : null}
              {!isRetainerTable ? <th>Vinculado</th> : null}
              {!isRetainerTable ? <th>Equipo</th> : null}
              {!isRetainerTable ? <th>Enviar</th> : null}
              {!isRetainerTable ? <th>Siguiente tarea</th> : null}
              {!isRetainerTable ? <th>Fecha sig.</th> : null}
              {!isRetainerTable ? <th>Origen</th> : null}
              {!isRetainerTable ? <th>Hito conclusion</th> : null}
              {!isRetainerTable ? <th>Concluyo?</th> : null}
              <th>Borrar</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isRetainerTable ? 9 : 28} className="centered-inline-message">
                  Cargando asuntos...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={isRetainerTable ? 9 : 28} className="centered-inline-message">
                  No hay asuntos.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const linkedQuote = findQuoteByNumber(quotes, item.quoteNumber);
                const matterType = getEffectiveMatterType(item, quotes);
                const reflection = getMatterReflection(item, reflections);
                const rowReason = evaluateMatterRow(item, quotes, clients, reflection);
                const isSelected = selectedIds.has(item.id);
                const clientMatch = findClientMatch(clients, item.clientName);
                const effectiveClientNumber = clientMatch?.clientNumber ?? normalizeText(item.clientNumber);
                const isClientLocked = Boolean(clientMatch);
                const isQuoteLocked = Boolean(normalizeText(item.quoteNumber));
                const isSpecificProcessEditable = !readOnly && matterType === "RETAINER";
                const isLinked = isMatterLinked(item);
                const sendLabel = matterType === "RETAINER" ? "-> Ejecucion" : "-> Ejec + Fin";
                const sendTone = matterType === "RETAINER" ? "secondary-button" : "primary-button";
                const rowClassName = [
                  rowReason && !isSelected ? "matter-row-danger" : "",
                  isSelected ? "matter-row-selected" : ""
                ].join(" ").trim();

                return (
                  <tr key={item.id} className={rowClassName} title={rowReason ?? ""}>
                    <td className="lead-table-checkbox">
                      <input
                        type="checkbox"
                        checked={!readOnly && isSelected}
                        disabled={readOnly}
                        onChange={() => onToggleSelection(item.id)}
                      />
                    </td>
                    <td>
                      <input
                        className={`lead-cell-input ${isClientLocked ? "matter-cell-derived" : ""}`}
                        value={effectiveClientNumber}
                        disabled={readOnly}
                        readOnly={readOnly || isClientLocked}
                        onChange={(event) => onLocalChange(item.id, "clientNumber", event.target.value)}
                        onBlur={() => onBlur(item.id)}
                        title={isClientLocked ? "Obtenido del catalogo de clientes" : "Editar manualmente"}
                      />
                    </td>
                    <td>
                      <input
                        className={`lead-cell-input ${isQuoteLocked ? "matter-cell-readonly" : ""}`}
                        value={item.clientName || ""}
                        disabled={readOnly}
                        readOnly={readOnly || isQuoteLocked}
                        onChange={(event) => onLocalChange(item.id, "clientName", event.target.value)}
                        onBlur={() => onBlur(item.id)}
                      />
                    </td>
                    <td>
                      <select
                        className="lead-cell-input"
                        value={item.quoteNumber || ""}
                        disabled={readOnly}
                        onChange={(event) => void onQuoteChange(item.id, event.target.value)}
                      >
                        <option value="">Manual (Sin cot.)</option>
                        {quotes
                          .filter((quote) => {
                            if (!normalizeText(item.clientName)) {
                              return true;
                            }

                            return normalizeComparableText(quote.clientName) === normalizeComparableText(item.clientName);
                          })
                          .map((quote) => (
                            <option key={quote.id} value={quote.quoteNumber}>
                              {quote.quoteNumber} - {quote.clientName}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <span className={`matter-type-pill ${matterType === "RETAINER" ? "is-retainer" : ""}`}>
                        {getMatterTypeLabel(matterType)}
                      </span>
                    </td>
                    <td>
                      <input
                        className={`lead-cell-input ${isQuoteLocked ? "matter-cell-readonly" : ""}`}
                        value={item.subject || ""}
                        disabled={readOnly}
                        readOnly={readOnly || isQuoteLocked}
                        onChange={(event) => onLocalChange(item.id, "subject", event.target.value)}
                        onBlur={() => onBlur(item.id)}
                      />
                    </td>
                    {!isRetainerTable ? (
                      <td>
                        <input
                          className={`lead-cell-input ${!isSpecificProcessEditable ? "matter-cell-readonly" : ""}`}
                          value={item.specificProcess || ""}
                          disabled={readOnly}
                          readOnly={!isSpecificProcessEditable}
                          onChange={(event) => onLocalChange(item.id, "specificProcess", event.target.value)}
                          onBlur={() => onBlur(item.id)}
                          title={isSpecificProcessEditable ? "Editable" : "Solo editable para igualas"}
                        />
                      </td>
                    ) : null}
                    <td>
                      <input
                        className="lead-cell-input lead-cell-input-number"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={readOnly || Boolean(linkedQuote)}
                        readOnly={readOnly || Boolean(linkedQuote)}
                        value={Number(item.totalFeesMxn || 0)}
                        onChange={(event) => onLocalChange(item.id, "totalFeesMxn", Number(event.target.value || 0))}
                        onBlur={() => onBlur(item.id)}
                      />
                    </td>
                    <td>
                      <select
                        className="lead-cell-input"
                        value={item.commissionAssignee || ""}
                        disabled={readOnly}
                        onChange={(event) => void onImmediateChange(item.id, "commissionAssignee", event.target.value)}
                      >
                        <option value="">Sel...</option>
                        {commissionOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    {!isRetainerTable ? (
                      <td>
                        <select
                          className="lead-cell-input"
                          value={item.communicationChannel}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "communicationChannel", event.target.value)}
                        >
                          {CHANNEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td className="matter-checkbox-cell">
                        <input
                          type="checkbox"
                          checked={Boolean(item.r1InternalCreated)}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "r1InternalCreated", event.target.checked)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td className="matter-checkbox-cell">
                        <input
                          type="checkbox"
                          checked={Boolean(item.telegramBotLinked)}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "telegramBotLinked", event.target.checked)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td className="matter-checkbox-cell">
                        <input
                          type="checkbox"
                          checked={Boolean(item.rdCreated)}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "rdCreated", event.target.checked)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <select
                          className="lead-cell-input"
                          value={item.rfCreated}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "rfCreated", event.target.value)}
                        >
                          {RF_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td className="matter-checkbox-cell">
                        <input
                          type="checkbox"
                          checked={Boolean(item.r1ExternalCreated)}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "r1ExternalCreated", event.target.checked)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td className="matter-checkbox-cell">
                        <input
                          type="checkbox"
                          checked={Boolean(item.billingChatCreated)}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "billingChatCreated", event.target.checked)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <input
                          className="lead-cell-input"
                          value={item.notes || ""}
                          disabled={readOnly}
                          onChange={(event) => onLocalChange(item.id, "notes", event.target.value)}
                          onBlur={() => onBlur(item.id)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <input
                          className="lead-cell-input"
                          value={item.matterIdentifier || ""}
                          disabled={readOnly}
                          onChange={(event) => onLocalChange(item.id, "matterIdentifier", event.target.value)}
                          onBlur={() => onBlur(item.id)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        {!readOnly ? (
                          <button type="button" className="secondary-button matter-inline-button" onClick={() => void onGenerateIdentifier(item.id)}>
                            Generar
                          </button>
                        ) : (
                          <span className="matter-cell-muted">-</span>
                        )}
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <span className={`matter-link-pill ${isLinked ? "is-linked" : "is-unlinked"}`}>
                          {isLinked ? "Si" : "No"}
                        </span>
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <select
                          className="lead-cell-input"
                          value={item.responsibleTeam || ""}
                          disabled={readOnly}
                          onChange={(event) => void onImmediateChange(item.id, "responsibleTeam", event.target.value)}
                        >
                          <option value="">Seleccionar...</option>
                          {EXECUTION_TEAM_OPTIONS.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        {!readOnly ? (
                          <button type="button" className={`${sendTone} matter-inline-button`} onClick={() => void onSendToExecution(item.id)}>
                            {sendLabel}
                          </button>
                        ) : (
                          <span className="matter-cell-muted">-</span>
                        )}
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <div className="matter-reflection-card">
                          {normalizeText(reflection.nextAction) ? reflection.nextAction : <span className="matter-cell-muted">Sin tareas</span>}
                        </div>
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <div className="matter-reflection-card">
                          {toDateInput(reflection.nextActionDueAt) || "-"}
                        </div>
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td className="matter-checkbox-cell">
                        {normalizeText(reflection.nextActionSource) ? (
                          <span className="matter-origin-indicator" title={reflection.nextActionSource}>
                            i
                          </span>
                        ) : (
                          <span className="matter-cell-muted">-</span>
                        )}
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td>
                        <input
                          className="lead-cell-input"
                          value={item.milestone || ""}
                          disabled={readOnly}
                          onChange={(event) => onLocalChange(item.id, "milestone", event.target.value)}
                          onBlur={() => onBlur(item.id)}
                        />
                      </td>
                    ) : null}
                    {!isRetainerTable ? (
                      <td className="matter-checkbox-cell">
                        <input type="checkbox" checked={Boolean(item.concluded)} disabled />
                      </td>
                    ) : null}
                    <td>
                      {!readOnly || canDeleteReadOnlyRows ? (
                        <button type="button" className="danger-button matter-inline-button" onClick={() => void onTrash(item.id)}>
                          Borrar
                        </button>
                      ) : (
                        <span className="matter-cell-muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MattersPage() {
  const { user } = useAuth();
  const [activeItems, setActiveItems] = useState<Matter[]>([]);
  const [deletedItems, setDeletedItems] = useState<Matter[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [taskModules, setTaskModules] = useState<TaskModuleDefinition[]>([]);
  const [commissionShortNames, setCommissionShortNames] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("Todos");
  const [clientSearch, setClientSearch] = useState("");
  const [wordSearch, setWordSearch] = useState("");

  const canDeleteReadOnlyRows = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
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

  async function loadBoard() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [loadedMatters, loadedDeleted, loadedQuotes, loadedClients, loadedTaskItems, loadedTaskModules, shortNames] = await Promise.all([
        apiGet<Matter[]>("/matters"),
        apiGet<Matter[]>("/matters/recycle-bin"),
        apiGet<Quote[]>("/quotes"),
        apiGet<Client[]>("/clients"),
        apiGet<TaskItem[]>("/tasks/items"),
        apiGet<TaskModuleDefinition[]>("/tasks/modules"),
        apiGet<string[]>("/matters/short-names")
      ]);

      setQuotes(sortQuotes(loadedQuotes));
      setClients(loadedClients);
      setTaskItems(loadedTaskItems);
      setTaskModules(loadedTaskModules);
      setCommissionShortNames(shortNames);
      setActiveItems(sortActiveMatters(loadedMatters, loadedClients));
      setDeletedItems(sortDeletedMatters(loadedDeleted));
      setSelectedIds(new Set());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBoard();
  }, []);

  function syncMatterAcrossViews(updated: Matter) {
    setActiveItems((items) => {
      const next = updated.deletedAt ? removeMatter(items, updated.id) : upsertMatter(items, updated);
      return sortActiveMatters(next, clients);
    });
    setDeletedItems((items) => {
      const next = updated.deletedAt ? upsertMatter(items, updated) : removeMatter(items, updated.id);
      return sortDeletedMatters(next);
    });
    setSelectedIds((items) => {
      const next = new Set(items);
      if (updated.deletedAt) {
        next.delete(updated.id);
      }
      return next;
    });
  }

  function updateMatterLocal(matterId: string, updater: (matter: Matter) => Matter) {
    const current = activeItems.find((item) => item.id === matterId);
    if (!current) {
      return null;
    }

    const updated = updater({ ...current });
    setActiveItems((items) => sortActiveMatters(replaceMatter(items, updated), clients));
    return updated;
  }

  async function persistMatter(matter: Matter) {
    try {
      const updated = await apiPatch<Matter>(`/matters/${matter.id}`, buildMatterPatch(matter));
      syncMatterAcrossViews(updated);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadBoard();
    }
  }

  function handleLocalChange(matterId: string, field: keyof MatterPatchPayload, value: string | number) {
    updateMatterLocal(matterId, (matter) => {
      const draft = matter as Matter & Record<string, unknown>;
      draft[field as string] = value;
      return matter;
    });
  }

  async function handleImmediateChange(matterId: string, field: keyof MatterPatchPayload, value: string | boolean) {
    const updated = updateMatterLocal(matterId, (matter) => {
      const draft = matter as Matter & Record<string, unknown>;
      draft[field as string] = value;
      return matter;
    });

    if (updated) {
      await persistMatter(updated);
    }
  }

  async function handleQuoteChange(matterId: string, quoteNumber: string) {
    const updated = updateMatterLocal(matterId, (matter) => {
      const cleanQuoteNumber = normalizeText(quoteNumber);
      const linkedQuote = findQuoteByNumber(quotes, cleanQuoteNumber);

      matter.quoteNumber = cleanQuoteNumber || undefined;
      matter.quoteId = linkedQuote?.id;
      if (linkedQuote) {
        const clientMatch = clients.find((client) => client.id === linkedQuote.clientId);
        matter.clientId = linkedQuote.clientId;
        matter.clientNumber = clientMatch?.clientNumber;
        matter.clientName = linkedQuote.clientName;
        matter.subject = linkedQuote.subject;
        matter.totalFeesMxn = linkedQuote.totalMxn;
        matter.milestone = linkedQuote.milestone;
      } else if (!cleanQuoteNumber) {
        matter.quoteId = undefined;
        matter.clientId = undefined;
        matter.clientName = "";
        matter.subject = "";
        matter.totalFeesMxn = 0;
        matter.milestone = undefined;
        matter.matterType = "ONE_TIME";
      }

      return matter;
    });

    if (updated) {
      await persistMatter(updated);
    }
  }

  function handleBlur(matterId: string) {
    const matter = activeItems.find((item) => item.id === matterId);
    if (!matter) {
      return;
    }

    void persistMatter(matter);
  }

  async function handleAddRow() {
    try {
      const created = await apiPost<Matter>("/matters", {});
      setActiveItems((items) => sortActiveMatters([...items, created], clients));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleTrash(matterId: string) {
    if (!window.confirm("Mover este asunto a la papelera?")) {
      return;
    }

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/trash`, {});
      syncMatterAcrossViews(updated);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleBulkTrash() {
    if (selectedIds.size === 0) {
      return;
    }

    if (!window.confirm(`Mover ${selectedIds.size} asuntos seleccionados a la papelera?`)) {
      return;
    }

    try {
      await apiPost<void>("/matters/bulk-trash", { ids: Array.from(selectedIds) });
      setActiveItems((items) => sortActiveMatters(items.filter((item) => !selectedIds.has(item.id)), clients));
      setSelectedIds(new Set());
      await loadBoard();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleRestore(matterId: string) {
    if (!window.confirm("Restaurar este asunto a activos?")) {
      return;
    }

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/restore`, {});
      syncMatterAcrossViews(updated);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleGenerateIdentifier(matterId: string) {
    const matter = activeItems.find((item) => item.id === matterId);
    if (!matter) {
      return;
    }

    if (normalizeText(matter.matterIdentifier) && !window.confirm("Este asunto ya tiene un ID. Deseas generar uno nuevo?")) {
      return;
    }

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/generate-identifier`, {});
      syncMatterAcrossViews(updated);
      window.alert(`ID generado exitosamente: ${updated.matterIdentifier}`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleSendToExecution(matterId: string) {
    const matter = activeItems.find((item) => item.id === matterId);
    if (!matter) {
      return;
    }

    if (!matter.responsibleTeam) {
      window.alert("Selecciona primero un equipo responsable.");
      return;
    }

    const matterType = getEffectiveMatterType(matter, quotes);
    const moduleName = getTeamLabel(matter.responsibleTeam);
    const confirmMessage = matterType === "RETAINER"
      ? `Enviar copia a ${moduleName}?`
      : `Enviar copia a ${moduleName} y dejarlo visible en Finanzas / Asuntos Activos?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const updated = await apiPost<Matter>(`/matters/${matterId}/send-to-execution`, {});
      syncMatterAcrossViews(updated);
      if (matterType === "RETAINER") {
        window.alert(`Enviado a ${moduleName} correctamente. (Iguala: no se envia a Finanzas / Ver Mes)`);
      } else {
        window.alert(`Enviado a ${moduleName} correctamente. (El registro ya es visible en Finanzas / Asuntos Activos)`);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function toggleSelection(matterId: string) {
    setSelectedIds((items) => {
      const next = new Set(items);
      if (next.has(matterId)) {
        next.delete(matterId);
      } else {
        next.add(matterId);
      }
      return next;
    });
  }

  function toggleAll(items: Matter[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = items.length > 0 && items.every((item) => next.has(item.id));

      if (allSelected) {
        items.forEach((item) => next.delete(item.id));
      } else {
        items.forEach((item) => next.add(item.id));
      }

      return next;
    });
  }

  const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
  const wordSearchWords = useMemo(() => getSearchWords(wordSearch), [wordSearch]);
  const reflections = useMemo(
    () => buildMatterReflectionMap(taskItems, taskModules),
    [taskItems, taskModules]
  );
  const filteredItems = useMemo(
    () =>
      activeItems.filter((item) => {
        const teamMatches = teamFilter === "Todos" || item.responsibleTeam === teamFilter;
        const reflection = getMatterReflection(item, reflections);
        const clientMatches = matchesClientSearch(item.clientName, clientSearchWords);
        const wordMatches = matchesWordSearch(item, quotes, clients, reflection, wordSearchWords);
        return teamMatches && clientMatches && wordMatches;
      }),
    [activeItems, clientSearchWords, wordSearchWords, teamFilter, reflections, quotes, clients]
  );
  const filteredDeletedItems = useMemo(
    () =>
      deletedItems.filter((item) => {
        const teamMatches = teamFilter === "Todos" || item.responsibleTeam === teamFilter;
        const reflection = getMatterReflection(item, reflections);
        const clientMatches = matchesClientSearch(item.clientName, clientSearchWords);
        const wordMatches = matchesWordSearch(item, quotes, clients, reflection, wordSearchWords);
        return teamMatches && clientMatches && wordMatches;
      }),
    [deletedItems, clientSearchWords, wordSearchWords, teamFilter, reflections, quotes, clients]
  );
  const filteredUniqueItems = useMemo(
    () => filteredItems.filter((item) => item.matterType !== "RETAINER"),
    [filteredItems]
  );
  const filteredRetainerItems = useMemo(
    () => filteredItems.filter((item) => item.matterType === "RETAINER"),
    [filteredItems]
  );

  return (
    <section className="page-stack matters-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Asuntos
          </span>
          <div>
            <h2>Asuntos Activos</h2>
          </div>
        </div>
        <p className="muted">
          Tabla operativa de asuntos con separacion entre unicos e igualas, papelera, autollenado desde cotizaciones y
          validacion visual en rojo cuando falta informacion clave.
        </p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>1. Asuntos Activos</h2>
          <span>{filteredUniqueItems.length + filteredRetainerItems.length} registros</span>
        </div>

        <div className="matters-toolbar matters-active-toolbar">
          <div className="matters-toolbar-actions">
            <button type="button" className="primary-button" onClick={() => void handleAddRow()}>
              + Agregar fila
            </button>
            {selectedIds.size > 0 ? (
              <button type="button" className="danger-button" onClick={() => void handleBulkTrash()}>
                Borrar ({selectedIds.size})
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={() => void loadBoard()}>
              Refrescar
            </button>
          </div>

          <div className="matters-filters leads-search-filters matters-active-search-filters">
            <label className="form-field matters-team-field">
              <span>Equipo</span>
              <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
                <option value="Todos">Todos</option>
                {EXECUTION_TEAM_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field matters-search-field">
              <span>Buscar por palabra</span>
              <input
                type="text"
                value={wordSearch}
                onChange={(event) => setWordSearch(event.target.value)}
                placeholder="ID, asunto, proceso, nota..."
              />
            </label>

            <label className="form-field matters-search-field">
              <span>Buscador por cliente</span>
              <input
                type="text"
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Buscar palabra del cliente..."
              />
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>1. Asuntos Activos</h2>
          <span>{filteredUniqueItems.length} unicos</span>
        </div>

        <MatterTable
          items={filteredUniqueItems}
          loading={loading}
          quotes={quotes}
          clients={clients}
          reflections={reflections}
          commissionOptions={commissionOptions}
          selectedIds={selectedIds}
          readOnly={false}
          variant="unique"
          canDeleteReadOnlyRows={canDeleteReadOnlyRows}
          onToggleSelection={toggleSelection}
          onToggleAll={toggleAll}
          onLocalChange={handleLocalChange}
          onImmediateChange={handleImmediateChange}
          onQuoteChange={handleQuoteChange}
          onBlur={handleBlur}
          onGenerateIdentifier={handleGenerateIdentifier}
          onSendToExecution={handleSendToExecution}
          onTrash={handleTrash}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>2. Igualas por asuntos varios</h2>
          <span>{filteredRetainerItems.length} registros</span>
        </div>
        <p className="muted matter-table-caption">
          Vista de solo lectura. Los renglones siguen mostrando rojo cuando falta informacion operativa o no estan
          vinculados a ejecucion.
        </p>

        <MatterTable
          items={filteredRetainerItems}
          loading={loading}
          quotes={quotes}
          clients={clients}
          reflections={reflections}
          commissionOptions={commissionOptions}
          selectedIds={new Set()}
          readOnly={true}
          variant="retainer"
          canDeleteReadOnlyRows={canDeleteReadOnlyRows}
          onToggleSelection={() => undefined}
          onToggleAll={() => undefined}
          onLocalChange={handleLocalChange}
          onImmediateChange={handleImmediateChange}
          onQuoteChange={handleQuoteChange}
          onBlur={handleBlur}
          onGenerateIdentifier={handleGenerateIdentifier}
          onSendToExecution={handleSendToExecution}
          onTrash={handleTrash}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Papelera de Reciclaje</h2>
          <span>{filteredDeletedItems.length} registros</span>
        </div>
        <p className="muted matter-table-caption">
          Los asuntos eliminados desaparecen definitivamente despues de 30 dias.
        </p>

        <div className="lead-table-shell">
          <div className="lead-table-wrapper">
            <table className="lead-table matters-table matters-table-recycle">
              <thead>
                <tr>
                  <th>No. Cliente</th>
                  <th>Comision cierre</th>
                  <th>Cliente</th>
                  <th>No. Cotizacion</th>
                  <th>Asunto</th>
                  <th>Total</th>
                  <th>Canal</th>
                  <th>Equipo</th>
                  <th>R1 Int</th>
                  <th>Bot TG</th>
                  <th>RD</th>
                  <th>RF</th>
                  <th>R1 Ext</th>
                  <th>Chat Fac</th>
                  <th>Hito conclusion</th>
                  <th>Concluyo?</th>
                  <th>Notas</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={18} className="centered-inline-message">
                  Cargando papelera...
                </td>
              </tr>
                ) : filteredDeletedItems.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="centered-inline-message">
                      Papelera vacia.
                    </td>
                  </tr>
                ) : (
                  filteredDeletedItems.map((item) => (
                    <tr key={item.id}>
                      <td>{getEffectiveClientNumber(item, clients) || "-"}</td>
                      <td>{item.commissionAssignee || "-"}</td>
                      <td>{item.clientName || "-"}</td>
                      <td>{item.quoteNumber || "-"}</td>
                      <td>{item.subject || "-"}</td>
                      <td>{formatCurrency(Number(item.totalFeesMxn || 0))}</td>
                      <td>{getChannelLabel(item.communicationChannel)}</td>
                      <td>{getTeamLabel(item.responsibleTeam)}</td>
                      <td>{item.r1InternalCreated ? "Si" : "No"}</td>
                      <td>{item.telegramBotLinked ? "Si" : "No"}</td>
                      <td>{item.rdCreated ? "Si" : "No"}</td>
                      <td>{getRfLabel(item.rfCreated)}</td>
                      <td>{item.r1ExternalCreated ? "Si" : "No"}</td>
                      <td>{item.billingChatCreated ? "Si" : "No"}</td>
                      <td>{item.milestone || "-"}</td>
                      <td>{item.concluded ? "Si" : "No"}</td>
                      <td>{item.notes || "-"}</td>
                      <td>
                        <button type="button" className="secondary-button matter-inline-button" onClick={() => void handleRestore(item.id)}>
                          Regresar
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
    </section>
  );
}
