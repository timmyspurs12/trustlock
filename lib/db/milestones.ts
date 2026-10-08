import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPool, initDb } from './index';

/* ---------------- types ---------------- */

export interface AcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface MilestonePolicy {
  autoRelease: boolean;
  minimumConfidence: number;
  maximumAutoReleaseAmount: number;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  acceptanceCriteria: AcceptanceCriterion[];
  policy: MilestonePolicy;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaypalPayment {
  id: string;
  milestoneId: string;
  orderId: string;
  authorizationId: string | null;
  currency: string;
  authorizedAmount: number;
  capturedAmount: number;
  paypalStatus: string | null;
  trustlockStatus: string;
  authorizationExpiresAt: string | null;
  lastPaypalRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAction {
  id: string;
  milestoneId: string;
  actionType: string;
  actor: string;
  inputReference: string | null;
  decision: string | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface MilestoneEvidence {
  id: string;
  milestoneId: string;
  deliverableUrl: string;
  notes: string;
  submittedBy: string;
  metadata: Record<string, unknown> | null;
  submittedAt: string;
}

export interface AiReview {
  id: string;
  milestoneId: string;
  evidenceId: string;
  provider: string;
  model: string;
  verdict: string;
  confidence: number;
  criteriaResults: any[];
  recommendedAmount: number;
  rationale: string;
  fetchedEvidence: Record<string, unknown> | null;
  policyDecision: string;
  policyReason: string;
  createdAt: string;
}

export interface PaymentRelease {
  id: string;
  milestoneId: string;
  reviewId: string;
  authorizationId: string;
  requestedAmount: number;
  captureId: string | null;
  captureStatus: string | null;
  state: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------------- mappers ---------------- */

const mapMilestone = (row: any): Milestone => ({
  id: row.id,
  title: row.title,
  description: row.description,
  amount: Number(row.amount),
  currency: row.currency,
  acceptanceCriteria: row.acceptance_criteria ?? [],
  policy: row.policy ?? { autoRelease: true, minimumConfidence: 0.9, maximumAutoReleaseAmount: 500 },
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPayment = (row: any): PaypalPayment => ({
  id: row.id,
  milestoneId: row.milestone_id,
  orderId: row.order_id,
  authorizationId: row.authorization_id ?? null,
  currency: row.currency,
  authorizedAmount: Number(row.authorized_amount),
  capturedAmount: Number(row.captured_amount ?? 0),
  paypalStatus: row.paypal_status ?? null,
  trustlockStatus: row.trustlock_status,
  authorizationExpiresAt: row.authorization_expires_at ?? null,
  lastPaypalRequestId: row.last_paypal_request_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAction = (row: any): AgentAction => ({
  id: row.id,
  milestoneId: row.milestone_id,
  actionType: row.action_type,
  actor: row.actor,
  inputReference: row.input_reference ?? null,
  decision: row.decision ?? null,
  confidence: row.confidence === null ? null : Number(row.confidence),
  metadata: row.metadata ?? null,
  createdAt: row.created_at,
});

const mapEvidence = (row: any): MilestoneEvidence => ({
  id: row.id,
  milestoneId: row.milestone_id,
  deliverableUrl: row.deliverable_url,
  notes: row.notes,
  submittedBy: row.submitted_by,
  metadata: row.metadata ?? null,
  submittedAt: row.submitted_at,
});

const mapReview = (row: any): AiReview => ({
  id: row.id,
  milestoneId: row.milestone_id,
  evidenceId: row.evidence_id,
  provider: row.provider,
  model: row.model,
  verdict: row.verdict,
  confidence: Number(row.confidence),
  criteriaResults: row.criteria_results ?? [],
  recommendedAmount: Number(row.recommended_amount),
  rationale: row.rationale,
  fetchedEvidence: row.fetched_evidence ?? null,
  policyDecision: row.policy_decision,
  policyReason: row.policy_reason,
  createdAt: row.created_at,
});

const mapRelease = (row: any): PaymentRelease => ({
  id: row.id,
  milestoneId: row.milestone_id,
  reviewId: row.review_id,
  authorizationId: row.authorization_id,
  requestedAmount: Number(row.requested_amount),
  captureId: row.capture_id ?? null,
  captureStatus: row.capture_status ?? null,
  state: row.state,
  idempotencyKey: row.idempotency_key,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ---------------- server-controlled state machine ---------------- */

export const MILESTONE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['FUNDING_PENDING', 'CANCELLED'],
  FUNDING_PENDING: ['AUTHORIZED', 'CANCELLED', 'VOIDED'],
  AUTHORIZED: ['EVIDENCE_SUBMITTED', 'CANCELLED', 'VOIDED', 'AUTHORIZATION_EXPIRING'],
  EVIDENCE_SUBMITTED: ['AI_REVIEW', 'CANCELLED', 'VOIDED'],
  AI_REVIEW: ['RELEASE_APPROVED', 'HUMAN_REVIEW', 'REQUEST_CHANGES', 'CAPTURE_PENDING', 'PAID', 'PAID_PARTIAL'],
  RELEASE_APPROVED: ['CAPTURE_PENDING', 'PAID', 'PAID_PARTIAL', 'CAPTURE_FAILED', 'CANCELLED'],
  HUMAN_REVIEW: ['RELEASE_APPROVED', 'REQUEST_CHANGES', 'CAPTURE_PENDING', 'PAID', 'PAID_PARTIAL', 'CANCELLED'],
  REQUEST_CHANGES: ['EVIDENCE_SUBMITTED', 'CANCELLED', 'VOIDED'],
  CAPTURE_PENDING: ['PAID', 'PAID_PARTIAL', 'CAPTURE_FAILED'],
  PAID: [],
  PAID_PARTIAL: ['PAID', 'VOIDED'],
  CAPTURE_FAILED: ['RELEASE_APPROVED', 'HUMAN_REVIEW', 'CANCELLED'],
  CANCELLED: ['VOIDED'],
  VOIDED: [],
  AUTHORIZATION_EXPIRING: ['AUTHORIZED', 'VOIDED', 'CANCELLED'],
};

/** Server-controlled milestone status transition (validated against the map). */
export async function setMilestoneStatus(milestoneId: string, next: string): Promise<void> {
  await initDb();
  const current = await getMilestone(milestoneId);
  if (!current) throw new Error('Milestone not found');
  if (current.status === next) return;
  const allowed = MILESTONE_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`Illegal milestone state transition: ${current.status} → ${next}`);
  }
  await getPool().query(`UPDATE milestones SET status = $1, updated_at = now() WHERE id = $2`, [next, milestoneId]);
}

/* ---------------- audit ---------------- */

/** Append-only audit record (the agent_actions table rejects UPDATE/DELETE via trigger). */
export async function recordAgentAction(input: {
  milestoneId: string;
  actionType: string;
  actor: string;
  inputReference?: string | null;
  decision?: string | null;
  confidence?: number | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await initDb();
  await getPool().query(
    `INSERT INTO agent_actions (id, milestone_id, action_type, actor, input_reference, decision, confidence, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      randomUUID(),
      input.milestoneId,
      input.actionType,
      input.actor,
      input.inputReference ?? null,
      input.decision ?? null,
      input.confidence ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );
}

/* ---------------- milestones ---------------- */

export async function createMilestone(input: {
  title: string;
  description: string;
  amount: number;
  currency: string;
  acceptanceCriteria: AcceptanceCriterion[];
}): Promise<Milestone> {
  await initDb();
  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO milestones (id, title, description, amount, currency, acceptance_criteria, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'DRAFT')`,
      [id, input.title, input.description, input.amount, input.currency, JSON.stringify(input.acceptanceCriteria)]
    );
    await client.query(
      `INSERT INTO agent_actions (id, milestone_id, action_type, actor, input_reference, metadata)
       VALUES ($1, $2, 'MILESTONE_CREATED', 'client', 'POST /api/milestones', $3::jsonb)`,
      [
        randomUUID(),
        id,
        JSON.stringify({
          amount: input.amount,
          currency: input.currency,
          criteriaCount: input.acceptanceCriteria.length,
        }),
      ]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return (await getMilestone(id)) as Milestone;
}

export async function getMilestone(id: string): Promise<Milestone | null> {
  await initDb();
  const res = await getPool().query('SELECT * FROM milestones WHERE id = $1', [id]);
  return res.rows.length ? mapMilestone(res.rows[0]) : null;
}

export async function listMilestones(): Promise<Array<Milestone & { paymentStatus: string | null }>> {
  await initDb();
  const res = await getPool().query(
    `SELECT m.*, p.trustlock_status AS payment_status
     FROM milestones m
     LEFT JOIN paypal_payments p ON p.milestone_id = m.id
     ORDER BY m.created_at DESC`
  );
  return res.rows.map((row) => ({ ...mapMilestone(row), paymentStatus: row.payment_status ?? null }));
}

export async function getMilestoneDetail(id: string): Promise<{
  milestone: Milestone;
  payment: PaypalPayment | null;
  actions: AgentAction[];
  evidence: MilestoneEvidence[];
  latestReview: AiReview | null;
  latestRelease: PaymentRelease | null;
} | null> {
  const milestone = await getMilestone(id);
  if (!milestone) return null;
  return {
    milestone,
    payment: await getPaymentByMilestoneId(id),
    actions: await listAgentActions(id),
    evidence: await listEvidence(id),
    latestReview: await getLatestReview(id),
    latestRelease: await getLatestRelease(id),
  };
}

/* ---------------- payments (Phase 1) ---------------- */

export async function getPaymentByOrderId(orderId: string): Promise<PaypalPayment | null> {
  await initDb();
  const res = await getPool().query('SELECT * FROM paypal_payments WHERE order_id = $1', [orderId]);
  return res.rows.length ? mapPayment(res.rows[0]) : null;
}

export async function getPaymentByAuthorizationId(authorizationId: string): Promise<PaypalPayment | null> {
  await initDb();
  const res = await getPool().query('SELECT * FROM paypal_payments WHERE authorization_id = $1', [authorizationId]);
  return res.rows.length ? mapPayment(res.rows[0]) : null;
}

export async function getPaymentByMilestoneId(milestoneId: string): Promise<PaypalPayment | null> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM paypal_payments WHERE milestone_id = $1 ORDER BY created_at DESC LIMIT 1',
    [milestoneId]
  );
  return res.rows.length ? mapPayment(res.rows[0]) : null;
}

export async function startFunding(
  milestoneId: string,
  input: { orderId: string; amount: number; currency: string }
): Promise<PaypalPayment> {
  await initDb();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE milestones SET status = 'FUNDING_PENDING', updated_at = now() WHERE id = $1 AND status = 'DRAFT'`,
      [milestoneId]
    );
    if (updated.rowCount === 0) throw new Error('Milestone is not in DRAFT state');
    await client.query(
      `INSERT INTO paypal_payments (id, milestone_id, order_id, currency, authorized_amount, trustlock_status)
       VALUES ($1, $2, $3, $4, $5, 'FUNDING_PENDING')`,
      [randomUUID(), milestoneId, input.orderId, input.currency, input.amount]
    );
    await client.query(
      `INSERT INTO agent_actions (id, milestone_id, action_type, actor, input_reference, metadata)
       VALUES ($1, $2, 'FUNDING_STARTED', 'system', $3, $4::jsonb)`,
      [
        randomUUID(),
        milestoneId,
        `POST /api/milestones/${milestoneId}/fund`,
        JSON.stringify({ orderId: input.orderId, amount: input.amount, currency: input.currency }),
      ]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return (await getPaymentByMilestoneId(milestoneId)) as PaypalPayment;
}

export async function completeAuthorization(input: {
  orderId: string;
  authorizationId: string;
  authorizationExpiresAt: string | null;
  paypalRequestId: string;
}): Promise<PaypalPayment> {
  await initDb();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE paypal_payments
       SET authorization_id = $2,
           paypal_status = 'CREATED',
           trustlock_status = 'AUTHORIZED',
           authorization_expires_at = $3,
           last_paypal_request_id = $4,
           updated_at = now()
       WHERE order_id = $1 AND trustlock_status = 'FUNDING_PENDING'
       RETURNING *`,
      [input.orderId, input.authorizationId, input.authorizationExpiresAt, input.paypalRequestId]
    );
    if (updated.rowCount === 0) {
      throw new Error('Payment is not in FUNDING_PENDING state (or order unknown)');
    }
    const payment = mapPayment(updated.rows[0]);
    await client.query(`UPDATE milestones SET status = 'AUTHORIZED', updated_at = now() WHERE id = $1`, [
      payment.milestoneId,
    ]);
    await client.query(
      `INSERT INTO agent_actions (id, milestone_id, action_type, actor, input_reference, decision, metadata)
       VALUES ($1, $2, 'PAYMENT_AUTHORIZED', 'system', $3, 'AUTHORIZED', $4::jsonb)`,
      [
        randomUUID(),
        payment.milestoneId,
        `POST /api/paypal/authorize (order ${input.orderId})`,
        JSON.stringify({
          orderId: input.orderId,
          authorizationId: input.authorizationId,
          expiresAt: input.authorizationExpiresAt,
        }),
      ]
    );
    await client.query('COMMIT');
    return payment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Best-effort partial update used by the webhook reconciler and capture flow. */
export async function updatePaymentCaptured(
  paymentId: string,
  patch: { capturedAmount?: number | null; paypalStatus?: string; trustlockStatus?: string }
): Promise<void> {
  await initDb();
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [paymentId];
  if (patch.capturedAmount !== undefined && patch.capturedAmount !== null) {
    values.push(patch.capturedAmount);
    sets.push(`captured_amount = $${values.length}`);
  }
  if (patch.paypalStatus !== undefined) {
    values.push(patch.paypalStatus);
    sets.push(`paypal_status = $${values.length}`);
  }
  if (patch.trustlockStatus !== undefined) {
    values.push(patch.trustlockStatus);
    sets.push(`trustlock_status = $${values.length}`);
  }
  await getPool().query(`UPDATE paypal_payments SET ${sets.join(', ')} WHERE id = $1`, values);
}

export async function updatePaymentFromWebhook(
  paymentId: string,
  patch: { paypalStatus?: string; trustlockStatus?: string; capturedAmount?: number | null }
): Promise<void> {
  await updatePaymentCaptured(paymentId, patch);
}

/* ---------------- evidence (Phase 2, append-only) ---------------- */

export async function createEvidence(
  milestoneId: string,
  input: { deliverableUrl: string; notes: string; evidenceUrls: string[]; submittedBy?: string }
): Promise<MilestoneEvidence> {
  await initDb();
  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO milestone_evidence (id, milestone_id, deliverable_url, notes, submitted_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        id,
        milestoneId,
        input.deliverableUrl,
        input.notes,
        input.submittedBy ?? 'freelancer',
        JSON.stringify({ evidenceUrls: input.evidenceUrls }),
      ]
    );
    await client.query(`UPDATE milestones SET status = 'EVIDENCE_SUBMITTED', updated_at = now() WHERE id = $1`, [
      milestoneId,
    ]);
    await client.query(
      `INSERT INTO agent_actions (id, milestone_id, action_type, actor, input_reference, metadata)
       VALUES ($1, $2, 'EVIDENCE_RECEIVED', 'client', $3, $4::jsonb)`,
      [randomUUID(), milestoneId, 'POST /api/milestones/[id]/evidence', JSON.stringify({ evidenceId: id, deliverableUrl: input.deliverableUrl })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return (await getEvidence(id)) as MilestoneEvidence;
}

export async function getEvidence(id: string): Promise<MilestoneEvidence | null> {
  await initDb();
  const res = await getPool().query('SELECT * FROM milestone_evidence WHERE id = $1', [id]);
  return res.rows.length ? mapEvidence(res.rows[0]) : null;
}

export async function getLatestEvidence(milestoneId: string): Promise<MilestoneEvidence | null> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM milestone_evidence WHERE milestone_id = $1 ORDER BY submitted_at DESC LIMIT 1',
    [milestoneId]
  );
  return res.rows.length ? mapEvidence(res.rows[0]) : null;
}

export async function listEvidence(milestoneId: string): Promise<MilestoneEvidence[]> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM milestone_evidence WHERE milestone_id = $1 ORDER BY submitted_at ASC',
    [milestoneId]
  );
  return res.rows.map(mapEvidence);
}

/* ---------------- AI reviews (Phase 2, append-only) ---------------- */

export async function createReview(input: {
  milestoneId: string;
  evidenceId: string;
  provider: string;
  model: string;
  verdict: string;
  confidence: number;
  criteriaResults: any[];
  recommendedAmount: number;
  rationale: string;
  fetchedEvidence: Record<string, unknown> | null;
  policyDecision: string;
  policyReason: string;
}): Promise<AiReview> {
  await initDb();
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO ai_reviews (id, milestone_id, evidence_id, provider, model, verdict, confidence, criteria_results, recommended_amount, rationale, fetched_evidence, policy_decision, policy_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb, $12, $13)`,
    [
      id,
      input.milestoneId,
      input.evidenceId,
      input.provider,
      input.model,
      input.verdict,
      input.confidence,
      JSON.stringify(input.criteriaResults),
      input.recommendedAmount,
      input.rationale,
      input.fetchedEvidence ? JSON.stringify(input.fetchedEvidence) : null,
      input.policyDecision,
      input.policyReason,
    ]
  );
  return (await getReview(id)) as AiReview;
}

export async function getReview(id: string): Promise<AiReview | null> {
  await initDb();
  const res = await getPool().query('SELECT * FROM ai_reviews WHERE id = $1', [id]);
  return res.rows.length ? mapReview(res.rows[0]) : null;
}

export async function getLatestReview(milestoneId: string): Promise<AiReview | null> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM ai_reviews WHERE milestone_id = $1 ORDER BY created_at DESC LIMIT 1',
    [milestoneId]
  );
  return res.rows.length ? mapReview(res.rows[0]) : null;
}

export async function getReviewByEvidence(milestoneId: string, evidenceId: string): Promise<AiReview | null> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM ai_reviews WHERE milestone_id = $1 AND evidence_id = $2 ORDER BY created_at DESC LIMIT 1',
    [milestoneId, evidenceId]
  );
  return res.rows.length ? mapReview(res.rows[0]) : null;
}

/* ---------------- payment releases (Phase 2) ---------------- */

export async function createRelease(input: {
  id: string;
  milestoneId: string;
  reviewId: string;
  authorizationId: string;
  requestedAmount: number;
  captureId: string | null;
  captureStatus: string | null;
  state: string;
  idempotencyKey: string;
}): Promise<PaymentRelease> {
  await initDb();
  await getPool().query(
    `INSERT INTO payment_releases (id, milestone_id, review_id, authorization_id, requested_amount, capture_id, capture_status, state, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.id,
      input.milestoneId,
      input.reviewId,
      input.authorizationId,
      input.requestedAmount,
      input.captureId,
      input.captureStatus,
      input.state,
      input.idempotencyKey,
    ]
  );
  return (await getRelease(input.id)) as PaymentRelease;
}

export async function getRelease(id: string): Promise<PaymentRelease | null> {
  await initDb();
  const res = await getPool().query('SELECT * FROM payment_releases WHERE id = $1', [id]);
  return res.rows.length ? mapRelease(res.rows[0]) : null;
}

export async function getReleaseByReview(milestoneId: string, reviewId: string): Promise<PaymentRelease | null> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM payment_releases WHERE milestone_id = $1 AND review_id = $2',
    [milestoneId, reviewId]
  );
  return res.rows.length ? mapRelease(res.rows[0]) : null;
}

export async function getLatestRelease(milestoneId: string): Promise<PaymentRelease | null> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM payment_releases WHERE milestone_id = $1 ORDER BY created_at DESC LIMIT 1',
    [milestoneId]
  );
  return res.rows.length ? mapRelease(res.rows[0]) : null;
}

