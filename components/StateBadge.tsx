const STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-200 text-slate-700',
  FUNDING_PENDING: 'bg-amber-100 text-amber-800',
  AUTHORIZED: 'bg-green-100 text-green-800',
  EVIDENCE_SUBMITTED: 'bg-blue-100 text-blue-800',
  AI_REVIEW: 'bg-indigo-100 text-indigo-800',
  RELEASE_APPROVED: 'bg-blue-100 text-blue-800',
  HUMAN_REVIEW: 'bg-amber-100 text-amber-800',
  REQUEST_CHANGES: 'bg-orange-100 text-orange-800',
  CAPTURE_PENDING: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  PAID_PARTIAL: 'bg-teal-100 text-teal-800',
  CAPTURE_FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
  VOIDED: 'bg-slate-200 text-slate-600',
  AUTHORIZATION_EXPIRING: 'bg-amber-100 text-amber-800',
};

export function StateBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
