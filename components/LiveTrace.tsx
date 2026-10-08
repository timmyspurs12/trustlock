'use client';

import { useEffect, useRef, useState } from 'react';
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

const IN_FLIGHT = ['EVIDENCE_SUBMITTED', 'AI_REVIEW'];

/**
 * Live agent activity: polls the milestone's REAL state while a review is in
 * flight (or just finished) and renders the audit events as they arrive.
 * Every event comes from the server's agent_actions — nothing is fabricated.
 */
export function LiveTrace({ milestoneId }: { milestoneId: string }) {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [status, setStatus] = useState('');
  const [active, setActive] = useState(false);
  const seenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/milestones/${milestoneId}`);
        const j = await res.json();
        if (cancelled || !j?.milestone) return;
        const acts = (j.actions ?? []) as AgentAction[];
        const inFlight = IN_FLIGHT.includes(j.milestone.status);
        const lastAt = acts.length ? new Date(acts[acts.length - 1].createdAt).getTime() : 0;
        const isRecent = Date.now() - lastAt < 90_000;
        const hasNew = acts.length > seenRef.current;
        seenRef.current = acts.length;
        if (inFlight || (hasNew && isRecent)) setActive(true);
        setActions(acts);
        setStatus(j.milestone.status);
      } catch {
        /* keep polling */
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [milestoneId]);

  if (!active || actions.length === 0) return null;
  const inFlight = IN_FLIGHT.includes(status);
  const fresh = actions.slice(-8);

  return (
    <section className="tl-card border-paypal/40 p-6" aria-live="polite">
      <div className="flex items-center justify-between">
        <h2 className="tl-section-title">Live agent activity</h2>
        {inFlight ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-paypal">
            <span className="tl-dot bg-paypal tl-pulse" aria-hidden="true" />
            live · server state: {status.replace(/_/g, ' ')}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">latest events</span>
        )}
      </div>
      <ol className="mt-4 space-y-2">
        {fresh.map((a) => (
          <li key={a.id} className="flex items-start gap-3 text-sm">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                a.actor === 'agent' ? 'bg-indigo' : a.actor === 'client' ? 'bg-amber' : 'bg-blue'
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <span className="font-medium text-ink">
                {LABELS[a.actionType] ?? a.actionType}
                {a.actionType === 'CRITERION_EVALUATED' && a.inputReference && (
                  <span className="font-normal text-ink-faint">
                    {' '}
                    — {a.inputReference.replace('criterion ', '')}
                  </span>
                )}
              </span>
              <span className="ml-2 font-mono text-xs text-ink-faint">{formatTime(a.createdAt)}</span>
              {a.decision && (
                <span className="ml-2 rounded-full bg-line-soft px-1.5 py-0.5 font-mono text-xs text-ink-soft">
                  {a.decision}
                </span>
              )}
              {a.confidence !== null && a.actionType === 'CRITERION_EVALUATED' && (
                <span className="ml-1 font-mono text-xs text-ink-faint">
                  {Math.round(a.confidence * 100)}%
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
