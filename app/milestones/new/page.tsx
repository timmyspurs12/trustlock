import { CreateMilestoneForm } from '@/components/CreateMilestoneForm';

export const dynamic = 'force-dynamic';

export default function NewMilestonePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New milestone</h1>
        <p className="mt-1 text-sm text-slate-500">
          Define the work, the amount, and the acceptance criteria. The criteria are stored as structured data so
          the verification agent can check each one.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CreateMilestoneForm />
      </div>
    </div>
  );
}
