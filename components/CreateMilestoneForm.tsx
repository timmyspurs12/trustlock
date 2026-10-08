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
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label htmlFor="tl-title" className="tl-label">
          Title
        </label>
        <input
          id="tl-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Landing page for the bakery client"
          className="tl-input"
        />
      </div>

      <div>
        <label htmlFor="tl-description" className="tl-label">
          Description
        </label>
        <textarea
          id="tl-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What does the freelancer deliver?"
          className="tl-input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tl-amount" className="tl-label">
            Amount
          </label>
          <input
            id="tl-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            inputMode="decimal"
            placeholder="100.00"
            className="tl-input"
          />
        </div>
        <div>
          <label htmlFor="tl-currency" className="tl-label">
            Currency
          </label>
          <select
            id="tl-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="tl-input"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="tl-label mb-0">Acceptance criteria</span>
          <button
            type="button"
            onClick={() => setCriteria((rows) => [...rows, { key: '', description: '', required: true }])}
            className="text-sm font-medium text-paypal hover:underline"
          >
            + Add criterion
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {criteria.map((criterion, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border border-line bg-paper p-3 sm:flex-row sm:items-start"
            >
              <input
                value={criterion.key}
                onChange={(e) => updateCriterion(index, { key: e.target.value })}
                placeholder="key"
                aria-label={`Criterion ${index + 1} key`}
                className="tl-input sm:w-32 sm:shrink-0"
              />
              <input
                value={criterion.description}
                onChange={(e) => updateCriterion(index, { description: e.target.value })}
                placeholder="e.g. Homepage is deployed at the submitted URL"
                aria-label={`Criterion ${index + 1} description`}
                className="tl-input sm:min-w-0 sm:flex-1"
              />
              <label className="flex shrink-0 items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={criterion.required}
                  onChange={(e) => updateCriterion(index, { required: e.target.checked })}
                  className="rounded border-line"
                />
                required
              </label>
              {criteria.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCriteria((rows) => rows.filter((_, i) => i !== index))}
                  className="shrink-0 self-center text-ink-faint hover:text-red"
                  aria-label={`Remove criterion ${index + 1}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          The key becomes a stable id (e.g. &quot;homepage&quot;); leave it blank to auto-generate one.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red/40 bg-red-bg px-3 py-2 text-sm text-red" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className="tl-btn-primary w-full" aria-busy={submitting}>
        {submitting ? 'Creating…' : 'Create milestone'}
      </button>
    </form>
  );
}
