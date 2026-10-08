import Link from 'next/link';
import type { Milestone } from '@/lib/db/milestones';
import { StateBadge } from './StateBadge';
import { formatMoney, formatDate } from '@/lib/format';

interface MilestoneCardProps {
  milestone: Milestone & { paymentStatus?: string | null };
  /** Compact mode: thin lifecycle progress bar instead of full details. */
  compact?: boolean;
}

/** Map a milestone status to a 0–6 lifecycle progress value. */
function lifecycleProgress(status: string): number {
  switch (status) {
    case 'DRAFT':
      return 0;
    case 'FUNDING_PENDING':
    case 'AUTHORIZED':
    case 'AUTHORIZATION_EXPIRING':
      return 1;
    case 'EVIDENCE_SUBMITTED':
      return 2;
    case 'AI_REVIEW':
      return 3;
    case 'HUMAN_REVIEW':
    case 'REQUEST_CHANGES':
    case 'RELEASE_APPROVED':
      return 4;
    case 'CAPTURE_PENDING':
    case 'CAPTURE_FAILED':
      return 5;
    case 'PAID':
    case 'PAID_PARTIAL':
      return 6;
    case 'CANCELLED':
    case 'VOIDED':
      return 1;
    default:
      return 0;
  }
}

export function MilestoneCard({ milestone, compact = false }: MilestoneCardProps) {
  const status = milestone.paymentStatus ?? milestone.status;
  const progress = lifecycleProgress(milestone.status);
  return (
    <Link
      href={`/milestones/${milestone.id}`}
      className="tl-card group block p-5 transition-colors hover:border-ink-faint/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink group-hover:text-paypal-deep">
            {milestone.title}
          </h3>
          <p className="mt-0.5 text-xs text-ink-faint">
            {milestone.acceptanceCriteria.length} criteria · updated {formatDate(milestone.updatedAt)}
          </p>
        </div>
        <StateBadge status={status} />
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="font-display text-2xl font-semibold tracking-tight">
          {formatMoney(milestone.amount, milestone.currency)}
        </span>
        <span className="text-xs font-medium text-ink-faint">Stage {progress + 1} of 7</span>
      </div>
      {!compact && (
        <div className="mt-3" aria-hidden="true">
          <div className="flex h-1 gap-0.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className={`h-full flex-1 rounded-full ${i <= progress ? 'bg-ink' : 'bg-line'}`}
              />
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}
