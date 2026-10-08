import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPool, initDb } from './index';

export interface AcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  acceptanceCriteria: AcceptanceCriterion[];
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

const mapMilestone = (row: any): Milestone => ({
  id: row.id,
  title: row.title,
  description: row.description,
  amount: Number(row.amount),
  currency: row.currency,
  acceptanceCriteria: row.acceptance_criteria ?? [],
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

export async function getMilestoneDetail(
  id: string
): Promise<{ milestone: Milestone; payment: PaypalPayment | null; actions: AgentAction[] } | null> {
  const milestone = await getMilestone(id);
  if (!milestone) return null;
  return {
    milestone,
    payment: await getPaymentByMilestoneId(id),
    actions: await listAgentActions(id),
  };
}

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

export async function listAgentActions(milestoneId: string): Promise<AgentAction[]> {
  await initDb();
  const res = await getPool().query(
    'SELECT * FROM agent_actions WHERE milestone_id = $1 ORDER BY created_at ASC',
    [milestoneId]
  );
  return res.rows.map(mapAction);
}

/**
 * DRAFT → FUNDING_PENDING.
 * Records the PayPal order WE created for the milestone. The amount comes from
 * the milestone row, never from the request.
 */
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

/**
 * FUNDING_PENDING → AUTHORIZED.
 * Only called after PayPal returned a verified CREATED authorization whose
 * amount matches the milestone.
 */
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

/** Best-effort partial update used by the webhook reconciler. */
export async function updatePaymentFromWebhook(
  paymentId: string,
  patch: { paypalStatus?: string; trustlockStatus?: string; capturedAmount?: number | null }
): Promise<void> {
  await initDb();
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [paymentId];
  if (patch.paypalStatus !== undefined) {
    values.push(patch.paypalStatus);
    sets.push(`paypal_status = $${values.length}`);
  }
  if (patch.trustlockStatus !== undefined) {
    values.push(patch.trustlockStatus);
    sets.push(`trustlock_status = $${values.length}`);
  }
  if (patch.capturedAmount !== undefined && patch.capturedAmount !== null) {
    values.push(patch.capturedAmount);
    sets.push(`captured_amount = $${values.length}`);
  }
  await getPool().query(`UPDATE paypal_payments SET ${sets.join(', ')} WHERE id = $1`, values);
}

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
  if (!payment && relatedOrderId) payment = await getPaymentByOrderId(relatedOrderId);
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
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const amount = resource?.amount?.value ? Number(resource.amount.value) : null;
      await updatePaymentFromWebhook(payment.id, { paypalStatus: 'CAPTURED', capturedAmount: amount });
      break;
    }
    default:
      console.log('[webhooks] unhandled event type:', type);
  }
}
