import type { AcceptanceCriterion, AiReview, PaymentRelease } from '@/lib/db/milestones';
import { CriterionCard, type CriterionDisplay } from './CriterionCard';
import { formatMoney, formatPercent } from '@/lib/format';

const VERDICT_STYLES: Record<string, string> = {
  RELEASE: 'border-green/40 bg-green-bg text-green',
  PARTIAL_RELEASE: 'border-amber/40 bg-amber-bg text-amber-strong',
  REQUEST_CHANGES: 'border-orange/40 bg-orange-bg text-orange',
};

interface ReviewPanelProps {
  review: AiReview;
  release: PaymentRelease | null;
  criteria: AcceptanceCriterion[];
}

/**
 * The AI Verification panel. Every value comes from the stored ai_reviews
 * record — verdict, confidence, per-criterion results, recommended release.
 */
export function ReviewPanel({ review, release, criteria }: ReviewPanelProps) {
  const criteriaById = new Map(criteria.map((c) => [c.id, c]));
  const results = review.criteriaResults as any[];
  const passed = results.filter((c) => c.result === 'PASS').length;
  const display: CriterionDisplay[] = results.map((c) => ({
    criterionId: c.criterionId,
    description: criteriaById.get(c.criterionId)?.description,
    result: c.result,
    confidence: c.confidence,
    rationale: c.rationale,
    evidence: c.evidence,
  }));

  return (
    <section className="tl-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="tl-h2">AI Verification</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Evidence reviewed against your contractual acceptance criteria.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${
            VERDICT_STYLES[review.verdict] ?? 'border-line bg-line-soft text-ink-soft'
          }`}
        >
          {review.verdict.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-paper p-4">
          <div className="tl-kpi-label">Confidence</div>
          <div className="mt-1 font-display text-2xl font-semibold">{formatPercent(review.confidence)}</div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${review.confidence >= 0.9 ? 'bg-green' : review.confidence >= 0.7 ? 'bg-amber' : 'bg-orange'}`}
              style={{ width: `${Math.round(review.confidence * 100)}%` }}
            />
          </div>
        </div>
        <div className="rounded-md border border-line bg-paper p-4">
          <div className="tl-kpi-label">Criteria</div>
          <div className="mt-1 font-display text-2xl font-semibold">
            {passed} / {results.length} passed
          </div>
          <div className="mt-1 text-xs text-ink-faint">
            {results.length - passed} not passed
          </div>
        </div>
        <div className="rounded-md border border-line bg-paper p-4">
          <div className="tl-kpi-label">Recommended release</div>
          <div className="mt-1 font-display text-2xl font-semibold">
            {formatMoney(review.recommendedAmount)}
          </div>
          <div className="mt-1 text-xs text-ink-faint">of the held amount</div>
        </div>
      </div>

      {review.rationale && <p className="mt-4 text-sm text-ink-soft">{review.rationale}</p>}

      <ul className="mt-5 space-y-2">
        {display.map((c) => (
          <CriterionCard key={c.criterionId} criterion={c} />
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper px-4 py-3 text-sm">
        <span className="font-semibold text-ink">Policy decision:</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
            review.policyDecision === 'AUTO_RELEASE'
              ? 'border-green/40 bg-green-bg text-green'
              : review.policyDecision === 'HUMAN_REVIEW'
                ? 'border-amber/40 bg-amber-bg text-amber-strong'
                : review.policyDecision === 'REQUEST_CHANGES'
                  ? 'border-orange/40 bg-orange-bg text-orange'
                  : 'border-red/40 bg-red-bg text-red'
          }`}
        >
          {review.policyDecision.replace(/_/g, ' ')}
        </span>
        <span className="text-ink-soft">{review.policyReason}</span>
      </div>

      {release && (
        <div className="mt-3 rounded-md border border-blue/40 bg-blue-bg/50 px-4 py-3 text-sm">
          <span className="font-semibold text-ink">Release: </span>
          <span className="font-semibold text-blue">{release.state.replace(/_/g, ' ')}</span>
          {release.captureStatus && <span className="text-ink-soft"> (capture {release.captureStatus})</span>}
          <span className="text-ink-soft"> · {formatMoney(release.requestedAmount)} · capture </span>
          <span className="font-mono text-xs text-ink-soft">{release.captureId}</span>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        Model: {review.provider}/{review.model} · reviewed {new Date(review.createdAt).toLocaleString()}
      </p>
    </section>
  );
}
