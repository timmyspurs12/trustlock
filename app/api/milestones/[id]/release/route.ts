import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import {
  getLatestReview,
  getMilestone,
  recordAgentAction,
  setMilestoneStatus,
} from '@/lib/db/milestones';
import { releaseSchema } from '@/lib/validation';
import { executeRelease, ReleaseError } from '@/lib/payments/release';

/**
 * POST /api/milestones/[id]/release
 *
 * The ONLY client-reachable path to capturing money. The browser never calls
 * PayPal. The server:
 *  - re-derives the deterministic policy decision from the stored AI review;
 *  - requires explicit human approval when the policy demands it;
 *  - supports the human overriding the AI (REQUEST_CHANGES / REJECT);
 *  - is idempotent: a duplicate release request never captures twice.
 */
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await initDb();
    const body = await req.json().catch(() => null);
    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { reviewId, decision, approvedAmount } = parsed.data;

    const milestone = await getMilestone(id);
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }
    const review = reviewId ? await getLatestReview(id) : await getLatestReview(id);
    if (!review) {
      return NextResponse.json({ error: 'No AI review exists for this milestone.' }, { status: 409 });
    }

    // Human overrides the AI recommendation (never a payment action).
    if (decision === 'REQUEST_CHANGES') {
      await setMilestoneStatus(id, 'REQUEST_CHANGES');
      await recordAgentAction({
        milestoneId: id,
        actionType: 'HUMAN_DECISION',
        actor: 'client',
        decision: 'REQUEST_CHANGES',
        inputReference: `review ${review.id}`,
        metadata: { note: 'Human requested changes after reviewing the AI verdict.' },
      });
      return NextResponse.json({ milestoneStatus: 'REQUEST_CHANGES' });
    }
    if (decision === 'REJECT') {
      await setMilestoneStatus(id, 'CANCELLED');
      await recordAgentAction({
        milestoneId: id,
        actionType: 'HUMAN_DECISION',
        actor: 'client',
        decision: 'REJECT',
        inputReference: `review ${review.id}`,
        metadata: { note: 'Human rejected the AI verdict; milestone cancelled (void path available).' },
      });
      return NextResponse.json({ milestoneStatus: 'CANCELLED' });
    }

    // APPROVE → controlled release (human approval flag set).
    try {
      const result = await executeRelease({
        milestoneId: id,
        reviewId: review.id,
        humanApproval: true,
        approvedAmount,
      });
      await recordAgentAction({
        milestoneId: id,
        actionType: 'HUMAN_APPROVAL',
        actor: 'client',
        decision: 'APPROVE',
        inputReference: `review ${review.id}`,
        metadata: { releaseId: result.release.id, amount: result.release.requestedAmount, alreadyReleased: result.alreadyReleased },
      });
      return NextResponse.json({
        release: {
          id: result.release.id,
          state: result.state,
          captureStatus: result.captureStatus,
          captureId: result.release.captureId,
          requestedAmount: result.release.requestedAmount,
          alreadyReleased: result.alreadyReleased,
        },
      });
    } catch (err) {
      if (err instanceof ReleaseError) {
        return NextResponse.json({ error: err.message }, { status: err.statusCode });
      }
      throw err;
    }
  } catch (err) {
    console.error('[api] POST /api/milestones/[id]/release failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
