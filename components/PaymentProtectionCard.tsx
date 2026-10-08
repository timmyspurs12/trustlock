import type { Milestone, PaypalPayment, PaymentRelease } from '@/lib/db/milestones';
import { StateBadge } from './StateBadge';
import { formatMoney, formatDate, shortId } from '@/lib/format';

interface PaymentProtectionCardProps {
  milestone: Milestone;
  payment: PaypalPayment | null;
  release: PaymentRelease | null;
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 1.5l6 2.2v4.1c0 3.6-2.5 6.6-6 7.7-3.5-1.1-6-4.1-6-7.7V3.7L9 1.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.2 9l2 2 3.6-3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The Trust / Payment panel. Every value comes from the stored payment and
 * release records. The capture status is shown exactly as PayPal reported it —
 * PENDING is never displayed as PAID.
 */
export function PaymentProtectionCard({ milestone, payment, release }: PaymentProtectionCardProps) {
  if (!payment) {
    return (
      <section className="tl-card p-6">
        <h2 className="tl-section-title">PayPal payment</h2>
        <p className="mt-3 text-sm text-ink-faint">No payment has been initiated for this milestone yet.</p>
      </section>
    );
  }

  const held = payment.authorizedAmount - payment.capturedAmount;
  const stateMessage =
    payment.trustlockStatus === 'AUTHORIZED'
      ? 'Funds are currently protected by a PayPal authorization — held, not captured.'
      : payment.trustlockStatus === 'CAPTURE_PENDING'
        ? 'The capture was accepted by PayPal and is settling. Not paid yet.'
        : payment.trustlockStatus === 'PAID'
          ? 'Funds were released to the freelancer.'
          : payment.trustlockStatus === 'PAID_PARTIAL'
            ? 'A partial amount was released to the freelancer.'
            : payment.trustlockStatus === 'CAPTURE_FAILED'
              ? 'The capture failed. No funds were released.'
              : payment.trustlockStatus === 'VOIDED'
                ? 'The authorization was voided. No funds were captured.'
                : 'Payment state is being reconciled with PayPal.';

  return (
    <section className="tl-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="tl-section-title">PayPal payment</h2>
        <span className="text-ink-faint">
          <ShieldIcon />
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="font-display text-3xl font-semibold tracking-tight">
          {formatMoney(payment.authorizedAmount, payment.currency)}
        </span>
        <StateBadge status={payment.trustlockStatus} />
      </div>
      <p className="mt-2 text-sm text-ink-soft">{stateMessage}</p>

      <dl className="mt-5 space-y-3 border-t border-line-soft pt-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-faint">Authorization</dt>
          <dd className="font-mono text-xs text-ink" title={payment.authorizationId ?? undefined}>
            {shortId(payment.authorizationId, 8, 6)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-faint">Order</dt>
          <dd className="font-mono text-xs text-ink" title={payment.orderId}>
            {shortId(payment.orderId, 8, 6)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-faint">Hold expires</dt>
          <dd className="text-ink">{formatDate(payment.authorizationExpiresAt)}</dd>
        </div>
        {release && (
          <>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-faint">Captured</dt>
              <dd className="font-medium text-ink">
                {formatMoney(release.requestedAmount, payment.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-faint">Capture</dt>
              <dd className="font-mono text-xs text-ink" title={release.captureId ?? undefined}>
                {shortId(release.captureId, 8, 6)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-faint">Capture status</dt>
              <dd>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    release.captureStatus === 'COMPLETED'
                      ? 'border-green/40 bg-green-bg text-green'
                      : release.captureStatus === 'PENDING'
                        ? 'border-blue/40 bg-blue-bg text-blue'
                        : 'border-red/40 bg-red-bg text-red'
                  }`}
                >
                  {release.captureStatus ?? 'UNKNOWN'}
                </span>
              </dd>
            </div>
          </>
        )}
        {payment.trustlockStatus === 'AUTHORIZED' && held > 0 && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-faint">Currently held</dt>
            <dd className="font-medium text-amber-strong">{formatMoney(held, payment.currency)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
