'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Freelancer evidence submission. On submit: POST evidence → POST review
 * (the AI verification agent) → refresh. The review call is awaited so the
 * agent trace + verdict render immediately after.
 */
export function EvidenceForm({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>(['']);
  const [state, setState] = useState<'idle' | 'submitting' | 'reviewing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState('submitting');
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

      setState('reviewing');
      const reviewRes = await fetch(`/api/milestones/${milestoneId}/review`, { method: 'POST' });
      const reviewData = await reviewRes.json();
      if (!reviewRes.ok) throw new Error(reviewData.error || reviewData.releaseError || 'AI review failed');

      setState('idle');
      router.refresh();
    } catch (err) {
      setState('error');
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Deliverable URL</label>
        <input
          value={deliverableUrl}
          onChange={(e) => setDeliverableUrl(e.target.value)}
          required
          placeholder="https://your-deliverable.example.com"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0070E0] focus:outline-none"
        />
        <p className="mt-1 text-xs text-slate-400">
          The verification agent fetches this URL server-side and inspects the HTTP status, content, and structure.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What was delivered, where to look, anything the reviewer should know…"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0070E0] focus:outline-none"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">Additional evidence URLs</label>
          <button
            type="button"
            onClick={() => setEvidenceUrls((u) => [...u, ''])}
            className="text-sm font-medium text-[#0070E0] hover:underline"
          >
            + Add URL
          </button>
        </div>
        <div className="mt-1 space-y-2">
          {evidenceUrls.map((u, i) => (
            <input
              key={i}
              value={u}
              onChange={(e) => setEvidenceUrls((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))}
              placeholder="https://… (screenshot, repo, doc…)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0070E0] focus:outline-none"
            />
          ))}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={state === 'submitting' || state === 'reviewing'}
        className="w-full rounded-md bg-[#0070E0] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ea6] disabled:opacity-60"
      >
        {state === 'submitting' && 'Submitting evidence…'}
        {state === 'reviewing' && 'AI agent verifying… (this can take a few seconds)'}
        {state !== 'submitting' && state !== 'reviewing' && 'Submit evidence & run AI verification'}
      </button>
    </form>
  );
}
