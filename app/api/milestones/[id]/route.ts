import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { getMilestoneDetail } from '@/lib/db/milestones';

/**
 * GET /api/milestones/[id]
 * Returns the milestone, its payment state, and the audit trail.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await initDb();
    const detail = await getMilestoneDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    console.error('[api] GET /api/milestones/[id] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