export async function listPendingReleases(): Promise<PaymentRelease[]> {
  await initDb();
  const res = await getPool().query(
    `SELECT * FROM payment_releases WHERE state = 'CAPTURE_PENDING' ORDER BY created_at ASC`
  );
  return res.rows.map(mapRelease);
}

export async function updateReleaseState(
  releaseId: string,
  patch: { state?: string; captureStatus?: string | null }
): Promise<void> {
  await initDb();
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [releaseId];
  if (patch.state !== undefined) {
    values.push(patch.state);
    sets.push(`state = $${values.length}`);
  }
  if (patch.captureStatus !== undefined) {
    values.push(patch.captureStatus);
    sets.push(`capture_status = $${values.length}`);
  }
  await getPool().query(`UPDATE payment_releases SET ${sets.join(', ')} WHERE id = $1`, values);
}

/* ---------------- audit list ---------------- */

export async function listAgentActions(milestoneId: string): Promise<AgentAction[]> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM agent_actions WHERE milestone_id = $1 ORDER BY created_at ASC',
    [milestoneId]
  );
  return res.rows.map(mapAction);
}

/* ---------------- webhook reconciliation ---------------- */

/**
 * Minimal webhook reconciliation. The webhook route verifies the signature
 * BEFORE calling this. Unknown events are logged and ignored.
 */
