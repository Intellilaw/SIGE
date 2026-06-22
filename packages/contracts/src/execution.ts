export interface ExecutionMatterCompletenessInput {
  clientNumber?: string | null;
  clientName?: string | null;
  quoteNumber?: string | null;
  subject?: string | null;
  matterIdentifier?: string | null;
  communicationChannel?: string | null;
  milestone?: string | null;
  taskCount?: number;
}

function hasText(value?: string | null) {
  return String(value ?? "").trim().length > 0;
}

export function getExecutionMatterMissingFields(input: ExecutionMatterCompletenessInput) {
  const missing: string[] = [];

  if (!hasText(input.clientNumber)) missing.push("No. Cliente");
  if (!hasText(input.clientName)) missing.push("Cliente");
  if (!hasText(input.quoteNumber)) missing.push("No. Cotizacion");
  if (!hasText(input.subject)) missing.push("Asunto");
  if (!hasText(input.matterIdentifier)) missing.push("ID Asunto");
  if (!hasText(input.communicationChannel)) missing.push("Canal");
  if (!hasText(input.milestone)) missing.push("Hito conclusion");
  if ((input.taskCount ?? 0) <= 0) missing.push("Sin siguientes tareas");

  return missing;
}

export function isExecutionMatterIncomplete(input: ExecutionMatterCompletenessInput) {
  return getExecutionMatterMissingFields(input).length > 0;
}
