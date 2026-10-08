'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Fallback path for environments where the PayPal SDK popup is blocked
 * (e.g. inside an iframe preview): the buyer approves via the direct
 * checkout URL, then clicks here — the SERVER authorizes with PayPal.
 */
export function ConfirmAuthorizationButton({ milestoneId, orderId }: { milestoneId: string; orderId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const confirm = async () => {
    setState('working');
    setMessage(null);
    try {
      const res = await fetch('/api/paypal/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, milestoneId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(data.error || 'Authorization failed');
        return;
      }
      setState('done');
      setMessage('Funds are now authorized and held. No money was captured.');
      router.refresh();
    } catch {
      setState('error');
      setMessage('Network error');
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={confirm}
        disabled={state === 'working' || state === 'done'}
        className="w-full rounded-md bg-[#0070E0] px-3 py-2 text-sm font-medium text-white hover:bg-[#005ea6] disabled:opacity-60"
      >
        {state === 'working' ? 'Confirming with PayPal…' : state === 'done' ? 'Authorized ✓' : "I've approved on PayPal — confirm"}
      </button>
      {message && (
        <p className={`text-xs ${state === 'error' ? 'text-red-600' : 'text-green-700'}`}>{message}</p>
      )}
    </div>
  );
}
