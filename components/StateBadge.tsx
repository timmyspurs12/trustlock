const STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-200 text-slate-700',
  FUNDING_PENDING: 'bg-amber-100 text-amber-800',
  AUTHORIZED: 'bg-green-100 text-green-800',
  VOIDED: 'bg-red-100 text-red-800',
  CAPTURED: 'bg-blue-100 text-blue-800',
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
