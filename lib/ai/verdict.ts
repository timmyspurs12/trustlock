import { z } from 'zod';

/**
 * Structured AI verdict schemas (pure module — no server-only import, so the
 * policy engine and tests can import it directly).
 *
 * The AI output is UNTRUSTED INPUT: it is validated with Zod here and then
 * passed through the deterministic policy engine. The model can never return
 * arbitrary verdict strings, arbitrary criteria, or arbitrary amounts.
 */

export const criterionEvidenceSchema = z.object({
  type: z.enum(['URL', 'HTTP', 'HTML', 'TEXT', 'SCREENSHOT', 'OTHER']),
  reference: z.string().max(2000),
  observation: z.string().max(2000),
});

export const criterionResultSchema = z.object({
  criterionId: z.string().min(1).max(64),
  result: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
  evidence: z.array(criterionEvidenceSchema).default([]),
  // Accept 0–1 or 0–100; normalized to 0–1 by the caller.
  confidence: z.number().min(0).max(100),
  rationale: z.string().max(2000),
});

export const verdictSchema = z.object({
  verdict: z.enum(['RELEASE', 'PARTIAL_RELEASE', 'REQUEST_CHANGES']),
  // Accept 0–1 or 0–100; normalized to 0–1 by the caller.
  confidence: z.number().min(0).max(100),
  criteria: z.array(criterionResultSchema).min(1),
  recommendedAmount: z.number().min(0).max(1_000_000),
  rationale: z.string().max(4000),
});

export type CriterionEvidence = z.infer<typeof criterionEvidenceSchema>;
export type CriterionResult = z.infer<typeof criterionResultSchema>;
export type Verdict = z.infer<typeof verdictSchema>['verdict'];
export type VerdictOutput = z.infer<typeof verdictSchema>;

/** Normalize a model confidence (0–1 or 0–100) to 0–1. */
export function normalizeConfidence(value: number): number {
  const v = value > 1 ? value / 100 : value;
  return Math.min(Math.max(v, 0), 1);
}

/** Normalize a criterion id for tolerant matching (canonical ids are kept). */
export function normalizeCriterionId(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
