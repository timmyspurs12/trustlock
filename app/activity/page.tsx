import Link from 'next/link';
import { initDb } from '@/lib/db';
import { getActivity } from '@/lib/db/stats';
import { ActivityFeed } from '@/components/ActivityFeed';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  await initDb();
  const events = await getActivity(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="tl-h1">Activity</h1>
        <p className="mt-1 text-sm text-ink-soft">
          The complete, append-only audit trail — every TrustLock event, newest first. Expand any event
          to inspect its stored details.
        </p>
      </div>
      <section className="tl-card p-6">
        <ActivityFeed events={events} />
      </section>
      <p className="text-xs text-ink-faint">
        Looking for a specific milestone?{' '}
        <Link href="/milestones" className="font-medium text-paypal hover:underline">
          Browse milestones →
        </Link>
      </p>
    </div>
  );
}
