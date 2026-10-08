import 'server-only';
import { getPool, initDb } from './index';

/**
 * Read-only aggregate queries for the presentation layer (dashboard metrics,
 * activity feed, insights). No mutation logic lives here — every number shown
 * in the UI comes from the real database.
 */

export interface DashboardMetrics {
  /** Funds currently held (authorized, not yet captured). */
  authorizedHeld: number;
  /** Funds captured (release accepted by PayPal; may still be settling). */
  captured: number;
  /** Funds in async settlement (CAPTURE_PENDING). */
  pendingSettlement: number;
  /** Count of releases executed via policy AUTO_RELEASE. */
  autoReleased: number;
  /** Total milestones. */
  milestonesTotal: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  await initDb();
  const pool = getPool();
  const [held, captured, pending, auto, total] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(authorized_amount - captured_amount), 0) AS v FROM paypal_payments WHERE trustlock_status = 'AUTHORIZED'`),
    pool.query(`SELECT COALESCE(SUM(captured_amount), 0) AS v FROM paypal_payments WHERE trustlock_status IN ('CAPTURE_PENDING', 'PAID', 'PAID_PARTIAL')`),
    pool.query(`SELECT COALESCE(SUM(captured_amount), 0) AS v FROM paypal_payments WHERE trustlock_status = 'CAPTURE_PENDING'`),
    pool.query(`SELECT COUNT(*)::int AS v FROM agent_actions WHERE action_type = 'RELEASE_APPROVED' AND decision = 'AUTO_RELEASE'`),
    pool.query(`SELECT COUNT(*)::int AS v FROM milestones`),
  ]);
  return {
    authorizedHeld: Number(held.rows[0]?.v ?? 0),
    captured: Number(captured.rows[0]?.v ?? 0),
    pendingSettlement: Number(pending.rows[0]?.v ?? 0),
    autoReleased: Number(auto.rows[0]?.v ?? 0),
    milestonesTotal: Number(total.rows[0]?.v ?? 0),
  };
}

/** Primary milestone for the dashboard hero: the one with payment-release
 *  activity (the most significant run), falling back to most recently updated. */
export async function getPrimaryMilestoneId(): Promise<string | null> {
  await initDb();
  const res = await getPool().query(
    `SELECT m.id
     FROM milestones m
     LEFT JOIN payment_releases pr ON pr.milestone_id = m.id
     ORDER BY (pr.id IS NOT NULL) DESC, COALESCE(pr.created_at, m.updated_at) DESC
     LIMIT 1`
  );
  return res.rows.length ? res.rows[0].id : null;
}

export interface ActivityEvent {
  id: string;
  at: string;
  type: string;
  actor: string;
  decision: string | null;
  confidence: number | null;
  inputReference: string | null;
  metadata: Record<string, unknown> | null;
  milestoneId: string;
  milestoneTitle: string;
  milestoneStatus: string;
  amount: number | null;
  currency: string | null;
}

/** Chronological audit events across all milestones (newest first). */
export async function getActivity(limit = 50): Promise<ActivityEvent[]> {
  await initDb();
  const res = await getPool().query(
    `SELECT a.id, a.created_at AS at, a.action_type AS type, a.actor, a.decision, a.confidence,
            a.input_reference, a.metadata,
            m.id AS milestone_id, m.title AS milestone_title, m.status AS milestone_status,
            p.authorized_amount, p.currency
     FROM agent_actions a
     JOIN milestones m ON m.id = a.milestone_id
     LEFT JOIN paypal_payments p ON p.milestone_id = m.id
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((row) => ({
    id: row.id,
    at: row.at,
    type: row.type,
    actor: row.actor,
    decision: row.decision ?? null,
    confidence: row.confidence === null ? null : Number(row.confidence),
    inputReference: row.input_reference ?? null,
    metadata: row.metadata ?? null,
    milestoneId: row.milestone_id,
    milestoneTitle: row.milestone_title,
    milestoneStatus: row.milestone_status,
    amount: row.authorized_amount === null ? null : Number(row.authorized_amount),
    currency: row.currency ?? null,
  }));
}

export interface InsightsData {
  milestonesByState: { state: string; count: number }[];
  verdicts: { verdict: string; count: number }[];
  avgConfidence: number | null;
  criteriaPassed: number;
  criteriaTotal: number;
  releasesTotal: number;
  autoReleases: number;
  fundsHeld: number;
  fundsCaptured: number;
  fundsPending: number;
  totalAuthorized: number;
  totalMilestones: number;
}

/** Aggregate analytics for the Insights page — all real, all read-only. */
export async function getInsights(): Promise<InsightsData> {
  await initDb();
  const pool = getPool();
  const [
    byState,
    verdicts,
    avgConf,
    criteria,
    releases,
    auto,
    funds,
    totalAuth,
    totalMilestones,
  ] = await Promise.all([
    pool.query(`SELECT status AS state, COUNT(*)::int AS count FROM milestones GROUP BY status ORDER BY count DESC, state ASC`),
    pool.query(`SELECT verdict, COUNT(*)::int AS count FROM ai_reviews GROUP BY verdict ORDER BY count DESC`),
    pool.query(`SELECT AVG(confidence) AS v FROM ai_reviews`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE elem ->> 'result' = 'PASS')::int AS passed, COUNT(*)::int AS total FROM ai_reviews, LATERAL jsonb_array_elements(criteria_results) AS elem`),
    pool.query(`SELECT COUNT(*)::int AS v FROM payment_releases`),
    pool.query(`SELECT COUNT(*)::int AS v FROM agent_actions WHERE action_type = 'RELEASE_APPROVED' AND decision = 'AUTO_RELEASE'`),
    pool.query(`SELECT COALESCE(SUM(authorized_amount - captured_amount), 0) AS held, COALESCE(SUM(captured_amount), 0) AS captured FROM paypal_payments`),
    pool.query(`SELECT COALESCE(SUM(authorized_amount), 0) AS v FROM paypal_payments`),
    pool.query(`SELECT COUNT(*)::int AS v FROM milestones`),
  ]);
  const pending = await pool.query(`SELECT COALESCE(SUM(captured_amount), 0) AS v FROM paypal_payments WHERE trustlock_status = 'CAPTURE_PENDING'`);
  return {
    milestonesByState: byState.rows.map((r) => ({ state: r.state, count: Number(r.count) })),
    verdicts: verdicts.rows.map((r) => ({ verdict: r.verdict, count: Number(r.count) })),
    avgConfidence: avgConf.rows[0]?.v === null ? null : Number(avgConf.rows[0].v),
    criteriaPassed: Number(criteria.rows[0]?.passed ?? 0),
    criteriaTotal: Number(criteria.rows[0]?.total ?? 0),
    releasesTotal: Number(releases.rows[0]?.v ?? 0),
    autoReleases: Number(auto.rows[0]?.v ?? 0),
    fundsHeld: Number(funds.rows[0]?.held ?? 0),
    fundsCaptured: Number(funds.rows[0]?.captured ?? 0),
    fundsPending: Number(pending.rows[0]?.v ?? 0),
    totalAuthorized: Number(totalAuth.rows[0]?.v ?? 0),
    totalMilestones: Number(totalMilestones.rows[0]?.v ?? 0),
  };
}
