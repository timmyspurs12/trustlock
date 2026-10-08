interface MetricCardProps {
  label: string;
  value: string;
  caption?: string;
  /** Accent dot color class (e.g. "bg-amber"). */
  accent: string;
}

export function MetricCard({ label, value, caption, accent }: MetricCardProps) {
  return (
    <div className="tl-card p-5">
      <div className="flex items-center gap-2">
        <span className={`tl-dot ${accent}`} aria-hidden="true" />
        <span className="tl-kpi-label">{label}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{value}</div>
      {caption && <div className="mt-1 text-xs text-ink-faint">{caption}</div>}
    </div>
  );
}
