import Link from 'next/link';
import { initDb } from '@/lib/db';
import { listMilestones } from '@/lib/db/milestones';
import { StateBadge } from '@/components/StateBadge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await initDb();
  const milestones = await listMilestones();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Milestones</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Escrow-like milestone protection powered by PayPal authorization. Client funds are held — not
            captured — until verified work is delivered.
          </p>
        </div>
        <Link
          href="/milestones/new"
          className="shrink-0 rounded-md bg-[#0070E0] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ea6]"
        >
          New milestone
        </Link>
      </div>

      {milestones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No milestones yet. Create your first milestone to hold funds safely.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Milestone</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {milestones.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/milestones/${m.id}`} className="font-medium text-[#0070E0] hover:underline">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {m.amount.toFixed(2)} {m.currency}
                  </td>
                  <td className="px-4 py-3">
                    <StateBadge status={m.paymentStatus ?? m.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
