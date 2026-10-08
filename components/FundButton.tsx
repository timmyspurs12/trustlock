'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    paypal?: any;
  }
}

/**
 * Renders the PayPal JS SDK button (intent=authorize).
 *
 * Flow: click → SDK opens the buyer-approval popup → createOrder asks OUR
 * server to create the AUTHORIZE order (server controls the amount) → buyer
 * approves → onApprove sends the order ID to OUR server, which authorizes.
 * The client secret never touches the browser.
 */
export function FundButton({ milestoneId, sdkUrl }: { milestoneId: string; sdkUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (window.paypal) {
      setSdkReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]');
    if (existing) {
      existing.addEventListener('load', () => setSdkReady(true));
      return;
    }
    const script = document.createElement('script');
    script.src = sdkUrl;
    script.async = true;
    script.dataset.paypalSdk = 'true';
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError('Failed to load the PayPal SDK (sandbox).');
    document.body.appendChild(script);
  }, [sdkUrl]);

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypal) return;

    let cancelled = false;
    window.paypal
      .Buttons({
        createOrder: async () => {
          const res = await fetch(`/api/milestones/${milestoneId}/fund`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not create the PayPal order');
          return data.orderId;
        },
        onApprove: async (data: { orderID: string }) => {
          const res = await fetch('/api/paypal/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderID, milestoneId }),
          });
          const result = await res.json();
          if (!res.ok) {
            setError(result.error || 'Authorization failed');
            return;
          }
          if (!cancelled) router.refresh();
        },
        onError: (err: any) => setError(err?.message || 'PayPal checkout error'),
      })
      .render(containerRef.current);

    return () => {
      cancelled = true;
    };
  }, [sdkReady, milestoneId, router]);

  return (
    <div>
      <div ref={containerRef} />
      {!sdkReady && !error && <p className="text-sm text-slate-400">Loading PayPal…</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
