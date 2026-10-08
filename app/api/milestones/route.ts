import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { createMilestone } from '@/lib/db/milestones';
import { createMilestoneSchema } from '@/lib/validation';

/**
 * POST /api/milestones
 * Create a milestone (DRAFT) with structured acceptance criteria.
 */
export async function POST(req: Request) {
  try {
    await initDb();
    const body = await req.json().catch(() => null);
    const parsed = createMilestoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const milestone = await createMilestone(parsed.data);
    return NextResponse.json({ milestone }, { status: 201 });
  } catch (err) {
    console.error('[api] POST /api/milestones failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
