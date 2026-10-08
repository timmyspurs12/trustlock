import { initDb } from '@/lib/db';
import { getInsights } from '@/lib/db/stats';
import { MetricCard } from '@/components/MetricCard';
import { StateBadge } from '@/components/StateBadge';
import { formatMoney, formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

function BarRow({ label, value, max, valueLabel, badge }: { label: string; value: number; max: number; valueLabel: string; badge?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-mono text-xs text-ink-faint">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-paypal" style={{ width: `${pct}%` }} />
      </div>
      {badge && (
        <div>
          <StateBadge status={badge} />
        </div>
      )}
    </div>
  );
}

export default async function InsightsPage() {
  await initDb();
  const data = await getInsights();

  const maxState = Math.max(1, ...data.milestonesByState.map((s) => s.count));
  const maxVerdict = Math.max(1, ...data.verdicts.map((v) => v.count));
  const maxFunds = Math.max(1, data.fundsHeld, data.fundsCaptured, data.fundsPending);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="tl-h1">Insights</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Aggregates computed from the live database — funds, milestones, AI verdicts, and criteria
          outcomes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Milestones" value={String(data.totalMilestones)} caption="Total created" accent="bg-ink" />
        <MetricCard label="Authorized" value={formatMoney(data.totalAuthorized)} caption="Total client funds authorized" accent="bg-amber" />
        <MetricCard label="Releases" value={String(data.releasesTotal)} caption={`${data.autoReleases} executed automatically`} accent="bg-green" />
        <MetricCard
          label="Avg AI confidence"
          value={formatPercent(data.avgConfidence)}
          caption="Across all AI reviews"
          accent="bg-indigo"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="tl-card p-6">
          <h2 className="tl-h2">Funds</h2>
          <div className="mt-5 space-y-5">
            <BarRow label="Held (authorized, not captured)" value={data.fundsHeld} max={maxFunds} valueLabel={formatMoney(data.fundsHeld)} />
            <BarRow label="Captured (release accepted)" value={data.fundsCaptured} max={maxFunds} valueLabel={formatMoney(data.fundsCaptured)} />
            <BarRow label="Pending settlement" value={data.fundsPending} max={maxFunds} valueLabel={formatMoney(data.fundsPending)} />
          </div>
        </section>

        <section className="tl-card p-6">
          <h2 className="tl-h2">Milestones by state</h2>
          <div className="mt-5 space-y-5">
            {data.milestonesByState.length === 0 && (
              <p className="text-sm text-ink-faint">No milestones yet.</p>
            )}
            {data.milestonesByState.map((s) => (
              <BarRow
                key={s.state}
                label={s.state.replace(/_/g, ' ')}
                value={s.count}
                max={maxState}
                valueLabel={`${s.count}`}
                badge={s.state}
              />
            ))}
          </div>
        </section>

        <section className="tl-card p-6">
          <h2 className="tl-h2">AI verdicts</h2>
          <div className="mt-5 space-y-5">
            {data.verdicts.length === 0 && <p className="text-sm text-ink-faint">No AI reviews yet.</p>}
            {data.verdicts.map((v) => (
              <BarRow
                key={v.verdict}
                label={v.verdict.replace(/_/g, ' ')}
                value={v.count}
                max={maxVerdict}
                valueLabel={`${v.count}`}
              />
            ))}
          </div>
        </section>

        <section className="tl-card p-6">
          <h2 className="tl-h2">Verification quality</h2>
          <div className="mt-5 space-y-5">
            <BarRow
              label="Criteria passed"
              value={data.criteriaPassed}
              max={Math.max(1, data.criteriaTotal)}
              valueLabel={`${data.criteriaPassed} / ${data.criteriaTotal}`}
            />
            <div className="rounded-md border border-line bg-paper p-4">
              <div className="tl-kpi-label">Criteria pass rate</div>
              <div className="mt-1 font-display text-2xl font-semibold">
                {data.criteriaTotal > 0 ? formatPercent(data.criteriaPassed / data.criteriaTotal) : '—'}
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                The agent marks criteria INCONCLUSIVE when evidence cannot establish them — those are
                never counted as passed.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
