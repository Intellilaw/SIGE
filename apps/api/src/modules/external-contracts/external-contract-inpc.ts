import type { ExternalContractInpcSyncWarning } from "@sige/contracts";

import { AppError } from "../../core/errors/app-error";
import type { ExternalContractInpcWriteRecord, ExternalContractsRepository } from "../../repositories/types";

const BUSINESS_TIME_ZONE = "America/Mexico_City";
const BANXICO_INPC_SERIES = "SP1";
const BANXICO_INPC_TITLE_TOKEN = "INPC";
const INPC_SYNC_START_PERIOD = "2025-01-01";
const MIN_EXPECTED_INPC_VALUE = 100;
const MAX_EXPECTED_INPC_VALUE = 500;
const MAX_MONTHLY_DECREASE_RATE = -0.03;
const MAX_MONTHLY_INCREASE_RATE = 0.1;
const WARNING_MONTHLY_CHANGE_RATE = 0.05;

export const BANXICO_INPC_PUBLIC_URL =
  "https://www.banxico.org.mx/SieInternet/consultaSerieGrafica.do?s=SP1,CP154,1&versionSerie=&l=es";

type BanxicoInpcPayload = {
  titulo?: unknown;
  serie?: unknown;
  valores?: unknown;
};

type ParsedInpcRecord = ExternalContractInpcWriteRecord & {
  periodLabel: string;
};

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getBusinessDateInput(date = new Date()) {
  const parts = Object.fromEntries(
    businessDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeAccessText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function periodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parsePeriodDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-01$/.test(value)) {
    throw new AppError(502, "BANXICO_INPC_PERIOD_INVALID", "Banxico devolvio un periodo INPC inesperado.");
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  const periodYear = date.getUTCFullYear();
  const periodMonth = date.getUTCMonth() + 1;

  return {
    periodDate: value,
    periodYear,
    periodMonth,
    periodLabel: periodLabel(periodYear, periodMonth)
  };
}

function parseInpcValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    throw new AppError(502, "BANXICO_INPC_VALUE_INVALID", "Banxico devolvio un valor INPC ilegible.");
  }

  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new AppError(502, "BANXICO_INPC_VALUE_AMBIGUOUS", "Banxico devolvio un valor INPC con formato ambiguo.");
  }

  return Number(normalized);
}

function validateInpcReading(record: ParsedInpcRecord, previous: ParsedInpcRecord | null, warnings: ExternalContractInpcSyncWarning[]) {
  if (!Number.isFinite(record.value) || record.value < MIN_EXPECTED_INPC_VALUE || record.value > MAX_EXPECTED_INPC_VALUE) {
    throw new AppError(
      502,
      "BANXICO_INPC_VALUE_OUT_OF_RANGE",
      `El INPC ${record.periodLabel} (${record.value}) no esta en el rango esperado para la base actual del indice.`
    );
  }

  if (!previous) {
    return;
  }

  const monthlyChangeRate = (record.value - previous.value) / previous.value;
  if (monthlyChangeRate < MAX_MONTHLY_DECREASE_RATE || monthlyChangeRate > MAX_MONTHLY_INCREASE_RATE) {
    throw new AppError(
      502,
      "BANXICO_INPC_VALUE_JUMP",
      `El INPC ${record.periodLabel} cambia ${(monthlyChangeRate * 100).toFixed(2)}% contra ${previous.periodLabel}; se detuvo la importacion para evitar guardar un numero erroneo.`
    );
  }

  if (monthlyChangeRate < 0) {
    warnings.push({
      period: record.periodLabel,
      message: `El INPC ${record.periodLabel} es ligeramente menor al mes anterior; se guardo porque la baja esta dentro del margen razonable.`
    });
  }

  if (Math.abs(monthlyChangeRate) > WARNING_MONTHLY_CHANGE_RATE) {
    warnings.push({
      period: record.periodLabel,
      message: `El INPC ${record.periodLabel} cambio ${(monthlyChangeRate * 100).toFixed(2)}% contra el mes anterior.`
    });
  }
}

function parseBanxicoPayload(payload: BanxicoInpcPayload, todayInput: string) {
  const title = typeof payload.titulo === "string" ? payload.titulo : "";
  const series = typeof payload.serie === "string" ? payload.serie : "";

  if (series !== BANXICO_INPC_SERIES || !normalizeAccessText(title).includes(BANXICO_INPC_TITLE_TOKEN)) {
    throw new AppError(502, "BANXICO_INPC_SERIES_INVALID", "La respuesta de Banxico no corresponde a la serie INPC esperada.");
  }

  if (!Array.isArray(payload.valores)) {
    throw new AppError(502, "BANXICO_INPC_VALUES_INVALID", "Banxico no devolvio valores INPC en el formato esperado.");
  }

  const warnings: ExternalContractInpcSyncWarning[] = [];
  const records = payload.valores
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        throw new AppError(502, "BANXICO_INPC_ROW_INVALID", "Banxico devolvio una fila INPC incompleta.");
      }

      const period = parsePeriodDate(entry[0]);
      return {
        ...period,
        value: parseInpcValue(entry[1]),
        source: "BANXICO",
        sourceSeries: BANXICO_INPC_SERIES
      };
    })
    .filter((record) => record.periodDate >= INPC_SYNC_START_PERIOD && record.periodDate <= todayInput)
    .sort((left, right) => left.periodDate.localeCompare(right.periodDate));

  let previous: ParsedInpcRecord | null = null;
  records.forEach((record) => {
    validateInpcReading(record, previous, warnings);
    previous = record;
  });

  return {
    records: records.map(({ periodLabel: _periodLabel, ...record }) => record),
    warnings
  };
}

export async function fetchExternalContractInpcFromBanxico(now = new Date()) {
  const todayInput = getBusinessDateInput(now);
  const response = await fetch(BANXICO_INPC_PUBLIC_URL, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new AppError(502, "BANXICO_INPC_FETCH_FAILED", "No se pudo consultar el INPC publicado por Banxico.");
  }

  const payload = await response.json() as BanxicoInpcPayload;
  return parseBanxicoPayload(payload, todayInput);
}

export async function syncExternalContractInpc(repository: ExternalContractsRepository, now = new Date()) {
  const { records, warnings } = await fetchExternalContractInpcFromBanxico(now);
  const counts = await repository.upsertInpc(records);

  return {
    ...counts,
    warnings
  };
}

export function getPreviousMonthInpcPeriodKey(now = new Date()) {
  const todayInput = getBusinessDateInput(now);
  const year = Number(todayInput.slice(0, 4));
  const month = Number(todayInput.slice(5, 7));
  const previousMonthDate = new Date(Date.UTC(year, month - 2, 1, 12));

  return periodLabel(previousMonthDate.getUTCFullYear(), previousMonthDate.getUTCMonth() + 1);
}

export function shouldAttemptMonthlyExternalContractInpcSync(now = new Date()) {
  const todayInput = getBusinessDateInput(now);
  const dayOfMonth = Number(todayInput.slice(8, 10));

  return dayOfMonth >= 9;
}
