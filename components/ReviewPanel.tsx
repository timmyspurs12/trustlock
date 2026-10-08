import type { AiReview, PaymentRelease } from '@/lib/db/milestones';

const VERDICT_STYLES: Record<string, string> = {
  RELEASE: 'bg-green-100 text-green-800',
  PARTIAL_RELEASE: 'bg-amber-100 text-amber-800',
  REQUEST_CHANGES: 'bg-orange-100 text-orange-800',
};

const RESULT_STYLES: Record<string, string> = {
  PASS: 'bg-green-100 text-green-800',
  FAIL: 'bg-red-100 text-red-800',
  INCONCLUSIVE: 'bg-slate-200 text-slate-700',
};

/**
 * The AI verdict + policy decision, rendered from the persisted review.
 * (Server component — reads only from the database.)
 */
export function ReviewPanel({
  review,
  release,
}: {
  review: AiReview;
  release: PaymentRelease | null;
}) {
  const criteria = review.criteriaResults as any[];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI verification</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_STYLES[review.verdict] ?? 'bg-slate-100 text-slate-700'}`}>
          {review.verdict.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Confidence</div>
          <div className="text-lg font-semibold">{(review.confidence * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Recommended release</div>
          <div className="text-lg font-semibold">${review.recommendedAmount.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Model</div>
          <div className="font-mono text-xs">{review.provider}/{review.model}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500">Criterion-by-criterion</div>
        <ul className="mt-2 space-y-2">
          {criteria.map((c) => (
            <li key={c.criterionId} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{c.criterionId}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_STYLES[c.result] ?? 'bg-slate-100 text-slate-700'}`}>
                  {c.result} · {(c.confidence * 100).toFixed(0)}%
                </span>
              </div>
              {c.rationale && <p className="mt-1 text-sm text-slate-700">{c.rationale}</p>}
              {Array.isArray(c.evidence) && c.evidence.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {c.evidence.map((e: any, i: number) => (
                    <li key={i} className="text-xs text-slate-500">
                      <span className="font-semibold">{e.type}</span> · {e.reference} — {e.observation}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      {review.rationale && (
        <p className="text-sm text-slate-600 border-t border-slate-100 pt-3">{review.rationale}</p>
      )}

      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="font-semibold">Policy decision: </span>
        <span className="font-mono">{review.policyDecision}</span>
        <span className="text-slate-500"> — {review.policyReason}</span>
      </div>

      {release && (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-sm">
          <span className="font-semibold">Release: </span>
          <span className="font-mono">{release.state}</span>
          {release.captureStatus && <span className="text-slate-500"> (capture {release.captureStatus})</span>}
          <span className="text-slate-500"> · ${release.requestedAmount.toFixed(2)} · capture </span>
          <span className="font-mono text-xs">{release.captureId}</span>
        </div>
      )}
    </section>
  );
}
