const STYLES: Record<string, { chip: string; dot: string }> = {
  DRAFT: { chip: 'border-line bg-line-soft text-ink-soft', dot: 'bg-ink-faint' },
  FUNDING_PENDING: { chip: 'border-amber/40 bg-amber-bg text-amber-strong', dot: 'bg-amber' },
  AUTHORIZED: { chip: 'border-amber/40 bg-amber-bg text-amber-strong', dot: 'bg-amber' },
  AUTHORIZATION_EXPIRING: { chip: 'border-amber/40 bg-amber-bg text-amber-strong', dot: 'bg-amber' },
  EVIDENCE_SUBMITTED: { chip: 'border-blue/40 bg-blue-bg text-blue', dot: 'bg-blue' },
  AI_REVIEW: { chip: 'border-indigo/40 bg-indigo-bg text-indigo', dot: 'bg-indigo' },
  RELEASE_APPROVED: { chip: 'border-blue/40 bg-blue-bg text-blue', dot: 'bg-blue' },
  HUMAN_REVIEW: { chip: 'border-amber/40 bg-amber-bg text-amber-strong', dot: 'bg-amber' },
  REQUEST_CHANGES: { chip: 'border-orange/40 bg-orange-bg text-orange', dot: 'bg-orange' },
  CAPTURE_PENDING: { chip: 'border-blue/40 bg-blue-bg text-blue', dot: 'bg-blue' },
  PAID: { chip: 'border-green/40 bg-green-bg text-green', dot: 'bg-green' },
  PAID_PARTIAL: { chip: 'border-teal/40 bg-teal-bg text-teal', dot: 'bg-teal' },
  CAPTURE_FAILED: { chip: 'border-red/40 bg-red-bg text-red', dot: 'bg-red' },
  CANCELLED: { chip: 'border-line bg-line-soft text-ink-faint', dot: 'bg-ink-faint' },
  VOIDED: { chip: 'border-line bg-line-soft text-ink-faint', dot: 'bg-ink-faint' },
};

const LABELS: Record<string, string> = {
  FUNDING_PENDING: 'Funding pending',
  AUTHORIZATION_EXPIRING: 'Authorization expiring',
  EVIDENCE_SUBMITTED: 'Evidence submitted',
  AI_REVIEW: 'AI review',
  RELEASE_APPROVED: 'Release approved',
  HUMAN_REVIEW: 'Human review',
  REQUEST_CHANGES: 'Changes requested',
  CAPTURE_PENDING: 'Capture pending',
  PAID_PARTIAL: 'Paid · partial',
  CAPTURE_FAILED: 'Capture failed',
};

export function StateBadge({ status, className = '' }: { status: string; className?: string }) {
  const style = STYLES[status] ?? { chip: 'border-line bg-line-soft text-ink-soft', dot: 'bg-ink-faint' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.chip} ${className}`}
    >
      <span className={`tl-dot ${style.dot}`} aria-hidden="true" />
      {LABELS[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}
