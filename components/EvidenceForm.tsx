'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Freelancer evidence submission — a professional "delivery package" form.
 *
 * The progress indicator is driven by REAL server state: while the review
 * request runs, this component polls the milestone endpoint and displays the
 * actual state transitions (EVIDENCE_SUBMITTED → AI_REVIEW → POLICY → RELEASE).
 * Nothing is faked.
 */
const STEPS = ['Evidence submitted', 'AI review', 'Policy decision', 'Release'] as const;

function liveStep(status: string): number {
  switch (status) {
    case 'EVIDENCE_SUBMITTED':
      return 0;
    case 'AI_REVIEW':
      return 1;
    case 'RELEASE_APPROVED':
    case 'HUMAN_REVIEW':
    case 'REQUEST_CHANGES':
      return 2;
    case 'CAPTURE_PENDING':
    case 'PAID':
    case 'PAID_PARTIAL':
    case 'CAPTURE_FAILED':
      return 3;
    default:
      return 0;
  }
}

export function EvidenceForm({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>(['']);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'reviewing' | 'done' | 'error'>('idle');
  const [liveStatus, setLiveStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPhase('submitting');
    setLiveStatus('EVIDENCE_SUBMITTED');
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliverableUrl: deliverableUrl.trim(),
          notes: notes.trim(),
          evidenceUrls: evidenceUrls.map((u) => u.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit evidence');

      setPhase('reviewing');
      // Poll the REAL milestone state while the review runs.
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/milestones/${milestoneId}`);
          const j = await r.json();
          if (j?.milestone?.status) setLiveStatus(j.milestone.status);
        } catch {
          /* keep polling */
        }
      }, 1500);

      const reviewRes = await fetch(`/api/milestones/${milestoneId}/review`, { method: 'POST' });
      const reviewData = await reviewRes.json();
      stopPolling();
      if (!reviewRes.ok) throw new Error(reviewData.error || reviewData.releaseError || 'AI review failed');

      setPhase('done');
      setLiveStatus('');
      router.refresh();
    } catch (err) {
      stopPolling();
      setPhase('error');
      setError((err as Error).message);
    }
  };

  const busy = phase === 'submitting' || phase === 'reviewing';
  const step = liveStep(liveStatus);

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <div>
        <h3 className="text-base font-semibold text-ink">Submit delivery evidence</h3>
        <p className="mt-1 text-sm text-ink-soft">
          TrustLock will evaluate the submitted evidence against the acceptance criteria defined for
          this milestone.
        </p>
      </div>

      <div>
        <label htmlFor="tl-deliverable-url" className="tl-label">
          Deliverable URL
        </label>
        <input
          id="tl-deliverable-url"
          value={deliverableUrl}
          onChange={(e) => setDeliverableUrl(e.target.value)}
          required
          placeholder="https://your-deliverable.example.com"
          className="tl-input"
        />
        <p className="mt-1 text-xs text-ink-faint">
          The verification agent fetches this URL server-side and inspects the HTTP status, content,
          and structure.
        </p>
      </div>

      <div>
        <label htmlFor="tl-notes" className="tl-label">
          Notes
        </label>
        <textarea
          id="tl-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What was delivered, where to look, anything the reviewer should know…"
          className="tl-input"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="tl-label mb-0">Additional evidence</span>
          <button
            type="button"
            onClick={() => setEvidenceUrls((u) => [...u, ''])}
            className="text-sm font-medium text-paypal hover:underline"
          >
            + Add URL
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {evidenceUrls.map((u, i) => (
            <input
              key={i}
              value={u}
              onChange={(e) => setEvidenceUrls((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))}
              placeholder="https://… (screenshot, repo, doc…)"
              className="tl-input"
              aria-label={`Additional evidence URL ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {phase !== 'idle' && (
        <div className="rounded-md border border-line bg-paper p-3" aria-live="polite">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {STEPS.map((s, i) => {
              const state =
                phase === 'error' && i === step
                  ? 'error'
                  : i < step || (phase === 'done' && i <= step)
                    ? 'done'
                    : i === step && busy
                      ? 'current'
                      : 'upcoming';
              return (
                <li key={s} className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                      state === 'done'
                        ? 'bg-ink text-paper'
                        : state === 'current'
                          ? 'bg-paypal text-white'
                          : state === 'error'
                            ? 'bg-red text-white'
                            : 'bg-line-soft text-ink-faint'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`font-medium ${
                      state === 'upcoming' ? 'text-ink-faint' : 'text-ink'
                    }`}
                  >
                    {s}
                  </span>
                  {i < STEPS.length - 1 && <span className="text-ink-faint" aria-hidden="true">→</span>}
                </li>
              );
            })}
          </ol>
          {busy && liveStatus && (
            <p className="mt-2 font-mono text-xs text-ink-faint">server state: {liveStatus}</p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red/40 bg-red-bg px-3 py-2 text-sm text-red" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="tl-btn-primary w-full">
        {phase === 'submitting' && 'Submitting evidence…'}
        {phase === 'reviewing' && 'AI agent verifying…'}
        {phase === 'done' && 'Submitted ✓'}
        {phase !== 'submitting' && phase !== 'reviewing' && phase !== 'done' && 'Submit evidence & run AI verification'}
      </button>
    </form>
  );
}
