export type MoneyCurrency = "MXN" | "USD";

type MoneyValues = Record<string, string>;

export const moneyCurrencyLabels: Record<MoneyCurrency, string> = {
  MXN: "Pesos (MXN)",
  USD: "Dólares (USD)"
};

const moneyCurrencyLegalDetails: Record<MoneyCurrency, { singular: string; plural: string; abbreviation: string }> = {
  MXN: { singular: "peso", plural: "pesos", abbreviation: "M.N." },
  USD: { singular: "dólar", plural: "dólares", abbreviation: "USD" }
};

const spanishNumberUnits = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve"
];
const spanishNumberTens = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const spanishNumberHundreds = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos"
];
const spanishNumberScales = [
  { value: 1_000_000_000_000_000_000_000_000n, singular: "cuatrillón", plural: "cuatrillones" },
  { value: 1_000_000_000_000_000_000n, singular: "trillón", plural: "trillones" },
  { value: 1_000_000_000_000n, singular: "billón", plural: "billones" },
  { value: 1_000_000n, singular: "millón", plural: "millones" }
];

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function spanishNumberBelowOneThousand(number: number, apocope: boolean): string {
  if (number < 30) {
    if (apocope && number === 1) {
      return "un";
    }

    if (apocope && number === 21) {
      return "veintiún";
    }

    return spanishNumberUnits[number];
  }

  if (number < 100) {
    const tens = Math.floor(number / 10);
    const units = number % 10;

    return units ? `${spanishNumberTens[tens]} y ${spanishNumberBelowOneThousand(units, apocope)}` : spanishNumberTens[tens];
  }

  if (number === 100) {
    return "cien";
  }

  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;

  return remainder
    ? `${spanishNumberHundreds[hundreds]} ${spanishNumberBelowOneThousand(remainder, apocope)}`
    : spanishNumberHundreds[hundreds];
}

function integerToSpanish(number: bigint, apocope = false): string {
  if (number < 1_000n) {
    return spanishNumberBelowOneThousand(Number(number), apocope);
  }

  for (const scale of spanishNumberScales) {
    if (number >= scale.value) {
      const scaleCount = number / scale.value;
      const remainder = number % scale.value;
      const scaleText =
        scaleCount === 1n ? `un ${scale.singular}` : `${integerToSpanish(scaleCount, true)} ${scale.plural}`;

      return remainder ? `${scaleText} ${integerToSpanish(remainder, apocope)}` : scaleText;
    }
  }

  const thousands = number / 1_000n;
  const remainder = number % 1_000n;
  const thousandsText = thousands === 1n ? "mil" : `${integerToSpanish(thousands, true)} mil`;

  return remainder ? `${thousandsText} ${integerToSpanish(remainder, apocope)}` : thousandsText;
}

export function formatMoneyInputValue(rawAmount?: string | null, forceDecimals = false) {
  const normalizedAmount = normalizeText(rawAmount)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");

  if (!normalizedAmount) {
    return "";
  }

  const hasDecimalPoint = normalizedAmount.includes(".");
  const [rawIntegerPart, ...rawDecimalParts] = normalizedAmount.split(".");
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/g, "") || "0";
  const decimalPart = rawDecimalParts.join("").slice(0, 2);
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (forceDecimals) {
    return `${groupedInteger}.${decimalPart.padEnd(2, "0")}`;
  }

  return hasDecimalPoint ? `${groupedInteger}.${decimalPart}` : groupedInteger;
}

export function getMoneyCurrency(values: MoneyValues): MoneyCurrency {
  return values.currency === "USD" ? "USD" : "MXN";
}

function moneyAmountParts(rawAmount?: string | null) {
  const normalizedAmount = formatMoneyInputValue(rawAmount, true);

  if (!normalizedAmount) {
    return null;
  }

  const [integerPart, decimalPart = "00"] = normalizedAmount.replace(/,/g, "").split(".");

  try {
    return {
      integer: BigInt(integerPart),
      decimals: decimalPart.padEnd(2, "0").slice(0, 2)
    };
  } catch {
    return null;
  }
}

function amountLabel(values: MoneyValues) {
  const amountParts = moneyAmountParts(values.amount);

  if (!amountParts) {
    return normalizeText(values.amount) || "cantidad pendiente";
  }

  const currency = getMoneyCurrency(values);
  const formattedAmount = `${amountParts.integer.toLocaleString("en-US")}.${amountParts.decimals}`;

  return `$${formattedAmount} ${moneyCurrencyLegalDetails[currency].abbreviation}`;
}

export function moneyAmountInWords(values: MoneyValues) {
  const amountParts = moneyAmountParts(values.amount);

  if (!amountParts) {
    return "CANTIDAD CON LETRA PENDIENTE";
  }

  const currency = getMoneyCurrency(values);
  const currencyDetails = moneyCurrencyLegalDetails[currency];
  const currencyName = amountParts.integer === 1n ? currencyDetails.singular : currencyDetails.plural;
  const requiresDe = amountParts.integer >= 1_000_000n && amountParts.integer % 1_000_000n === 0n;
  const words = integerToSpanish(amountParts.integer, true);

  return `${words}${requiresDe ? " de" : ""} ${currencyName} ${amountParts.decimals}/100 ${currencyDetails.abbreviation}`.toLocaleUpperCase(
    "es-MX"
  );
}

export function moneyAmountWithWords(values: MoneyValues) {
  return `${amountLabel(values)} (${moneyAmountInWords(values)})`;
}
