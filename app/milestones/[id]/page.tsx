import Link from 'next/link';
import { notFound } from 'next/navigation';
import { initDb } from '@/lib/db';
import { getMilestoneDetail } from '@/lib/db/milestones';
import type { ActivityEvent } from '@/lib/db/stats';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { StateBadge } from '@/components/StateBadge';
import { PaymentProtectionCard } from '@/components/PaymentProtectionCard';
import { ReviewPanel } from '@/components/ReviewPanel';
import { HumanApprovalCard } from '@/components/HumanApprovalCard';
import { EvidenceForm } from '@/components/EvidenceForm';
import { AgentTrace } from '@/components/AgentTrace';
import { ActivityFeed } from '@/components/ActivityFeed';
import { FundButton } from '@/components/FundButton';
import { ConfirmAuthorizationButton } from '@/components/ConfirmAuthorizationButton';
import { paypalConfig, paypalCheckoutUrl, paypalSdkUrl } from '@/lib/paypal/config';
import { formatMoney, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function MilestonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await initDb();
  const detail = await getMilestoneDetail(id);
  if (!detail) notFound();
  const { milestone, payment, actions, evidence, latestReview, latestRelease } = detail;

  // Map this milestone's audit actions into the shared activity shape.
  const activityEvents: ActivityEvent[] = actions.map((a) => ({
    id: a.id,
    at: a.createdAt,
    type: a.actionType,
    actor: a.actor,
    decision: a.decision,
    confidence: a.confidence,
    inputReference: a.inputReference,
    metadata: a.metadata,
    milestoneId: milestone.id,
    milestoneTitle: milestone.title,
    milestoneStatus: milestone.status,
    amount: milestone.amount,
    currency: milestone.currency,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/milestones" className="text-sm text-ink-faint hover:text-ink">
            ← Milestones
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{milestone.title}</h1>
          <p className="mt-1 font-mono text-xs text-ink-faint">{milestone.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-display text-3xl font-semibold tracking-tight">
            {formatMoney(milestone.amount, milestone.currency)}
          </span>
          <StateBadge status={milestone.status} />
        </div>
      </div>

      {/* Lifecycle */}
      <section className="tl-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="tl-section-title">Lifecycle</h2>
          <span className="text-xs text-ink-faint">
            {milestone.acceptanceCriteria.length} acceptance criteria
          </span>
        </div>
        <div className="mt-5">
          <LifecycleStepper status={milestone.status} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: the verification story */}
        <div className="space-y-6 lg:col-span-2">
          {milestone.description && (
            <section className="tl-card p-6">
              <h2 className="tl-section-title">Description</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{milestone.description}</p>
            </section>
          )}

          {latestReview ? (
            <ReviewPanel review={latestReview} release={latestRelease} criteria={milestone.acceptanceCriteria} />
          ) : (
            <section className="tl-card p-6">
              <h2 className="tl-h2">AI Verification</h2>
              <p className="mt-2 text-sm text-ink-soft">
                No review yet. Once the milestone is authorized and the freelancer submits evidence, the
                verification agent will evaluate every acceptance criterion here.
              </p>
            </section>
          )}

          <AgentTrace actions={actions} />

          <section className="tl-card p-6">
            <h2 className="tl-section-title">Audit trail</h2>
            <div className="mt-4">
              <ActivityFeed events={activityEvents} showMilestone={false} />
            </div>
          </section>
        </div>

        {/* Right: payment + actions */}
        <div className="space-y-6">
          <PaymentProtectionCard milestone={milestone} payment={payment} release={latestRelease} />

          {milestone.status === 'DRAFT' && (
            <section className="tl-card p-6">
              <h2 className="tl-section-title">Fund this milestone</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Authorize {formatMoney(milestone.amount, milestone.currency)} through PayPal. The funds are
                held — not captured — until verified work is delivered.
              </p>
              <div className="mt-4">
                <FundButton
                  milestoneId={milestone.id}
                  sdkUrl={paypalSdkUrl(paypalConfig.clientId, milestone.currency)}
                />
              </div>
              <p className="mt-3 text-xs text-ink-faint">Sandbox only. No real money moves.</p>
            </section>
          )}

          {milestone.status === 'FUNDING_PENDING' && payment && (
            <section className="tl-card p-6">
              <h2 className="tl-section-title">Buyer approval</h2>
              <p className="mt-2 text-sm text-ink-soft">
                A PayPal authorization order is waiting for the client to approve.
              </p>
              <div className="mt-4 space-y-3">
                <a
                  href={paypalCheckoutUrl(payment.orderId)}
                  target="_blank"
                  rel="noreferrer"
                  className="tl-btn-secondary w-full"
                >
                  Open PayPal approval →
                </a>
                <ConfirmAuthorizationButton milestoneId={milestone.id} orderId={payment.orderId} />
              </div>
              <p className="mt-3 break-all font-mono text-xs text-ink-faint">Order {payment.orderId}</p>
            </section>
          )}

          {['AUTHORIZED', 'REQUEST_CHANGES'].includes(milestone.status) && (
            <section className="tl-card p-6">
              <EvidenceForm milestoneId={milestone.id} />
            </section>
          )}

          {milestone.status === 'HUMAN_REVIEW' && latestReview && (
            <HumanApprovalCard milestoneId={milestone.id} review={latestReview} />
          )}

          {evidence.length > 0 && (
            <section className="tl-card p-6">
              <h2 className="tl-section-title">Evidence submissions ({evidence.length})</h2>
              <ul className="mt-4 space-y-2">
                {evidence.map((e, i) => (
                  <li key={e.id} className="rounded-md border border-line bg-paper px-3 py-2 text-xs">
                    <div className="font-mono text-ink-faint">v{evidence.length - i}</div>
                    <div className="mt-0.5 break-all text-ink-soft">{e.deliverableUrl}</div>
                    <div className="mt-0.5 text-ink-faint">{formatDate(e.submittedAt)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
