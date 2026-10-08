import Link from 'next/link';
import { initDb } from '@/lib/db';
import { listMilestones } from '@/lib/db/milestones';
import { MilestoneCard } from '@/components/MilestoneCard';

export const dynamic = 'force-dynamic';

export default async function MilestonesPage() {
  await initDb();
  const milestones = await listMilestones();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="tl-h1">Milestones</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every milestone holds client funds in a PayPal authorization until verified work is delivered.
          </p>
        </div>
        <Link href="/milestones/new" className="tl-btn-primary">
          New milestone
        </Link>
      </div>

      {milestones.length === 0 ? (
        <div className="tl-card p-12 text-center">
          <p className="text-sm text-ink-faint">No milestones yet.</p>
          <Link href="/milestones/new" className="tl-btn-primary mt-4">
            Create your first milestone
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {milestones.map((m) => (
            <MilestoneCard key={m.id} milestone={m} />
          ))}
        </div>
      )}
    </div>
  );
}
