import 'server-only';
import { randomUUID } from 'node:crypto';
import { initDb } from '@/lib/db';
import {
  createRelease,
  getLatestReview,
  getMilestone,
  getPaymentByMilestoneId,
  getReleaseByReview,
  getReview,
  recordAgentAction,
  setMilestoneStatus,
  updatePaymentCaptured,
  type PaymentRelease,
} from '@/lib/db/milestones';
import { captureAuthorization, getAuthorization, getCapture, PayPalError } from '@/lib/paypal/client';
import { DEFAULT_POLICY, evaluatePolicy } from '@/lib/policy/engine';
import { syncReleaseFromPayPal } from './reconcile';

/**
 * Controlled PayPal release (server-only).
 *
 * This is the ONLY place that captures money. It:
 *  1. loads the milestone, the held PayPal authorization, and the AI review;
 *  2. re-derives the deterministic policy decision from the stored review;
 *  3. requires human approval unless the policy auto-released;
 *  4. is idempotent per review — a duplicate request returns the existing
 *     release and NEVER captures twice;
 *  5. verifies the authorization is still held at PayPal;
 *  6. captures with a stable PayPal-Request-Id (idempotency key);
 *  7. reads the capture back — never assumes COMPLETED;
 *  8. records the release and updates server-controlled state.
 */

export class ReleaseError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ReleaseError';
    this.statusCode = statusCode;
  }
}

