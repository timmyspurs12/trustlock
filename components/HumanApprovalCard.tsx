'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AiReview } from '@/lib/db/milestones';
import { formatMoney } from '@/lib/format';

/**
 * Human decision card shown when the policy engine requires a human
 * (low confidence, partial release, inconclusive evidence, rejected
 * proposal). The human action goes through the same server-side policy and
 * payment protections — the browser never calls PayPal.
 */
export function HumanApprovalCard({ milestoneId, review }: { milestoneId: string; review: AiReview }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (decision: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT') => {
    setBusy(decision);
    setMessage(null);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.id, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setMessage(
        decision === 'APPROVE'
          ? 'Release executed — see the payment panel for the PayPal capture state.'
          : `Decision recorded: ${decision.replace(/_/g, ' ')}`
      );
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-amber/40 bg-amber-bg/40 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-strong">
        Human review required
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        The policy engine did not allow automatic release. AI recommendation:{' '}
        <strong className="text-ink">{review.verdict.replace(/_/g, ' ')}</strong> ·{' '}
        {formatMoney(review.recommendedAmount)} · confidence {Math.round(review.confidence * 100)}%.
      </p>
      <p className="mt-1 text-xs text-ink-faint">{review.policyReason}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => act('APPROVE')}
          disabled={!!busy}
          className="tl-btn-success"
          aria-busy={busy === 'APPROVE'}
        >
          {busy === 'APPROVE' ? 'Releasing…' : `Approve release ${formatMoney(review.recommendedAmount)}`}
        </button>
        <button
          onClick={() => act('REQUEST_CHANGES')}
          disabled={!!busy}
          className="inline-flex items-center justify-center rounded-md bg-amber px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === 'REQUEST_CHANGES' ? '…' : 'Request changes'}
        </button>
        <button
          onClick={() => act('REJECT')}
          disabled={!!busy}
          className="tl-btn-danger"
        >
          {busy === 'REJECT' ? '…' : 'Reject'}
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-ink-soft">{message}</p>}
    </section>
  );
}
