'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AiReview } from '@/lib/db/milestones';

/**
 * Human decision card shown when the policy engine requires a human
 * (low confidence, partial release, inconclusive evidence, or rejected
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
      setMessage(decision === 'APPROVE' ? 'Release executed — see the payment state below.' : `Decision recorded: ${decision.replace(/_/g, ' ')}`);
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Human review required</h2>
      <p className="text-sm text-slate-700">
        The policy engine did not allow automatic release. AI recommendation:{' '}
        <strong>{review.verdict.replace(/_/g, ' ')}</strong> · ${review.recommendedAmount.toFixed(2)} · confidence{' '}
        {(review.confidence * 100).toFixed(0)}%.
      </p>
      <p className="text-xs text-slate-500">{review.policyReason}</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => act('APPROVE')}
          disabled={!!busy}
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
        >
          {busy === 'APPROVE' ? 'Releasing…' : `Approve release $${review.recommendedAmount.toFixed(2)}`}
        </button>
        <button
          onClick={() => act('REQUEST_CHANGES')}
          disabled={!!busy}
          className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {busy === 'REQUEST_CHANGES' ? '…' : 'Request changes'}
        </button>
        <button
          onClick={() => act('REJECT')}
          disabled={!!busy}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
        >
          {busy === 'REJECT' ? '…' : 'Reject'}
        </button>
      </div>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </section>
  );
}
