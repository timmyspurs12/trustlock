import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import {
  createReview,
  getLatestEvidence,
  getLatestRelease,
  getMilestone,
  getPaymentByMilestoneId,
  getReviewByEvidence,
  recordAgentAction,
  setMilestoneStatus,
} from '@/lib/db/milestones';
import { fetchDeliverable, fetchEvidenceRef } from '@/lib/evidence/fetch';
import { runVerificationAgent } from '@/lib/ai/review';
import { normalizeCriterionId } from '@/lib/ai/verdict';
import { DEFAULT_POLICY, evaluatePolicy } from '@/lib/policy/engine';
import { executeRelease, ReleaseError } from '@/lib/payments/release';

/**
 * POST /api/milestones/[id]/review
 *
 * Runs the AI verification agent over the latest evidence submission:
 *   evidence fetch → criterion-by-criterion AI evaluation (structured, Zod-
 *   validated) → deterministic policy decision → controlled release.
 *
 * The AI proposes; the policy engine decides; the server executes. The AI
 * never calls PayPal directly.
 *
 * Idempotent per evidence submission: re-running the review for the SAME
 * evidence returns the existing review (no duplicate review, no duplicate
 * capture). New evidence → new review.
 */
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await initDb();

    const milestone = await getMilestone(id);
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }
    if (!['AUTHORIZED', 'EVIDENCE_SUBMITTED', 'REQUEST_CHANGES', 'AI_REVIEW'].includes(milestone.status)) {
      return NextResponse.json(
        { error: `A review can only run on an authorized milestone with evidence (current state: ${milestone.status}).` },
        { status: 409 }
      );
    }

    const evidence = await getLatestEvidence(id);
    if (!evidence) {
      return NextResponse.json({ error: 'Submit evidence before running a review.' }, { status: 409 });
    }

    // Idempotency: one review per evidence submission.
    const existing = await getReviewByEvidence(id, evidence.id);
    if (existing) {
      const release = await getLatestRelease(id);
      return NextResponse.json({
        review: existing,
        policy: { decision: existing.policyDecision, reason: existing.policyReason },
        release: release ?? null,
        alreadyReviewed: true,
      });
    }

    await setMilestoneStatus(id, 'AI_REVIEW');
    await recordAgentAction({
      milestoneId: id,
      actionType: 'AI_REVIEW_STARTED',
      actor: 'system',
      inputReference: `evidence ${evidence.id}`,
      metadata: { deliverableUrl: evidence.deliverableUrl },
    });

    // 1. Controlled evidence retrieval (server-side fetch; the AI never fetches).
    const fetched = await fetchDeliverable(evidence.deliverableUrl);
    const extraEvidence = [];
    for (const url of (evidence.metadata as any)?.evidenceUrls ?? []) {
      try {
        const ref = await fetchEvidenceRef(url);
        extraEvidence.push({ url: ref.url, summary: ref.summary });
      } catch (err) {
        extraEvidence.push({ url, summary: `${url} → error: ${(err as Error).message}` });
      }
    }
    await recordAgentAction({
      milestoneId: id,
      actionType: 'EVIDENCE_FETCHED',
      actor: 'system',
      metadata: {
        deliverable: {
          httpStatus: fetched.httpStatus,
          ok: fetched.ok,
          contentType: fetched.contentType,
          title: fetched.title,
          textLength: fetched.text.length,
          signals: fetched.signals,
        },
        extraEvidenceCount: extraEvidence.length,
      },
    });

    // 2. AI verification agent (structured, Zod-validated output).
    let agentResult;
    try {
      agentResult = await runVerificationAgent({
        milestoneTitle: milestone.title,
        milestoneDescription: milestone.description,
        amount: milestone.amount,
        currency: milestone.currency,
        criteria: milestone.acceptanceCriteria,
        deliverableUrl: evidence.deliverableUrl,
        notes: evidence.notes,
        fetched,
        extraEvidence,
      });
    } catch (err) {
      await recordAgentAction({
        milestoneId: id,
        actionType: 'AI_REVIEW_FAILED',
        actor: 'system',
        decision: 'AI_REVIEW_FAILED',
        metadata: { error: (err as Error)?.message ?? String(err) },
      });
      return NextResponse.json(
        { error: 'The AI verification agent failed to produce a valid verdict.', detail: (err as Error)?.message },
        { status: 422 }
      );
    }

    // 3. Enforce criterion coverage: the AI must evaluate exactly the
    //    contractual criteria — never invent, drop, or rename them.
    const canonicalByNorm = new Map(
      milestone.acceptanceCriteria.map((c) => [normalizeCriterionId(c.id), c.id])
    );
    const returnedNorms = agentResult.normalizedCriteria.map((c) => normalizeCriterionId(c.criterionId));
    const coverageOk =
      returnedNorms.length === milestone.acceptanceCriteria.length &&
      returnedNorms.every((n) => canonicalByNorm.has(n)) &&
      new Set(returnedNorms).size === returnedNorms.length;
    if (!coverageOk) {
      await recordAgentAction({
        milestoneId: id,
        actionType: 'AI_VERDICT_INVALID',
        actor: 'system',
        decision: 'AI_VERDICT_INVALID',
        metadata: {
          expected: milestone.acceptanceCriteria.map((c) => c.id),
          received: agentResult.normalizedCriteria.map((c) => c.criterionId),
        },
      });
      return NextResponse.json(
        {
          error: 'The AI verdict did not cover exactly the contractual criteria.',
          expected: milestone.acceptanceCriteria.map((c) => c.id),
          received: agentResult.normalizedCriteria.map((c) => c.criterionId),
        },
        { status: 422 }
      );
    }
    // Map to canonical criterion ids.
    const criteriaResults = agentResult.normalizedCriteria.map((c) => ({
      ...c,
      criterionId: canonicalByNorm.get(normalizeCriterionId(c.criterionId)) ?? c.criterionId,
    }));

    // 4. Deterministic policy engine (the AI never decides whether money moves).
    const payment = await getPaymentByMilestoneId(id);
    const policy = { ...DEFAULT_POLICY, ...(milestone.policy ?? {}) };
    const policyOutput = evaluatePolicy({
      verdict: agentResult.raw.verdict,
      confidence: agentResult.normalizedConfidence,
      recommendedAmount: agentResult.raw.recommendedAmount,
      criteria: criteriaResults as any,
      authorizedAmount: payment?.authorizedAmount ?? milestone.amount,
      requiredCriteriaIds: milestone.acceptanceCriteria.filter((c) => c.required).map((c) => c.id),
      policy,
    });

    // 5. Persist the review (append-only) with the policy decision.
    const review = await createReview({
      milestoneId: id,
      evidenceId: evidence.id,
      provider: agentResult.provider,
      model: agentResult.modelName,
      verdict: agentResult.raw.verdict,
      confidence: agentResult.normalizedConfidence,
      criteriaResults,
      recommendedAmount: agentResult.raw.recommendedAmount,
      rationale: agentResult.raw.rationale,
      fetchedEvidence: {
        deliverable: {
          url: fetched.url,
          httpStatus: fetched.httpStatus,
          contentType: fetched.contentType,
          title: fetched.title,
          signals: fetched.signals,
        },
        extraEvidence,
      },
      policyDecision: policyOutput.decision,
      policyReason: policyOutput.reason,
    });

    for (const c of criteriaResults) {
      await recordAgentAction({
        milestoneId: id,
        actionType: 'CRITERION_EVALUATED',
        actor: 'agent',
        inputReference: `criterion ${c.criterionId}`,
        decision: c.result,
        confidence: c.confidence,
        metadata: { evidence: c.evidence, rationale: c.rationale },
      });
    }
    await recordAgentAction({
      milestoneId: id,
      actionType: 'AI_VERDICT_CREATED',
      actor: 'agent',
      decision: agentResult.raw.verdict,
      confidence: agentResult.normalizedConfidence,
      inputReference: `review ${review.id}`,
      metadata: {
        model: `${agentResult.provider}/${agentResult.modelName}`,
        recommendedAmount: agentResult.raw.recommendedAmount,
        criteriaResults,
        rationale: agentResult.raw.rationale,
        evidenceSubmissionId: evidence.id,
      },
    });
    await recordAgentAction({
      milestoneId: id,
      actionType: 'POLICY_EVALUATED',
      actor: 'system',
      decision: policyOutput.decision,
      inputReference: `review ${review.id}`,
      metadata: { reason: policyOutput.reason, releaseAmount: policyOutput.releaseAmount, policy },
    });

    // 6. Act on the policy decision — server-controlled state transitions.
    let releaseResult = null;
    if (policyOutput.decision === 'AUTO_RELEASE') {
      await setMilestoneStatus(id, 'RELEASE_APPROVED');
      await recordAgentAction({
        milestoneId: id,
        actionType: 'RELEASE_APPROVED',
        actor: 'system',
        decision: 'AUTO_RELEASE',
        inputReference: `review ${review.id}`,
        metadata: { reason: policyOutput.reason, amount: policyOutput.releaseAmount },
      });
      try {
        releaseResult = await executeRelease({ milestoneId: id, reviewId: review.id });
      } catch (err) {
        if (err instanceof ReleaseError) {
          return NextResponse.json(
            { review, policy: policyOutput, releaseError: err.message },
            { status: err.statusCode }
          );
        }
        throw err;
      }
    } else if (policyOutput.decision === 'HUMAN_REVIEW') {
      await setMilestoneStatus(id, 'HUMAN_REVIEW');
    } else if (policyOutput.decision === 'REQUEST_CHANGES') {
      await setMilestoneStatus(id, 'REQUEST_CHANGES');
      await recordAgentAction({
        milestoneId: id,
        actionType: 'REQUEST_CHANGES',
        actor: 'system',
        decision: 'REQUEST_CHANGES',
        inputReference: `review ${review.id}`,
        metadata: { reason: policyOutput.reason },
      });
    } else {
      // REJECTED — the proposal was invalid; a human must look at it.
      await setMilestoneStatus(id, 'HUMAN_REVIEW');
    }

    return NextResponse.json({
      review,
      policy: policyOutput,
      release: releaseResult
        ? {
            id: releaseResult.release.id,
            state: releaseResult.state,
            captureStatus: releaseResult.captureStatus,
            captureId: releaseResult.release.captureId,
            requestedAmount: releaseResult.release.requestedAmount,
            alreadyReleased: releaseResult.alreadyReleased,
          }
        : null,
    });
  } catch (err) {
    console.error('[api] POST /api/milestones/[id]/review failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
