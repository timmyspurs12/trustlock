import Link from 'next/link';
import { initDb } from '@/lib/db';
import { listMilestones } from '@/lib/db/milestones';
import { getActivity, getDashboardMetrics, getPrimaryMilestoneId } from '@/lib/db/stats';
import { getMilestoneDetail } from '@/lib/db/milestones';
import { MetricCard } from '@/components/MetricCard';
import { MilestoneCard } from '@/components/MilestoneCard';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { ActivityFeed } from '@/components/ActivityFeed';
import { StateBadge } from '@/components/StateBadge';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  await initDb();
  const [metrics, milestones, activity, primaryId] = await Promise.all([
    getDashboardMetrics(),
    listMilestones(),
    getActivity(6),
    getPrimaryMilestoneId(),
  ]);
  const primary = primaryId ? await getMilestoneDetail(primaryId) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="tl-h1">Overview</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Client funds → PayPal authorization → freelancer delivery → AI verification → deterministic
            policy → PayPal release.
          </p>
        </div>
        <Link href="/milestones/new" className="tl-btn-primary">
          New milestone
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Authorized"
          value={formatMoney(metrics.authorizedHeld)}
          caption="Funds held by PayPal, not yet captured"
          accent="bg-amber"
        />
        <MetricCard
          label="Captured"
          value={formatMoney(metrics.captured)}
          caption="Capture accepted by PayPal"
          accent="bg-green"
        />
        <MetricCard
          label="Pending"
          value={formatMoney(metrics.pendingSettlement)}
          caption="In settlement (CAPTURE_PENDING)"
          accent="bg-blue"
        />
        <MetricCard
          label="Auto-released"
          value={String(metrics.autoReleased)}
          caption="Releases executed by policy AUTO_RELEASE"
          accent="bg-ink"
        />
      </div>

      {primary && (
        <section className="tl-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="tl-kpi-label">Active milestone</div>
              <h2 className="mt-1 truncate font-display text-2xl font-semibold tracking-tight">
                <Link href={`/milestones/${primary.milestone.id}`} className="hover:text-paypal-deep">
                  {primary.milestone.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                {formatMoney(primary.milestone.amount, primary.milestone.currency)} ·{' '}
                {primary.milestone.acceptanceCriteria.length} acceptance criteria
              </p>
            </div>
            <StateBadge status={primary.payment?.trustlockStatus ?? primary.milestone.status} />
          </div>
          <div className="mt-6">
            <LifecycleStepper status={primary.milestone.status} />
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t border-line-soft pt-4 text-sm">
            <div>
              <span className="text-ink-faint">Payment: </span>
              <span className="font-medium text-ink">
                {primary.payment ? primary.payment.trustlockStatus.replace(/_/g, ' ') : 'not started'}
              </span>
            </div>
            {primary.latestReview && (
              <div>
                <span className="text-ink-faint">AI verdict: </span>
                <span className="font-medium text-ink">
                  {primary.latestReview.verdict.replace(/_/g, ' ')} · {Math.round(primary.latestReview.confidence * 100)}%
                </span>
              </div>
            )}
            {primary.latestRelease && (
              <div>
                <span className="text-ink-faint">Release: </span>
                <span className="font-medium text-ink">
                  {primary.latestRelease.state.replace(/_/g, ' ')}
                  {primary.latestRelease.captureStatus ? ` (${primary.latestRelease.captureStatus})` : ''}
                </span>
              </div>
            )}
          </div>
          <div className="mt-4">
            <Link href={`/milestones/${primary.milestone.id}`} className="tl-btn-secondary">
              Open milestone →
            </Link>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="tl-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="tl-h2">Recent activity</h2>
            <Link href="/activity" className="text-sm font-medium text-paypal hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-4">
            <ActivityFeed events={activity} />
          </div>
        </section>
        <section className="tl-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="tl-h2">Milestones</h2>
            <Link href="/milestones" className="text-sm font-medium text-paypal hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {milestones.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-faint">No milestones yet.</p>
            )}
            {milestones.slice(0, 5).map((m) => (
              <Link
                key={m.id}
                href={`/milestones/${m.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2.5 transition-colors hover:border-ink-faint/40"
              >
                <span className="min-w-0 truncate text-sm font-medium text-ink">{m.title}</span>
                <span className="shrink-0 font-mono text-xs text-ink-faint">
                  {formatMoney(m.amount, m.currency)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
