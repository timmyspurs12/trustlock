import 'server-only';
import { generateObject } from 'ai';
import { getAiModelChain } from './provider';
import { verdictSchema, normalizeConfidence, type VerdictOutput } from './verdict';
import type { FetchedEvidence } from '@/lib/evidence/fetch';
import { summarizeFetchedEvidence } from '@/lib/evidence/fetch';
import type { AcceptanceCriterion } from '@/lib/db/milestones';

/**
 * AI verification agent (server-only).
 *
 * The agent evaluates EVERY acceptance criterion independently against the
 * fetched evidence and returns a Zod-validated structured verdict.
 *
 * Honesty rules enforced by the prompt and the schema:
 *  - evaluate ONLY the criteria that exist (never invent new ones)
 *  - PASS only when evidence directly establishes the criterion
 *  - INCONCLUSIVE when evidence cannot establish it (never guess)
 *  - structured output only (no free-form text decisions)
 */

export interface ReviewPromptInput {
  milestoneTitle: string;
  milestoneDescription: string;
  amount: number;
  currency: string;
  criteria: AcceptanceCriterion[];
  deliverableUrl: string;
  notes: string;
  fetched: FetchedEvidence;
  extraEvidence: Array<{ url: string; summary: string }>;
}

export const SYSTEM_PROMPT = `You are TrustLock's verification agent. TrustLock holds a client's funds in a PayPal authorization until a freelancer's deliverable satisfies the milestone's acceptance criteria. Your job is to evaluate each acceptance criterion against the provided evidence and produce a structured verdict.

Rules:
- Evaluate ONLY the criteria provided in the request. Never invent, add, drop, or rename criteria. Your output must contain exactly one result per provided criterion, using the exact criterion ids.
- For each criterion, decide PASS, FAIL, or INCONCLUSIVE:
  - PASS only when the provided evidence directly establishes the criterion.
  - FAIL when the provided evidence directly contradicts the criterion.
  - INCONCLUSIVE when the evidence cannot establish the criterion — for example visual or viewport properties that text inspection cannot prove. Never guess, and never mark INCONCLUSIVE as PASS.
- Reference the specific evidence you used for each criterion (HTTP status, page title, extracted text, detected form fields, headings).
- Assign a confidence between 0 and 1 for each criterion (0 = no evidence, 1 = fully established).
- Overall verdict:
  - RELEASE when every required criterion is PASS and the deliverable satisfies the contract.
  - PARTIAL_RELEASE when the work only partially satisfies the contract; recommend an amount strictly below the authorized amount.
  - REQUEST_CHANGES when required criteria fail or the deliverable is not yet acceptable.
- recommendedAmount: the full authorized amount for RELEASE; a partial amount for PARTIAL_RELEASE; 0 for REQUEST_CHANGES.
- Be strict and honest. The client is deciding whether to pay real money. A criterion that cannot be established from the evidence is INCONCLUSIVE, not PASS.`;

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const criteriaBlock = input.criteria
    .map(
      (c, i) =>
        `${i + 1}. [id: ${c.id}] ${c.description}${c.required ? ' (required)' : ' (optional)'}`
    )
    .join('\n');

  const extraBlock =
    input.extraEvidence.length > 0
      ? input.extraEvidence.map((e) => `- ${e.summary}`).join('\n')
      : '- none';

  return `Milestone: "${input.milestoneTitle}" (${input.amount.toFixed(2)} ${input.currency})
Description: ${input.milestoneDescription || '—'}

Acceptance criteria (evaluate EACH ONE, using these exact ids):
${criteriaBlock}

Freelancer submission:
- Deliverable URL: ${input.deliverableUrl}
- Freelancer notes: ${input.notes || '—'}

Fetched evidence (server-side fetch of the deliverable):
${summarizeFetchedEvidence(input.fetched)}

Additional evidence references:
${extraBlock}

Evaluate every criterion above against this evidence and return the structured verdict.`;
}

export interface AgentReviewResult {
  raw: VerdictOutput;
  normalizedConfidence: number;
  normalizedCriteria: VerdictOutput['criteria'];
  provider: string;
  modelName: string;
}

/**
 * Run the AI verification agent. Returns the Zod-validated verdict with
 * normalized confidences (0–1).
 *
 * Tries the configured model first, then the fallback chain (e.g. when the
 * primary is overloaded). Every attempt is a real model call.
 */
export async function runVerificationAgent(input: ReviewPromptInput): Promise<AgentReviewResult> {
  const chain = getAiModelChain();
  if (chain.length === 0) {
    throw new Error('No AI provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY.');
  }
  const prompt = buildReviewPrompt(input);

  let lastError: unknown = null;
  for (const handle of chain) {
    try {
      const { object } = await generateObject({
        model: handle.model,
        schema: verdictSchema,
        prompt,
        system: SYSTEM_PROMPT,
      });
      return {
        raw: object,
        normalizedConfidence: normalizeConfidence(object.confidence),
        normalizedCriteria: object.criteria.map((c) => ({
          ...c,
          confidence: normalizeConfidence(c.confidence),
        })),
        provider: handle.provider,
        modelName: handle.modelName,
      };
    } catch (err) {
      lastError = err;
      console.warn(`[ai] model ${handle.provider}/${handle.modelName} failed, trying next in chain:`, (err as Error)?.message?.slice(0, 160));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
