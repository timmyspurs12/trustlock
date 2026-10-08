import type { AgentAction } from '@/lib/db/milestones';

const TRACE_TYPES = new Set([
  'EVIDENCE_RECEIVED',
  'AI_REVIEW_STARTED',
  'EVIDENCE_FETCHED',
  'CRITERION_EVALUATED',
  'AI_VERDICT_CREATED',
  'POLICY_EVALUATED',
  'RELEASE_APPROVED',
  'CAPTURE_REQUESTED',
  'CAPTURE_PENDING',
  'PAID',
  'PAID_PARTIAL',
  'CAPTURE_FAILED',
  'REQUEST_CHANGES',
  'HUMAN_REVIEW',
  'HUMAN_APPROVAL',
  'HUMAN_DECISION',
]);

const LABELS: Record<string, string> = {
  EVIDENCE_RECEIVED: 'Evidence received',
  AI_REVIEW_STARTED: 'AI review started',
  EVIDENCE_FETCHED: 'Deliverable fetched & inspected',
  CRITERION_EVALUATED: 'Criterion evaluated',
  AI_VERDICT_CREATED: 'Verdict created',
  POLICY_EVALUATED: 'Policy evaluated',
  RELEASE_APPROVED: 'Release approved',
  CAPTURE_REQUESTED: 'Capture requested (PayPal)',
  CAPTURE_PENDING: 'Capture pending settlement',
  PAID: 'Paid',
  PAID_PARTIAL: 'Partially paid',
  CAPTURE_FAILED: 'Capture failed',
  REQUEST_CHANGES: 'Changes requested',
  HUMAN_REVIEW: 'Sent to human review',
  HUMAN_APPROVAL: 'Human approved',
  HUMAN_DECISION: 'Human decision',
};

/**
 * The agent's execution trace — real audit events recorded server-side as the
 * review/release actually ran (never faked). Rendered as a timeline.
 */
export function AgentTrace({ actions }: { actions: AgentAction[] }) {
  const trace = actions.filter((a) => TRACE_TYPES.has(a.actionType));
  if (trace.length === 0) return null;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agent trace</h2>
      <ol className="mt-3 space-y-2">
        {trace.map((a, i) => (
          <li key={a.id} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
              ✓
            </span>
            <div className="min-w-0">
              <div className="font-medium text-slate-800">
                {LABELS[a.actionType] ?? a.actionType}
                {a.actionType === 'CRITERION_EVALUATED' && a.inputReference && (
                  <span className="font-normal text-slate-500"> — {a.inputReference.replace('criterion ', '')}</span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                {new Date(a.createdAt).toLocaleTimeString()} · {a.actor}
                {a.decision && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono">{a.decision}</span>}
                {a.confidence !== null && a.actionType === 'CRITERION_EVALUATED' && (
                  <span className="ml-1">{(a.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
