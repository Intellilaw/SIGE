const TTL_PATTERN = /^(\d+)\s*([smhd])$/i;

const unitToSeconds = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60
} as const;

export function parseTtlSeconds(value: string, fallbackSeconds: number) {
  const trimmed = value.trim();
  const numericSeconds = Number.parseInt(trimmed, 10);
  if (/^\d+$/.test(trimmed) && Number.isFinite(numericSeconds)) {
    return numericSeconds;
  }

  const match = TTL_PATTERN.exec(trimmed);
  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase() as keyof typeof unitToSeconds;
  return amount * unitToSeconds[unit];
}
