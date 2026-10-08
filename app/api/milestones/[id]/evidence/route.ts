import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { createEvidence, getMilestone, setMilestoneStatus } from '@/lib/db/milestones';
import { evidenceSchema } from '@/lib/validation';

/**
 * POST /api/milestones/[id]/evidence
 *
 * The freelancer submits evidence for an AUTHORIZED (held) milestone.
 * Submissions are append-only: a new submission creates a NEW row; previous
 * submissions and reviews are never overwritten.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await initDb();
    const body = await req.json().catch(() => null);
    const parsed = evidenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const milestone = await getMilestone(id);
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }
    if (!['AUTHORIZED', 'REQUEST_CHANGES'].includes(milestone.status)) {
      return NextResponse.json(
        { error: `Evidence can only be submitted for an authorized milestone (current state: ${milestone.status}).` },
        { status: 409 }
      );
    }

    const evidence = await createEvidence(id, parsed.data);
    return NextResponse.json({ evidence, milestoneStatus: 'EVIDENCE_SUBMITTED' }, { status: 201 });
  } catch (err) {
    console.error('[api] POST /api/milestones/[id]/evidence failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
