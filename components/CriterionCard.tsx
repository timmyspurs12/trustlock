import { formatPercent } from '@/lib/format';

export interface CriterionDisplay {
  criterionId: string;
  description?: string;
  result: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | string;
  confidence: number;
  rationale?: string;
  evidence?: Array<{ type: string; reference: string; observation: string }>;
}

const RESULT_STYLES: Record<string, { border: string; chip: string; icon: string; label: string }> = {
  PASS: {
    border: 'border-green/40 bg-green-bg/40',
    chip: 'border-green/40 bg-green-bg text-green',
    icon: 'text-green',
    label: 'PASS',
  },
  FAIL: {
    border: 'border-red/40 bg-red-bg/40',
    chip: 'border-red/40 bg-red-bg text-red',
    icon: 'text-red',
    label: 'FAIL',
  },
  INCONCLUSIVE: {
    border: 'border-amber/40 bg-amber-bg/40',
    chip: 'border-amber/40 bg-amber-bg text-amber-strong',
    icon: 'text-amber',
    label: 'INCONCLUSIVE',
  },
};

function ResultIcon({ result }: { result: string }) {
  if (result === 'PASS') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (result === 'FAIL') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.2v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * One acceptance criterion as evaluated by the AI agent.
 * INCONCLUSIVE is styled amber — it must never look like PASS.
 */
export function CriterionCard({ criterion }: { criterion: CriterionDisplay }) {
  const style = RESULT_STYLES[criterion.result] ?? RESULT_STYLES.INCONCLUSIVE;
  return (
    <li className={`rounded-md border p-3 ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={style.icon} aria-hidden="true">
              <ResultIcon result={criterion.result} />
            </span>
            <span className="font-mono text-xs text-ink-faint">{criterion.criterionId}</span>
          </div>
          {criterion.description && (
            <p className="mt-1 text-sm font-medium text-ink">{criterion.description}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
          {style.label} · {formatPercent(criterion.confidence)}
        </span>
      </div>
      {criterion.rationale && <p className="mt-2 text-sm text-ink-soft">{criterion.rationale}</p>}
      {criterion.evidence && criterion.evidence.length > 0 && (
        <ul className="mt-2 space-y-1">
          {criterion.evidence.map((e, i) => (
            <li key={i} className="font-mono text-xs text-ink-faint">
              <span className="font-semibold text-ink-soft">{e.type}</span> · {e.reference} — {e.observation}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
