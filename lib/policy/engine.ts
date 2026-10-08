/**
 * Deterministic policy engine (pure module — no server-only import, no I/O).
 *
 * CRITICAL SEPARATION: the AI proposes; the policy engine decides whether the
 * proposal is PERMITTED to cause a payment action. The AI can never move money
 * directly, never pick an authorization, never change an amount, and never
 * bypass these thresholds.
 */

import type { CriterionResult } from '@/lib/ai/verdict';

export interface PolicyConfig {
  autoRelease: boolean;
  minimumConfidence: number; // 0–1
  maximumAutoReleaseAmount: number;
}

export const DEFAULT_POLICY: PolicyConfig = {
  autoRelease: true,
  minimumConfidence: 0.9,
  maximumAutoReleaseAmount: 500,
};

export type PolicyDecision = 'AUTO_RELEASE' | 'HUMAN_REVIEW' | 'REQUEST_CHANGES' | 'REJECTED';

export interface PolicyInput {
  verdict: 'RELEASE' | 'PARTIAL_RELEASE' | 'REQUEST_CHANGES';
  confidence: number; // 0–1
  recommendedAmount: number;
  criteria: CriterionResult[];
  authorizedAmount: number;
  requiredCriteriaIds: string[];
  policy: PolicyConfig;
}

export interface PolicyOutput {
  decision: PolicyDecision;
  reason: string;
  /** Amount a human may approve (null when no release is possible). */
  releaseAmount: number | null;
}

export function evaluatePolicy(input: PolicyInput): PolicyOutput {
  const { verdict, confidence, recommendedAmount, criteria, authorizedAmount, requiredCriteriaIds, policy } =
    input;

  // The agent asked for changes: never release.
  if (verdict === 'REQUEST_CHANGES') {
    return {
      decision: 'REQUEST_CHANGES',
      reason: 'The verification agent requested changes; no release is permitted.',
      releaseAmount: null,
    };
  }

  // The proposal can never exceed what the client authorized (held).
  if (recommendedAmount > authorizedAmount) {
    return {
      decision: 'REJECTED',
      reason: `Recommended amount ${recommendedAmount} exceeds the authorized amount ${authorizedAmount}.`,
      releaseAmount: null,
    };
  }
  if (recommendedAmount < 0) {
    return {
      decision: 'REJECTED',
      reason: 'Recommended amount cannot be negative.',
      releaseAmount: null,
    };
  }

  // Required criteria must be established by evidence.
  const requiredResults = criteria.filter((c) => requiredCriteriaIds.includes(c.criterionId));
  const failedRequired = requiredResults.find((c) => c.result === 'FAIL');
  if (failedRequired) {
    return {
      decision: 'REQUEST_CHANGES',
      reason: `Required criterion "${failedRequired.criterionId}" failed verification; the work does not yet satisfy the contract.`,
      releaseAmount: null,
    };
  }
  const inconclusiveRequired = requiredResults.find((c) => c.result === 'INCONCLUSIVE');
  if (inconclusiveRequired) {
    return {
      decision: 'HUMAN_REVIEW',
      reason: `Required criterion "${inconclusiveRequired.criterionId}" could not be established from the available evidence; a human must decide.`,
      releaseAmount: recommendedAmount > 0 ? Math.min(recommendedAmount, authorizedAmount) : null,
    };
  }

  // Confidence and amount caps gate AUTOMATIC release.
  if (!policy.autoRelease) {
    return {
      decision: 'HUMAN_REVIEW',
      reason: 'Automatic release is disabled by policy.',
      releaseAmount: Math.min(recommendedAmount, authorizedAmount) || null,
    };
  }
  if (confidence < policy.minimumConfidence) {
    return {
      decision: 'HUMAN_REVIEW',
      reason: `Confidence ${(confidence * 100).toFixed(0)}% is below the policy minimum ${(policy.minimumConfidence * 100).toFixed(0)}%.`,
      releaseAmount: Math.min(recommendedAmount, authorizedAmount) || null,
    };
  }
  if (recommendedAmount > policy.maximumAutoReleaseAmount) {
    return {
      decision: 'HUMAN_REVIEW',
      reason: `Recommended amount ${recommendedAmount} exceeds the automatic-release cap ${policy.maximumAutoReleaseAmount}.`,
      releaseAmount: Math.min(recommendedAmount, authorizedAmount) || null,
    };
  }

  if (verdict === 'RELEASE') {
    return {
      decision: 'AUTO_RELEASE',
      reason: `All required criteria passed with confidence ${(confidence * 100).toFixed(0)}%; amount within policy caps.`,
      releaseAmount: Math.min(recommendedAmount, authorizedAmount),
    };
  }

  // PARTIAL_RELEASE always requires an explicit human decision.
  if (verdict === 'PARTIAL_RELEASE') {
    if (recommendedAmount <= 0) {
      return {
        decision: 'HUMAN_REVIEW',
        reason: 'Partial release amount must be greater than zero; a human must decide.',
        releaseAmount: null,
      };
    }
    return {
      decision: 'HUMAN_REVIEW',
      reason: `Partial release of ${recommendedAmount} proposed; partial releases always require explicit human approval.`,
      releaseAmount: Math.min(recommendedAmount, authorizedAmount),
    };
  }

  return {
    decision: 'HUMAN_REVIEW',
    reason: 'Unhandled verdict; a human must decide.',
    releaseAmount: Math.min(recommendedAmount, authorizedAmount) || null,
  };
}
