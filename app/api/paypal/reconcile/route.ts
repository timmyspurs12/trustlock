import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { getRelease } from '@/lib/db/milestones';
import { reconcileSchema } from '@/lib/validation';
import { reconcilePendingReleases, syncReleaseFromPayPal } from '@/lib/payments/reconcile';

/**
 * POST /api/paypal/reconcile
 *
 * Polling reconciler: synchronizes local release state with PayPal.
 * Complements webhooks (Phase 1 finding: sandbox captures can stay PENDING).
 *
 * Body (all optional):
 *  - { releaseId }    → reconcile one release
 *  - { milestoneId }  → reconcile all pending releases for a milestone
 *  - {}               → reconcile all pending releases
 */
export async function POST(req: Request) {
  try {
    await initDb();
    const body = await req.json().catch(() => ({}));
    const parsed = reconcileSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    if (parsed.data.releaseId) {
      const existing = await getRelease(parsed.data.releaseId);
      if (!existing) {
        return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      }
      const result = await syncReleaseFromPayPal(parsed.data.releaseId);
      return NextResponse.json({ release: result.release, changed: result.changed });
    }

    const results = await reconcilePendingReleases();
    return NextResponse.json({
      reconciled: results.length,
      changed: results.filter((r) => r.changed).length,
      releases: results.map((r) => ({ id: r.release.id, state: r.release.state, captureStatus: r.release.captureStatus, changed: r.changed })),
    });
  } catch (err) {
    console.error('[api] POST /api/paypal/reconcile failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
