const STAGES = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'AUTHORIZED', label: 'Authorized' },
  { key: 'EVIDENCE', label: 'Evidence' },
  { key: 'AI_REVIEW', label: 'AI review' },
  { key: 'POLICY', label: 'Policy' },
  { key: 'RELEASE', label: 'Release' },
  { key: 'PAID', label: 'Paid' },
] as const;

interface StageState {
  status: 'done' | 'current' | 'upcoming' | 'failed' | 'stopped';
  /** When the milestone is AUTHORIZED (funds held), the current stage is amber. */
  held: boolean;
}

/**
 * Map the real milestone status onto the 7-stage lifecycle.
 * The current stage is derived from the stored state — never guessed.
 */
function mapStatus(status: string): { stage: number; note?: string; failed?: boolean; stopped?: boolean } {
  switch (status) {
    case 'DRAFT':
      return { stage: 0 };
    case 'FUNDING_PENDING':
      return { stage: 1 };
    case 'AUTHORIZED':
      return { stage: 1 };
    case 'AUTHORIZATION_EXPIRING':
      return { stage: 1, note: 'Authorization expiring' };
    case 'EVIDENCE_SUBMITTED':
      return { stage: 2 };
    case 'AI_REVIEW':
      return { stage: 3 };
    case 'HUMAN_REVIEW':
      return { stage: 4 };
    case 'REQUEST_CHANGES':
      return { stage: 4, note: 'Changes requested' };
    case 'RELEASE_APPROVED':
      return { stage: 5 };
    case 'CAPTURE_PENDING':
      return { stage: 5 };
    case 'CAPTURE_FAILED':
      return { stage: 5, failed: true };
    case 'PAID':
      return { stage: 6 };
    case 'PAID_PARTIAL':
      return { stage: 6, note: 'Partially paid' };
    case 'CANCELLED':
      return { stage: 1, stopped: true, note: 'Cancelled' };
    case 'VOIDED':
      return { stage: 1, stopped: true, note: 'Voided' };
    default:
      return { stage: 0 };
  }
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.5l2.2 2.2L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LifecycleStepper({ status }: { status: string }) {
  const { stage, note, failed, stopped } = mapStatus(status);
  const states: StageState[] = STAGES.map((_, i) => {
    if (failed && i === stage) return { status: 'failed', held: false };
    if (stopped && i === stage) return { status: 'stopped', held: false };
    if (i < stage) return { status: 'done', held: false };
    if (i === stage) return { status: 'current', held: status === 'AUTHORIZED' || status === 'AUTHORIZATION_EXPIRING' };
    return { status: 'upcoming', held: false };
  });

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[560px] items-start" aria-label={`Milestone lifecycle, current stage: ${STAGES[stage].label}`}>
        {STAGES.map((s, i) => {
          const state = states[i];
          const isLast = i === STAGES.length - 1;
          return (
            <li key={s.key} className="flex flex-1 items-start last:flex-none">
              <div className="flex w-full flex-col items-center gap-2">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    state.status === 'done'
                      ? 'bg-ink text-paper'
                      : state.status === 'current'
                        ? state.held
                          ? 'bg-amber text-white tl-step-current-amber tl-pulse'
                          : 'bg-paypal text-white tl-step-current tl-pulse'
                        : state.status === 'failed'
                          ? 'bg-red text-white'
                          : state.status === 'stopped'
                            ? 'bg-line-soft text-ink-faint'
                            : 'bg-line-soft text-ink-faint'
                  } ${i === STAGES.length - 1 && status === 'PAID' ? 'bg-green text-white' : ''}`}
                  aria-current={state.status === 'current' ? 'step' : undefined}
                >
                  {state.status === 'done' ? (
                    <CheckIcon />
                  ) : state.status === 'failed' || state.status === 'stopped' ? (
                    <XIcon />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={`text-center text-xs font-medium ${
                    state.status === 'current'
                      ? 'text-ink'
                      : state.status === 'done'
                        ? 'text-ink-soft'
                        : 'text-ink-faint'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {!isLast && (
                <span
                  className={`mx-2 mt-4 h-0.5 flex-1 ${
                    states[i + 1].status === 'upcoming' ? 'bg-line' : 'bg-ink'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
      {note && (
        <p className="mt-3 text-xs text-ink-faint">
          {note} · current stage: <span className="font-semibold text-ink-soft">{STAGES[stage].label}</span>
        </p>
      )}
    </div>
  );
}
