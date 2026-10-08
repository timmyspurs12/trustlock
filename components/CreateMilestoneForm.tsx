'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CriterionRow {
  key: string;
  description: string;
  required: boolean;
}

const slugify = (value: string, fallback: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug.length >= 2 ? slug : fallback;
};

export function CreateMilestoneForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [criteria, setCriteria] = useState<CriterionRow[]>([
    { key: '', description: '', required: true },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateCriterion = (index: number, patch: Partial<CriterionRow>) =>
    setCriteria((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const filled = criteria.filter((c) => c.description.trim().length > 0);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      amount: Number(amount),
      currency,
      acceptanceCriteria: filled.map((c, i) => ({
        id: slugify(c.key, `criterion-${i + 1}`),
        description: c.description.trim(),
        required: c.required,
      })),
    };

    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const issues = Array.isArray(data.issues)
          ? data.issues.map((i: any) => `${i.path?.join('.') ?? ''}: ${i.message}`).join(' · ')
          : null;
        setError(issues ? `${data.error}: ${issues}` : data.error || 'Could not create the milestone');
        return;
      }
      router.push(`/milestones/${data.milestone.id}`);
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Landing page for the bakery client"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0070E0] focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What does the freelancer deliver?"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0070E0] focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            inputMode="decimal"
            placeholder="100.00"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0070E0] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0070E0] focus:outline-none"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">Acceptance criteria</label>
          <button
            type="button"
            onClick={() => setCriteria((rows) => [...rows, { key: '', description: '', required: true }])}
            className="text-sm font-medium text-[#0070E0] hover:underline"
          >
            + Add criterion
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {criteria.map((criterion, index) => (
            <div key={index} className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <input
                value={criterion.key}
                onChange={(e) => updateCriterion(index, { key: e.target.value })}
                placeholder="key"
                className="w-28 shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-[#0070E0] focus:outline-none"
              />
              <input
                value={criterion.description}
                onChange={(e) => updateCriterion(index, { description: e.target.value })}
                placeholder="e.g. Homepage is deployed at the submitted URL"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-[#0070E0] focus:outline-none"
              />
              <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={criterion.required}
                  onChange={(e) => updateCriterion(index, { required: e.target.checked })}
                />
                required
              </label>
              {criteria.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCriteria((rows) => rows.filter((_, i) => i !== index))}
                  className="shrink-0 text-slate-400 hover:text-red-600"
                  aria-label="Remove criterion"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          The key becomes a stable id (e.g. &quot;homepage&quot;); leave it blank to auto-generate one.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-[#0070E0] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ea6] disabled:opacity-60"
      >
        {submitting ? 'Creating…' : 'Create milestone'}
      </button>
    </form>
  );
}
