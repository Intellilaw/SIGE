interface SummaryCardProps {
  label: string;
  value: number;
  accent: string;
}

export function SummaryCard({ label, value, accent }: SummaryCardProps) {
  return (
    <article className="summary-card" style={{ borderColor: accent }}>
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
    </article>
  );
}
