import Link from 'next/link';
import type { ActivityEvent } from '@/lib/db/stats';
import { formatDateTime, formatMoney } from '@/lib/format';
import { StateBadge } from './StateBadge';

const EVENT_STYLES: Record<string, string> = {
  MILESTONE_CREATED: 'border-line bg-line-soft text-ink-soft',
  FUNDING_STARTED: 'border-line bg-line-soft text-ink-soft',
  FUNDING_RESET: 'border-line bg-line-soft text-ink-soft',
  PAYMENT_AUTHORIZED: 'border-amber/40 bg-amber-bg text-amber-strong',
  EVIDENCE_RECEIVED: 'border-blue/40 bg-blue-bg text-blue',
  AI_REVIEW_STARTED: 'border-indigo/40 bg-indigo-bg text-indigo',
  EVIDENCE_FETCHED: 'border-indigo/40 bg-indigo-bg text-indigo',
  CRITERION_EVALUATED: 'border-indigo/40 bg-indigo-bg text-indigo',
  AI_VERDICT_CREATED: 'border-indigo/40 bg-indigo-bg text-indigo',
  AI_REVIEW_FAILED: 'border-red/40 bg-red-bg text-red',
  AI_VERDICT_INVALID: 'border-red/40 bg-red-bg text-red',
  POLICY_EVALUATED: 'border-line bg-line-soft text-ink',
  RELEASE_APPROVED: 'border-green/40 bg-green-bg text-green',
  CAPTURE_REQUESTED: 'border-blue/40 bg-blue-bg text-blue',
  CAPTURE_PENDING: 'border-blue/40 bg-blue-bg text-blue',
  PAID: 'border-green/40 bg-green-bg text-green',
  PAID_PARTIAL: 'border-teal/40 bg-teal-bg text-teal',
  CAPTURE_FAILED: 'border-red/40 bg-red-bg text-red',
  REQUEST_CHANGES: 'border-orange/40 bg-orange-bg text-orange',
  HUMAN_REVIEW: 'border-amber/40 bg-amber-bg text-amber-strong',
  HUMAN_APPROVAL: 'border-amber/40 bg-amber-bg text-amber-strong',
  HUMAN_DECISION: 'border-amber/40 bg-amber-bg text-amber-strong',
};

function eventAmount(event: ActivityEvent): number | null {
  const meta = event.metadata as Record<string, unknown> | null;
  if (meta && typeof meta.amount === 'number') return meta.amount;
  if (['PAYMENT_AUTHORIZED', 'CAPTURE_REQUESTED', 'CAPTURE_PENDING', 'PAID', 'PAID_PARTIAL', 'RELEASE_APPROVED', 'FUNDING_STARTED'].includes(event.type)) {
    return event.amount;
  }
  return null;
}

/**
 * Chronological audit feed built from real agent_actions records.
 * Every row is expandable to inspect the event's stored metadata.
 */
export function ActivityFeed({ events, showMilestone = true }: { events: ActivityEvent[]; showMilestone?: boolean }) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-faint">No activity yet.</p>;
  }
  return (
    <ol className="divide-y divide-line-soft">
      {events.map((event) => {
        const amount = eventAmount(event);
        return (
          <li key={event.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-3 hover:bg-line-soft/60 [&::-webkit-details-marker]:hidden">
                <time className="w-32 shrink-0 font-mono text-xs text-ink-faint" dateTime={event.at}>
                  {formatDateTime(event.at)}
                </time>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    EVENT_STYLES[event.type] ?? 'border-line bg-line-soft text-ink-soft'
                  }`}
                >
                  {event.type}
                </span>
                {showMilestone && (
                  <Link
                    href={`/milestones/${event.milestoneId}`}
                    className="min-w-0 truncate text-sm font-medium text-ink hover:text-paypal-deep"
                  >
                    {event.milestoneTitle}
                  </Link>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {event.decision && (
                    <span className="hidden rounded-full bg-line-soft px-2 py-0.5 font-mono text-xs text-ink-soft sm:inline">
                      {event.decision}
                    </span>
                  )}
                  {amount !== null && (
                    <span className="font-mono text-sm font-medium text-ink">
                      {formatMoney(amount, event.currency ?? 'USD')}
                    </span>
                  )}
                  <StateBadge status={event.milestoneStatus} className="hidden md:inline-flex" />
                </span>
              </summary>
              <div className="px-1 pb-4 pt-1">
                <dl className="grid gap-2 rounded-md border border-line bg-paper p-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold uppercase tracking-wider text-ink-faint">Actor</dt>
                    <dd className="mt-0.5 font-mono text-ink-soft">{event.actor}</dd>
                  </div>
                  {event.inputReference && (
                    <div>
                      <dt className="font-semibold uppercase tracking-wider text-ink-faint">Input</dt>
                      <dd className="mt-0.5 break-all font-mono text-ink-soft">{event.inputReference}</dd>
                    </div>
                  )}
                  {event.confidence !== null && (
                    <div>
                      <dt className="font-semibold uppercase tracking-wider text-ink-faint">Confidence</dt>
                      <dd className="mt-0.5 font-mono text-ink-soft">{Math.round(event.confidence * 100)}%</dd>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <dt className="font-semibold uppercase tracking-wider text-ink-faint">Event ID</dt>
                    <dd className="mt-0.5 break-all font-mono text-ink-soft">{event.id}</dd>
                  </div>
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold uppercase tracking-wider text-ink-faint">Metadata</dt>
                      <dd className="mt-0.5 overflow-x-auto rounded bg-card p-2 font-mono text-ink-soft">
                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(event.metadata, null, 2)}</pre>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
