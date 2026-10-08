/**
 * Policy engine failure tests (run: npm run test:policy).
 *
 * These tests drive the REAL policy engine (lib/policy/engine.ts) and the REAL
 * Zod verdict schema (lib/ai/verdict.ts) with synthetic AI outputs. They prove
 * the deterministic safety gates — no LLM required.
 *
 * Spec tests covered:
 *  Test 1: AI RELEASE with confidence 0.70 (< policy 0.90) → HUMAN_REVIEW
 *  Test 2: AI recommends $150 against a $100 authorization → REJECTED
 *  Test 3: AI returns an unknown verdict → Zod validation failure
 *  Test 4: a required criterion is INCONCLUSIVE → no automatic release
 */
import { evaluatePolicy, DEFAULT_POLICY, type PolicyInput } from '../lib/policy/engine';
import { verdictSchema, normalizeConfidence } from '../lib/ai/verdict';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) {
    failures++;
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

const baseCriteria = [
  {
    criterionId: 'homepage',
    result: 'PASS' as const,
    evidence: [{ type: 'HTTP' as const, reference: 'deliverable', observation: 'HTTP 200 text/html' }],
    confidence: 0.95,
    rationale: 'Page loads and serves HTML.',
  },
  {
    criterionId: 'contact',
    result: 'PASS' as const,
    evidence: [{ type: 'HTML' as const, reference: 'deliverable', observation: 'form with name/email/message' }],
    confidence: 0.9,
    rationale: 'Contact form detected.',
  },
];

const baseInput: PolicyInput = {
  verdict: 'RELEASE',
  confidence: 0.96,
  recommendedAmount: 100,
  criteria: baseCriteria as any,
  authorizedAmount: 100,
  requiredCriteriaIds: ['homepage', 'contact'],
  policy: DEFAULT_POLICY,
};

// Test 1: confidence below the policy minimum → HUMAN_REVIEW
check(
  'Test 1: RELEASE @ 0.70 confidence (< 0.90 minimum) → HUMAN_REVIEW',
  evaluatePolicy({ ...baseInput, confidence: 0.7 }).decision,
  'HUMAN_REVIEW'
);

// Test 2: recommended amount above the authorized amount → REJECTED
check(
  'Test 2: recommend $150 against $100 authorized → REJECTED',
  evaluatePolicy({ ...baseInput, recommendedAmount: 150 }).decision,
  'REJECTED'
);

// Test 3: unknown verdict string → Zod validation failure
const badVerdict = verdictSchema.safeParse({
  verdict: 'RELEASE_ALL_THE_MONEY',
  confidence: 0.99,
  criteria: baseCriteria,
  recommendedAmount: 100,
  rationale: 'gimme',
});
check('Test 3: unknown verdict string → Zod validation failure', badVerdict.success, false);

// Test 4: a required criterion is INCONCLUSIVE → no automatic release
const inconclusiveInput: PolicyInput = {
  ...baseInput,
  criteria: [
    baseCriteria[0],
    { ...baseCriteria[1], result: 'INCONCLUSIVE' as const, confidence: 0.4, rationale: 'Cannot establish from text.' },
  ] as any,
};
const t4 = evaluatePolicy(inconclusiveInput);
check(
  'Test 4: required criterion INCONCLUSIVE → no AUTO_RELEASE',
  t4.decision !== 'AUTO_RELEASE',
  true
);
check('Test 4 (detail): decision is HUMAN_REVIEW', t4.decision, 'HUMAN_REVIEW');

// Bonus gates worth locking in:
check(
  'Bonus: RELEASE @ 0.96, $100 ≤ caps → AUTO_RELEASE',
  evaluatePolicy(baseInput).decision,
  'AUTO_RELEASE'
);
check(
  'Bonus: required criterion FAIL → REQUEST_CHANGES',
  evaluatePolicy({
    ...baseInput,
    criteria: [baseCriteria[0], { ...baseCriteria[1], result: 'FAIL' as const }] as any,
  }).decision,
  'REQUEST_CHANGES'
);
check(
  'Bonus: PARTIAL_RELEASE always → HUMAN_REVIEW',
  evaluatePolicy({ ...baseInput, verdict: 'PARTIAL_RELEASE', recommendedAmount: 60 }).decision,
  'HUMAN_REVIEW'
);
check(
  'Bonus: amount above the auto-release cap ($500) → HUMAN_REVIEW',
  evaluatePolicy({ ...baseInput, recommendedAmount: 600, authorizedAmount: 600 }).decision,
  'HUMAN_REVIEW'
);
check(
  'Bonus: confidence normalization (96 → 0.96)',
  normalizeConfidence(96),
  0.96
);

console.log(failures === 0 ? '\nALL POLICY TESTS PASSED' : `\n${failures} POLICY TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