export interface ReleaseResult {
  release: PaymentRelease;
  captureStatus: string | null;
  state: string;
  alreadyReleased: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function executeRelease(input: {
  milestoneId: string;
  reviewId?: string;
  humanApproval?: boolean;
  approvedAmount?: number;
}): Promise<ReleaseResult> {
  await initDb();

  const milestone = await getMilestone(input.milestoneId);
  if (!milestone) throw new ReleaseError('Milestone not found', 404);

  const payment = await getPaymentByMilestoneId(input.milestoneId);
  if (!payment || !payment.authorizationId) {
    throw new ReleaseError('No PayPal authorization is held for this milestone', 409);
  }

  const review = input.reviewId
    ? await getReview(input.reviewId)
    : await getLatestReview(input.milestoneId);
  if (!review || review.milestoneId !== input.milestoneId) {
    throw new ReleaseError('No AI review found for this milestone', 409);
  }

  // Re-derive the policy decision from the stored review (deterministic).
  const policy = { ...DEFAULT_POLICY, ...((milestone as any).policy ?? {}) };
  const policyOutput = evaluatePolicy({
    verdict: review.verdict as 'RELEASE' | 'PARTIAL_RELEASE' | 'REQUEST_CHANGES',
    confidence: review.confidence,
    recommendedAmount: review.recommendedAmount,
    criteria: review.criteriaResults,
    authorizedAmount: payment.authorizedAmount,
    requiredCriteriaIds: milestone.acceptanceCriteria.filter((c) => c.required).map((c) => c.id),
    policy,
  });

  if (policyOutput.decision === 'REQUEST_CHANGES') {
    throw new ReleaseError('The AI requested changes; release is not permitted. Submit new evidence.', 409);
  }
  if (policyOutput.decision === 'REJECTED') {
    throw new ReleaseError(`Policy rejected the AI proposal: ${policyOutput.reason}`, 422);
  }
  if (policyOutput.decision === 'HUMAN_REVIEW' && !input.humanApproval) {
    throw new ReleaseError('This release requires explicit human approval.', 403);
  }

  // IDEMPOTENCY FIRST: one release per review. A duplicate request re-syncs
  // with PayPal and returns the existing release — it NEVER captures twice.
  const existing = await getReleaseByReview(milestone.id, review.id);
  if (existing) {
    const synced = await syncReleaseFromPayPal(existing.id);
    return {
      release: synced.release,
      captureStatus: synced.release.captureStatus,
      state: synced.release.state,
      alreadyReleased: true,
    };
  }

  // Determine the capture amount (never above what is still held).
  const remaining = round2(payment.authorizedAmount - payment.capturedAmount);
  let amount = policyOutput.releaseAmount ?? review.recommendedAmount;
  if (input.humanApproval && input.approvedAmount !== undefined) amount = input.approvedAmount;
  if (!(amount > 0) || amount > remaining + 0.005) {
    throw new ReleaseError(
      `Requested amount ${amount} exceeds the remaining held amount ${remaining}.`,
      422
    );
  }
  amount = Math.min(amount, remaining);

  // Verify the authorization is still held at PayPal.
  let authState;
  try {
    authState = await getAuthorization(payment.authorizationId);
  } catch (err) {
    if (err instanceof PayPalError) throw new ReleaseError('Could not verify the authorization with PayPal', 502);
    throw err;
  }
  if (authState.status === 'VOIDED') {
    throw new ReleaseError('The authorization was voided; no funds are held.', 409);
  }
  if (authState.status === 'CAPTURED' && remaining <= 0.005) {
    throw new ReleaseError('The authorization is already fully captured.', 409);
  }
  if (authState.status !== 'CREATED' && authState.status !== 'CAPTURED') {
    throw new ReleaseError(`Authorization is not in a held state (PayPal status: ${authState.status}).`, 409);
  }

  if (!['AUTHORIZED', 'AI_REVIEW', 'RELEASE_APPROVED', 'HUMAN_REVIEW'].includes(milestone.status)) {
    throw new ReleaseError(`Milestone is not in a releasable state (current: ${milestone.status}).`, 409);
  }

  // Capture with a stable idempotency key.
  const idempotencyKey = `release:${review.id}`;
  if (milestone.status !== 'RELEASE_APPROVED') {
    await setMilestoneStatus(milestone.id, 'RELEASE_APPROVED');
  }
  await recordAgentAction({
    milestoneId: milestone.id,
    actionType: 'CAPTURE_REQUESTED',
    actor: 'system',
    inputReference: `review ${review.id}`,
    metadata: { amount, authorizationId: payment.authorizationId, idempotencyKey, humanApproval: !!input.humanApproval },
  });

  let capture;
  try {
    capture = await captureAuthorization(payment.authorizationId, {
      amount,
      currency: payment.currency,
      finalCapture: amount >= remaining - 0.005,
      idempotencyKey,
    });
  } catch (err) {
    if (err instanceof PayPalError) {
      await recordAgentAction({
        milestoneId: milestone.id,
        actionType: 'CAPTURE_FAILED',
        actor: 'system',
        decision: 'CAPTURE_FAILED',
        metadata: { issue: err.issue, amount },
      });
      await setMilestoneStatus(milestone.id, 'CAPTURE_FAILED');
      throw new ReleaseError(`PayPal rejected the capture: ${err.issue ?? err.message}`, 502);
    }
    throw err;
  }

  // Read the capture back — never assume it is COMPLETED.
  let captureState: any = capture;
  try {
    captureState = await getCapture(capture.id);
  } catch {
    // fall back to the capture response itself
  }
  const captureStatus: string | null = captureState?.status ?? capture?.status ?? null;

  const fullyCaptured = round2(payment.capturedAmount + amount) >= payment.authorizedAmount - 0.005;
  let state: 'PAID' | 'PAID_PARTIAL' | 'CAPTURE_PENDING' | 'CAPTURE_FAILED';
  if (captureStatus === 'COMPLETED') state = fullyCaptured ? 'PAID' : 'PAID_PARTIAL';
  else if (captureStatus === 'PENDING') state = 'CAPTURE_PENDING';
  else state = 'CAPTURE_FAILED';

  const release = await createRelease({
    id: randomUUID(),
    milestoneId: milestone.id,
    reviewId: review.id,
    authorizationId: payment.authorizationId,
    requestedAmount: amount,
    captureId: capture.id,
    captureStatus,
    state,
    idempotencyKey,
  });

  await updatePaymentCaptured(payment.id, {
    capturedAmount: round2(payment.capturedAmount + amount),
    paypalStatus: captureStatus === 'COMPLETED' ? 'COMPLETED' : (captureStatus ?? 'PENDING'),
    trustlockStatus: state,
  });

  if (state === 'PAID' || state === 'PAID_PARTIAL') {
    await setMilestoneStatus(milestone.id, state);
    await recordAgentAction({
      milestoneId: milestone.id,
      actionType: state === 'PAID' ? 'PAID' : 'PAID_PARTIAL',
      actor: 'system',
      decision: state,
      metadata: { releaseId: release.id, captureId: capture.id, amount, captureStatus },
    });
  } else if (state === 'CAPTURE_PENDING') {
    await setMilestoneStatus(milestone.id, 'CAPTURE_PENDING');
    await recordAgentAction({
      milestoneId: milestone.id,
      actionType: 'CAPTURE_PENDING',
      actor: 'system',
      decision: 'CAPTURE_PENDING',
      metadata: { releaseId: release.id, captureId: capture.id, amount, captureStatus, note: 'Capture accepted by PayPal; settlement pending. Reconcile via webhook or polling.' },
    });
  } else {
    await setMilestoneStatus(milestone.id, 'CAPTURE_FAILED');
    await recordAgentAction({
      milestoneId: milestone.id,
      actionType: 'CAPTURE_FAILED',
      actor: 'system',
      decision: 'CAPTURE_FAILED',
      metadata: { releaseId: release.id, captureId: capture.id, amount, captureStatus },
    });
  }

  return { release, captureStatus, state, alreadyReleased: false };
}
