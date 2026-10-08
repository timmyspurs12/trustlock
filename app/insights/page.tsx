import { initDb } from '@/lib/db';
import { getStudioData } from '@/lib/db/stats';
import { StudioDashboard } from '@/components/StudioDashboard';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  await initDb();
  const { milestones, activity } = await getStudioData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="tl-h1">Insights</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Self-serve analytics over live TrustLock data — funds, milestones, AI verdicts, and the audit
          trail. Built with AG Studio.
        </p>
      </div>
      <StudioDashboard
        milestones={milestones}
        activity={activity}
        licenseKey={process.env.AG_STUDIO_LICENSE_KEY || undefined}
      />
    </div>
  );
}
