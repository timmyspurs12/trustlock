import 'server-only';
import { initDb } from '@/lib/db';
import {
  getPaymentByMilestoneId,
  getRelease,
  listPendingReleases,
  recordAgentAction,
  setMilestoneStatus,
  updatePaymentCaptured,
  updateReleaseState,
  type PaymentRelease,
} from '@/lib/db/milestones';
import { getCapture, PayPalError } from '@/lib/paypal/client';

/**
 * Async payment reconciliation (server-only).
 *
 * Phase 1 discovery: sandbox captures can remain PENDING even though the
 * capture was accepted and the authorization became CAPTURED. Therefore:
 *  - a capture is only PAID once PayPal reports the capture COMPLETED;
 *  - CAPTURE_PENDING is a first-class state, never shown as PAID;
 *  - reconciliation runs from webhooks (PAYMENT.CAPTURE.COMPLETED) and from
 *    this polling function.
 */

export interface SyncResult {
  release: PaymentRelease;
  changed: boolean;
}

export async function syncReleaseFromPayPal(releaseId: string): Promise<SyncResult> {
  await initDb();
  const release = await getRelease(releaseId);
  if (!release) throw new Error('Release not found');

  // Terminal states never change.
  if ((release.state === 'PAID' || release.state === 'PAID_PARTIAL' || release.state === 'CAPTURE_FAILED') && release.captureStatus === 'COMPLETED') {
    return { release, changed: false };
  }
  if (!release.captureId) return { release, changed: false };

  let capture: any;
  try {
    capture = await getCapture(release.captureId);
  } catch (err) {
    if (err instanceof PayPalError) throw new Error(`Could not read capture ${release.captureId} from PayPal: ${err.issue ?? err.message}`);
    throw err;
  }

  const captureStatus: string | null = capture?.status ?? release.captureStatus;
  let changed = false;

  if (captureStatus === 'COMPLETED' && release.state !== 'PAID' && release.state !== 'PAID_PARTIAL') {
    const payment = await getPaymentByMilestoneId(release.milestoneId);
    const fullyCaptured =
      payment && Number(payment.capturedAmount) >= Number(payment.authorizedAmount) - 0.005;
    const newState = fullyCaptured ? 'PAID' : 'PAID_PARTIAL';
    await updateReleaseState(release.id, { state: newState, captureStatus });
    if (payment) {
      await updatePaymentCaptured(payment.id, {
        paypalStatus: 'COMPLETED',
        trustlockStatus: newState,
      });
    }
    await setMilestoneStatus(release.milestoneId, newState);
    await recordAgentAction({
      milestoneId: release.milestoneId,
      actionType: newState === 'PAID' ? 'PAID' : 'PAID_PARTIAL',
      actor: 'system',
      decision: newState,
      inputReference: `reconcile release ${release.id}`,
      metadata: { releaseId: release.id, captureId: release.captureId, captureStatus, source: 'reconciler' },
    });
    changed = true;
  } else if (captureStatus === 'DECLINED' && release.state !== 'CAPTURE_FAILED') {
    await updateReleaseState(release.id, { state: 'CAPTURE_FAILED', captureStatus });
    const payment = await getPaymentByMilestoneId(release.milestoneId);
    if (payment) {
      await updatePaymentCaptured(payment.id, { paypalStatus: 'DECLINED', trustlockStatus: 'CAPTURE_FAILED' });
    }
    await setMilestoneStatus(release.milestoneId, 'CAPTURE_FAILED');
    await recordAgentAction({
      milestoneId: release.milestoneId,
      actionType: 'CAPTURE_FAILED',
      actor: 'system',
      decision: 'CAPTURE_FAILED',
      inputReference: `reconcile release ${release.id}`,
      metadata: { releaseId: release.id, captureId: release.captureId, captureStatus, source: 'reconciler' },
    });
    changed = true;
  } else if (captureStatus && captureStatus !== release.captureStatus) {
    await updateReleaseState(release.id, { captureStatus });
    changed = true;
  }

  const updated = (await getRelease(release.id)) ?? release;
  return { release: updated, changed };
}

/** Reconcile every release still waiting on settlement. */
export async function reconcilePendingReleases(): Promise<SyncResult[]> {
  await initDb();
  const pending = await listPendingReleases();
  const results: SyncResult[] = [];
  for (const release of pending) {
    try {
      results.push(await syncReleaseFromPayPal(release.id));
    } catch (err) {
      console.error('[reconcile] failed for release', release.id, err);
    }
  }
  return results;
}
