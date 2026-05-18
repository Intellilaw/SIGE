interface RusconiIntelligenceMarkProps {
  size?: "compact" | "large";
}

interface RusconiIntelligenceBadgeProps {
  connectionId: string;
  label?: string;
}

export function RusconiIntelligenceMark({ size = "compact" }: RusconiIntelligenceMarkProps) {
  return (
    <span className={`ri-mark ri-mark-${size}`} aria-hidden="true">
      <span className="ri-mark-core">RI</span>
    </span>
  );
}

export function RusconiIntelligenceBadge({ connectionId, label }: RusconiIntelligenceBadgeProps) {
  const title = label ? `Rusconi Intelligence ${connectionId}: ${label}` : `Rusconi Intelligence ${connectionId}`;

  return (
    <span className="ri-badge" title={title} aria-label={title}>
      <RusconiIntelligenceMark />
      <span className="ri-badge-id">{connectionId}</span>
    </span>
  );
}
