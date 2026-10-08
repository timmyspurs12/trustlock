import { CreateMilestoneForm } from '@/components/CreateMilestoneForm';

export const dynamic = 'force-dynamic';

export default function NewMilestonePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="tl-h1">New milestone</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Define the work, the amount, and the acceptance criteria. The criteria are stored as
          structured data so the verification agent can check each one.
        </p>
      </div>
      <div className="tl-card p-6">
        <CreateMilestoneForm />
      </div>
    </div>
  );
}
