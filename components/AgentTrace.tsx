import type { AgentAction } from '@/lib/db/milestones';
import { formatTime } from '@/lib/format';

const LABELS: Record<string, string> = {
  EVIDENCE_RECEIVED: 'Evidence received',
  AI_REVIEW_STARTED: 'AI review started',
  EVIDENCE_FETCHED: 'Deliverable fetched & inspected',
  CRITERION_EVALUATED: 'Criterion evaluated',
  AI_VERDICT_CREATED: 'AI verdict created',
  AI_REVIEW_FAILED: 'AI review failed',
  POLICY_EVALUATED: 'Policy evaluated',
  RELEASE_APPROVED: 'Release approved',
  CAPTURE_REQUESTED: 'PayPal capture requested',
  CAPTURE_PENDING: 'Capture pending settlement',
  PAID: 'Paid',
  PAID_PARTIAL: 'Partially paid',
  CAPTURE_FAILED: 'Capture failed',
  REQUEST_CHANGES: 'Changes requested',
  HUMAN_REVIEW: 'Sent to human review',
  HUMAN_APPROVAL: 'Human approved',
  HUMAN_DECISION: 'Human decision',
  PAYMENT_AUTHORIZED: 'Payment authorized (funds held)',
  FUNDING_STARTED: 'Funding started',
  MILESTONE_CREATED: 'Milestone created',
};

const ACTOR_STYLES: Record<string, string> = {
  agent: 'bg-indigo-bg text-indigo',
  system: 'bg-blue-bg text-blue',
  client: 'bg-amber-bg text-amber-strong',
};

/**
 * The agent's execution trace — a timeline of REAL audit events recorded
 * server-side while the review/release actually ran. Nothing is fabricated.
 */
export function AgentTrace({ actions }: { actions: AgentAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section className="tl-card p-6">
      <h2 className="tl-section-title">Agent trace</h2>
      <ol className="mt-4 space-y-3">
        {actions.map((a, i) => {
          const isLast = i === actions.length - 1;
          return (
            <li key={a.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-0.5 flex h-2 w-2 shrink-0 rounded-full ${
                    a.actor === 'agent' ? 'bg-indigo' : a.actor === 'client' ? 'bg-amber' : 'bg-blue'
                  }`}
                  aria-hidden="true"
                />
                {!isLast && <span className="w-px flex-1 bg-line" aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {LABELS[a.actionType] ?? a.actionType}
                    {a.actionType === 'CRITERION_EVALUATED' && a.inputReference && (
                      <span className="font-normal text-ink-faint">
                        {' '}
                        — {a.inputReference.replace('criterion ', '')}
                      </span>
                    )}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      ACTOR_STYLES[a.actor] ?? 'bg-line-soft text-ink-soft'
                    }`}
                  >
                    {a.actor}
                  </span>
                  {a.decision && (
                    <span className="rounded-full bg-line-soft px-1.5 py-0.5 font-mono text-xs text-ink-soft">
                      {a.decision}
                    </span>
                  )}
                  {a.confidence !== null && a.actionType === 'CRITERION_EVALUATED' && (
                    <span className="font-mono text-xs text-ink-faint">
                      {Math.round(a.confidence * 100)}%
                    </span>
                  )}
                </div>
                <time className="mt-0.5 block font-mono text-xs text-ink-faint" dateTime={a.createdAt}>
                  {formatTime(a.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