export async function reconcileWebhookEvent(event: any): Promise<void> {
  const type: string = event?.event_type ?? '';
  const resource = event?.resource ?? {};
  let payment: PaypalPayment | null = null;
  if (resource.id) {
    payment = (await getPaymentByAuthorizationId(resource.id)) ?? (await getPaymentByOrderId(resource.id));
  }
  const relatedOrderId = resource?.supplementary_data?.related_ids?.order_id;
  const relatedAuthId = resource?.supplementary_data?.related_ids?.authorization_id;
  if (!payment && relatedOrderId) payment = await getPaymentByOrderId(relatedOrderId);
  if (!payment && relatedAuthId) payment = await getPaymentByAuthorizationId(relatedAuthId);
  if (!payment) {
    console.log('[webhooks] event for unknown payment, ignoring:', type, resource.id ?? relatedOrderId ?? '');
    return;
  }

  switch (type) {
    case 'CHECKOUT.ORDER.APPROVED':
      await updatePaymentFromWebhook(payment.id, { paypalStatus: 'APPROVED' });
      break;
    case 'PAYMENT.AUTHORIZATION.CREATED':
      await updatePaymentFromWebhook(payment.id, { paypalStatus: resource.status ?? 'CREATED' });
      break;
    case 'PAYMENT.AUTHORIZATION.VOIDED':
      await updatePaymentFromWebhook(payment.id, {
        paypalStatus: 'VOIDED',
        trustlockStatus: payment.trustlockStatus === 'AUTHORIZED' ? 'VOIDED' : payment.trustlockStatus,
      });
      break;
    case 'PAYMENT.CAPTURE.COMPLETED':
    case 'PAYMENT.CAPTURE.PENDING':
    case 'PAYMENT.CAPTURE.DECLINED': {
      const amount = resource?.amount?.value ? Number(resource.amount.value) : null;
      await updatePaymentFromWebhook(payment.id, {
        paypalStatus: type === 'PAYMENT.CAPTURE.COMPLETED' ? 'COMPLETED' : type === 'PAYMENT.CAPTURE.PENDING' ? 'PENDING' : 'DECLINED',
        ...(amount !== null ? { capturedAmount: amount } : {}),
      });
      // Also reconcile any release waiting on this capture.
      const captureId = resource?.id;
      if (captureId) {
        const relRes = await getPool().query('SELECT * FROM payment_releases WHERE capture_id = $1', [captureId]);
        for (const row of relRes.rows) {
          const release = mapRelease(row);
          if (release.state === 'CAPTURE_PENDING') {
            if (type === 'PAYMENT.CAPTURE.COMPLETED') {
              const fully = Number(payment.capturedAmount) >= Number(payment.authorizedAmount) - 0.005;
              const newState = fully ? 'PAID' : 'PAID_PARTIAL';
              await updateReleaseState(release.id, { state: newState, captureStatus: 'COMPLETED' });
              await updatePaymentFromWebhook(payment.id, { trustlockStatus: newState });
              await setMilestoneStatus(release.milestoneId, newState);
              await recordAgentAction({
                milestoneId: release.milestoneId,
                actionType: newState === 'PAID' ? 'PAID' : 'PAID_PARTIAL',
                actor: 'system',
                decision: newState,
                inputReference: `webhook ${event?.id ?? ''}`,
                metadata: { releaseId: release.id, captureId, source: 'webhook' },
              });
            } else if (type === 'PAYMENT.CAPTURE.DECLINED') {
              await updateReleaseState(release.id, { state: 'CAPTURE_FAILED', captureStatus: 'DECLINED' });
              await updatePaymentFromWebhook(payment.id, { trustlockStatus: 'CAPTURE_FAILED' });
              await setMilestoneStatus(release.milestoneId, 'CAPTURE_FAILED');
            }
          }
        }
      }
      break;
    }
    default:
      console.log('[webhooks] unhandled event type:', type);
  }
}
