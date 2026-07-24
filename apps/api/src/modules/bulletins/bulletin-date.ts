const MEXICO_CITY_TIME_ZONE = "America/Mexico_City";

export function getCurrentMexicoDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MEXICO_CITY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
